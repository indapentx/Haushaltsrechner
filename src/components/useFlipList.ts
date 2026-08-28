import { useLayoutEffect, useRef } from 'react';

/**
 * FLIP: when the list reorders, animate each row from where it was to where
 * it now is. Used for paid rows sliding to the bottom of the checklist.
 * 200ms ease-out, and nothing moves under prefers-reduced-motion.
 */
export function useFlipList(order: string) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const positions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const reduce =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    const next = new Map<string, number>();
    nodes.current.forEach((el, id) => {
      const top = el.getBoundingClientRect().top;
      const before = positions.current.get(id);
      if (!reduce && before !== undefined && Math.abs(before - top) > 0.5) {
        el.animate(
          [{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }],
          { duration: 200, easing: 'ease-out' },
        );
      }
      next.set(id, top);
    });
    positions.current = next;
  }, [order]);

  return (id: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  };
}
