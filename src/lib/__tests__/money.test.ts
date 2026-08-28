import { describe, expect, it } from 'vitest';
import {
  MAX_AMOUNT,
  formatAmount,
  formatMoney,
  parseAmount,
  sumAmounts,
  toAmount,
} from '../money';

describe('parseAmount', () => {
  it('reads a plain number', () => {
    expect(parseAmount('1234')).toBe(1234);
    expect(parseAmount('0')).toBe(0);
  });

  it('reads a Turkish comma decimal', () => {
    expect(parseAmount('1234,56')).toBe(1234.56);
    expect(parseAmount('0,5')).toBe(0.5);
  });

  it('reads a full Turkish figure with grouping', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('12.345.678,90')).toBe(12345678.9);
  });

  it('reads the English form too', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('1234.56')).toBe(1234.56);
  });

  it('treats a repeated separator as grouping', () => {
    expect(parseAmount('1.234.567')).toBe(1234567);
    expect(parseAmount('1,234,567')).toBe(1234567);
  });

  it('strips currency symbols and whitespace', () => {
    expect(parseAmount(' ₺1.234,56 ')).toBe(1234.56);
    expect(parseAmount('$1,234.56')).toBe(1234.56);
  });

  it('handles both minus characters', () => {
    expect(parseAmount('-50')).toBe(-50);
    expect(parseAmount('−50,5')).toBe(-50.5);
  });

  it('returns null for nothing usable', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('rounds to two places', () => {
    expect(parseAmount('1,239')).toBe(1.24);
    expect(parseAmount('10.005')).toBe(10.01);
  });

  it('clamps to what numeric(12,2) can hold', () => {
    expect(parseAmount('99999999999999')).toBe(MAX_AMOUNT);
  });
});

describe('sumAmounts', () => {
  it('does not drift', () => {
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
    expect(sumAmounts([1234.56, 0.1, 0.2, 999.99])).toBe(2234.85);
  });

  it('survives ten realistic items', () => {
    const items = [4500, 1250.75, 899.99, 320.5, 175.25, 89.9, 60, 45.45, 33.3, 12.1];
    expect(sumAmounts(items)).toBe(7387.24);
  });

  it('is zero for an empty cycle', () => {
    expect(sumAmounts([])).toBe(0);
  });
});

describe('formatting', () => {
  it('formats TRY the way a Turkish reader expects', () => {
    expect(formatMoney(1234.5, 'TRY')).toBe('₺1.234,50');
    expect(formatAmount(1234.5, 'TRY')).toBe('1.234,50');
  });

  it('uses a real minus sign, not a hyphen', () => {
    expect(formatMoney(-1234.5, 'TRY')).toContain('−');
    expect(formatMoney(-1234.5, 'TRY')).not.toContain('-');
  });

  it('always shows two decimals so columns line up', () => {
    expect(formatAmount(60, 'TRY')).toBe('60,00');
    expect(formatAmount(0, 'USD')).toBe('0.00');
  });
});

describe('toAmount', () => {
  it('accepts the string form postgres numeric can arrive as', () => {
    expect(toAmount('1234.56')).toBe(1234.56);
    expect(toAmount(1234.56)).toBe(1234.56);
    expect(toAmount(null)).toBe(0);
    expect(toAmount(undefined)).toBe(0);
  });
});
