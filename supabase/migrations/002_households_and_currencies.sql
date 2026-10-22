-- ===========================================================================
-- Migration 002 — shared households, and per-item currencies
--
-- Run this ONCE, in the Supabase SQL editor, on a project already running
-- the original schema. TAKE A BACKUP FIRST (Database → Backups).
--
-- It runs in a single transaction: if any step fails, nothing changes.
-- It is written to be safe to re-run — every step checks whether it has
-- already been done.
--
-- What changes:
--   * Profiles stop belonging to one user and start belonging to a HOUSEHOLD.
--     Any number of accounts can be members of a household, and all of them
--     can read and edit everything in it.
--   * A cycle's single `income` number becomes a list of income entries, so
--     income can arrive in more than one currency.
--   * Items and incomes gain a currency and the date whose exchange rate
--     applies to them.
-- ===========================================================================

begin;

-- ------------------------------------------------------------ 1. households

create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists household_members (
  household_id  uuid not null references households(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'member' check (role in ('owner', 'member')),
  display_name  text,
  joined_at     timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx on household_members (user_id);

-- A code you share with the people you live with. Rotatable, so access can
-- be cut off later without touching anyone's account.
create table if not exists household_invites (
  code          text primary key,
  household_id  uuid not null references households(id) on delete cascade,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  max_uses      int,
  uses          int not null default 0
);

create index if not exists household_invites_household_idx on household_invites (household_id);

-- ------------------------------------------- 2. move profiles into households

-- These must go FIRST. The v1 policies on cycles and items reach into
-- profiles.user_id, and Postgres refuses to drop a column that a policy
-- still depends on.
drop policy if exists "own profiles" on profiles;
drop policy if exists "own cycles"   on cycles;
drop policy if exists "own items"    on items;

alter table profiles add column if not exists household_id uuid
  references households(id) on delete cascade;

-- One household per existing owner, carrying their profiles across.
do $$
declare
  r record;
  h uuid;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'user_id'
  ) then
    for r in select distinct user_id from profiles where household_id is null loop
      insert into households (name, created_by) values ('Haushalt', r.user_id)
        returning id into h;
      insert into household_members (household_id, user_id, role)
        values (h, r.user_id, 'owner')
        on conflict (household_id, user_id) do nothing;
      update profiles set household_id = h
        where user_id = r.user_id and household_id is null;
    end loop;
  end if;
end $$;

-- Refuse to go further if a single profile was left behind.
do $$
begin
  if exists (select 1 from profiles where household_id is null) then
    raise exception 'Aborting: % profile(s) could not be attached to a household',
      (select count(*) from profiles where household_id is null);
  end if;
end $$;

alter table profiles alter column household_id set not null;
alter table profiles drop column if exists user_id;

create index if not exists profiles_household_idx on profiles (household_id, sort_order);

-- --------------------------------------------- 3. income becomes a list

create table if not exists incomes (
  id             uuid primary key default gen_random_uuid(),
  cycle_id       uuid not null references cycles(id) on delete cascade,
  name           text not null default 'Income',
  amount         numeric(12,2) not null default 0,
  currency       text not null,
  -- The day whose exchange rate applies. ECB rates for a past date never
  -- change, so this is what freezes a past cycle's value permanently.
  rate_date      date not null default current_date,
  -- Set only when someone types a rate by hand, overriding the ECB figure.
  rate_override  numeric(18,8),
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists incomes_cycle_idx on incomes (cycle_id);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cycles' and column_name = 'income'
  ) then
    insert into incomes (cycle_id, name, amount, currency, rate_date, sort_order)
    select c.id, 'Income', c.income, p.currency, c.start_date, 0
      from cycles c
      join profiles p on p.id = c.profile_id
     where c.income is not null and c.income <> 0;

    alter table cycles drop column income;
  end if;
end $$;

-- ------------------------------------------------- 4. items gain a currency

alter table items add column if not exists currency      text;
alter table items add column if not exists rate_date     date;
alter table items add column if not exists rate_override numeric(18,8);

-- Existing items are in their profile's currency, dated to their own cycle.
update items i
   set currency  = coalesce(i.currency, p.currency),
       rate_date = coalesce(i.rate_date, c.start_date)
  from cycles c
  join profiles p on p.id = c.profile_id
 where c.id = i.cycle_id
   and (i.currency is null or i.rate_date is null);

alter table items alter column currency  set not null;
alter table items alter column rate_date set not null;
alter table items alter column currency  set default 'TRY';
alter table items alter column rate_date set default current_date;

-- --------------------------------------------------- 5. exchange rate cache
-- Shared by every member and every device: a rate is fetched once and then
-- read from here forever. Everything is quoted against EUR, which is what
-- the European Central Bank publishes.

create table if not exists fx_rates (
  as_of       date not null,
  base        text not null,
  quote       text not null,
  rate        numeric(18,8) not null,
  fetched_at  timestamptz not null default now(),
  primary key (as_of, base, quote)
);

-- ======================================================= 6. access control
--
-- The trap in a schema like this: the policy that decides "may you see this
-- household?" has to consult household_members — and if household_members'
-- own policy consults household_members, Postgres raises error 42P17,
-- infinite recursion. These two helpers are SECURITY DEFINER, so they read
-- the table with row-level security bypassed and the loop never forms.

create or replace function is_household_member(h uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from household_members m
    where m.household_id = h and m.user_id = auth.uid()
  );
$$;

create or replace function is_household_owner(h uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from household_members m
    where m.household_id = h and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

revoke all on function is_household_member(uuid) from public;
revoke all on function is_household_owner(uuid)  from public;
grant execute on function is_household_member(uuid) to authenticated;
grant execute on function is_household_owner(uuid)  to authenticated;

alter table households        enable row level security;
alter table household_members enable row level security;
alter table household_invites enable row level security;
alter table incomes           enable row level security;
alter table fx_rates          enable row level security;

-- households -------------------------------------------------------------
drop policy if exists "read own households"   on households;
drop policy if exists "owner edits household" on households;

create policy "read own households" on households
  for select to authenticated
  using (is_household_member(id));

create policy "owner edits household" on households
  for update to authenticated
  using (is_household_owner(id))
  with check (is_household_owner(id));

-- Creating and deleting a household goes through create_household(); there
-- is deliberately no direct insert policy, because the creator cannot be a
-- member until the household exists.

-- members ----------------------------------------------------------------
drop policy if exists "read household members"   on household_members;
drop policy if exists "owner manages members"    on household_members;
drop policy if exists "member can leave"         on household_members;
drop policy if exists "member renames self"      on household_members;

create policy "read household members" on household_members
  for select to authenticated
  using (is_household_member(household_id));

create policy "owner manages members" on household_members
  for delete to authenticated
  using (is_household_owner(household_id));

-- Anyone may remove themselves — that is how you leave a household.
create policy "member can leave" on household_members
  for delete to authenticated
  using (user_id = auth.uid());

create policy "member renames self" on household_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- invites ----------------------------------------------------------------
drop policy if exists "read household invites"  on household_invites;
drop policy if exists "owner manages invites"   on household_invites;

-- Members can read the code so they can pass it on; only the owner can
-- create or revoke one. Joining reads it through join_household() instead,
-- since someone joining is not a member yet.
create policy "read household invites" on household_invites
  for select to authenticated
  using (is_household_member(household_id));

create policy "owner manages invites" on household_invites
  for all to authenticated
  using (is_household_owner(household_id))
  with check (is_household_owner(household_id));

-- the budget itself ------------------------------------------------------
drop policy if exists "household profiles" on profiles;
drop policy if exists "household cycles"   on cycles;
drop policy if exists "household items"    on items;

create policy "household profiles" on profiles
  for all to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy "household cycles" on cycles
  for all to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = cycles.profile_id and is_household_member(p.household_id)
  ))
  with check (exists (
    select 1 from profiles p
    where p.id = cycles.profile_id and is_household_member(p.household_id)
  ));

create policy "household items" on items
  for all to authenticated
  using (exists (
    select 1 from cycles c join profiles p on p.id = c.profile_id
    where c.id = items.cycle_id and is_household_member(p.household_id)
  ))
  with check (exists (
    select 1 from cycles c join profiles p on p.id = c.profile_id
    where c.id = items.cycle_id and is_household_member(p.household_id)
  ));

drop policy if exists "household incomes" on incomes;
create policy "household incomes" on incomes
  for all to authenticated
  using (exists (
    select 1 from cycles c join profiles p on p.id = c.profile_id
    where c.id = incomes.cycle_id and is_household_member(p.household_id)
  ))
  with check (exists (
    select 1 from cycles c join profiles p on p.id = c.profile_id
    where c.id = incomes.cycle_id and is_household_member(p.household_id)
  ));

-- exchange rates ---------------------------------------------------------
-- Published ECB reference data, not anybody's private information. Any
-- signed-in user may read it or add a day that is not cached yet. Nobody
-- may change or delete a cached rate — a past rate is a fact.
drop policy if exists "read fx rates"  on fx_rates;
drop policy if exists "cache fx rates" on fx_rates;

create policy "read fx rates" on fx_rates
  for select to authenticated using (true);

create policy "cache fx rates" on fx_rates
  for insert to authenticated with check (true);

-- ========================================================== 7. operations

-- Eight characters from an alphabet with no 0/O or 1/I/L, so a code can be
-- read aloud or copied by hand without ambiguity. Randomness comes from
-- gen_random_uuid(), which is cryptographic.
create or replace function gen_join_code()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  raw text := replace(gen_random_uuid()::text, '-', '');
  code text := '';
  i int;
begin
  for i in 1..8 loop
    code := code || substr(
      alphabet,
      1 + (('x' || substr(raw, i * 2 - 1, 2))::bit(8)::int % length(alphabet)),
      1
    );
  end loop;
  return substr(code, 1, 4) || '-' || substr(code, 5, 4);
end $$;

-- The household this migration just created has no code yet, so its owner
-- would have no way to invite anyone. Give every household one.
do $$
declare
  h record;
  c text;
begin
  for h in
    select id, created_by from households
     where not exists (
       select 1 from household_invites i where i.household_id = households.id
     )
  loop
    loop
      c := gen_join_code();
      begin
        insert into household_invites (code, household_id, created_by)
        values (c, h.id, h.created_by);
        exit;
      exception when unique_violation then
      end;
    end loop;
  end loop;
end $$;

-- Creating a household cannot go through a policy: you cannot be a member
-- of something that does not exist yet. So it happens here, atomically —
-- household, owner membership and first join code together.
create or replace function create_household(p_name text)
returns households
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  h households;
  c text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  insert into households (name, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'Haushalt'), auth.uid())
  returning * into h;

  insert into household_members (household_id, user_id, role)
  values (h.id, auth.uid(), 'owner');

  loop
    c := gen_join_code();
    begin
      insert into household_invites (code, household_id, created_by)
      values (c, h.id, auth.uid());
      exit;
    exception when unique_violation then
      -- vanishingly unlikely; try another
    end;
  end loop;

  return h;
end $$;

-- Someone joining is not a member yet, so they cannot read the invite under
-- row-level security. This reads it on their behalf and admits them.
create or replace function join_household(p_code text)
returns households
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv household_invites;
  h   households;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into inv from household_invites
   where code = upper(trim(p_code));

  if not found then
    raise exception 'That code is not valid';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'That code has expired';
  end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then
    raise exception 'That code has already been used';
  end if;

  insert into household_members (household_id, user_id, role)
  values (inv.household_id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;

  update household_invites set uses = uses + 1 where code = inv.code;

  select * into h from households where id = inv.household_id;
  return h;
end $$;

create or replace function rotate_join_code(p_household uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c text;
begin
  if not is_household_owner(p_household) then
    raise exception 'Only the household owner can change the join code';
  end if;

  delete from household_invites where household_id = p_household;

  loop
    c := gen_join_code();
    begin
      insert into household_invites (code, household_id, created_by)
      values (c, p_household, auth.uid());
      exit;
    exception when unique_violation then
    end;
  end loop;

  return c;
end $$;

-- Who is in the house. Emails live in auth.users, which is not reachable
-- through the API, so this reads them — but only for a household the caller
-- actually belongs to. Without that guard any user could enumerate any
-- household's members.
create or replace function household_member_list(p_household uuid)
returns table (
  user_id      uuid,
  email        text,
  role         text,
  display_name text,
  joined_at    timestamptz
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select m.user_id, u.email::text, m.role, m.display_name, m.joined_at
    from household_members m
    join auth.users u on u.id = m.user_id
   where m.household_id = p_household
     and is_household_member(p_household)
   order by m.joined_at;
$$;

-- ----------------------------------------------------- rollover, version 2
-- Same lazy, atomic rollover as before, but income is now a list and both
-- items and incomes carry a currency.
--
-- Copied rows are re-dated to the new cycle's start: next month's rent is
-- converted at next month's rate, not at the rate of the month it was first
-- entered. A hand-typed rate override is deliberately NOT carried forward —
-- it applied to the month it was set in.
create or replace function ensure_cycle(p_profile_id uuid, p_start date)
returns cycles
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cycle cycles;
  v_prev  cycles;
begin
  select * into v_cycle from cycles
    where profile_id = p_profile_id and start_date = p_start;
  if found then
    return v_cycle;
  end if;

  select * into v_prev from cycles
    where profile_id = p_profile_id and start_date < p_start
    order by start_date desc
    limit 1;

  insert into cycles (profile_id, start_date)
  values (p_profile_id, p_start)
  on conflict (profile_id, start_date) do nothing
  returning * into v_cycle;

  if v_cycle.id is null then
    -- Another device created it first. Read theirs and stop.
    select * into v_cycle from cycles
      where profile_id = p_profile_id and start_date = p_start;
    return v_cycle;
  end if;

  if v_prev.id is not null then
    insert into items (cycle_id, name, amount, is_paid, paid_at, sort_order, currency, rate_date)
    select v_cycle.id, name, amount, false, null, sort_order, currency, p_start
      from items
     where cycle_id = v_prev.id;

    insert into incomes (cycle_id, name, amount, currency, rate_date, sort_order)
    select v_cycle.id, name, amount, currency, p_start, sort_order
      from incomes
     where cycle_id = v_prev.id;
  end if;

  return v_cycle;
end $$;

grant execute on function create_household(text)        to authenticated;
grant execute on function join_household(text)          to authenticated;
grant execute on function rotate_join_code(uuid)        to authenticated;
grant execute on function household_member_list(uuid)   to authenticated;
grant execute on function ensure_cycle(uuid, date)      to authenticated;
revoke all on function gen_join_code() from public;

commit;
