import { formatCycleLabel, fromDateKey } from '../lib/cycle';
import { useBudget } from '../state/store';

/** `25 AUG — 24 SEP`, with a chevron either side. */
export function CycleNav() {
  const { cycle, canStepBack, canStepForward, stepCycle } = useBudget();

  return (
    <div className="flex items-center justify-between px-5 pb-4">
      <Chevron
        direction="back"
        disabled={!canStepBack}
        onClick={() => stepCycle(-1)}
      />
      <span className="micro text-text-secondary">
        {cycle ? formatCycleLabel(fromDateKey(cycle.start_date)) : '—'}
      </span>
      <Chevron
        direction="forward"
        disabled={!canStepForward}
        onClick={() => stepCycle(1)}
      />
    </div>
  );
}

function Chevron({
  direction,
  disabled,
  onClick,
}: {
  direction: 'back' | 'forward';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'back' ? 'Previous cycle' : 'Next cycle'}
      className="h-11 w-11 text-text-secondary disabled:text-rule active:text-text"
    >
      <svg
        viewBox="0 0 24 24"
        className="mx-auto h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path
          d={direction === 'back' ? 'M14.5 5 8 12l6.5 7' : 'M9.5 5 16 12l-6.5 7'}
          strokeLinecap="square"
        />
      </svg>
    </button>
  );
}
