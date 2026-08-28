/**
 * The budget cycle runs the 25th to the 24th, not the calendar month.
 *
 * Everything here is computed in the device's *local* time and dates are
 * carried as bare `YYYY-MM-DD` strings. Never use toISOString() on these:
 * east of UTC it reports tomorrow's date late in the evening, which would
 * roll the app over at the wrong moment.
 */

/** Change this one constant to move the cycle boundary. */
export const ANCHOR_DAY = 25;

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

/**
 * Boundary dates are built at midday, not midnight. In timezones that skip
 * midnight on a DST transition, `new Date(y, m, d)` can land on the previous
 * day; midday is never skipped.
 */
function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 12, 0, 0, 0);
}

/** The anchor day that begins the cycle containing `d`. */
export function cycleStart(d: Date = new Date()): Date {
  const day = d.getDate();
  return day >= ANCHOR_DAY
    ? localDate(d.getFullYear(), d.getMonth(), ANCHOR_DAY)
    : localDate(d.getFullYear(), d.getMonth() - 1, ANCHOR_DAY);
}

/** Exclusive end — the next anchor day. */
export function cycleEnd(start: Date): Date {
  return localDate(start.getFullYear(), start.getMonth() + 1, ANCHOR_DAY);
}

/** Inclusive last day of the cycle — the day before the next anchor. */
export function cycleLastDay(start: Date): Date {
  const end = cycleEnd(start);
  return localDate(end.getFullYear(), end.getMonth(), end.getDate() - 1);
}

/** Step `n` cycles forward (or back, if negative). */
export function shiftCycle(start: Date, n: number): Date {
  return localDate(start.getFullYear(), start.getMonth() + n, ANCHOR_DAY);
}

/** Local `YYYY-MM-DD`. The only serialisation used for cycle dates. */
export function toDateKey(d: Date): string {
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a bare `YYYY-MM-DD` back into a local Date. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return localDate(y, m - 1, d);
}

/** The current cycle's start, as stored in the database. */
export function currentCycleKey(now: Date = new Date()): string {
  return toDateKey(cycleStart(now));
}

/** e.g. `25 AUG — 24 SEP`. Month names are fixed English, not locale-derived. */
export function formatCycleLabel(start: Date): string {
  const last = cycleLastDay(start);
  const from = `${start.getDate()} ${MONTHS[start.getMonth()]}`;
  const to = `${last.getDate()} ${MONTHS[last.getMonth()]}`;
  return `${from} — ${to}`;
}
