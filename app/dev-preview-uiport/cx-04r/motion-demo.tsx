'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// CX-04R motion specimen: the same card list under the three motion options, so the difference can be felt. Sample only.
// The rows and bar arrive as server-rendered nodes; this file only owns the timing.

type Mode = '2a' | '2b' | '2c';
type Tab = 'active' | 'drafts';

const CSS = `
@keyframes m-bar-a { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes m-rise-b { from { opacity: 0; transform: translateY(16px); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes m-scrub-c { from { opacity: 0.1; } to { opacity: 1; } }
.m-2a-bar { animation: m-bar-a 180ms cubic-bezier(0.23, 1, 0.32, 1) both; }
.m-2b-row { animation: m-rise-b 800ms cubic-bezier(0.32, 0.72, 0, 1) both; animation-delay: calc(var(--i) * 60ms); }
.m-2b-bar { animation: m-rise-b 700ms cubic-bezier(0.32, 0.72, 0, 1) both; }
.m-2c-row { animation: m-scrub-c linear both; animation-timeline: view(); animation-range: entry 0% entry 70%; }
.m-tab { transition: color 120ms ease-out, border-color 120ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .m-2a-bar, .m-2b-row, .m-2b-bar { animation-name: m-fade; animation-duration: 150ms; animation-delay: 0ms; }
  .m-2c-row { animation: none; }
  @keyframes m-fade { from { opacity: 0; } to { opacity: 1; } }
}
`;

const MODES: [Mode, string][] = [
  ['2a', '2a Almost none'],
  ['2b', '2b Slow and weighted'],
  ['2c', '2c Scroll-driven'],
];

export function MotionDemo({ active, drafts, bar }: { active: ReactNode[]; drafts: ReactNode[]; bar: ReactNode }) {
  const [mode, setMode] = useState<Mode>('2a');
  const [tab, setTab] = useState<Tab>('active');
  const [showBar, setShowBar] = useState(false);
  const [run, setRun] = useState(0);
  const rows = tab === 'active' ? active : drafts;
  const pill = (on: boolean) => cn('min-h-11 rounded-full border px-md font-label-md text-label-md', on ? 'border-transparent bg-primary text-on-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high');

  return (
    <div className="space-y-sm rounded-[14px] border border-outline-variant bg-surface p-md">
      <style>{CSS}</style>
      <p className="font-body-md text-body-md text-on-surface-variant">
        Live sample of the same card list. Pick a motion option, then switch the tab, tick a row, and scroll the list. 2c only works in a browser that supports scroll-driven animation (current Chrome and Safari); elsewhere rows just show.
      </p>
      <div role="radiogroup" aria-label="Motion option" className="flex flex-wrap gap-xs">
        {MODES.map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => { setMode(k); setRun((n) => n + 1); }} className={pill(mode === k)}>{l}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-sm border-b border-outline-variant">
        <div role="tablist" aria-label="Event state" className="flex gap-lg">
          {(['active', 'drafts'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('m-tab -mb-px min-h-11 border-b-2 font-label-md text-label-md', tab === k ? 'border-[color:var(--on-primary-container)] text-on-surface' : 'border-transparent text-on-surface-variant')}>
              {k === 'active' ? 'Active' : 'Drafts'}
            </button>
          ))}
        </div>
        <div className="flex gap-xs pb-xs">
          <button type="button" onClick={() => setShowBar((v) => !v)} className={pill(showBar)}>{showBar ? 'Clear selection' : 'Tick a row'}</button>
          <button type="button" onClick={() => setRun((n) => n + 1)} className={pill(false)}>Replay</button>
        </div>
      </div>
      {showBar && <div key={`bar-${mode}-${run}`} className={mode === '2b' ? 'm-2b-bar' : mode === '2a' ? 'm-2a-bar' : ''}>{bar}</div>}
      <div key={`${tab}-${mode}-${run}`} className="@container flex h-[440px] flex-col gap-sm overflow-y-auto pr-xs">
        {rows.map((r, i) => (
          <ul key={i} style={{ ['--i' as string]: i }} className={mode === '2b' ? 'm-2b-row' : mode === '2c' ? 'm-2c-row' : ''}>{r}</ul>
        ))}
      </div>
    </div>
  );
}
