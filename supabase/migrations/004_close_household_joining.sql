-- ===========================================================================
-- Migration 004 — close household-wide joining for good
--
-- 003 moved sharing down to the individual budget and deleted the
-- household-wide codes, but it left the machinery in place: join_household()
-- and rotate_join_code() still existed. A browser running a cached copy of
-- the old app could therefore mint a fresh household code and hand somebody
-- access to EVERY budget in the household — exactly what 003 set out to
-- prevent.
--
-- This removes the machinery, so a stale client cannot do it even if it
-- tries. Sharing is per budget and nothing else.
--
-- Run it in the Supabase SQL editor. One transaction, safe to re-run.
-- ===========================================================================

begin;

-- Anything minted since 003 goes too.
delete from household_invites;

drop function if exists join_household(text);
drop function if exists rotate_join_code(uuid);

-- Nobody can create one any more either.
drop policy if exists "owner manages invites" on household_invites;
drop policy if exists "read household invites" on household_invites;

drop policy if exists "no household invites" on household_invites;
create policy "no household invites" on household_invites
  for select to authenticated
  using (false);

-- Guard: if a household code ever reappears, something has gone wrong.
do $$
begin
  if exists (select 1 from household_invites) then
    raise exception 'Aborting: household invites still present';
  end if;
end $$;

commit;
