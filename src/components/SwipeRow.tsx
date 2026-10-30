import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

/** How far a row slides open: the width of the revealed Delete. */
const ACTION_WIDTH = 88;
/** Movement before a press counts as a drag rather than a tap. */
const SLOP = 8;

/**
 * Swipe a row left to reveal Delete; tap it to delete.
 *
 * There is deliberately no full-swipe-to-delete. These lists get used
 * one-handed while walking round a shop, and an accidental swipe should not
 * cost a line. Revealing the button and then tapping it is the confirmation
 * the spec asks destructive actions to have.
 *
 * Vertical movement is left to the browser (touch-action: pan-y), so the
 * list still scrolls normally; only a mostly-horizontal drag is taken over.
 */
export function SwipeRow({
  open,
  onOpenChange,
  onDelete,
  onTouch,
  swallowTap = false,
  className = '',
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  /** Called on every press, so the list can close any other open row. */
  onTouch?: () => void;
  /** Another row is open: this press only closes it, and must not tick. */
  swallowTap?: boolean;
  /** Must give the content an opaque background, or Delete shows through. */
  className?: string;
  children: ReactNode;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const mode = useRef<'idle' | 'horizontal' | 'vertical'>('idle');
  const suppressClick = useRef(false);

  const offset = drag ?? (open ? -ACTION_WIDTH : 0);

  function setOffset(value: number | null) {
    dragRef.current = value;
    setDrag(value);
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    onTouch?.();
    suppressClick.current = swallowTap;
    start.current = { x: e.clientX, y: e.clientY, base: open ? -ACTION_WIDTH : 0 };
    mode.current = 'idle';
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;

    if (mode.current === 'idle') {
      if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) {
        mode.current = 'horizontal';
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* capture is a nicety; the drag works without it */
        }
      } else if (Math.abs(dy) > SLOP) {
        // A scroll. Not ours.
        mode.current = 'vertical';
        start.current = null;
        return;
      } else {
        return;
      }
    }

    // Whatever a drag ends on, it was not a tap.
    suppressClick.current = true;
    // A little give past fully open, none past closed.
    setOffset(Math.min(0, Math.max(-ACTION_WIDTH * 1.25, s.base + dx)));
  }

  function up() {
    if (mode.current === 'horizontal' && dragRef.current !== null) {
      onOpenChange(dragRef.current < -ACTION_WIDTH / 2);
    } else if (mode.current === 'idle' && open) {
      // A tap on an open row closes it rather than acting on it.
      onOpenChange(false);
      suppressClick.current = true;
    }
    setOffset(null);
    start.current = null;
    mode.current = 'idle';
  }

  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        onClick={onDelete}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        className="absolute inset-y-0 right-0 border-l border-rule bg-surface-raised text-[15px] text-text active:bg-rule"
        style={{ width: ACTION_WIDTH }}
      >
        Delete
      </button>
      <div
        className={`relative ${className}`}
        style={{
          transform: `translateX(${offset}px)`,
          transition: drag === null ? 'transform 200ms ease-out' : 'none',
          touchAction: 'pan-y',
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
