'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Specimen-only measuring: reads what the browser really rendered from the product's own classes and tokens,
// so a number on this page is a measurement and not a typed-in estimate. The pane's animation timeline can
// stall at 0, leaving 150 ms colour transitions on their first-paint values, so transitions are finished first.

type Rgba = [number, number, number, number];

function pixel(ctx: CanvasRenderingContext2D, layers: string[]): Rgba {
  ctx.clearRect(0, 0, 1, 1);
  for (const css of layers) {
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
  }
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3] / 255];
}

function lum([r, g, b]: Rgba) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a: Rgba, b: Rgba) {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Backgrounds of the element and every ancestor, painted bottom to top, give the colour the eye sees.
function backdrop(el: Element) {
  const layers: string[] = [];
  for (let n: Element | null = el; n; n = n.parentElement) layers.unshift(getComputedStyle(n).backgroundColor);
  return layers;
}

export type ProbeWhat = 'text' | 'border' | 'clip';

/** Measures the first `[data-probe]` descendant and prints the result under the children. */
export function Probe({ what, need, children }: { what: ProbeWhat; need?: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const out = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const run = () => {
      const target = box.current?.querySelector<HTMLElement>('[data-probe]');
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!target || !ctx || !out.current) return;
      document.getAnimations().forEach((a) => {
        if (a instanceof CSSTransition) a.finish();
      });
      if (what === 'clip') {
        // The label's box against the column that must hold it: any overhang is clipped by the row.
        const col = target.closest('[data-col]') ?? target;
        const range = document.createRange();
        range.selectNodeContents(target);
        const c = range.getBoundingClientRect();
        const t = target.getBoundingClientRect();
        const k = col.getBoundingClientRect();
        const over = Math.round(Math.max(t.right - k.right, k.left - t.left, c.right - t.right, t.left - c.left, 0));
        out.current.textContent = over > 0 ? `Measured here: Check-in sticks out of its ${Math.round(k.width)} px column by ${over} px` : `Measured here: fits inside the ${Math.round(k.width)} px column`;
        return;
      }
      const cs = getComputedStyle(target);
      const bg = pixel(ctx, backdrop(target));
      const fgCss = what === 'text' ? cs.color : cs.borderTopColor;
      const fg = pixel(ctx, [...backdrop(target), fgCss]);
      const r = ratio(fg, bg);
      const verdict = need ? (r >= need ? `passes ${need}:1` : `under ${need}:1`) : '';
      out.current.textContent = `Measured here: ${r.toFixed(2)}:1 ${what === 'text' ? 'text' : 'border'} ${verdict}`.trim();
    };
    run();
    const t = setTimeout(run, 500);
    const mo = new MutationObserver(run);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => {
      clearTimeout(t);
      mo.disconnect();
    };
  }, [what, need]);

  return (
    <div ref={box}>
      {children}
      <p ref={out} className="mt-xs font-label-md text-label-md text-on-surface-variant">Measuring…</p>
    </div>
  );
}
