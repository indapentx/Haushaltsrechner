/**
 * Runs migration 002 against a real Postgres (PGlite — Postgres compiled to
 * WASM, no install, no Docker) that has been set up to look like Supabase:
 * an `auth` schema, an `auth.uid()` that reads a session setting, and an
 * `authenticated` role so row-level security actually applies.
 *
 * The point is that the migration touches live budget data, so "it looks
 * right" is not good enough. This stands up a v1 database with data in it,
 * migrates, and checks what came out the other side.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const V1 = readFileSync(join(ROOT, 'supabase/migrations/001_initial.sql'), 'utf8');
const MIGRATION = readFileSync(
  join(ROOT, 'supabase/migrations/002_households_and_currencies.sql'),
  'utf8',
);
const SHARING = readFileSync(
  join(ROOT, 'supabase/migrations/003_share_single_budget.sql'),
  'utf8',
);
const CLOSE_HOUSEHOLD = readFileSync(
  join(ROOT, 'supabase/migrations/004_close_household_joining.sql'),
  'utf8',
);

const OWNER = '11111111-1111-1111-1111-111111111111';
const HOUSEMATE = '22222222-2222-2222-2222-222222222222';
const STRANGER = '33333333-3333-3333-3333-333333333333';

/** The parts of Supabase a migration leans on. */
const SUPABASE_STUBS = `
  create schema if not exists auth;

  create table auth.users (
    id    uuid primary key,
    email text
  );

  -- Supabase reads this out of the JWT; a session setting is close enough.
  create or replace function auth.uid() returns uuid
  language sql stable as $fn$
    select nullif(current_setting('test.user_id', true), '')::uuid
  $fn$;

  create role authenticated nologin;
  grant usage on schema public, auth to authenticated;
`;

/** v1 data: one owner, two profiles, three cycles, items and income. */
const SEED = `
  insert into auth.users (id, email) values
    ('${OWNER}',     'owner@example.com'),
    ('${HOUSEMATE}', 'housemate@example.com'),
    ('${STRANGER}',  'stranger@example.com');

  insert into profiles (id, user_id, name, currency, sort_order) values
    ('aaaaaaaa-0000-0000-0000-000000000001', '${OWNER}', 'Ev',     'TRY', 0),
    ('aaaaaaaa-0000-0000-0000-000000000002', '${OWNER}', 'İşyeri', 'EUR', 1);

  insert into cycles (id, profile_id, start_date, income) values
    ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-07-25', 45000),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-08-25', 47000),
    ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', '2026-08-25', 0);

  insert into items (cycle_id, name, amount, is_paid, paid_at, sort_order) values
    ('bbbbbbbb-0000-0000-0000-000000000002', 'Kira',     18000,   false, null, 0),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'Doğalgaz',  1899.9, true,  now(), 1),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'İnternet',   749,   false, null, 2),
    ('bbbbbbbb-0000-0000-0000-000000000001', 'Kira',     17000,   true,  now(), 0);
`;

async function freshDatabase(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STUBS);
  await db.exec(V1);
  await db.exec(SEED);
  // Everything the API role touches must be reachable before RLS decides.
  await db.exec(`
    grant all on all tables in schema public to authenticated;
    grant all on all sequences in schema public to authenticated;
  `);
  return db;
}

/** Run a block as a signed-in user, with row-level security enforced. */
async function asUser<T>(db: PGlite, userId: string, sql: string): Promise<T[]> {
  await db.exec(`set role authenticated; set test.user_id = '${userId}';`);
  try {
    const result = await db.query<T>(sql);
    return result.rows;
  } finally {
    await db.exec(`reset role; reset test.user_id;`);
  }
}

describe('migration 002', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(MIGRATION);
    await db.exec(`
      grant all on all tables in schema public to authenticated;
      grant all on all sequences in schema public to authenticated;
    `);
  }, 60_000);

  it('runs at all', async () => {
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from households');
    expect(rows[0].n).toBe(1);
  });

  it('moves the existing profiles into one household', async () => {
    const { rows } = await db.query<{ name: string; household_id: string }>(
      'select name, household_id from profiles order by sort_order',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Ev');
    expect(rows[1].name).toBe('İşyeri');
    expect(rows[0].household_id).toBe(rows[1].household_id);
  });

  it('makes the original account the owner', async () => {
    const { rows } = await db.query<{ user_id: string; role: string }>(
      'select user_id, role from household_members',
    );
    expect(rows).toEqual([{ user_id: OWNER, role: 'owner' }]);
  });

  it('drops profiles.user_id once everything is attached', async () => {
    const { rows } = await db.query(
      `select 1 from information_schema.columns
        where table_name = 'profiles' and column_name = 'user_id'`,
    );
    expect(rows).toHaveLength(0);
  });

  it('turns each cycle income into an income row, and keeps the amount', async () => {
    const { rows } = await db.query<{ amount: string; currency: string; rate_date: string }>(
      `select amount, currency, rate_date::text from incomes
        join cycles on cycles.id = incomes.cycle_id
       order by amount`,
    );
    // The zero-income cycle gets no row; nothing is lost.
    expect(rows.map((r) => Number(r.amount))).toEqual([45000, 47000]);
    expect(rows.every((r) => r.currency === 'TRY')).toBe(true);
    expect(rows[0].rate_date).toBe('2026-07-25');
  });

  it('removes cycles.income so nothing can read a stale copy', async () => {
    const { rows } = await db.query(
      `select 1 from information_schema.columns
        where table_name = 'cycles' and column_name = 'income'`,
    );
    expect(rows).toHaveLength(0);
  });

  it('stamps every existing item with its profile currency and cycle date', async () => {
    const { rows } = await db.query<{ name: string; currency: string; rate_date: string }>(
      `select i.name, i.currency, i.rate_date::text from items i
         join cycles c on c.id = i.cycle_id
        where c.start_date = '2026-08-25' order by i.sort_order`,
    );
    expect(rows.map((r) => r.currency)).toEqual(['TRY', 'TRY', 'TRY']);
    expect(rows.map((r) => r.rate_date)).toEqual(['2026-08-25', '2026-08-25', '2026-08-25']);
  });

  it('issues a join code for the migrated household', async () => {
    const { rows } = await db.query<{ code: string }>('select code from household_invites');
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  });
  describe('row-level security', () => {
    it('shows a member everything in their household', async () => {
      const rows = await asUser(db, OWNER, 'select name from profiles order by sort_order');
      expect(rows.map((r: { name: string }) => r.name)).toEqual(['Ev', 'İşyeri']);
    });

    it('shows a stranger nothing at all', async () => {
      expect(await asUser(db, STRANGER, 'select * from profiles')).toHaveLength(0);
      expect(await asUser(db, STRANGER, 'select * from cycles')).toHaveLength(0);
      expect(await asUser(db, STRANGER, 'select * from items')).toHaveLength(0);
      expect(await asUser(db, STRANGER, 'select * from incomes')).toHaveLength(0);
      expect(await asUser(db, STRANGER, 'select * from households')).toHaveLength(0);
      expect(await asUser(db, STRANGER, 'select * from household_invites')).toHaveLength(0);
    });

    it('does not recurse when reading members', async () => {
      // The classic failure here is Postgres 42P17, infinite recursion in a
      // policy. If the SECURITY DEFINER helper were a plain query, this throws.
      const rows = await asUser(db, OWNER, 'select user_id from household_members');
      expect(rows).toHaveLength(1);
    });

    it('stops a stranger writing into someone else’s household', async () => {
      // Read the id as superuser: this is the attacker who already knows,
      // or has guessed, the household id. The WITH CHECK clause is what
      // has to stop them.
      const { rows } = await db.query<{ id: string }>('select id from households limit 1');
      await expect(
        asUser(
          db,
          STRANGER,
          `insert into profiles (household_id, name, currency)
           values ('${rows[0].id}', 'intruder', 'TRY')`,
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  describe('joining a household', () => {
    it('refuses a code that does not exist', async () => {
      await expect(
        asUser(db, HOUSEMATE, `select * from join_household('ZZZZ-ZZZZ')`),
      ).rejects.toThrow(/not valid/);
    });

    it('lets someone in with the real code, and they then see everything', async () => {
      const { rows } = await db.query<{ code: string }>('select code from household_invites');
      const code = rows[0].code;

      // Nothing before joining.
      expect(await asUser(db, HOUSEMATE, 'select * from profiles')).toHaveLength(0);

      await asUser(db, HOUSEMATE, `select * from join_household('${code}')`);

      const profiles = await asUser(db, HOUSEMATE, 'select name from profiles order by sort_order');
      expect(profiles.map((r: { name: string }) => r.name)).toEqual(['Ev', 'İşyeri']);
    });

    it('lets the new member edit, which is the whole point', async () => {
      await asUser(
        db,
        HOUSEMATE,
        `insert into items (cycle_id, name, amount, currency, rate_date, sort_order)
         values ('bbbbbbbb-0000-0000-0000-000000000002', 'Netflix', 199, 'TRY', '2026-08-25', 3)`,
      );
      const rows = await asUser(
        db,
        OWNER,
        `select name from items where name = 'Netflix'`,
      );
      expect(rows).toHaveLength(1);
    });

    it('does not make the new member an owner', async () => {
      const rows = await asUser(
        db,
        HOUSEMATE,
        `select role from household_members where user_id = '${HOUSEMATE}'`,
      );
      expect((rows[0] as { role: string }).role).toBe('member');
    });

    it('refuses to let a plain member rotate the code', async () => {
      await expect(
        asUser(
          db,
          HOUSEMATE,
          `select rotate_join_code(id) from households limit 1`,
        ),
      ).rejects.toThrow(/owner/);
    });
  });

  describe('rollover, version 2', () => {
    it('copies items and income forward, unpaid and re-dated', async () => {
      await asUser(
        db,
        OWNER,
        `select * from ensure_cycle('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-25')`,
      );

      const items = await asUser(
        db,
        OWNER,
        `select i.name, i.amount, i.is_paid, i.currency, i.rate_date::text
           from items i join cycles c on c.id = i.cycle_id
          where c.start_date = '2026-09-25' order by i.sort_order`,
      );
      type Row = { name: string; amount: string; is_paid: boolean; rate_date: string };
      expect((items as Row[]).map((r) => r.name)).toEqual([
        'Kira',
        'Doğalgaz',
        'İnternet',
        'Netflix',
      ]);
      // Everything comes back unticked...
      expect((items as Row[]).every((r) => r.is_paid === false)).toBe(true);
      // ...and dated to the new cycle, so it converts at this month's rate.
      expect((items as Row[]).every((r) => r.rate_date === '2026-09-25')).toBe(true);

      const incomes = await asUser(
        db,
        OWNER,
        `select amount, rate_date::text from incomes i
           join cycles c on c.id = i.cycle_id
          where c.start_date = '2026-09-25'`,
      );
      expect(incomes).toHaveLength(1);
      expect(Number((incomes[0] as { amount: string }).amount)).toBe(47000);
      expect((incomes[0] as { rate_date: string }).rate_date).toBe('2026-09-25');
    });

    it('is idempotent — a second device gets the same cycle, not a copy', async () => {
      await asUser(
        db,
        HOUSEMATE,
        `select * from ensure_cycle('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-25')`,
      );
      const rows = await asUser(
        db,
        OWNER,
        `select count(*)::int as n from cycles
          where profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'
            and start_date = '2026-09-25'`,
      );
      expect((rows[0] as { n: number }).n).toBe(1);
    });
  });

  it('can be run twice without breaking anything', async () => {
    const twice = await freshDatabase();
    await twice.exec(MIGRATION);
    await twice.exec(`grant all on all tables in schema public to authenticated;`);
    await expect(twice.exec(MIGRATION)).resolves.toBeDefined();

    const { rows } = await twice.query<{ n: number }>(
      'select count(*)::int as n from households',
    );
    // Re-running must not mint a second household for the same data.
    expect(rows[0].n).toBe(1);
  }, 60_000);
});

/**
 * 003 moves sharing from the whole household down to one budget at a time.
 * The thing that must be true: a guest let into one budget sees that budget
 * and nothing else.
 */
describe('migration 003 — sharing one budget', () => {
  let db: PGlite;
  let evId: string;
  let privateId: string;

  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(MIGRATION);
    await db.exec(SHARING);
    await db.exec(`grant all on all tables in schema public to authenticated;`);

    const { rows } = await db.query<{ id: string; name: string }>(
      'select id, name from profiles order by sort_order',
    );
    evId = rows[0].id; // Ev — the one to share
    privateId = rows[1].id; // İşyeri — must stay private
  }, 60_000);

  it('revokes the household-wide code, so nobody can take everything', async () => {
    const { rows } = await db.query('select code from household_invites');
    expect(rows).toHaveLength(0);
  });

  it('shows the owner all their budgets', async () => {
    const rows = await asUser(db, OWNER, 'select name from profiles order by sort_order');
    expect(rows.map((r: { name: string }) => r.name)).toEqual(['Ev', 'İşyeri']);
  });

  it('lets the owner share exactly one', async () => {
    const rows = await asUser<{ share_profile: string }>(
      db,
      OWNER,
      `select share_profile('${evId}')`,
    );
    expect(rows[0].share_profile).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  });

  it('refuses to let a stranger share someone else’s budget', async () => {
    await expect(
      asUser(db, STRANGER, `select share_profile('${privateId}')`),
    ).rejects.toThrow(/owner/);
  });

  it('lets a guest in with the code — and ONLY to that budget', async () => {
    const { rows } = await db.query<{ code: string }>(
      `select code from profile_invites where profile_id = '${evId}'`,
    );
    await asUser(db, HOUSEMATE, `select * from join_profile('${rows[0].code}')`);

    const visible = await asUser(db, HOUSEMATE, 'select name from profiles');
    // This is the whole point of the migration.
    expect(visible.map((r: { name: string }) => r.name)).toEqual(['Ev']);
  });

  it('keeps the private budget’s money out of reach too', async () => {
    const cycles = await asUser(
      db,
      HOUSEMATE,
      `select * from cycles where profile_id = '${privateId}'`,
    );
    expect(cycles).toHaveLength(0);

    const items = await asUser(
      db,
      HOUSEMATE,
      `select i.* from items i join cycles c on c.id = i.cycle_id
        where c.profile_id = '${privateId}'`,
    );
    expect(items).toHaveLength(0);
  });

  it('lets the guest edit the budget they were given', async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from cycles where profile_id = '${evId}' order by start_date desc limit 1`,
    );
    await asUser(
      db,
      HOUSEMATE,
      `insert into items (cycle_id, name, amount, currency, rate_date, sort_order)
       values ('${rows[0].id}', 'Guest item', 50, 'TRY', '2026-08-25', 9)`,
    );
    const seen = await asUser(db, OWNER, `select name from items where name = 'Guest item'`);
    expect(seen).toHaveLength(1);
  });

  it('does not let the guest rename or delete the budget', async () => {
    await asUser(db, HOUSEMATE, `update profiles set name = 'Hijacked' where id = '${evId}'`);
    const rows = await asUser(db, OWNER, `select name from profiles where id = '${evId}'`);
    // The update matches no rows under the guest's policy rather than erroring.
    expect((rows[0] as { name: string }).name).toBe('Ev');
  });

  it('removes the guest again when sharing is switched off', async () => {
    await asUser(db, OWNER, `select unshare_profile('${evId}')`);
    expect(await asUser(db, HOUSEMATE, 'select name from profiles')).toHaveLength(0);
  });

  it('can be run twice', async () => {
    await expect(db.exec(SHARING)).resolves.toBeDefined();
  }, 60_000);
});

/**
 * 003 deleted the household-wide codes but left the functions that mint
 * them. A cached copy of the old app could call rotate_join_code() and hand
 * someone access to every budget at once. 004 removes the machinery.
 */
describe('migration 004 — household joining is gone', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(MIGRATION);
    await db.exec(SHARING);
    await db.exec(CLOSE_HOUSEHOLD);
    await db.exec(`grant all on all tables in schema public to authenticated;`);
  }, 60_000);

  it('removes the functions a stale client would call', async () => {
    const { rows } = await db.query<{ proname: string }>(
      `select proname from pg_proc
        where proname in ('join_household', 'rotate_join_code')`,
    );
    expect(rows).toEqual([]);
  });

  it('leaves no household code behind', async () => {
    const { rows } = await db.query('select * from household_invites');
    expect(rows).toHaveLength(0);
  });

  it('keeps per-budget sharing working', async () => {
    const { rows } = await db.query<{ id: string }>(
      'select id from profiles order by sort_order limit 1',
    );
    const code = await asUser<{ share_profile: string }>(
      db,
      OWNER,
      `select share_profile('${rows[0].id}')`,
    );
    expect(code[0].share_profile).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);

    await asUser(db, HOUSEMATE, `select * from join_profile('${code[0].share_profile}')`);
    const seen = await asUser(db, HOUSEMATE, 'select name from profiles');
    expect(seen.map((r: { name: string }) => r.name)).toEqual(['Ev']);
  });

  it('can be run twice', async () => {
    await expect(db.exec(CLOSE_HOUSEHOLD)).resolves.toBeDefined();
  }, 60_000);
});
