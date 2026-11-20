// Error-banner shake (motion pattern 3, locked 2026-11-19): 7px peak, 300ms,
// two cycles. Banner only, never the field. No-op under reduced motion.
export function shake(el: HTMLElement | null): void {
  if (!el || typeof el.animate !== 'function') return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.animate(
    { transform: ['translateX(0)', 'translateX(-7px)', 'translateX(7px)', 'translateX(-4px)', 'translateX(4px)', 'translateX(0)'] },
    { duration: 300, easing: 'ease-out' },
  );
}
