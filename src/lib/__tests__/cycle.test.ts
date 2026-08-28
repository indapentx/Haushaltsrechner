import { describe, expect, it } from 'vitest';
import {
  ANCHOR_DAY,
  currentCycleKey,
  cycleEnd,
  cycleLastDay,
  cycleStart,
  formatCycleLabel,
  fromDateKey,
  shiftCycle,
  toDateKey,
} from '../cycle';

const key = (y: number, m: number, d: number, h = 12) =>
  toDateKey(cycleStart(new Date(y, m - 1, d, h)));

describe('cycleStart', () => {
  it('puts the 24th in the cycle that began last month', () => {
    expect(key(2026, 9, 24)).toBe('2026-08-25');
  });

  it('starts a new cycle on the 25th', () => {
    expect(key(2026, 9, 25)).toBe('2026-09-25');
  });

  it('keeps the 26th in the cycle that just began', () => {
    expect(key(2026, 9, 26)).toBe('2026-09-25');
  });

  it('holds at every hour of the 24th, including 3am', () => {
    for (const h of [0, 3, 11, 12, 23]) {
      expect(key(2026, 9, 24, h)).toBe('2026-08-25');
    }
  });

  it('rolls over at every hour of the 25th, including 3am', () => {
    for (const h of [0, 3, 11, 12, 23]) {
      expect(key(2026, 9, 25, h)).toBe('2026-09-25');
    }
  });

  it('crosses December into January', () => {
    expect(key(2026, 12, 26)).toBe('2026-12-25');
    expect(key(2027, 1, 3)).toBe('2026-12-25');
    expect(key(2027, 1, 24)).toBe('2026-12-25');
    expect(key(2027, 1, 25)).toBe('2027-01-25');
  });

  it('handles a leap-year February', () => {
    expect(key(2024, 2, 24)).toBe('2024-01-25');
    expect(key(2024, 2, 25)).toBe('2024-02-25');
    expect(key(2024, 2, 29)).toBe('2024-02-25');
    expect(key(2024, 3, 1)).toBe('2024-02-25');
  });

  it('handles a non-leap February', () => {
    expect(key(2026, 2, 28)).toBe('2026-02-25');
    expect(key(2026, 3, 1)).toBe('2026-02-25');
  });
});

describe('cycleEnd / cycleLastDay', () => {
  it('ends on the next anchor, exclusive', () => {
    expect(toDateKey(cycleEnd(fromDateKey('2026-08-25')))).toBe('2026-09-25');
    expect(toDateKey(cycleEnd(fromDateKey('2026-12-25')))).toBe('2027-01-25');
  });

  it('spans the leap day', () => {
    const start = fromDateKey('2024-02-25');
    expect(toDateKey(cycleEnd(start))).toBe('2024-03-25');
    // The cycle before it contains 29 Feb.
    expect(toDateKey(cycleLastDay(fromDateKey('2024-01-25')))).toBe('2024-02-24');
  });

  it('last day is the 24th', () => {
    expect(toDateKey(cycleLastDay(fromDateKey('2026-08-25')))).toBe('2026-09-24');
  });
});

describe('shiftCycle', () => {
  it('steps back and forward across a year boundary', () => {
    expect(toDateKey(shiftCycle(fromDateKey('2027-01-25'), -1))).toBe('2026-12-25');
    expect(toDateKey(shiftCycle(fromDateKey('2026-12-25'), 1))).toBe('2027-01-25');
    expect(toDateKey(shiftCycle(fromDateKey('2026-08-25'), -12))).toBe('2025-08-25');
  });
});

describe('date keys are local, never UTC', () => {
  it('agrees with the local calendar at both ends of the day', () => {
    for (const h of [0, 1, 12, 22, 23]) {
      const d = new Date(2026, 7, 25, h, 30);
      expect(toDateKey(d)).toBe('2026-08-25');
    }
  });

  it('round-trips through fromDateKey', () => {
    for (const k of ['2024-02-25', '2026-12-25', '2027-01-25']) {
      expect(toDateKey(fromDateKey(k))).toBe(k);
    }
  });

  it('never matches a naive toISOString east or west of UTC', () => {
    // This is the actual bug being guarded: at 23:30 local in Istanbul the
    // UTC date is still 25 Aug, but at 00:30 it is already 24 Aug in UTC.
    const late = new Date(2026, 7, 25, 23, 30);
    expect(toDateKey(late)).toBe('2026-08-25');
    const early = new Date(2026, 7, 25, 0, 30);
    expect(toDateKey(early)).toBe('2026-08-25');
  });
});

describe('formatCycleLabel', () => {
  it('reads as a receipt date range', () => {
    expect(formatCycleLabel(fromDateKey('2026-08-25'))).toBe('25 AUG — 24 SEP');
    expect(formatCycleLabel(fromDateKey('2026-12-25'))).toBe('25 DEC — 24 JAN');
    expect(formatCycleLabel(fromDateKey('2024-01-25'))).toBe('25 JAN — 24 FEB');
  });
});

describe('currentCycleKey', () => {
  it('uses the anchor constant, whatever it is set to', () => {
    const onAnchor = new Date(2026, 5, ANCHOR_DAY, 9, 0);
    expect(currentCycleKey(onAnchor)).toBe(toDateKey(onAnchor));
  });
});
