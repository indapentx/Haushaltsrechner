import { useMemo, useState } from 'react';
import { Micro, Rule } from '../components/ui';
import { formatAmount, formatMoney } from '../lib/money';
import { byAmount, type AmountSort } from '../lib/sorting';
import { useBudget } from '../state/store';

/** The cycle's items as a flat list. One control: the sort direction. */
export default function Expenses() {
  const { items, currency, totals } = useBudget();
  const [sort, setSort] = useState<AmountSort>('high');
  const ordered = useMemo(() => byAmount(items, sort), [items, sort]);

  return (
    <div className="pb-4">
      <div className="px-5 py-5">
        <Micro>Committed</Micro>
        <div className="mt-2 font-mono tnum text-[28px] leading-none">
          {formatMoney(totals.committed, currency)}
        </div>
      </div>
      <Rule />

      <div className="flex px-5 py-3">
        <button
          type="button"
          onClick={() => setSort((s) => (s === 'high' ? 'low' : 'high'))}
          className="micro text-text-secondary active:text-text"
          aria-label={`Sorted by amount, ${sort === 'high' ? 'high to low' : 'low to high'}. Tap to reverse.`}
        >
          Amount, {sort === 'high' ? 'high to low' : 'low to high'}
        </button>
      </div>
      <Rule />

      {ordered.length === 0 ? (
        <p className="px-5 py-10 text-[15px] text-text-muted">No items in this cycle.</p>
      ) : (
        ordered.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 border-b border-rule px-5 py-4"
          >
            <span
              className={`flex-1 text-[16px] ${item.is_paid ? 'text-text-muted' : 'text-text'}`}
            >
              {item.name}
            </span>
            <span
              className={`font-mono tnum text-[16px] ${
                item.is_paid ? 'text-text-muted' : 'text-text'
              }`}
            >
              {formatAmount(item.amount, currency)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
