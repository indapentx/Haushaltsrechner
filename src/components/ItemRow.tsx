import { useRef, useState } from 'react';
import type { Item } from '../lib/db';
import { formatAmount } from '../lib/money';

/**
 * Tapping anywhere on the row toggles paid. Editing and deleting are behind
 * a long press (or the ··· control, which appears on hover and focus for the
 * laptop, where there is no comfortable long press).
 */
export function ItemRow({
  item,
  currency,
  onToggle,
  onOpenActions,
  rowRef,
}: {
  item: Item;
  currency: string;
  onToggle: () => void;
  onOpenActions: () => void;
  rowRef: (el: HTMLElement | null) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const [pressed, setPressed] = useState(false);

  function startPress() {
    longPressed.current = false;
    setPressed(true);
    timer.current = setTimeout(() => {
      longPressed.current = true;
      setPressed(false);
      onOpenActions();
    }, 500);
  }

  function endPress() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPressed(false);
  }

  return (
    <div
      ref={rowRef}
      className={`group relative border-b border-rule ${pressed ? 'bg-surface-raised' : 'bg-surface'}`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={item.is_paid}
        onClick={() => {
          if (longPressed.current) return;
          onToggle();
        }}
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onPointerCancel={endPress}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenActions();
        }}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <Box checked={item.is_paid} />
        <span
          className={`flex-1 text-[16px] ${
            item.is_paid ? 'text-text-muted line-through' : 'text-text'
          }`}
        >
          {item.name}
        </span>
        <span
          className={`font-mono tnum text-[16px] ${
            item.is_paid ? 'text-text-muted line-through' : 'text-text'
          }`}
        >
          {formatAmount(item.amount, currency)}
        </span>
      </button>

      <button
        type="button"
        onClick={onOpenActions}
        aria-label={`Edit or delete ${item.name}`}
        className="absolute top-1/2 right-0 hidden h-11 w-8 -translate-y-1/2 text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 sm:block"
      >
        ···
      </button>
    </div>
  );
}

/** A square, not a tick in a circle: closer to a ledger than to a checkbox. */
function Box({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center border ${
        checked ? 'border-text-muted' : 'border-text-secondary'
      }`}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-text-muted" aria-hidden="true">
          <path
            d="M2 6.5 4.7 9 10 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="square"
          />
        </svg>
      )}
    </span>
  );
}
