'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Review-mode overlay. Auto-labels every clickable / structural element on
// the page so the reviewer can point at things by code ("EE-7 should be
// left of EE-9"). Lays a 12-column grid so positioning intent is legible.
// Mounted only when NEXT_PUBLIC_EVENTAR_REVIEW_MODE === 'true' — pair with
// the requireStaff() + proxy bypass in lib/auth.ts + proxy.ts. Strip both
// the env var and the mount before pushing to production.

const PAGE_PREFIXES: Array<[RegExp, string]> = [
  [/^\/events\/new$/, 'EE'],
  [/^\/events\/[^/]+\/edit$/, 'EE'],
  [/^\/events\/[^/]+\/details$/, 'ED'],
  [/^\/events\/[^/]+\/checkin$/, 'TC'],
  [/^\/events\/[^/]+\/analytics$/, 'AN'],
  [/^\/events\/[^/]+\/poster$/, 'PO'],
  [/^\/events\/[^/]+$/, 'PE'],
  [/^\/checkin\/confirm$/, 'CI'],
  [/^\/survey$/, 'SV'],
  [/^\/dashboard$/, 'DB'],
  [/^\/login$/, 'LG'],
  [/^\/settings$/, 'ST'],
];

function pagePrefix(pathname: string): string {
  for (const [pattern, prefix] of PAGE_PREFIXES) {
    if (pattern.test(pathname)) return prefix;
  }
  return 'PG';
}

const LABELABLE_SELECTORS = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'section',
  'header',
  'footer',
  'h1',
  'h2',
  'h3',
  '[role="alert"]',
  '[role="status"]',
  '[data-review-label]',
].join(',');

type Label = { rect: DOMRect; code: string; el: Element };

export function ReviewOverlay() {
  const pathname = usePathname();
  const prefix = pagePrefix(pathname);

  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [labels, setLabels] = useState<Label[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  const compute = useCallback(() => {
    if (!showLabels) {
      setLabels([]);
      return;
    }
    const elements = document.querySelectorAll(LABELABLE_SELECTORS);
    const result: Label[] = [];
    let counter = 0;
    elements.forEach((el) => {
      if (el.closest('[data-review-overlay]')) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      counter++;
      result.push({ rect, code: `${prefix}-${counter}`, el });
    });
    setLabels(result);
  }, [prefix, showLabels]);

  useEffect(() => {
    // requestAnimationFrame the first paint so the setState calls don't
    // cascade synchronously inside the effect (eslint react-hooks/purity).
    const raf = requestAnimationFrame(() => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      compute();
    });
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      compute();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', compute, { passive: true });
    const obs = new MutationObserver(compute);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', compute);
      obs.disconnect();
    };
  }, [compute]);

  function copyToClipboard(code: string) {
    navigator.clipboard?.writeText(code).catch(() => {});
  }

  return (
    <div
      data-review-overlay=""
      className="pointer-events-none fixed inset-0 z-[9999]"
      aria-hidden
    >
      {showGrid && (
        <div className="absolute inset-0 mx-auto w-full max-w-[1280px] px-grid-margin">
          <div className="h-full grid grid-cols-12 gap-grid-gutter">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(0,112,243,0.04)',
                  borderLeft: '1px dashed rgba(0,112,243,0.18)',
                  borderRight:
                    i === 11 ? '1px dashed rgba(0,112,243,0.18)' : 'none',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {showLabels &&
        labels.map(({ rect, code }) => {
          const isHovered = hovered === code;
          return (
            <button
              key={code}
              type="button"
              onMouseEnter={() => setHovered(code)}
              onMouseLeave={() => setHovered(null)}
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(code);
              }}
              className="pointer-events-auto absolute font-mono text-[10px] font-bold text-white px-[5px] py-[1px] rounded-sm"
              style={{
                left: Math.max(2, rect.left),
                top: Math.max(2, rect.top - 13),
                background: isHovered ? '#0a0a0a' : '#0070f3',
                boxShadow: isHovered ? '0 0 0 1px #0a0a0a' : 'none',
                cursor: 'pointer',
              }}
              title={`${code} — click to copy`}
            >
              {code}
            </button>
          );
        })}

      {showLabels && hovered && (
        (() => {
          const target = labels.find((l) => l.code === hovered);
          if (!target) return null;
          return (
            <div
              className="absolute"
              style={{
                left: target.rect.left,
                top: target.rect.top,
                width: target.rect.width,
                height: target.rect.height,
                border: '2px solid #0070f3',
                background: 'rgba(0,112,243,0.06)',
              }}
            />
          );
        })()
      )}

      <div
        className="pointer-events-auto fixed bottom-4 right-4 bg-white text-[#0a0a0a] border border-[#eaeaea] rounded-lg shadow-lg p-3 flex flex-col gap-2 text-xs font-mono"
        data-review-overlay-controls
        style={{ minWidth: 180 }}
      >
        <p
          className="font-bold uppercase tracking-wider m-0"
          style={{ fontSize: 10, color: '#525252' }}
        >
          Review · {prefix} · {viewport.w}×{viewport.h}
        </p>
        <label className="flex items-center gap-2 cursor-pointer m-0">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(e) => setShowGrid(e.target.checked)}
          />
          <span>12-col grid</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer m-0">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
          />
          <span>Element labels ({labels.length})</span>
        </label>
        <p
          className="m-0"
          style={{ fontSize: 10, color: '#525252', lineHeight: 1.3 }}
        >
          Click a label to copy its code.
        </p>
      </div>
    </div>
  );
}
