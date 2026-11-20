'use client';

import { useEffect, type RefObject } from 'react';

// Sets data-fade-start / data-fade-end on a horizontal scroller so the
// `.scroll-fade` mask (app/globals.css) fades only a side that has hidden
// content. Attach with className="scroll-fade overflow-x-auto" and a ref.
export function useScrollFade(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      el.dataset.fadeStart = el.scrollLeft > 1 ? '1' : '0';
      el.dataset.fadeEnd = el.scrollLeft + el.clientWidth < el.scrollWidth - 1 ? '1' : '0';
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    // ResizeObserver is absent in jsdom; the scroll listener alone still works there.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [ref]);
}
