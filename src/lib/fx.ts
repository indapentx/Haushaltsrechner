/**
 * Exchange rates.
 *
 * Everything is quoted against EUR, because that is what the European
 * Central Bank publishes and what Frankfurter serves. The rate for a past
 * date never changes, so storing the *date* on each item is what freezes a
 * past cycle's value — there is no need to store a rate on the row, and the
 * display currency stays switchable without rewriting history.
 *
 * Rates are cached in the `fx_rates` table, shared by every member and
 * every device: a day is fetched once and read from the database forever.
 */
import { supabase } from './supabase';
import { toAmount } from './money';

export const FX_BASE = 'EUR';
const API = 'https://api.frankfurter.dev/v1';

/** date → currency → how many of that currency one euro buys. */
export type RateTable = Record<string, Record<string, number>>;

/**
 * Convert between currencies using the rates of a specific day.
 * Returns null when the day's rate is not available, so callers can show
 * that a figure is unknown rather than silently showing a wrong one.
 */
export function convert(
  amount: number,
  from: string,
  to: string,
  onDate: string,
  rates: RateTable,
): number | null {
  // No rate can make a currency differ from itself, and skipping the round
  // trip avoids floating-point noise on the overwhelmingly common case.
  if (from === to) return amount;

  const day = rates[onDate];
  if (!day) return null;

  const fromRate = from === FX_BASE ? 1 : day[from];
  const toRate = to === FX_BASE ? 1 : day[to];
  if (!fromRate || !toRate) return null;

  return (amount / fromRate) * toRate;
}

/** Everything that needs a rate, grouped by the day it is dated to. */
export interface RateNeed {
  rate_date: string;
  currency: string;
}

/** What is still missing from `rates` for these rows and display currency. */
export function missingRates(
  needs: readonly RateNeed[],
  display: string,
  rates: RateTable,
): Map<string, Set<string>> {
  const missing = new Map<string, Set<string>>();

  for (const need of needs) {
    if (need.currency === display) continue; // never needs a rate
    const day = rates[need.rate_date] ?? {};
    for (const currency of [need.currency, display]) {
      if (currency === FX_BASE) continue; // the base is always 1
      if (day[currency]) continue;
      const set = missing.get(need.rate_date) ?? new Set<string>();
      set.add(currency);
      missing.set(need.rate_date, set);
    }
  }
  return missing;
}

// --------------------------------------------------------------- the cache

async function readCache(dates: string[]): Promise<RateTable> {
  if (dates.length === 0) return {};
  const { data } = await supabase
    .from('fx_rates')
    .select('as_of, quote, rate')
    .eq('base', FX_BASE)
    .in('as_of', dates)
    .throwOnError();

  const table: RateTable = {};
  for (const row of data) {
    (table[row.as_of] ??= {})[row.quote] = toAmount(row.rate);
  }
  return table;
}

async function writeCache(date: string, rates: Record<string, number>): Promise<void> {
  const rows = Object.entries(rates).map(([quote, rate]) => ({
    as_of: date,
    base: FX_BASE,
    quote,
    rate,
  }));
  if (rows.length === 0) return;
  // A rate already cached is a fact and must not be overwritten.
  await supabase.from('fx_rates').upsert(rows, { ignoreDuplicates: true }).throwOnError();
}

/**
 * The ECB publishes on working days only. Asking for a weekend returns the
 * preceding working day's figures, which is the correct answer — and since
 * we cache under the date we asked for, it stays stable.
 */
async function fetchDay(date: string, symbols: string[]): Promise<Record<string, number>> {
  const wanted = symbols.filter((s) => s !== FX_BASE);
  if (wanted.length === 0) return {};
  const response = await fetch(
    `${API}/${date}?base=${FX_BASE}&symbols=${wanted.join(',')}`,
  );
  if (!response.ok) throw new Error(`Exchange rates unavailable (${response.status})`);
  const body = (await response.json()) as { rates?: Record<string, number> };
  return body.rates ?? {};
}

/**
 * The last resort when a day cannot be fetched: the most recent rate we do
 * have. Better than refusing to show a balance, as long as it is honest
 * about being approximate.
 */
async function nearestCached(
  date: string,
  currency: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('fx_rates')
    .select('rate')
    .eq('base', FX_BASE)
    .eq('quote', currency)
    .lte('as_of', date)
    .order('as_of', { ascending: false })
    .limit(1)
    .throwOnError();
  return data.length > 0 ? toAmount(data[0].rate) : null;
}

export interface LoadedRates {
  rates: RateTable;
  /** True when at least one figure fell back to an older day's rate. */
  approximate: boolean;
}

/**
 * Resolve every rate these rows need: from the shared cache first, then from
 * the ECB, then — only if that fails — from the nearest earlier day.
 */
export async function loadRates(
  needs: readonly RateNeed[],
  display: string,
): Promise<LoadedRates> {
  const dates = [...new Set(needs.map((n) => n.rate_date))];
  const rates = await readCache(dates);
  let approximate = false;

  for (const [date, symbols] of missingRates(needs, display, rates)) {
    try {
      const fetched = await fetchDay(date, [...symbols]);
      Object.assign((rates[date] ??= {}), fetched);
      await writeCache(date, fetched);
    } catch {
      for (const symbol of symbols) {
        const fallback = await nearestCached(date, symbol);
        if (fallback !== null) {
          (rates[date] ??= {})[symbol] = fallback;
          approximate = true;
        }
      }
    }
  }

  return { rates, approximate };
}
