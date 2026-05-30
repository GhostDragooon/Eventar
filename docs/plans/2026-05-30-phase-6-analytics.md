# Phase 6 — Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every task with a test step. Use `superpowers:verification-before-completion` before declaring the phase shipped.

**Goal:** Build Phase 6 analytics — `/events/[id]/analytics` per-event feedback page (5-slice card + 2 rule-templated insight cards) and an extended `/dashboard` (aggregate Layer-1 tiles + per-row attendance/feedback strip). Read-only, RLS-aware, no schema changes.

**Architecture:** Server Components on both surfaces, parallel `Promise.all` reads via `supabaseServer`, distributions computed in-process by pure helpers in `lib/analytics/`. The per-event page renders exactly per the locked visual framework at `docs/plans/phase-6-analytics-q2-mockup.html`. No new RPC, no new dependencies, no migration. See [design doc](2026-05-30-phase-6-analytics-design.md) and [[02 — Decisions Log#Q16]] for the locked decisions.

**Tech Stack:** Next.js 16 (App Router, Server Components), TypeScript, Tailwind v4 with the existing M3 indigo tokens, Vitest, `@supabase/supabase-js` via the existing `lib/supabase/server.ts` (RLS-aware) and `lib/supabase/admin.ts` (only if a read needs to escape RLS — Phase 6 does NOT).

**Source-of-truth reads** (each task may need to consult):
- `lib/surveyTemplate.ts` — slug → label mapping (Phase 5 SSOT)
- `app/dashboard/page.tsx` — existing dashboard surface + the `MetricCard` + `StatusPill` patterns
- `app/events/[id]/edit/page.tsx` — pattern for `requireStaff()` + `notFound()` + `supabaseServer` reads
- `app/(public)/survey/actions.ts` — patterns for parallel queries
- `docs/plans/phase-6-analytics-q2-mockup.html` — the locked visual framework

**Running invariants going in** — `tsc` clean · `eslint` clean · vitest **90/90 across 11 files** · next build **12 routes**.

**Running invariants target out** — `tsc` clean · `eslint` clean · vitest **~96/96 across ~15 files** · next build **13 routes** (added `/events/[id]/analytics`).

---

## Task 1: `lib/analytics/countBySlug.ts` — single-select distribution helper

**Files:**
- Create: `lib/analytics/countBySlug.ts`
- Test: `lib/analytics/countBySlug.test.ts`

**Step 1: Write the failing test**

Create `lib/analytics/countBySlug.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { countBySlug } from './countBySlug';

type Row = { session_format: string | null };

const labels: Record<string, string> = {
  scientific_presentations: 'Scientific Presentations',
  clinical_panels: 'Clinical Panel Discussions',
  interactive_qa: 'Interactive Q&A Sessions',
  peer_networking: 'Peer Networking',
};

describe('countBySlug', () => {
  it('returns empty array for empty rows', () => {
    expect(countBySlug<Row, 'session_format'>([], 'session_format', labels)).toEqual([]);
  });

  it('ignores null values in the count + denominator', () => {
    const rows: Row[] = [
      { session_format: 'peer_networking' },
      { session_format: null },
      { session_format: 'peer_networking' },
    ];
    const out = countBySlug(rows, 'session_format', labels);
    const top = out.find((r) => r.slug === 'peer_networking');
    expect(top?.count).toBe(2);
    expect(top?.pct).toBe(100); // 2 of 2 non-null
  });

  it('sorts descending by count', () => {
    const rows: Row[] = [
      { session_format: 'peer_networking' },
      { session_format: 'peer_networking' },
      { session_format: 'peer_networking' },
      { session_format: 'scientific_presentations' },
      { session_format: 'scientific_presentations' },
      { session_format: 'interactive_qa' },
    ];
    const out = countBySlug(rows, 'session_format', labels);
    expect(out.map((r) => r.slug)).toEqual(['peer_networking', 'scientific_presentations', 'interactive_qa']);
  });

  it('rounds percent to nearest integer', () => {
    const rows: Row[] = [
      { session_format: 'peer_networking' },
      { session_format: 'peer_networking' },
      { session_format: 'scientific_presentations' },
    ];
    const out = countBySlug(rows, 'session_format', labels);
    expect(out[0].pct).toBe(67);
    expect(out[1].pct).toBe(33);
  });

  it('includes label from the labels map; falls back to slug if missing', () => {
    const rows: Row[] = [{ session_format: 'peer_networking' }, { session_format: 'unknown_slug' }];
    const out = countBySlug(rows, 'session_format', labels);
    expect(out.find((r) => r.slug === 'peer_networking')?.label).toBe('Peer Networking');
    expect(out.find((r) => r.slug === 'unknown_slug')?.label).toBe('unknown_slug');
  });
});
```

**Step 2: Run test, verify failure**

Run: `pnpm exec vitest run lib/analytics/countBySlug.test.ts`
Expected: FAIL — "Cannot find module './countBySlug'".

**Step 3: Write minimal implementation**

Create `lib/analytics/countBySlug.ts`:

```ts
export type Distribution = {
  slug: string;
  label: string;
  count: number;
  pct: number;
};

export function countBySlug<TRow, TKey extends keyof TRow>(
  rows: TRow[],
  key: TKey,
  labels: Record<string, string>,
): Distribution[] {
  const counts = new Map<string, number>();
  let denom = 0;
  for (const row of rows) {
    const value = row[key];
    if (value == null) continue;
    const slug = String(value);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
    denom++;
  }
  if (denom === 0) return [];
  return [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      label: labels[slug] ?? slug,
      count,
      pct: Math.round((count / denom) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}
```

**Step 4: Run test, verify pass**

Run: `pnpm exec vitest run lib/analytics/countBySlug.test.ts`
Expected: PASS — 5/5.

**Step 5: Commit**

```bash
git add lib/analytics/countBySlug.ts lib/analytics/countBySlug.test.ts
git commit -m "feat(analytics): countBySlug helper for single-select distributions (Phase 6)"
```

---

## Task 2: `lib/analytics/countBySlugMulti.ts` — multi-select distribution helper (Q5)

**Files:**
- Create: `lib/analytics/countBySlugMulti.ts`
- Test: `lib/analytics/countBySlugMulti.test.ts`

**Why separate from countBySlug:** Q5 `future_preferences` is a `text[]`. Denominator is "rows where the array is non-empty" (i.e. responders who answered Q5). Each slug's % can sum > 100% across slugs since each responder can pick multiple.

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { countBySlugMulti } from './countBySlugMulti';

type Row = { future_preferences: string[] };

const labels: Record<string, string> = {
  expanded_qa: 'Expanded Interactive Q&A',
  increased_clinical_depth: 'Increased Clinical Depth',
  structured_networking: 'Structured Networking',
  subspecialty_topics: 'Diverse Sub-specialty Topics',
};

describe('countBySlugMulti', () => {
  it('returns empty array for empty rows', () => {
    expect(countBySlugMulti<Row, 'future_preferences'>([], 'future_preferences', labels)).toEqual([]);
  });

  it('ignores rows with empty array in the denominator', () => {
    const rows: Row[] = [
      { future_preferences: ['structured_networking'] },
      { future_preferences: [] },
      { future_preferences: ['structured_networking', 'expanded_qa'] },
    ];
    const out = countBySlugMulti(rows, 'future_preferences', labels);
    const top = out.find((r) => r.slug === 'structured_networking');
    expect(top?.count).toBe(2);
    expect(top?.pct).toBe(100); // 2 of 2 non-empty responders picked it
  });

  it('percents can sum > 100% (multi-select semantics)', () => {
    const rows: Row[] = [
      { future_preferences: ['structured_networking', 'expanded_qa'] },
      { future_preferences: ['structured_networking', 'increased_clinical_depth'] },
    ];
    const out = countBySlugMulti(rows, 'future_preferences', labels);
    const sum = out.reduce((s, r) => s + r.pct, 0);
    expect(sum).toBeGreaterThan(100);
  });

  it('sorts descending by count', () => {
    const rows: Row[] = [
      { future_preferences: ['structured_networking'] },
      { future_preferences: ['structured_networking', 'expanded_qa'] },
      { future_preferences: ['structured_networking', 'increased_clinical_depth'] },
    ];
    const out = countBySlugMulti(rows, 'future_preferences', labels);
    expect(out[0].slug).toBe('structured_networking');
  });
});
```

**Step 2: Verify failure** — `pnpm exec vitest run lib/analytics/countBySlugMulti.test.ts` → FAIL.

**Step 3: Implementation**

```ts
import type { Distribution } from './countBySlug';

export function countBySlugMulti<TRow, TKey extends keyof TRow>(
  rows: TRow[],
  key: TKey,
  labels: Record<string, string>,
): Distribution[] {
  const counts = new Map<string, number>();
  let responders = 0;
  for (const row of rows) {
    const arr = row[key] as unknown as string[] | null | undefined;
    if (!arr || arr.length === 0) continue;
    responders++;
    for (const slug of arr) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  if (responders === 0) return [];
  return [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      label: labels[slug] ?? slug,
      count,
      pct: Math.round((count / responders) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add lib/analytics/countBySlugMulti.ts lib/analytics/countBySlugMulti.test.ts
git commit -m "feat(analytics): countBySlugMulti helper for multi-select Q5 distribution (Phase 6)"
```

---

## Task 3: `lib/analytics/happyRate.ts` — Q4 "Met/Exceeded" fraction

**Files:**
- Create: `lib/analytics/happyRate.ts`
- Test: `lib/analytics/happyRate.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { happyRate } from './happyRate';

type Row = { expectations: string | null };

describe('happyRate', () => {
  it('returns null when there are no non-null Q4 rows', () => {
    expect(happyRate<Row>([], 'expectations')).toBeNull();
    expect(happyRate<Row>([{ expectations: null }, { expectations: null }], 'expectations')).toBeNull();
  });

  it('returns the fraction of exceeded+met over non-null Q4 rows', () => {
    const rows: Row[] = [
      { expectations: 'exceeded' },
      { expectations: 'met' },
      { expectations: 'partially' },
      { expectations: 'not_met' },
    ];
    expect(happyRate(rows, 'expectations')).toBe(0.5);
  });

  it('null rows do not affect the denominator', () => {
    const rows: Row[] = [
      { expectations: 'exceeded' },
      { expectations: null },
      { expectations: 'met' },
    ];
    expect(happyRate(rows, 'expectations')).toBe(1);
  });
});
```

**Step 2: Verify failure.**

**Step 3: Implementation**

```ts
export function happyRate<TRow>(
  rows: TRow[],
  key: keyof TRow,
): number | null {
  let happy = 0;
  let denom = 0;
  for (const row of rows) {
    const v = row[key];
    if (v == null) continue;
    denom++;
    if (v === 'exceeded' || v === 'met') happy++;
  }
  if (denom === 0) return null;
  return happy / denom;
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add lib/analytics/happyRate.ts lib/analytics/happyRate.test.ts
git commit -m "feat(analytics): happyRate helper for Q4 (Phase 6)"
```

---

## Task 4: `lib/analytics/arrivalLatency.ts` — % checked in within first 15 min

**Files:**
- Create: `lib/analytics/arrivalLatency.ts`
- Test: `lib/analytics/arrivalLatency.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { arrivalLatency } from './arrivalLatency';

const START = new Date('2026-06-01T10:00:00Z').toISOString();

describe('arrivalLatency', () => {
  it('returns null when no one has checked in', () => {
    expect(arrivalLatency([], START)).toBeNull();
    expect(arrivalLatency([{ check_in_at: null }, { check_in_at: null }], START)).toBeNull();
  });

  it('counts only check_in_at within 15 minutes after start_time', () => {
    const rows = [
      { check_in_at: '2026-06-01T10:00:00Z' }, // on time
      { check_in_at: '2026-06-01T10:14:59Z' }, // 14:59 after — IN
      { check_in_at: '2026-06-01T10:15:01Z' }, // 15:01 after — OUT
      { check_in_at: '2026-06-01T10:30:00Z' }, // 30 min after — OUT
    ];
    expect(arrivalLatency(rows, START)).toBe(0.5);
  });

  it('includes early arrivals (negative latency) as "on time"', () => {
    const rows = [
      { check_in_at: '2026-06-01T09:55:00Z' }, // 5 min early — IN
      { check_in_at: '2026-06-01T10:30:00Z' }, // 30 min after — OUT
    ];
    expect(arrivalLatency(rows, START)).toBe(0.5);
  });

  it('null check_in_at rows do not affect the denominator', () => {
    const rows = [
      { check_in_at: '2026-06-01T10:00:00Z' },
      { check_in_at: null },
    ];
    expect(arrivalLatency(rows, START)).toBe(1);
  });
});
```

**Step 2: Verify failure.**

**Step 3: Implementation**

```ts
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

type Row = { check_in_at: string | null };

export function arrivalLatency(rows: Row[], startTime: string): number | null {
  const startMs = new Date(startTime).getTime();
  let onTime = 0;
  let denom = 0;
  for (const row of rows) {
    if (row.check_in_at == null) continue;
    denom++;
    const diff = new Date(row.check_in_at).getTime() - startMs;
    if (diff <= FIFTEEN_MIN_MS) onTime++;
  }
  if (denom === 0) return null;
  return onTime / denom;
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add lib/analytics/arrivalLatency.ts lib/analytics/arrivalLatency.test.ts
git commit -m "feat(analytics): arrivalLatency helper for Layer-1 (Phase 6)"
```

---

## Task 5: `lib/analytics/narrative.ts` — rule-templated bottom-card text

**Files:**
- Create: `lib/analytics/narrative.ts`
- Test: `lib/analytics/narrative.test.ts`

Two functions matching the two info-cards from the locked mockup:
1. `operationalInsightText(m)` — "Operational Insight" card (the `info` icon, surface-container bg)
2. `keyMetricAnalysisText(m)` — "Key Operational Metric Analysis" card (the `analytics` icon, surface-container-high bg)

Rules deliberately simple — they fire on attendance + sentiment thresholds.

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { keyMetricAnalysisText, operationalInsightText } from './narrative';

describe('operationalInsightText', () => {
  it('flags expectation gap when show-up high + happy low', () => {
    const out = operationalInsightText({ showUpRate: 0.85, happyRate: 0.7, responseRate: 0.5 });
    expect(out.toLowerCase()).toContain('expectation gap');
  });

  it('flags promo / timing concern when show-up low', () => {
    const out = operationalInsightText({ showUpRate: 0.4, happyRate: 0.9, responseRate: 0.5 });
    expect(out.toLowerCase()).toMatch(/timing|reminder|promo/);
  });

  it('returns a "healthy" message when show-up high + happy high', () => {
    const out = operationalInsightText({ showUpRate: 0.85, happyRate: 0.92, responseRate: 0.5 });
    expect(out.toLowerCase()).toMatch(/healthy|strong|on track/);
  });

  it('flags low signal when response rate below 50%', () => {
    const out = operationalInsightText({ showUpRate: 0.85, happyRate: 0.92, responseRate: 0.3 });
    expect(out.toLowerCase()).toContain('low response');
  });
});

describe('keyMetricAnalysisText', () => {
  it('is non-empty boilerplate that mentions show-up + Q4 cross-reference', () => {
    const out = keyMetricAnalysisText({ showUpRate: 0.82, happyRate: 0.91, responseRate: 0.7 });
    expect(out.length).toBeGreaterThan(40);
    expect(out.toLowerCase()).toMatch(/show-up|attendance/);
    expect(out.toLowerCase()).toMatch(/satisfaction|expectations|q4/);
  });
});
```

**Step 2: Verify failure.**

**Step 3: Implementation**

```ts
export type NarrativeMetrics = {
  showUpRate: number; // 0..1
  happyRate: number | null; // 0..1 or null
  responseRate: number; // 0..1
};

export function operationalInsightText(m: NarrativeMetrics): string {
  if (m.responseRate < 0.5) {
    return `Low response rate (${pct(m.responseRate)}) means the feedback below is suggestive, not representative. Worth a follow-up nudge before drawing conclusions.`;
  }
  const happy = m.happyRate ?? 0;
  if (m.showUpRate >= 0.75 && happy < 0.8) {
    return `High show-up rate (${pct(m.showUpRate)}) coupled with ${pct(1 - happy)} neutral/negative sentiment suggests operational success but a potential expectation gap in content depth.`;
  }
  if (m.showUpRate < 0.6) {
    return `Show-up rate (${pct(m.showUpRate)}) is below the band where reminders and timing typically deliver — worth reviewing promo cadence, reminder send-time, and venue logistics before the next event.`;
  }
  if (m.showUpRate >= 0.75 && happy >= 0.9) {
    return `Show-up (${pct(m.showUpRate)}) and satisfaction (${pct(happy)}) are both in the healthy band — the event is on track. Focus future iterations on the requests in Q5.`;
  }
  return `Show-up rate ${pct(m.showUpRate)}; satisfaction ${m.happyRate == null ? '—' : pct(happy)}. Mixed signals — review Q5 requests and the highlights below for actionable next steps.`;
}

export function keyMetricAnalysisText(m: NarrativeMetrics): string {
  return `Show-up rate (attended ÷ registered = ${pct(m.showUpRate)}) is the operational health metric. Cross-referenced with Q4 satisfaction (${m.happyRate == null ? '—' : pct(m.happyRate)}), low rates signal promo or timing issues while high rates with low satisfaction point to on-the-day execution problems. Use this pair to direct next-event optimization toward marketing versus logistics.`;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add lib/analytics/narrative.ts lib/analytics/narrative.test.ts
git commit -m "feat(analytics): rule-templated narrative helpers for insight cards (Phase 6)"
```

---

## Task 6: Slice components — generic + 3 variants

**Files:**
- Create: `components/analytics/Slice.tsx` (generic container)
- Create: `components/analytics/BarDistributionSlice.tsx` (Q1, Q3, Q5)
- Create: `components/analytics/HighlightCommentSlice.tsx` (Q2)
- Create: `components/analytics/SentimentSlice.tsx` (Q4)

No tests for visual components (per CLAUDE.md rule 9 — tests check behavior, not visual rendering). Verification is `tsc` + `next build` + browser smoke-check after Task 8.

**Reference the mockup wholesale.** Open `docs/plans/phase-6-analytics-q2-mockup.html` and copy the slice markup verbatim into the variant components. Replace placeholder values with props.

**Step 1: Create `components/analytics/Slice.tsx`**

```tsx
import type { ReactNode } from 'react';

type IconBgVariant = 'fixed' | 'secondary-container' | 'tertiary-fixed' | 'primary-container' | 'primary';

const iconBgClasses: Record<IconBgVariant, string> = {
  'fixed': 'bg-primary-fixed text-primary',
  'secondary-container': 'bg-secondary-container text-on-secondary-container',
  'tertiary-fixed': 'bg-tertiary-fixed text-tertiary',
  'primary-container': 'bg-primary-container text-on-primary',
  'primary': 'bg-primary text-on-primary',
};

export function Slice({
  icon,
  iconBg,
  title,
  prompt,
  children,
  bgClass,
  borderBottom = true,
}: {
  icon: string; // material-symbols-outlined name
  iconBg: IconBgVariant;
  title: string;
  prompt: string;
  children: ReactNode;
  bgClass?: string;
  borderBottom?: boolean;
}) {
  return (
    <div
      className={`flex flex-col md:flex-row items-center gap-lg p-lg ${
        borderBottom ? 'border-b border-outline-variant' : ''
      } hover:bg-surface-container-low/30 transition-colors ${bgClass ?? ''}`}
    >
      <div className="w-full md:w-1/3 flex items-start gap-md">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${iconBgClasses[iconBg]}`}>
          <span className="material-symbols-outlined" aria-hidden>
            {icon}
          </span>
        </div>
        <div>
          <h2 className="font-headline-sm text-title-lg text-on-surface leading-none pt-1.5">{title}</h2>
          <p className="text-body-md text-on-surface-variant italic mt-sm pr-md">{prompt}</p>
        </div>
      </div>
      <div className="w-full md:w-2/3 flex items-center gap-xl">{children}</div>
    </div>
  );
}
```

**Step 2: Create `components/analytics/BarDistributionSlice.tsx`** — handles Q1 (4 bars in `grid-cols-2`), Q3 (3 bars in `grid-cols-2`, one empty cell), Q5 (4 bars stacked, `bg-primary/5` slice bg).

```tsx
import type { Distribution } from '@/lib/analytics/countBySlug';
import { Slice } from './Slice';

export function BarDistributionSlice({
  icon,
  iconBg,
  title,
  prompt,
  distribution,
  layout,
  priorityPill,
  sliceBgClass,
  borderBottom = true,
}: {
  icon: string;
  iconBg: 'fixed' | 'tertiary-fixed' | 'primary';
  title: string;
  prompt: string;
  distribution: Distribution[];
  layout: 'grid' | 'stack';
  priorityPill?: string; // e.g. "Priority Expansion"
  sliceBgClass?: string;
  borderBottom?: boolean;
}) {
  const topSlug = distribution[0]?.slug;

  const bars = distribution.map((d) => {
    const isWinner = d.slug === topSlug;
    return (
      <div key={d.slug} className="space-y-xs">
        <div className={`flex justify-between text-label-md font-bold ${isWinner ? 'text-primary' : 'text-on-surface-variant'}`}>
          <span>{d.label}</span>
          <span>{d.pct}%</span>
        </div>
        <div className={`h-2 w-full bg-surface-container-high rounded-full overflow-hidden ${isWinner ? 'border border-primary/20' : ''}`}>
          <div
            className={`h-full ${isWinner ? 'bg-primary' : 'bg-primary-container'}`}
            style={{ width: `${d.pct}%` }}
          />
        </div>
      </div>
    );
  });

  return (
    <Slice icon={icon} iconBg={iconBg} title={title} prompt={prompt} bgClass={sliceBgClass} borderBottom={borderBottom}>
      <div className={layout === 'grid' ? 'grid grid-cols-2 gap-x-xl gap-y-md flex-grow' : 'flex-grow space-y-sm'}>
        {bars}
      </div>
      {priorityPill && (
        <span className="hidden lg:block bg-secondary-container text-on-secondary-container px-md py-xs rounded-full text-label-md font-label-md flex-shrink-0 whitespace-nowrap">
          {priorityPill}
        </span>
      )}
    </Slice>
  );
}
```

**Step 3: Create `components/analytics/HighlightCommentSlice.tsx`** — Q2 free-text variant.

```tsx
import { Slice } from './Slice';

export function HighlightCommentSlice({
  latestQuote,
  latestQuoteAgo,
  totalComments,
}: {
  latestQuote: string | null;
  latestQuoteAgo: string | null; // e.g. "2 hours ago"
  totalComments: number;
}) {
  return (
    <Slice
      icon="campaign"
      iconBg="secondary-container"
      title="Content (Q2)"
      prompt={'"What stood out as a key highlight from this event?"'}
    >
      <div className="w-full flex justify-between items-center">
        <div className="flex flex-col">
          <span className="text-label-md font-label-md text-primary uppercase">Latest Highlight</span>
          <span className="font-headline-sm text-2xl text-on-surface">
            {latestQuote ? `"${latestQuote}"` : 'No comments yet.'}
          </span>
          {latestQuoteAgo && (
            <div className="mt-md flex flex-wrap gap-sm">
              <span className="text-[10px] font-bold text-primary uppercase tracking-tighter bg-primary/5 px-2 py-0.5 rounded border border-primary/20">
                {latestQuoteAgo}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-md bg-surface-container-low px-lg py-md rounded-xl border border-outline-variant">
          <div className="text-center">
            <span className="block text-label-md font-bold text-on-surface-variant uppercase">Comments</span>
            <span className="text-headline-sm font-bold text-primary">{totalComments}</span>
          </div>
        </div>
      </div>
    </Slice>
  );
}
```

**Step 4: Create `components/analytics/SentimentSlice.tsx`** — Q4 big-number + segmented bar + 4-color legend.

```tsx
import type { Distribution } from '@/lib/analytics/countBySlug';
import { Slice } from './Slice';

type Q4Slug = 'exceeded' | 'met' | 'partially' | 'not_met';

const SLUG_COLOR: Record<Q4Slug, string> = {
  exceeded: 'bg-primary',
  met: 'bg-primary-container',
  partially: 'bg-outline-variant',
  not_met: 'bg-error',
};

const SLUG_LABEL: Record<Q4Slug, string> = {
  exceeded: 'Exceeded',
  met: 'Met',
  partially: 'Partially',
  not_met: 'Not Met',
};

export function SentimentSlice({
  happyRate,
  distribution,
}: {
  happyRate: number | null;
  distribution: Distribution[];
}) {
  const findPct = (slug: Q4Slug) => distribution.find((d) => d.slug === slug)?.pct ?? 0;

  return (
    <Slice
      icon="favorite"
      iconBg="primary-container"
      title="Sentiment (Q4)"
      prompt={'"Did this event meet your expectations?"'}
    >
      <div className="flex items-center gap-md flex-shrink-0">
        <span className="text-display font-bold text-primary leading-none">
          {happyRate == null ? '—' : `${Math.round(happyRate * 100)}%`}
        </span>
        <div className="text-label-md font-bold text-on-surface-variant leading-tight">
          Met/Exceeded
          <br />
          Expectations
        </div>
      </div>
      <div className="flex-grow flex flex-col gap-sm">
        <div className="h-6 flex-grow bg-surface-container-high rounded-full overflow-hidden relative">
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: `${happyRate == null ? 0 : Math.round(happyRate * 100)}%` }}
          />
        </div>
        <div className="flex justify-between gap-md flex-wrap">
          {(['exceeded', 'met', 'partially', 'not_met'] as Q4Slug[]).map((slug) => (
            <div key={slug} className="text-[10px] flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${SLUG_COLOR[slug]}`} />
              <span className="text-on-surface-variant">
                {SLUG_LABEL[slug]} ({findPct(slug)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </Slice>
  );
}
```

**Step 5: Run static gates**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint components/analytics/`
Expected: clean.

**Step 6: Commit**

```bash
git add components/analytics/
git commit -m "feat(analytics): Slice + BarDistribution/HighlightComment/Sentiment variants (Phase 6)"
```

---

## Task 7: Insight cards — OperationalInsightCard + KeyMetricAnalysisCard

**Files:**
- Create: `components/analytics/OperationalInsightCard.tsx`
- Create: `components/analytics/KeyMetricAnalysisCard.tsx`

These wrap the narrative helpers from Task 5. The HTML containers come straight from the mockup's bottom info-cards.

**Step 1: Create `components/analytics/OperationalInsightCard.tsx`**

```tsx
import { operationalInsightText, type NarrativeMetrics } from '@/lib/analytics/narrative';

export function OperationalInsightCard({ metrics }: { metrics: NarrativeMetrics }) {
  return (
    <div className="mt-lg p-lg bg-surface-container rounded-xxl border border-outline-variant flex items-start gap-md">
      <span className="material-symbols-outlined text-primary" aria-hidden>
        info
      </span>
      <div>
        <h3 className="font-title-lg text-on-surface mb-xs">Operational Insight</h3>
        <p className="text-body-md text-on-surface-variant">{operationalInsightText(metrics)}</p>
      </div>
    </div>
  );
}
```

**Step 2: Create `components/analytics/KeyMetricAnalysisCard.tsx`**

```tsx
import { keyMetricAnalysisText, type NarrativeMetrics } from '@/lib/analytics/narrative';

export function KeyMetricAnalysisCard({ metrics }: { metrics: NarrativeMetrics }) {
  return (
    <div className="mt-md p-lg bg-surface-container-high rounded-xxl border border-outline-variant flex items-start gap-md">
      <span className="material-symbols-outlined text-primary" aria-hidden>
        analytics
      </span>
      <div>
        <h3 className="font-headline-sm text-title-lg text-on-surface mb-xs font-display">
          Key Operational Metric Analysis
        </h3>
        <p className="text-body-md text-on-surface-variant font-body-md">{keyMetricAnalysisText(metrics)}</p>
      </div>
    </div>
  );
}
```

**Step 3: Run static gates**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint components/analytics/`
Expected: clean.

**Step 4: Commit**

```bash
git add components/analytics/OperationalInsightCard.tsx components/analytics/KeyMetricAnalysisCard.tsx
git commit -m "feat(analytics): insight cards bound to rule-templated narrative (Phase 6)"
```

---

## Task 8: `/events/[id]/analytics` route — wire it all together

**Files:**
- Create: `app/events/[id]/analytics/page.tsx`

This is the per-event analytics page. Server Component, `requireStaff()`, 3 parallel queries via `Promise.all`, renders the hero + 5-slice card + 2 insight cards.

**Read first:** `app/events/[id]/edit/page.tsx` (lines 1-80) for the `requireStaff()` + `notFound()` + `supabaseServer` pattern.

**Step 1: Create the page**

Create `app/events/[id]/analytics/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { StaffShell } from '@/components/shell/StaffShell';
import {
  SESSION_FORMAT_OPTIONS,
  VALUE_PROPOSITION_OPTIONS,
  EXPECTATIONS_OPTIONS,
  FUTURE_PREFERENCE_OPTIONS,
} from '@/lib/surveyTemplate';
import { countBySlug } from '@/lib/analytics/countBySlug';
import { countBySlugMulti } from '@/lib/analytics/countBySlugMulti';
import { happyRate } from '@/lib/analytics/happyRate';
import { arrivalLatency } from '@/lib/analytics/arrivalLatency';
import { BarDistributionSlice } from '@/components/analytics/BarDistributionSlice';
import { HighlightCommentSlice } from '@/components/analytics/HighlightCommentSlice';
import { SentimentSlice } from '@/components/analytics/SentimentSlice';
import { OperationalInsightCard } from '@/components/analytics/OperationalInsightCard';
import { KeyMetricAnalysisCard } from '@/components/analytics/KeyMetricAnalysisCard';

type SurveyRow = {
  id: string;
  session_format: string | null;
  key_highlights: string | null;
  value_proposition: string | null;
  expectations: string | null;
  future_preferences: string[];
  submitted_at: string;
};

type RegRow = {
  id: string;
  status: string;
  check_in_at: string | null;
};

const optionsToLabels = (opts: readonly { value: string; label: string }[]) =>
  Object.fromEntries(opts.map((o) => [o.value, o.label]));

const Q1_LABELS = optionsToLabels(SESSION_FORMAT_OPTIONS);
const Q3_LABELS = optionsToLabels(VALUE_PROPOSITION_OPTIONS);
const Q4_LABELS = optionsToLabels(EXPECTATIONS_OPTIONS);
const Q5_LABELS = optionsToLabels(FUTURE_PREFERENCE_OPTIONS);

export default async function EventAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }
  const { id } = await params;

  const supabase = await supabaseServer();
  const [eventRes, regsRes, surveysRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, start_time, end_time, timezone, venue_name, max_attendees, status')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('registrations').select('id, status, check_in_at').eq('event_id', id),
    supabase
      .from('survey_responses')
      .select('id, session_format, key_highlights, value_proposition, expectations, future_preferences, submitted_at')
      .eq('event_id', id)
      .order('submitted_at', { ascending: false }),
  ]);

  if (eventRes.error) throw eventRes.error;
  if (!eventRes.data) notFound();
  if (regsRes.error) throw regsRes.error;
  if (surveysRes.error) throw surveysRes.error;

  const event = eventRes.data;
  const regs = (regsRes.data ?? []) as RegRow[];
  const surveys = (surveysRes.data ?? []) as SurveyRow[];

  const registered = regs.length;
  const attended = regs.filter((r) => r.status === 'attended').length;
  const showUpRate = registered > 0 ? attended / registered : 0;
  const responseRate = attended > 0 ? surveys.length / attended : 0;

  const q1 = countBySlug(surveys, 'session_format', Q1_LABELS);
  const q3 = countBySlug(surveys, 'value_proposition', Q3_LABELS);
  const q4 = countBySlug(surveys, 'expectations', Q4_LABELS);
  const q5 = countBySlugMulti(surveys, 'future_preferences', Q5_LABELS);
  const hr = happyRate(surveys, 'expectations');

  const commentRows = surveys.filter((s) => s.key_highlights != null && s.key_highlights.trim() !== '');
  const latest = commentRows[0];
  const latestQuote = latest?.key_highlights?.trim() ?? null;
  const latestQuoteAgo = latest ? timeAgo(latest.submitted_at) : null;

  const metrics = { showUpRate, happyRate: hr, responseRate };

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }}>
      <header className="mb-lg flex flex-col md:flex-row justify-between items-end gap-md">
        <div className="max-w-3xl">
          <Link
            href={`/events/${event.id}/edit`}
            className="text-label-md font-label-md text-primary tracking-widest uppercase mb-xs block hover:underline"
          >
            ← Organizer Portal
          </Link>
          <h1 className="font-headline-lg text-headline-lg text-primary mb-xs leading-tight">
            Post-Event Survey Analytics: {event.title}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Multi-channel member feedback and operational analytics summary.
          </p>
        </div>
        <button
          type="button"
          disabled
          className="flex items-center gap-sm bg-surface-container-high text-on-surface px-lg py-sm rounded-lg font-bold border border-outline-variant opacity-60 cursor-not-allowed text-sm"
          aria-label="Export PDF (not yet available)"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden>
            download
          </span>
          Export PDF
        </button>
      </header>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xxl shadow-sm overflow-hidden">
        <BarDistributionSlice
          icon="event_note"
          iconBg="fixed"
          title="Agenda (Q1)"
          prompt={'"Which session format did you find most useful?"'}
          distribution={q1}
          layout="grid"
          priorityPill="Priority Expansion"
        />
        <HighlightCommentSlice
          latestQuote={latestQuote}
          latestQuoteAgo={latestQuoteAgo}
          totalComments={commentRows.length}
        />
        <BarDistributionSlice
          icon="insights"
          iconBg="tertiary-fixed"
          title="Value Drivers (Q3)"
          prompt={'"What was the most valuable aspect of this summit?"'}
          distribution={q3}
          layout="grid"
        />
        <SentimentSlice happyRate={hr} distribution={q4} />
        <BarDistributionSlice
          icon="chat"
          iconBg="primary"
          title="Requests (Q5)"
          prompt={'"Which areas would you prioritize for our next event?"'}
          distribution={q5}
          layout="stack"
          sliceBgClass="bg-primary/5"
          borderBottom={false}
        />
      </div>

      <OperationalInsightCard metrics={metrics} />
      <KeyMetricAnalysisCard metrics={metrics} />

      {/* Hidden sr-only check that arrival latency is computed (used by the Layer-1 strip on the dashboard) */}
      <span className="sr-only">
        Arrival latency (within 15 min of start):{' '}
        {(() => {
          const al = arrivalLatency(regs, event.start_time);
          return al == null ? 'unknown' : `${Math.round(al * 100)}%`;
        })()}
      </span>
    </StaffShell>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
```

**Step 2: Run static gates**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build`

Expected:
- tsc: clean
- eslint: clean
- vitest: ~96/96 (90 prior + new analytics tests)
- next build: 13 routes (was 12; added `/events/[id]/analytics`)

If next build shows a route count other than 13, stop and investigate. Don't accept route drift silently.

**Step 3: Browser smoke-check**

User's dev server runs on `:3000` per `CLAUDE.md`. Don't start a new one.

1. Open `http://localhost:3000/dashboard`
2. Click into an event row (any existing event with registrations + surveys)
3. Manually navigate to `http://localhost:3000/events/<event-id>/analytics`
4. Visually compare against `docs/plans/phase-6-analytics-q2-mockup.html`. Confirm:
   - 5 slices present in order Q1, Q2, Q3, Q4, Q5
   - Winner bar on Q1 + Q3 is solid `bg-primary` with faint border, others `bg-primary-container`
   - Q4 big % matches `happyRate * 100`
   - Q2 shows real comment text or "No comments yet"
   - Bottom info-cards render with rule-templated text appropriate to the metrics
   - Export PDF button is visually present but disabled

If anything is off, stop and surface — do NOT silently mutate the visual to compensate.

**Step 4: Commit**

```bash
git add app/events/\[id\]/analytics/page.tsx
git commit -m "feat(analytics): /events/[id]/analytics route — Layer 2 page (Phase 6)"
```

---

## Task 9: Dashboard extension — Layer-1 tiles + per-row strip

**Files:**
- Create: `components/analytics/LayerOneTiles.tsx`
- Create: `components/analytics/EventRowStrip.tsx`
- Modify: `app/dashboard/page.tsx`

The existing dashboard's 3 metric cards (Total Events / Total Registrations / Checked In) **stay untouched** per Rule 3 (surgical). Phase 6 adds a NEW row of Layer-1 metric tiles + a per-row strip on every event in the list.

**Step 1: Create `components/analytics/LayerOneTiles.tsx`**

```tsx
export function LayerOneTiles({
  capacityPct,
  arrivalOnTimePct,
}: {
  capacityPct: number | null; // null when no events have max_attendees
  arrivalOnTimePct: number | null; // null when no one has checked in yet
}) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-grid-gutter mb-xl">
      <Tile
        label="Capacity Utilization"
        value={capacityPct == null ? '—' : `${capacityPct}%`}
        icon="event_seat"
        hint={capacityPct == null ? 'No capped events' : 'Registered ÷ Capacity (across capped events)'}
      />
      <Tile
        label="On-time Arrival"
        value={arrivalOnTimePct == null ? '—' : `${arrivalOnTimePct}%`}
        icon="schedule"
        hint={arrivalOnTimePct == null ? 'Awaiting first check-in' : 'Checked in within first 15 min of start'}
      />
    </section>
  );
}

function Tile({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: string;
  hint: string;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-[20px] p-lg border border-outline-variant shadow-sm flex flex-col justify-between min-h-[140px]">
      <div className="flex justify-between items-start">
        <h3 className="font-label-md text-label-md text-on-surface-variant uppercase">{label}</h3>
        <span
          className="material-symbols-outlined text-primary bg-primary-container/10 p-xs rounded-md"
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <div>
        <p className="font-display text-display text-on-surface">{value}</p>
        <p className="font-label-md text-label-md text-on-surface-variant mt-xs">{hint}</p>
      </div>
    </div>
  );
}
```

**Step 2: Create `components/analytics/EventRowStrip.tsx`**

```tsx
export function EventRowStrip({
  registered,
  attended,
  surveys,
  happyPct,
}: {
  registered: number;
  attended: number;
  surveys: number;
  happyPct: number | null;
}) {
  const attPct = registered > 0 ? Math.round((attended / registered) * 100) : 0;
  return (
    <div className="flex items-center gap-md flex-wrap text-label-md font-label-md mt-sm">
      <span className="bg-surface-container-high text-on-surface-variant px-sm py-xs rounded-full">
        Reg {registered}
      </span>
      <span className="bg-surface-container-high text-on-surface-variant px-sm py-xs rounded-full">
        Att {attended} · {attPct}%
      </span>
      <span className="bg-primary-container/10 text-primary px-sm py-xs rounded-full border border-primary-container/20">
        Surveys {surveys}
        {happyPct != null && ` · ${happyPct}% happy`}
      </span>
    </div>
  );
}
```

**Step 3: Modify `app/dashboard/page.tsx`**

Extend the existing dashboard to:
1. Pull arrival/capacity aggregates via two new parallel queries
2. Pull per-event registrations + survey aggregates joined by `event_id IN (...)`
3. Render the new Layer-1 tile row above the event list
4. Render `<EventRowStrip>` inline on each event-list `<li>`
5. Link each event row to `/events/[id]/analytics` (not edit — per Phase 6 navigation model)

**Read** the existing `app/dashboard/page.tsx` in full first. Append the new aggregates to the existing `Promise.all` block; do not touch the existing 3 metric cards.

Insert the new imports near the top:

```tsx
import { LayerOneTiles } from '@/components/analytics/LayerOneTiles';
import { EventRowStrip } from '@/components/analytics/EventRowStrip';
import { arrivalLatency } from '@/lib/analytics/arrivalLatency';
import { happyRate } from '@/lib/analytics/happyRate';
```

Replace the existing `Promise.all` block + body up to the `return` with:

```tsx
const eventIds = (events ?? []).map((e) => e.id);

const [{ count: totalRegistered }, { count: totalAttended }, regsByEventRes, surveysByEventRes] = await Promise.all([
  supabase.from('registrations').select('*', { count: 'exact', head: true }),
  supabase.from('registrations').select('*', { count: 'exact', head: true }).eq('status', 'attended'),
  eventIds.length > 0
    ? supabase.from('registrations').select('event_id, status, check_in_at').in('event_id', eventIds)
    : Promise.resolve({ data: [], error: null }),
  eventIds.length > 0
    ? supabase.from('survey_responses').select('event_id, expectations').in('event_id', eventIds)
    : Promise.resolve({ data: [], error: null }),
]);

if (regsByEventRes.error) throw regsByEventRes.error;
if (surveysByEventRes.error) throw surveysByEventRes.error;

const regsByEvent = (regsByEventRes.data ?? []) as { event_id: string; status: string; check_in_at: string | null }[];
const surveysByEvent = (surveysByEventRes.data ?? []) as { event_id: string; expectations: string | null }[];

const perEvent = new Map<string, { registered: number; attended: number; checkIns: (string | null)[]; surveys: { expectations: string | null }[] }>();
for (const e of events ?? []) {
  perEvent.set(e.id, { registered: 0, attended: 0, checkIns: [], surveys: [] });
}
for (const r of regsByEvent) {
  const p = perEvent.get(r.event_id);
  if (!p) continue;
  p.registered++;
  if (r.status === 'attended') p.attended++;
  p.checkIns.push(r.check_in_at);
}
for (const s of surveysByEvent) {
  const p = perEvent.get(s.event_id);
  if (!p) continue;
  p.surveys.push({ expectations: s.expectations });
}

// Layer-1 tiles: capacity utilization across capped events; arrival latency across all check-ins (weighted by raw count, simplest)
const cappedEvents = (events ?? []).filter((e) => e.max_attendees != null);
const totalCapacity = cappedEvents.reduce((sum, e) => sum + (e.max_attendees ?? 0), 0);
const totalRegisteredInCapped = cappedEvents.reduce((sum, e) => sum + (perEvent.get(e.id)?.registered ?? 0), 0);
const capacityPct = totalCapacity > 0 ? Math.round((totalRegisteredInCapped / totalCapacity) * 100) : null;

const allCheckIns: { check_in_at: string | null }[] = [];
const allEventStarts = new Map<string, string>();
for (const e of events ?? []) allEventStarts.set(e.id, e.start_time);
for (const r of regsByEvent) {
  if (r.check_in_at != null) allCheckIns.push({ check_in_at: r.check_in_at });
}
// Simplification: for the dashboard tile we compute a weighted average using each event's own start_time.
// Per-event arrival latency, then aggregate across events by raw on-time count ÷ raw check-in count.
let onTime = 0;
let totalCheckIns = 0;
for (const e of events ?? []) {
  const p = perEvent.get(e.id);
  if (!p) continue;
  const eRows = p.checkIns.map((c) => ({ check_in_at: c }));
  const eOnTime = arrivalLatency(eRows, e.start_time);
  if (eOnTime != null) {
    const eCheckCount = p.checkIns.filter((c) => c != null).length;
    onTime += eOnTime * eCheckCount;
    totalCheckIns += eCheckCount;
  }
}
const arrivalOnTimePct = totalCheckIns > 0 ? Math.round((onTime / totalCheckIns) * 100) : null;

const totalEvents = events?.length ?? 0;
const registered = totalRegistered ?? 0;
const attended = totalAttended ?? 0;
const attendanceRate = registered > 0 ? Math.round((attended / registered) * 100) : 0;

// eslint-disable-next-line react-hooks/purity
const nowMs = Date.now();
const upcoming = (events ?? []).filter((e) => new Date(e.start_time).getTime() > nowMs);
const past = (events ?? []).filter((e) => new Date(e.start_time).getTime() <= nowMs);
```

Then **insert** the `<LayerOneTiles>` after the existing 3-card section and **add** the `<EventRowStrip>` inside each event-list `<li>`. Change the per-row `<Link href={...edit}>` to `<Link href={\`/events/${e.id}/analytics\`}>`:

```tsx
{/* New: Layer-1 tiles (Phase 6) */}
<LayerOneTiles capacityPct={capacityPct} arrivalOnTimePct={arrivalOnTimePct} />

{/* existing events section unchanged except: link → /analytics, add EventRowStrip */}
```

Inside the `events!.map(...)` body, find the `<Link href={\`/events/${e.id}/edit\`}>` and change to `/analytics`. Inside the `<div className="flex-1 min-w-0">`, after the existing `<StatusPill>` + Cap pill block, add:

```tsx
<EventRowStrip
  registered={perEvent.get(e.id)?.registered ?? 0}
  attended={perEvent.get(e.id)?.attended ?? 0}
  surveys={perEvent.get(e.id)?.surveys.length ?? 0}
  happyPct={(() => {
    const hr = happyRate(perEvent.get(e.id)?.surveys ?? [], 'expectations');
    return hr == null ? null : Math.round(hr * 100);
  })()}
/>
```

**Step 4: Run static gates**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build`
Expected: clean, vitest ~96/96, next build 13 routes.

**Step 5: Browser smoke-check**

Open `http://localhost:3000/dashboard`:
- 3 original metric cards still there (Total Events / Registrations / Checked In)
- 2 new Layer-1 tiles below them (Capacity Utilization / On-time Arrival)
- Each event row shows the new Reg/Att/Surveys/Happy strip
- Clicking an event row goes to `/events/[id]/analytics` (not edit)

**Step 6: Commit**

```bash
git add components/analytics/LayerOneTiles.tsx components/analytics/EventRowStrip.tsx app/dashboard/page.tsx
git commit -m "feat(analytics): dashboard Layer-1 tiles + per-row strip + analytics link (Phase 6)"
```

---

## Task 10: Edit page CTA + close-out

**Files:**
- Modify: `app/events/[id]/edit/page.tsx` — add a "View analytics" link in the existing right-column action card

**Step 1: Read `app/events/[id]/edit/page.tsx`** to find the right-column ActionCards section (`StaffShell` body with sticky right column).

**Step 2: Add the link**

Find the existing action-card stack on the right column. Add a new action card or a link entry consistent with the existing style:

```tsx
<Link
  href={`/events/${event.id}/analytics`}
  className="flex items-center gap-sm bg-surface-container-high text-on-surface px-lg py-sm rounded-lg font-bold border border-outline-variant hover:bg-surface-variant transition-all"
>
  <span className="material-symbols-outlined text-sm" aria-hidden>
    analytics
  </span>
  View analytics
</Link>
```

Match the existing button styling exactly — read 2-3 sibling action-card entries before placing the new one. Do NOT touch unrelated code.

**Step 3: Run static gates**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build`
Expected: clean, ~96/96, 13 routes.

**Step 4: Backtest plan** (do this once before declaring phase shipped, not as part of the per-task loop)

Per `~/.claude/CLAUDE.md` phase-completion-protocol:

1. **Dev-perspective review** — dispatch a `feature-dev:code-reviewer` (or general-purpose) agent on `<task-1-commit-hash>..HEAD` to find dev-side issues. The agent should run all 4 gates independently and review the diff + full files.

2. **User-perspective review** — dispatch a SEPARATE general-purpose agent on the same range for cold-start UX. Have them open `http://localhost:3000/dashboard` and `/events/[id]/analytics` (manually using the running dev server), compare against `docs/plans/phase-6-analytics-q2-mockup.html`, and report dead-ends / misleading numbers / ambiguous states.

3. **Backtest** — execute the read path against the **real DB** (project `muieupgkpbxpqsrjjwol`). Steps:
   - Seed: pick an event that has ≥1 attended registration with ≥1 survey response. If none exists, seed via the existing flows (register → checkin → /survey?code=) — do NOT bypass the action.
   - Open `http://localhost:3000/events/<id>/analytics` — confirm distributions render the real values seen in the DB.
   - Query the same event's data via the MCP `execute_sql` tool and hand-verify happy rate = `(exceeded + met) / non-null Q4` and Q1/Q3/Q5 counts match.
   - Confirm the rule-templated narrative branches fire correctly given the seeded metrics.

**Step 5: After all three pass, land the Phase-5 close-out batch**

Open task #10 from the session — apply the 7 deferred Phase-5 close-out fixes (full_name pull, success card event name, nested `<main>`, focus-visible propagation, structured-error return, Zod key_highlights tighten, event date/venue surface). Each as its own atomic commit. Re-run all 4 gates after.

**Step 6: Update vault status + write handoff**

1. Edit `/Users/ivan/Desktop/Eventar/20 — Roadmap/Phase 6 — Analytics.md` — change frontmatter `status: designed (pending implementation)` → `status: implemented (backtest passed; two-lens review done; close-out batch landed)` and add a "What shipped" section below the existing "What it is."

2. Append a new section to `docs/plans/handoff_30052026.md` (or create `docs/plans/handoff_DDMMYYYY.md` for the next session date) summarizing: commits, gates state, what's left for Phase 7.

**Step 7: Commit the close-out**

```bash
git add app/events/\[id\]/edit/page.tsx
git commit -m "feat(analytics): View analytics CTA on edit page (Phase 6 close-out)"

# After vault + handoff:
git add docs/plans/
git commit -m "docs(phase-6): handoff + design-doc status flip"
```

---

## Done. Phase 6 invariants out

- `tsc` clean · `eslint` clean · vitest **~96+/96+** · `next build` **13 routes**
- New route `/events/[id]/analytics` reachable from `/dashboard` event row + edit page CTA
- All 5 survey questions rendered per the locked visual framework
- Two rule-templated insight cards bind to computed metrics
- Layer-1 tiles + per-row strip live on `/dashboard`
- Zero schema changes, zero new dependencies, zero new RPCs
- Phase 5 close-out batch (7 fixes from task #10) landed

## Cross-references

- Design doc: `docs/plans/2026-05-30-phase-6-analytics-design.md`
- Visual reference: `docs/plans/phase-6-analytics-q2-mockup.html`
- Vault note: `/Users/ivan/Desktop/Eventar/20 — Roadmap/Phase 6 — Analytics.md`
- Decisions Log: `/Users/ivan/Desktop/Eventar/02 — Decisions Log.md` §Q16
- Prior session handoff: `docs/plans/handoff_30052026.md`

## Skills to invoke during execution

- `@superpowers:executing-plans` — entrypoint
- `@superpowers:test-driven-development` — for tasks 1–5 (pure helpers)
- `@superpowers:verification-before-completion` — before any "done" claim
- `@superpowers:dispatching-parallel-agents` — for the two-lens review in Task 10 Step 4
