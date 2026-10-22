import { useEffect, useRef, useState } from 'react';
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
  approximate,
  onEditIncome,
  onChangeCurrency,
}: {
  balance: number;
  income: number;
  committed: number;
  stillToPay: number;
  currency: string;
  /** A figure in here relied on an older day's exchange rate. */
  approximate?: boolean;
  onEditIncome: () => void;
  onChangeCurrency: () => void;
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
        <div className="flex items-baseline justify-between">
          <span className={`micro ${negative ? 'text-black' : 'text-text-secondary'}`}>
            Balance{approximate ? ' · approx' : ''}
          </span>
          {/* Which currency every figure on this screen is expressed in. */}
          <button
            type="button"
            onClick={onChangeCurrency}
            aria-label={`Showing ${currency}. Tap to change.`}
            className={`micro ${negative ? 'text-black' : 'text-text-secondary'} active:opacity-60`}
          >
            {currency}
          </button>
        </div>
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
}: {
  label: string;
  value: string;
  negative: boolean;
  divided?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <div className="flex h-full flex-col justify-between gap-1.5">
      <span className={`micro block ${negative ? 'text-black' : 'text-text-secondary'}`}>
        {label}
      </span>
      <span className="block font-mono tnum text-[18px]">{value}</span>
    </div>
  );

  const divider = divided
    ? negative
      ? 'border-l border-black'
      : 'border-l border-rule'
    : '';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`px-3 py-4 text-left ${divider}`}
        aria-label={`${label} — tap to edit`}
      >
        {body}
      </button>
    );
  }

  return <div className={`px-3 py-4 ${divider}`}>{body}</div>;
}
