-- ===========================================================================
-- Migration 005 — the shopping list
--
-- A living list attached to a budget: what to buy, which shop to buy it at,
-- and what it costs. Ticked off as you go. When the shop is done, the
-- bought lines are turned into a budget item and cleared, leaving behind
-- anything you did not find.
--
-- It hangs off a profile rather than a household, so a budget shared with
-- somebody shares its shopping list too — which is the point, if you both
-- live there.
--
-- Run it in the Supabase SQL editor. One transaction, safe to re-run.
-- ===========================================================================

begin;

create table if not exists grocery_items (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  name        text not null,
  -- Free text: shops come and go, and nobody wants to maintain a list of
  -- them. The app suggests ones already used on this budget.
  store       text,
  amount      numeric(12,2) not null default 0,
  currency    text not null,
  rate_date   date not null default current_date,
  is_bought   boolean not null default false,
  bought_at   timestamptz,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists grocery_items_profile_idx on grocery_items (profile_id, sort_order);

alter table grocery_items enable row level security;

drop policy if exists "shared groceries" on grocery_items;
create policy "shared groceries" on grocery_items
  for all to authenticated
  using (can_see_profile(profile_id))
  with check (can_see_profile(profile_id));

-- ------------------------------------------------------------- checkout
-- Turn what was actually bought into a budget item and clear it from the
-- list. Anything still unticked stays — you did not buy it.
--
-- One item per currency rather than one converted total: summing across
-- currencies would need a rate, and the budget already knows how to convert
-- an item. Nothing is lost that way.
--
-- Atomic, because adding the items and clearing the list must not come
-- apart: a half-finished checkout would either double-count the shop or
-- lose it.
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
    select currency, sum(amount) as total
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
