/**
 * Every database call the app makes. Amounts are normalised on the way in
 * (postgres numeric can arrive as a string) and errors are thrown, not
 * returned, so callers can use try/catch.
 */
import { supabase } from './supabase';
import { toAmount } from './money';

export interface Household {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export interface HouseholdMember {
  user_id: string;
  email: string;
  role: 'owner' | 'member';
  display_name: string | null;
  joined_at: string;
}

export interface Profile {
  id: string;
  household_id: string;
  name: string;
  currency: string;
  sort_order: number;
  created_at: string;
}

export interface Cycle {
  id: string;
  profile_id: string;
  start_date: string;
  created_at: string;
}

export interface Item {
  id: string;
  cycle_id: string;
  name: string;
  amount: number;
  is_paid: boolean;
  paid_at: string | null;
  sort_order: number;
  currency: string;
  rate_date: string;
  rate_override: number | null;
  created_at: string;
}

export interface Income {
  id: string;
  cycle_id: string;
  name: string;
  amount: number;
  currency: string;
  rate_date: string;
  rate_override: number | null;
  sort_order: number;
  created_at: string;
}

/** A cycle that exists, for the chevron navigation. */
export interface CycleStub {
  id: string;
  start_date: string;
}

function asItem(row: Item): Item {
  return { ...row, amount: toAmount(row.amount) };
}

function asIncome(row: Income): Income {
  return { ...row, amount: toAmount(row.amount) };
}

// ------------------------------------------------------------ households

/** Every household this account is a member of. Usually exactly one. */
export async function listHouseholds(): Promise<Household[]> {
  const { data } = await supabase
    .from('households')
    .select('*')
    .order('created_at', { ascending: true })
    .throwOnError();
  return data;
}

export async function createHousehold(name: string): Promise<Household> {
  const { data } = await supabase
    .rpc('create_household', { p_name: name })
    .throwOnError();
  return data;
}

export async function renameHousehold(id: string, name: string): Promise<void> {
  await supabase.from('households').update({ name }).eq('id', id).throwOnError();
}

export async function removeMember(householdId: string, userId: string): Promise<void> {
  await supabase
    .from('household_members')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .throwOnError();
}

// ------------------------------------------------- sharing one budget

export interface ProfileMember {
  user_id: string;
  email: string;
  joined_at: string;
}

/** The code for this budget, or null if it is not shared. */
export async function getShareCode(profileId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profile_invites')
    .select('code')
    .eq('profile_id', profileId)
    .limit(1)
    .throwOnError();
  return data.length > 0 ? data[0].code : null;
}

/** Start sharing, or return the code it already has. */
export async function shareProfile(profileId: string): Promise<string> {
  const { data } = await supabase
    .rpc('share_profile', { p_profile: profileId })
    .throwOnError();
  return data;
}

export async function rotateShareCode(profileId: string): Promise<string> {
  const { data } = await supabase
    .rpc('rotate_profile_code', { p_profile: profileId })
    .throwOnError();
  return data;
}

/** Stop sharing: the code dies and everyone it was shared with is removed. */
export async function unshareProfile(profileId: string): Promise<void> {
  await supabase.rpc('unshare_profile', { p_profile: profileId }).throwOnError();
}

export async function joinProfile(code: string): Promise<Profile> {
  const { data } = await supabase.rpc('join_profile', { p_code: code }).throwOnError();
  return data;
}

export async function listProfileMembers(profileId: string): Promise<ProfileMember[]> {
  const { data } = await supabase
    .rpc('profile_member_list', { p_profile: profileId })
    .throwOnError();
  return data;
}

export async function removeProfileMember(
  profileId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from('profile_members')
    .delete()
    .eq('profile_id', profileId)
    .eq('user_id', userId)
    .throwOnError();
}

// -------------------------------------------------------------- profiles

/**
 * Every budget this account can open: its own household's, plus any that
 * have been shared with it. The filtering is row-level security's job — ask
 * for them all and it returns the ones you are allowed.
 */
export async function listProfiles(): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .throwOnError();
  return data;
}

export async function createProfile(
  householdId: string,
  name: string,
  currency: string,
  sortOrder: number,
): Promise<Profile> {
  const { data } = await supabase
    .from('profiles')
    .insert({ household_id: householdId, name, currency, sort_order: sortOrder })
    .select()
    .single()
    .throwOnError();
  return data;
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, 'name' | 'currency' | 'sort_order'>>,
): Promise<void> {
  await supabase.from('profiles').update(patch).eq('id', id).throwOnError();
}

export async function deleteProfile(id: string): Promise<void> {
  await supabase.from('profiles').delete().eq('id', id).throwOnError();
}

// ---------------------------------------------------------------- cycles

/**
 * Find or create the cycle starting on `startKey`, copying last cycle's
 * items and income across unpaid. Atomic and idempotent — see
 * supabase/migrations/002_households_and_currencies.sql.
 */
export async function ensureCycle(profileId: string, startKey: string): Promise<Cycle> {
  const { data } = await supabase
    .rpc('ensure_cycle', { p_profile_id: profileId, p_start: startKey })
    .throwOnError();
  return data;
}

export async function listCycleStubs(profileId: string): Promise<CycleStub[]> {
  const { data } = await supabase
    .from('cycles')
    .select('id, start_date')
    .eq('profile_id', profileId)
    .order('start_date', { ascending: true })
    .throwOnError();
  return data;
}

export async function getCycle(profileId: string, startKey: string): Promise<Cycle | null> {
  const { data, error } = await supabase
    .from('cycles')
    .select('*')
    .eq('profile_id', profileId)
    .eq('start_date', startKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// ----------------------------------------------------------------- items

export async function listItems(cycleId: string): Promise<Item[]> {
  const { data } = await supabase
    .from('items')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true }).throwOnError();
  return data.map(asItem);
}

export async function createItem(
  cycleId: string,
  name: string,
  amount: number,
  currency: string,
  rateDate: string,
  sortOrder: number,
): Promise<Item> {
  const { data } = await supabase
    .from('items')
    .insert({
      cycle_id: cycleId,
      name,
      amount,
      currency,
      rate_date: rateDate,
      sort_order: sortOrder,
    })
    .select()
    .single().throwOnError();
  return asItem(data);
}

export async function updateItem(
  id: string,
  patch: Partial<Pick<Item, 'name' | 'amount' | 'is_paid' | 'paid_at' | 'sort_order' | 'currency'>>,
): Promise<void> {
  await supabase.from('items').update(patch).eq('id', id).throwOnError();
}

export async function deleteItem(id: string): Promise<void> {
  await supabase.from('items').delete().eq('id', id).throwOnError();
}

/**
 * Reset all: unticks every item in this cycle. Does not create a cycle and
 * does not touch amounts or income.
 */
export async function resetCycleItems(cycleId: string): Promise<void> {
  await supabase
    .from('items')
    .update({ is_paid: false, paid_at: null })
    .eq('cycle_id', cycleId).throwOnError();
}

// ------------------------------------------------------------- groceries

export interface Shop {
  id: string;
  profile_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface GroceryItem {
  id: string;
  profile_id: string;
  name: string;
  store: string | null;
  amount: number;
  /** How many of it. The price is per one. */
  quantity: number;
  currency: string;
  rate_date: string;
  is_bought: boolean;
  bought_at: string | null;
  sort_order: number;
  created_at: string;
}

function asGrocery(row: GroceryItem): GroceryItem {
  return { ...row, amount: toAmount(row.amount) };
}

export async function listShops(profileId: string): Promise<Shop[]> {
  const { data } = await supabase
    .from('shops')
    .select('*')
    .eq('profile_id', profileId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .throwOnError();
  return data;
}

export async function createShop(
  profileId: string,
  name: string,
  sortOrder: number,
): Promise<Shop> {
  const { data } = await supabase
    .from('shops')
    .insert({ profile_id: profileId, name, sort_order: sortOrder })
    .select()
    .single()
    .throwOnError();
  return data;
}

export async function setShopOrder(id: string, sortOrder: number): Promise<void> {
  await supabase.from('shops').update({ sort_order: sortOrder }).eq('id', id).throwOnError();
}

export async function deleteShop(id: string): Promise<void> {
  await supabase.from('shops').delete().eq('id', id).throwOnError();
}

export async function listGroceries(profileId: string): Promise<GroceryItem[]> {
  const { data } = await supabase
    .from('grocery_items')
    .select('*')
    .eq('profile_id', profileId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .throwOnError();
  return data.map(asGrocery);
}

export async function createGrocery(
  profileId: string,
  name: string,
  store: string | null,
  amount: number,
  quantity: number,
  currency: string,
  rateDate: string,
  sortOrder: number,
): Promise<GroceryItem> {
  const { data } = await supabase
    .from('grocery_items')
    .insert({
      profile_id: profileId,
      name,
      store,
      amount,
      quantity,
      currency,
      rate_date: rateDate,
      sort_order: sortOrder,
    })
    .select()
    .single()
    .throwOnError();
  return asGrocery(data);
}

export async function updateGrocery(
  id: string,
  patch: Partial<
    Pick<
      GroceryItem,
      'name' | 'store' | 'amount' | 'quantity' | 'currency' | 'is_bought' | 'bought_at'
    >
  >,
): Promise<void> {
  await supabase.from('grocery_items').update(patch).eq('id', id).throwOnError();
}

export async function deleteGrocery(id: string): Promise<void> {
  await supabase.from('grocery_items').delete().eq('id', id).throwOnError();
}

export async function clearGroceries(profileId: string): Promise<void> {
  await supabase
    .from('grocery_items')
    .delete()
    .eq('profile_id', profileId)
    .throwOnError();
}

/**
 * Turn what was bought into budget items and clear it from the list.
 * One item per currency; anything still unticked stays put.
 */
export async function checkoutGroceries(
  profileId: string,
  cycleId: string,
  label: string,
): Promise<Item[]> {
  const { data } = await supabase
    .rpc('checkout_groceries', {
      p_profile: profileId,
      p_cycle: cycleId,
      p_label: label,
    })
    .throwOnError();
  return data.map(asItem);
}

// --------------------------------------------------------------- incomes

export async function listIncomes(cycleId: string): Promise<Income[]> {
  const { data } = await supabase
    .from('incomes')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true }).throwOnError();
  return data.map(asIncome);
}

export async function createIncome(
  cycleId: string,
  name: string,
  amount: number,
  currency: string,
  rateDate: string,
  sortOrder: number,
): Promise<Income> {
  const { data } = await supabase
    .from('incomes')
    .insert({
      cycle_id: cycleId,
      name,
      amount,
      currency,
      rate_date: rateDate,
      sort_order: sortOrder,
    })
    .select()
    .single().throwOnError();
  return asIncome(data);
}

export async function updateIncome(
  id: string,
  patch: Partial<Pick<Income, 'name' | 'amount' | 'currency' | 'sort_order'>>,
): Promise<void> {
  await supabase.from('incomes').update(patch).eq('id', id).throwOnError();
}

export async function deleteIncome(id: string): Promise<void> {
  await supabase.from('incomes').delete().eq('id', id).throwOnError();
}
