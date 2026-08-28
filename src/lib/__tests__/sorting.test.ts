import { describe, expect, it } from 'vitest';
import { byAmount, checklistOrder } from '../sorting';
import type { Item } from '../db';

const item = (over: Partial<Item> & { id: string }): Item => ({
  cycle_id: 'c',
  name: over.id,
  amount: 0,
  is_paid: false,
  paid_at: null,
  sort_order: 0,
  created_at: '2026-08-25T10:00:00Z',
  ...over,
});

describe('checklistOrder', () => {
  it('keeps unpaid on top in their own order', () => {
    const items = [
      item({ id: 'b', sort_order: 1 }),
      item({ id: 'a', sort_order: 0 }),
      item({ id: 'c', sort_order: 2 }),
    ];
    expect(checklistOrder(items).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('moves paid to the bottom, in the order they were ticked', () => {
    const items = [
      item({ id: 'a', sort_order: 0, is_paid: true, paid_at: '2026-08-26T09:00:00Z' }),
      item({ id: 'b', sort_order: 1 }),
      item({ id: 'c', sort_order: 2, is_paid: true, paid_at: '2026-08-25T09:00:00Z' }),
    ];
    expect(checklistOrder(items).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('never drops a paid row', () => {
    const items = [
      item({ id: 'a', is_paid: true, paid_at: '2026-08-26T09:00:00Z' }),
      item({ id: 'b', is_paid: true, paid_at: '2026-08-27T09:00:00Z' }),
    ];
    expect(checklistOrder(items)).toHaveLength(2);
  });

  it('does not mutate the input', () => {
    const items = [item({ id: 'b', sort_order: 1 }), item({ id: 'a', sort_order: 0 })];
    checklistOrder(items);
    expect(items.map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('byAmount', () => {
  const items = [
    item({ id: 'mid', amount: 500 }),
    item({ id: 'big', amount: 4500 }),
    item({ id: 'small', amount: 12.1 }),
  ];

  it('sorts high to low by default', () => {
    expect(byAmount(items, 'high').map((i) => i.id)).toEqual(['big', 'mid', 'small']);
  });

  it('sorts low to high', () => {
    expect(byAmount(items, 'low').map((i) => i.id)).toEqual(['small', 'mid', 'big']);
  });

  it('ignores whether an item is paid', () => {
    const mixed = [
      item({ id: 'paid-big', amount: 999, is_paid: true }),
      item({ id: 'unpaid-small', amount: 1 }),
    ];
    expect(byAmount(mixed, 'high').map((i) => i.id)).toEqual(['paid-big', 'unpaid-small']);
  });
});
