'use client';

import Link from 'next/link';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';

export type PublicEventCard = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  day: string;
  month: string;
  time: string;
  venue: string;
  organizers: string[];
  lifecycle: Lifecycle;
};

// Category selector (locked): horizontal tabs, SENTENCE CASE, no boxes, a
// short accent underline under the active tab only, full-width hairline.
const CATEGORIES: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'life_sciences', label: 'Life sciences' },
  { key: 'engineering', label: 'Engineering' },
  { key: 'finance', label: 'Finance' },
  { key: 'technology', label: 'Technology' },
];

export function EventsListClient({ events }: { events: PublicEventCard[] }) {
  const [cat, setCat] = useState('all');
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // Sliding underline: one shared indicator translates to the active tab
  // (measured, so it tracks font metrics + resize).
  useLayoutEffect(() => {
    function measure() {
      const list = listRef.current;
      const tab = tabRefs.current.get(cat);
      if (!list || !tab) return;
      const lr = list.getBoundingClientRect();
      const tr = tab.getBoundingClientRect();
      setIndicator({ left: tr.left - lr.left + list.scrollLeft + tr.width / 2 - 12, width: 24 });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [cat]);

  const visible = useMemo(
    () => (cat === 'all' ? events : events.filter((e) => e.category === cat)),
    [events, cat],
  );

  return (
    <>
      <div
        ref={listRef}
        role="tablist"
        aria-label="Event categories"
        className="relative flex items-center justify-center gap-[40px] overflow-x-auto border-b border-outline-variant mb-lg"
      >
        {CATEGORIES.map((c) => {
          const active = cat === c.key;
          return (
            // <div role="tab"> not <button> — locked render rule (host button
            // styling clobbers) + hover stays a subtle text-darken, no box.
            <div
              key={c.key}
              ref={(el) => {
                if (el) tabRefs.current.set(c.key, el);
                else tabRefs.current.delete(c.key);
              }}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              onClick={() => setCat(c.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setCat(c.key);
                }
              }}
              className={`relative shrink-0 pb-md pt-xs cursor-pointer text-[calc(14px*var(--text-scale))] font-semibold transition-colors ${
                active ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {c.label}
            </div>
          );
        })}
        {indicator && (
          <span
            aria-hidden
            className="absolute bottom-0 h-[2px] bg-[color:var(--on-primary-container)] rounded-full transition-[left,width] duration-250 ease-out"
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
      </div>

      {visible.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-xl text-center">
          <p className="font-body-md text-body-md text-on-surface-variant">
            {events.length === 0 ? 'No open events right now — check back soon.' : 'Nothing in this category right now.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-sm">
          {visible.map((e) => (
            <li key={e.id}>
              <article className="flex items-stretch gap-md bg-surface-container-lowest border border-outline-variant rounded-[16px] p-md">
                {/* Date block */}
                <div className="flex flex-col items-center justify-center w-[64px] shrink-0 rounded-[12px] bg-surface-container-low border border-outline-variant py-sm" aria-hidden>
                  <span className="text-[calc(22px*var(--text-scale))] font-extrabold tabular-nums leading-none text-on-surface">{e.day}</span>
                  <span className="text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-wider text-on-surface-variant mt-[2px]">{e.month}</span>
                </div>

                <div className="flex-1 min-w-0">
                  {e.category && (
                    <p className="text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-[0.14em] text-[color:var(--on-primary-container)] mb-[2px]">
                      {CATEGORIES.find((c) => c.key === e.category)?.label ?? ''}
                    </p>
                  )}
                  <h2 className="font-title-lg text-title-lg font-semibold text-on-surface truncate">{e.title}</h2>
                  <p className="font-label-md text-label-md text-on-surface-variant normal-case tracking-normal mt-[2px]">
                    {e.time}{e.venue ? ` · ${e.venue}` : ''}
                  </p>
                  {e.organizers.length > 0 && (
                    <p className="font-label-md text-label-md text-on-surface-variant normal-case tracking-normal mt-[2px] truncate">
                      By {e.organizers.join(' · ')}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end justify-between shrink-0 gap-sm">
                  {e.lifecycle === 'registering' ? (
                    <span className="inline-flex items-center gap-xs px-sm py-[3px] rounded-full text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-wide bg-success-container text-on-success-container">
                      <span className="w-[6px] h-[6px] rounded-full bg-[color:var(--success)]" aria-hidden />Registering
                    </span>
                  ) : e.lifecycle === 'live' ? (
                    <span className="inline-flex items-center gap-xs px-sm py-[3px] rounded-full text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-wide bg-success-container text-on-success-container">
                      <span className="w-[6px] h-[6px] rounded-full bg-[color:var(--success)]" aria-hidden />Live
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-sm py-[3px] rounded-full text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-wide bg-surface-container-high text-on-surface-variant">
                      Starts soon
                    </span>
                  )}
                  <Link
                    href={`/events/${e.id}`}
                    className="inline-flex items-center gap-xs px-md py-sm rounded-full bg-primary text-on-primary font-label-md text-label-md hover:opacity-90 transition-opacity"
                  >
                    View
                    <span className="material-symbols-outlined text-[calc(15px*var(--text-scale))]" aria-hidden>arrow_forward</span>
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
