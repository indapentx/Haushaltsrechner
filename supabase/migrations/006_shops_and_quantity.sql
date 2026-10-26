-- ===========================================================================
-- Migration 006 — named shops, and how many of a thing
--
-- Two things that came out of actually using the list.
--
-- Shops were free text, re-typed every time. They are now a list belonging
-- to the budget, so you pick one instead of typing it — and because they
-- belong to the budget, they survive the list being cleared at checkout and
-- are shared with whoever the budget is shared with.
--
-- Lines gain a quantity. Buying one egg is rare.
--
-- Run it in the Supabase SQL editor. One transaction, safe to re-run.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------- shops

create table if not exists shops (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (profile_id, name)
);

create index if not exists shops_profile_idx on shops (profile_id, sort_order, name);

alter table shops enable row level security;

drop policy if exists "shared shops" on shops;
create policy "shared shops" on shops
  for all to authenticated
  using (can_see_profile(profile_id))
  with check (can_see_profile(profile_id));

-- Carry across whatever shops the current list already mentions, so nobody
-- has to re-enter them.
insert into shops (profile_id, name)
select distinct g.profile_id, btrim(g.store)
  from grocery_items g
 where g.store is not null and btrim(g.store) <> ''
on conflict (profile_id, name) do nothing;

-- ------------------------------------------------------------- quantity

alter table grocery_items
  add column if not exists quantity int not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'grocery_items_quantity_positive'
  ) then
    alter table grocery_items
      add constraint grocery_items_quantity_positive check (quantity >= 1);
  end if;
end $$;

-- --------------------------------------------------- checkout, with counts
-- `amount` is the price of one. Two eggs at 0.69 is 1.38, and the budget
-- should receive 1.38.

create or replace function checkout_groceries(
  p_profile uuid,
  p_cycle   uuid,
  p_label   text
)
returns setof items
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order int;
  v_date  date;
begin
  if not can_see_profile(p_profile) then
    raise exception 'That budget is not yours';
  end if;

  select start_date into v_date from cycles where id = p_cycle;
  if v_date is null then
    raise exception 'No such cycle';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_order
    from items where cycle_id = p_cycle;

  return query
  with sums as (
    select currency, sum(amount * quantity) as total
      from grocery_items
     where profile_id = p_profile and is_bought
     group by currency
  ),
  inserted as (
    insert into items (cycle_id, name, amount, currency, rate_date, sort_order)
    select p_cycle,
           p_label,
           s.total,
           s.currency,
           v_date,
           v_order + (row_number() over (order by s.currency))::int - 1
      from sums s
    returning *
  )
  select * from inserted;

  delete from grocery_items where profile_id = p_profile and is_bought;
end $$;

grant execute on function checkout_groceries(uuid, uuid, text) to authenticated;

commit;
