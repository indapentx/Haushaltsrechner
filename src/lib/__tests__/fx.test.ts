import { describe, expect, it } from 'vitest';
import { convert, missingRates, type RateTable } from '../fx';

// Real ECB figures, so the arithmetic is checked against reality.
const rates: RateTable = {
  '2026-08-25': { TRY: 56.0935, USD: 1.1632, GBP: 0.8601 },
  '2026-10-22': { TRY: 55.6079, USD: 1.1205, GBP: 0.8377 },
};

describe('convert', () => {
  it('returns the amount untouched when nothing changes currency', () => {
    // Exact, not approximately — a round trip through EUR would introduce
    // floating-point noise into every ordinary same-currency item.
    expect(convert(1234.56, 'TRY', 'TRY', '2026-08-25', rates)).toBe(1234.56);
    expect(convert(0.1, 'EUR', 'EUR', '2026-08-25', rates)).toBe(0.1);
  });

  it('converts from the base currency', () => {
    expect(convert(800, 'EUR', 'TRY', '2026-08-25', rates)).toBeCloseTo(44874.8, 1);
  });

  it('converts to the base currency', () => {
    expect(convert(56093.5, 'TRY', 'EUR', '2026-08-25', rates)).toBeCloseTo(1000, 6);
  });

  it('crosses two non-base currencies through the base', () => {
    // 1000 USD → EUR → TRY
    const viaEur = 1000 / 1.1632;
    expect(convert(1000, 'USD', 'TRY', '2026-08-25', rates)).toBeCloseTo(
      viaEur * 56.0935,
      6,
    );
  });

  it('uses the rate of the row’s own day, which is what freezes history', () => {
    const august = convert(800, 'EUR', 'TRY', '2026-08-25', rates);
    const october = convert(800, 'EUR', 'TRY', '2026-10-22', rates);
    expect(august).not.toBe(october);
    expect(august).toBeCloseTo(44874.8, 1);
    expect(october).toBeCloseTo(44486.32, 1);
  });

  it('round-trips without losing money', () => {
    const toTry = convert(800, 'EUR', 'TRY', '2026-08-25', rates)!;
    expect(convert(toTry, 'TRY', 'EUR', '2026-08-25', rates)).toBeCloseTo(800, 8);
  });

  it('returns null rather than guessing when the day is unknown', () => {
    expect(convert(800, 'EUR', 'TRY', '2026-01-01', rates)).toBeNull();
  });

  it('returns null rather than guessing when the currency is unknown', () => {
    expect(convert(800, 'JPY', 'TRY', '2026-08-25', rates)).toBeNull();
  });
});

describe('missingRates', () => {
  it('asks for nothing when every row is already in the display currency', () => {
    const needs = [
      { rate_date: '2026-08-25', currency: 'TRY' },
      { rate_date: '2026-09-25', currency: 'TRY' },
    ];
    expect(missingRates(needs, 'TRY', {}).size).toBe(0);
  });

  it('asks for both sides of a conversion', () => {
    const needs = [{ rate_date: '2026-09-25', currency: 'EUR' }];
    const missing = missingRates(needs, 'TRY', {});
    // EUR is the base and always 1, so only TRY has to be fetched.
    expect([...missing.get('2026-09-25')!]).toEqual(['TRY']);
  });

  it('asks for a cross-currency pair on the row’s own day', () => {
    const needs = [{ rate_date: '2026-09-25', currency: 'USD' }];
    const missing = missingRates(needs, 'TRY', {});
    expect([...missing.get('2026-09-25')!].sort()).toEqual(['TRY', 'USD']);
  });

  it('does not re-ask for what is already cached', () => {
    const needs = [{ rate_date: '2026-08-25', currency: 'EUR' }];
    expect(missingRates(needs, 'TRY', rates).size).toBe(0);
  });

  it('groups by day, because each day has its own rate', () => {
    const needs = [
      { rate_date: '2026-09-25', currency: 'EUR' },
      { rate_date: '2026-11-25', currency: 'EUR' },
    ];
    expect([...missingRates(needs, 'TRY', {}).keys()].sort()).toEqual([
      '2026-09-25',
      '2026-11-25',
    ]);
  });
});
