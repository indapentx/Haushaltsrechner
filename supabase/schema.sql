-- Budget app schema. Paste this whole file into the Supabase SQL editor
-- and run it once. Safe to re-run.

-- ---------------------------------------------------------------- tables

create table if not exists profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  currency    text not null default 'TRY',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists cycles (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  start_date  date not null,               -- always a 25th (see ANCHOR_DAY)
  income      numeric(12,2) not null default 0,
  created_at  timestamptz not null default now(),
  unique (profile_id, start_date)
);

create table if not exists items (
  id          uuid primary key default gen_random_uuid(),
  cycle_id    uuid not null references cycles(id) on delete cascade,
  name        text not null,
  amount      numeric(12,2) not null default 0,
  is_paid     boolean not null default false,
  paid_at     timestamptz,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists cycles_profile_start_idx on cycles (profile_id, start_date desc);
create index if not exists items_cycle_idx          on items  (cycle_id);
create index if not exists profiles_user_idx        on profiles (user_id, sort_order);

-- ------------------------------------------------------- row level security
-- The anon key ships in the browser. Without these policies the whole
-- database is public.

alter table profiles enable row level security;
alter table cycles   enable row level security;
alter table items    enable row level security;

drop policy if exists "own profiles" on profiles;
create policy "own profiles" on profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- `for all` reuses `using` as the check when `with check` is omitted, but
-- writing it out means an INSERT path can never be widened by accident.
drop policy if exists "own cycles" on cycles;
create policy "own cycles" on cycles
  for all to authenticated
  using (exists (
    select 1 from profiles p where p.id = cycles.profile_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from profiles p where p.id = cycles.profile_id and p.user_id = auth.uid()
  ));

drop policy if exists "own items" on items;
create policy "own items" on items
  for all to authenticated
  using (exists (
    select 1 from cycles c join profiles p on p.id = c.profile_id
    where c.id = items.cycle_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from cycles c join profiles p on p.id = c.profile_id
    where c.id = items.cycle_id and p.user_id = auth.uid()
  ));

-- ------------------------------------------------------------- rollover
-- Lazy rollover, done atomically server-side.
--
-- The client computes the cycle start in *local* time and passes it in, so
-- the timezone rule is untouched. Doing the find-or-create in one function
-- means two devices opening the app on the 25th cannot half-copy the item
-- list between them; the loser of the race just reads the winner's cycle.
--
-- security invoker (the default): RLS still governs every statement here,
-- so this cannot touch another user's rows.

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

  -- Income carries forward as a starting value; it stays editable.
  insert into cycles (profile_id, start_date, income)
  values (p_profile_id, p_start, coalesce(v_prev.income, 0))
  on conflict (profile_id, start_date) do nothing
  returning * into v_cycle;

  if v_cycle.id is null then
    -- Another device created it first. Read theirs and stop.
    select * into v_cycle from cycles
      where profile_id = p_profile_id and start_date = p_start;
    return v_cycle;
  end if;

  -- Same names, same amounts, same order — but nothing is paid yet.
  if v_prev.id is not null then
    insert into items (cycle_id, name, amount, is_paid, paid_at, sort_order)
    select v_cycle.id, name, amount, false, null, sort_order
      from items
     where cycle_id = v_prev.id;
  end if;

  return v_cycle;
end;
$$;

grant execute on function ensure_cycle(uuid, date) to authenticated;

-- ------------------------------------------------------------ verify RLS
-- Run these two while signed out (SQL editor: set role to `anon`) and
-- confirm both return zero rows.
--
--   set local role anon;
--   select * from profiles;
--   select * from cycles;
