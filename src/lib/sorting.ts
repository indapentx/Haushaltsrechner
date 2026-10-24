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

/**
 * Order by size.
 *
 * `valueOf` exists because an item's raw amount is not comparable across
 * currencies: €800 of rent is a bigger expense than ₺1.250 of electricity,
 * but a smaller number. Callers pass the value converted to whatever is on
 * screen, so the biggest item really does come first.
 */
export function byAmount(
  items: readonly Item[],
  direction: AmountSort,
  valueOf: (item: Item) => number = (item) => item.amount,
): Item[] {
  return [...items].sort((a, b) =>
    direction === 'high' ? valueOf(b) - valueOf(a) : valueOf(a) - valueOf(b),
  );
}
