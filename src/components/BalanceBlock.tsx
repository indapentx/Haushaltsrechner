import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatAmount, formatMoney } from '../lib/money';
import { Rule } from './ui';

/**
 * The signature element: a receipt total. One hairline above the figure
 * running the full content width, three supporting figures below divided by
 * vertical hairlines.
 *
 * A negative balance inverts the whole block — white ground, black figure,
 * weight 600, leading minus. Unmissable without a hue.
 */
export function BalanceBlock({
  balance,
  income,
  committed,
  stillToPay,
  currency,
  editingIncome,
  incomeDraft,
  onIncomeDraft,
  onIncomeCommit,
  onEditIncome,
}: {
  balance: number;
  income: number;
  committed: number;
  stillToPay: number;
  currency: string;
  editingIncome: boolean;
  incomeDraft: string;
  onIncomeDraft: (v: string) => void;
  onIncomeCommit: () => void;
  onEditIncome: () => void;
}) {
  const negative = balance < 0;
  const [flash, setFlash] = useState(0);
  const previous = useRef(balance);

  useEffect(() => {
    if (previous.current !== balance) {
      previous.current = balance;
      setFlash((n) => n + 1);
    }
  }, [balance]);

  return (
    <section
      className={
        negative ? 'bg-white text-black' : 'bg-ink text-text'
      }
      aria-label="Balance"
    >
      <div className={negative ? 'h-px bg-black' : 'h-px bg-rule'} />
      <div className="px-5 pt-5 pb-6">
        <span
          className={`micro ${negative ? 'text-black' : 'text-text-secondary'}`}
        >
          Balance
        </span>
        <div
          key={flash}
          className="balance-fade mt-2 font-mono tnum leading-none"
          style={{
            fontSize: 'clamp(40px, 14vw, 56px)',
            fontWeight: negative ? 600 : 500,
            letterSpacing: '-0.02em',
          }}
        >
          {formatMoney(balance, currency)}
        </div>
      </div>

      <div className={negative ? 'h-px bg-black' : 'h-px bg-rule'} />

      <div className="grid grid-cols-3">
        <Figure
          label="Income"
          value={formatAmount(income, currency)}
          negative={negative}
          onClick={onEditIncome}
          editor={
            editingIncome ? (
              <input
                autoFocus
                inputMode="decimal"
                enterKeyHint="done"
                className={`mt-1.5 block w-full font-mono tnum text-[18px] outline-none ${
                  negative ? 'text-black' : 'text-text'
                }`}
                value={incomeDraft}
                onChange={(e) => onIncomeDraft(e.target.value)}
                onBlur={onIncomeCommit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                aria-label="Income"
              />
            ) : null
          }
        />
        <Figure
          label="Committed"
          value={formatAmount(committed, currency)}
          negative={negative}
          divided
        />
        <Figure
          label="Still to pay"
          value={formatAmount(stillToPay, currency)}
          negative={negative}
          divided
        />
      </div>
      {!negative && <Rule />}
      {negative && <div className="h-px bg-black" />}
    </section>
  );
}

function Figure({
  label,
  value,
  negative,
  divided,
  onClick,
  editor,
}: {
  label: string;
  value: string;
  negative: boolean;
  divided?: boolean;
  onClick?: () => void;
  editor?: ReactNode;
}) {
  const body = (
    <>
      <span className={`micro block ${negative ? 'text-black' : 'text-text-secondary'}`}>
        {label}
      </span>
      {editor ?? <span className="mt-1.5 block font-mono tnum text-[18px]">{value}</span>}
    </>
  );

  const divider = divided
    ? negative
      ? 'border-l border-black'
      : 'border-l border-rule'
    : '';

  if (editor) {
    return <div className={`px-4 py-4 ${divider}`}>{body}</div>;
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`px-4 py-4 text-left ${divider}`}
        aria-label={`${label} — tap to edit`}
      >
        {body}
      </button>
    );
  }

  return <div className={`px-4 py-4 ${divider}`}>{body}</div>;
}
