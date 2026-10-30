import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

interface Entry {
  id: string;
  label: string;
}

/**
 * A short list you put in order by dragging the handle on each row.
 *
 * Only the handle drags (touch-action: none on it alone), so the sheet the
 * list sits in still scrolls normally everywhere else. The handle is also a
 * button: arrow keys move a row for anyone not using a pointer.
 */
export function ReorderList({
  items,
  onReorder,
  trailing,
}: {
  items: Entry[];
  onReorder: (ids: string[]) => void;
  trailing?: (item: Entry) => ReactNode;
}) {
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const drag = useRef<{ startY: number; startIndex: number; rowHeight: number; original: string[] } | null>(
    null,
  );

  // Follow the source of truth whenever nothing is being dragged.
  const signature = items.map((i) => i.id).join('|');
  useEffect(() => {
    if (!drag.current) setOrder(items.map((i) => i.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const byId = new Map(items.map((i) => [i.id, i]));

  function down(e: PointerEvent<HTMLButtonElement>, id: string) {
    const row = e.currentTarget.closest('[data-row]') as HTMLElement | null;
    drag.current = {
      startY: e.clientY,
      startIndex: order.indexOf(id),
      rowHeight: row?.getBoundingClientRect().height || 48,
      original: order,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety */
    }
    setDragId(id);
    setOffset(0);
  }

  function move(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || !dragId) return;
    const delta = e.clientY - d.startY;
    const target = Math.max(
      0,
      Math.min(d.original.length - 1, d.startIndex + Math.round(delta / d.rowHeight)),
    );
    const next = d.original.filter((id) => id !== dragId);
    next.splice(target, 0, dragId);
    setOrder(next);
    // The dragged row follows the finger; the slot it now occupies has
    // already absorbed whole rows of that movement.
    setOffset(delta - (target - d.startIndex) * d.rowHeight);
  }

  function up() {
    const d = drag.current;
    drag.current = null;
    setDragId(null);
    setOffset(0);
    if (d && order.join('|') !== d.original.join('|')) onReorder(order);
  }

  function key(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    const index = order.indexOf(id);
    const target = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : -1;
    if (target < 0 || target >= order.length) return;
    e.preventDefault();
    const next = order.filter((x) => x !== id);
    next.splice(target, 0, id);
    setOrder(next);
    onReorder(next);
  }

  return (
    <div>
      {order.map((id) => {
        const item = byId.get(id);
        if (!item) return null;
        const dragging = dragId === id;
        return (
          <div
            key={id}
            data-row
            className={`relative flex items-center border-b border-rule ${
              dragging ? 'z-10 bg-surface-raised' : 'bg-surface'
            }`}
            style={dragging ? { transform: `translateY(${offset}px)` } : undefined}
          >
            <button
              type="button"
              onPointerDown={(e) => down(e, id)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onKeyDown={(e) => key(e, id)}
              aria-label={`Move ${item.label}. Drag, or use the arrow keys.`}
              className="flex h-12 w-12 shrink-0 items-center justify-center text-text-muted active:text-text"
              style={{ touchAction: 'none' }}
            >
              {/* Three hairlines: the conventional grip, drawn rather than
                  borrowed from an icon font. */}
              <svg viewBox="0 0 16 12" className="h-3 w-4" aria-hidden="true">
                <path d="M1 1.5h14M1 6h14M1 10.5h14" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
            <span className="flex-1 text-[15px]">{item.label}</span>
            {trailing?.(item)}
          </div>
        );
      })}
    </div>
  );
}
