-- ===========================================================================
-- Migration 003 — share one budget, not everything
--
-- 002 made sharing all-or-nothing: a household member saw every profile in
-- the household. That is wrong for anyone who keeps more than one set of
-- books and wants to share exactly one of them.
--
-- Sharing moves down a level. Each profile now has its own list of people
-- and its own join code. A household goes back to being what it always
-- really was: the private container holding your own budgets.
--
-- Run it in the Supabase SQL editor. One transaction, safe to re-run.
-- ===========================================================================

begin;

-- ------------------------------------------------- 1. per-profile sharing

create table if not exists profile_members (
  profile_id  uuid not null references profiles(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (profile_id, user_id)
);

create index if not exists profile_members_user_idx on profile_members (user_id);

create table if not exists profile_invites (
  code        text primary key,
  profile_id  uuid not null references profiles(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  max_uses    int,
  uses        int not null default 0
);

create index if not exists profile_invites_profile_idx on profile_invites (profile_id);

-- Household-wide sharing is withdrawn. Any code handed out under 002 stops
-- working now, so nobody can let themselves into every budget at once.
delete from household_invites;

-- ------------------------------------------------------- 2. who sees what

-- Two ways in: the budget lives in your own household, or it has been
-- shared with you directly. SECURITY DEFINER for the same reason as before —
-- a policy that queries the table it protects recurses.
create or replace function can_see_profile(p uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from profiles pr
      join household_members m on m.household_id = pr.household_id
     where pr.id = p and m.user_id = auth.uid()
  ) or exists (
    select 1 from profile_members pm
     where pm.profile_id = p and pm.user_id = auth.uid()
  );
$$;

/** True only for the household that owns the budget — not for guests. */
create or replace function owns_profile(p uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from profiles pr
      join household_members m on m.household_id = pr.household_id
     where pr.id = p and m.user_id = auth.uid()
  );
$$;

revoke all on function can_see_profile(uuid) from public;
revoke all on function owns_profile(uuid)    from public;
grant execute on function can_see_profile(uuid) to authenticated;
grant execute on function owns_profile(uuid)    to authenticated;

alter table profile_members enable row level security;
alter table profile_invites enable row level security;

-- profiles ---------------------------------------------------------------
-- Guests may read a budget that was shared with them, but only the owning
-- household may rename it, change its currency, or delete it.
drop policy if exists "household profiles" on profiles;
drop policy if exists "see shared profiles" on profiles;
drop policy if exists "own household profiles" on profiles;

create policy "see shared profiles" on profiles
  for select to authenticated
  using (can_see_profile(id));

create policy "own household profiles" on profiles
  for all to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- the money ---------------------------------------------------------------
-- Guests get the lot here: adding, editing, deleting, ticking. That is the
-- point of sharing a budget.
drop policy if exists "household cycles"  on cycles;
drop policy if exists "household items"   on items;
drop policy if exists "household incomes" on incomes;
drop policy if exists "shared cycles"     on cycles;
drop policy if exists "shared items"      on items;
drop policy if exists "shared incomes"    on incomes;

create policy "shared cycles" on cycles
  for all to authenticated
  using (can_see_profile(profile_id))
  with check (can_see_profile(profile_id));

create policy "shared items" on items
  for all to authenticated
  using (exists (
    select 1 from cycles c where c.id = items.cycle_id and can_see_profile(c.profile_id)
  ))
  with check (exists (
    select 1 from cycles c where c.id = items.cycle_id and can_see_profile(c.profile_id)
  ));

create policy "shared incomes" on incomes
  for all to authenticated
  using (exists (
    select 1 from cycles c where c.id = incomes.cycle_id and can_see_profile(c.profile_id)
  ))
  with check (exists (
    select 1 from cycles c where c.id = incomes.cycle_id and can_see_profile(c.profile_id)
  ));

-- membership and codes ----------------------------------------------------
drop policy if exists "read profile members"   on profile_members;
drop policy if exists "owner manages sharing"  on profile_members;
drop policy if exists "guest can leave"        on profile_members;

create policy "read profile members" on profile_members
  for select to authenticated
  using (can_see_profile(profile_id));

create policy "owner manages sharing" on profile_members
  for delete to authenticated
  using (owns_profile(profile_id));

-- Anyone may remove themselves from a budget shared with them.
create policy "guest can leave" on profile_members
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "read profile invites"  on profile_invites;
drop policy if exists "owner manages invites" on profile_invites;

-- Only the owning household ever sees the code. Guests do not need it, and
-- someone joining reads it through join_profile() instead.
create policy "read profile invites" on profile_invites
  for select to authenticated
  using (owns_profile(profile_id));

create policy "owner manages invites" on profile_invites
  for all to authenticated
  using (owns_profile(profile_id))
  with check (owns_profile(profile_id));

-- ========================================================== 3. operations

/** Start sharing a budget, or return the code it already has. */
create or replace function share_profile(p_profile uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c text;
begin
  if not owns_profile(p_profile) then
    raise exception 'Only the owner of this budget can share it';
  end if;

  select code into c from profile_invites where profile_id = p_profile limit 1;
  if found then
    return c;
  end if;

  loop
    c := gen_join_code();
    begin
      insert into profile_invites (code, profile_id, created_by)
      values (c, p_profile, auth.uid());
      exit;
    exception when unique_violation then
      -- vanishingly unlikely; try another
    end;
  end loop;

  return c;
end $$;

/** New code, old one dead. People already in keep their access. */
create or replace function rotate_profile_code(p_profile uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not owns_profile(p_profile) then
    raise exception 'Only the owner of this budget can change its code';
  end if;
  delete from profile_invites where profile_id = p_profile;
  return share_profile(p_profile);
end $$;

/** Stop sharing entirely: the code dies and everyone is removed. */
create or replace function unshare_profile(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not owns_profile(p_profile) then
    raise exception 'Only the owner of this budget can stop sharing it';
  end if;
  delete from profile_invites where profile_id = p_profile;
  delete from profile_members where profile_id = p_profile;
end $$;

/**
 * Someone joining cannot read the invite under row-level security, because
 * they are not in yet. This reads it for them and lets them in — to this
 * one budget, and nothing else.
 */
create or replace function join_profile(p_code text)
returns profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv profile_invites;
  pr  profiles;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into inv from profile_invites where code = upper(trim(p_code));
  if not found then
    raise exception 'That code is not valid';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'That code has expired';
  end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then
    raise exception 'That code has already been used';
  end if;

  insert into profile_members (profile_id, user_id)
  values (inv.profile_id, auth.uid())
  on conflict (profile_id, user_id) do nothing;

  update profile_invites set uses = uses + 1 where code = inv.code;

  select * into pr from profiles where id = inv.profile_id;
  return pr;
end $$;

/**
 * Who this budget is shared with. Emails live in auth.users, which the API
 * cannot reach — and the guard matters: without it any user could list the
 * members of any budget.
 */
create or replace function profile_member_list(p_profile uuid)
returns table (
  user_id   uuid,
  email     text,
  joined_at timestamptz
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select pm.user_id, u.email::text, pm.joined_at
    from profile_members pm
    join auth.users u on u.id = pm.user_id
   where pm.profile_id = p_profile
     and can_see_profile(p_profile)
   order by pm.joined_at;
$$;

grant execute on function share_profile(uuid)        to authenticated;
grant execute on function rotate_profile_code(uuid)  to authenticated;
grant execute on function unshare_profile(uuid)      to authenticated;
grant execute on function join_profile(text)         to authenticated;
grant execute on function profile_member_list(uuid)  to authenticated;

commit;
