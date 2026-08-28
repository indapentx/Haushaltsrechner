/**
 * Money handling.
 *
 * Two things this exists to prevent:
 *  1. A Turkish keyboard produces `1234,56`. parseFloat reads that as 1234.
 *  2. Summing ten `numeric(12,2)` values as floats lands the balance on
 *     1234.5600000000002. All arithmetic here goes through integer cents.
 */

/** numeric(12,2) tops out here. */
export const MAX_AMOUNT = 9_999_999_999.99;

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Sum without float drift. */
export function sumAmounts(values: readonly number[]): number {
  return fromCents(values.reduce((total, v) => total + toCents(v || 0), 0));
}

/**
 * Parse typed input into a number, or null if there is nothing usable.
 *
 * Both `,` and `.` are accepted as the decimal separator. A separator that
 * repeats is grouping; a separator that appears once is a decimal point.
 * When both appear, the rightmost one is the decimal.
 */
export function parseAmount(input: string): number | null {
  if (typeof input !== 'string') return null;

  const negative = /^\s*[-−]/.test(input);
  let s = input.replace(/[^0-9.,]/g, '');
  if (s === '') return null;

  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;

  if (dots > 0 && commas > 0) {
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const grouping = decimal === '.' ? ',' : '.';
    s = s.split(grouping).join('');
    s = s.replace(decimal, '.');
  } else if (commas > 1) {
    s = s.split(',').join('');
  } else if (dots > 1) {
    s = s.split('.').join('');
  } else if (commas === 1) {
    s = s.replace(',', '.');
  }

  const value = Number(s);
  if (!Number.isFinite(value)) return null;

  const signed = negative ? -value : value;
  const clamped = Math.max(-MAX_AMOUNT, Math.min(MAX_AMOUNT, signed));
  return fromCents(toCents(clamped));
}

/** Grouping follows the currency, not the device, so both devices agree. */
const CURRENCY_LOCALE: Record<string, string> = {
  TRY: 'tr-TR',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
};

export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

function localeFor(currency: string): string {
  return CURRENCY_LOCALE[currency] ?? 'en-US';
}

/** A real minus sign (U+2212), not a hyphen — it lines up in tabular figures. */
function withRealMinus(s: string): string {
  return s.replace(/-/g, '−');
}

/** With the currency symbol. Used for the balance and running totals. */
export function formatMoney(value: number, currency: string): string {
  const formatted = new Intl.NumberFormat(localeFor(currency), {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
  return withRealMinus(formatted);
}

/** Bare grouped figure. Used in list rows, where a symbol on every line is noise. */
export function formatAmount(value: number, currency: string): string {
  const formatted = new Intl.NumberFormat(localeFor(currency), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
  return withRealMinus(formatted);
}

/** Postgres numeric can arrive as a string; never trust it to be a number. */
export function toAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The value as you would type it: no grouping, the locale's decimal
 * separator, and no trailing `,00` to delete before retyping.
 */
export function toEditableString(value: number, currency: string): string {
  if (!value) return '';
  const separator = new Intl.NumberFormat(localeFor(currency))
    .formatToParts(1.5)
    .find((part) => part.type === 'decimal')?.value ?? '.';
  const [whole, fraction] = value.toFixed(2).split('.');
  return fraction === '00' ? whole : `${whole}${separator}${fraction}`;
}
