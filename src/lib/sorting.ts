import type { Item } from './db';

/**
 * Checklist order: unpaid at the top in the order they were added, paid
 * pushed to the bottom in the order they were ticked. Paid rows are never
 * hidden — they move.
 */
export function checklistOrder(items: readonly Item[]): Item[] {
  return [...items].sort((a, b) => {
    if (a.is_paid !== b.is_paid) return a.is_paid ? 1 : -1;
    if (a.is_paid && b.is_paid) {
      const at = a.paid_at ?? '';
      const bt = b.paid_at ?? '';
      if (at !== bt) return at < bt ? -1 : 1;
    }
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at < b.created_at ? -1 : 1;
  });
}

export type AmountSort = 'high' | 'low';

/** Expenses order: the one control on that screen. */
export function byAmount(items: readonly Item[], direction: AmountSort): Item[] {
  return [...items].sort((a, b) =>
    direction === 'high' ? b.amount - a.amount : a.amount - b.amount,
  );
}
