/**
 * Every database call the app makes. Amounts are normalised on the way in
 * (postgres numeric can arrive as a string) and errors are thrown, not
 * returned, so callers can use try/catch.
 */
import { supabase } from './supabase';
import { toAmount } from './money';

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  currency: string;
  sort_order: number;
  created_at: string;
}

export interface Cycle {
  id: string;
  profile_id: string;
  start_date: string;
  income: number;
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
  created_at: string;
}

/** A cycle that exists, for the chevron navigation. */
export interface CycleStub {
  id: string;
  start_date: string;
}

function asCycle(row: Cycle): Cycle {
  return { ...row, income: toAmount(row.income) };
}

function asItem(row: Item): Item {
  return { ...row, amount: toAmount(row.amount) };
}

// ------------------------------------------------------------- profiles

export async function listProfiles(): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true }).throwOnError();
  return data;
}

export async function createProfile(
  userId: string,
  name: string,
  currency: string,
  sortOrder: number,
): Promise<Profile> {
  const { data } = await supabase
    .from('profiles')
    .insert({ user_id: userId, name, currency, sort_order: sortOrder })
    .select()
    .single().throwOnError();
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

// --------------------------------------------------------------- cycles

/**
 * Find or create the cycle starting on `startKey`, copying last cycle's
 * items across unpaid. Atomic and idempotent — see supabase/schema.sql.
 */
export async function ensureCycle(profileId: string, startKey: string): Promise<Cycle> {
  const { data } = await supabase
    .rpc('ensure_cycle', { p_profile_id: profileId, p_start: startKey }).throwOnError();
  return asCycle(data);
}

export async function listCycleStubs(profileId: string): Promise<CycleStub[]> {
  const { data } = await supabase
    .from('cycles')
    .select('id, start_date')
    .eq('profile_id', profileId)
    .order('start_date', { ascending: true }).throwOnError();
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
  return data ? asCycle(data) : null;
}

export async function setIncome(cycleId: string, income: number): Promise<void> {
  await supabase.from('cycles').update({ income }).eq('id', cycleId).throwOnError();
}

// ---------------------------------------------------------------- items

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
  sortOrder: number,
): Promise<Item> {
  const { data } = await supabase
    .from('items')
    .insert({ cycle_id: cycleId, name, amount, sort_order: sortOrder })
    .select()
    .single().throwOnError();
  return asItem(data);
}

export async function updateItem(
  id: string,
  patch: Partial<Pick<Item, 'name' | 'amount' | 'is_paid' | 'paid_at' | 'sort_order'>>,
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
