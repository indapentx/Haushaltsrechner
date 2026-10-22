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

export async function joinHousehold(code: string): Promise<Household> {
  const { data } = await supabase.rpc('join_household', { p_code: code }).throwOnError();
  return data;
}

export async function renameHousehold(id: string, name: string): Promise<void> {
  await supabase.from('households').update({ name }).eq('id', id).throwOnError();
}

export async function listMembers(householdId: string): Promise<HouseholdMember[]> {
  const { data } = await supabase
    .rpc('household_member_list', { p_household: householdId })
    .throwOnError();
  return data;
}

export async function getJoinCode(householdId: string): Promise<string | null> {
  const { data } = await supabase
    .from('household_invites')
    .select('code')
    .eq('household_id', householdId)
    .limit(1)
    .throwOnError();
  return data.length > 0 ? data[0].code : null;
}

export async function rotateJoinCode(householdId: string): Promise<string> {
  const { data } = await supabase
    .rpc('rotate_join_code', { p_household: householdId })
    .throwOnError();
  return data;
}

export async function removeMember(householdId: string, userId: string): Promise<void> {
  await supabase
    .from('household_members')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .throwOnError();
}

// -------------------------------------------------------------- profiles

export async function listProfiles(householdId: string): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('household_id', householdId)
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
