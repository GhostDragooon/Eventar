# Phase 1.5b — Form redesign implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Replace the long-scroll `/events/new` form with an accordion of 4 sections, a hybrid chip-grid time picker, HK-biased Mapbox search, and shadcn/ui primitives that resolve the white-on-white `<select>` bug.

**Architecture:** Five accordion sections (Basics → Venue → Date+Time → Program → sticky save bar), each with a manual "Done" button. Date+Time uses a native date input + ToggleGroup chips for start/duration; end time is derived in a pure helper. VenueSearchBox gains proximity bias to HK. Existing Server Action contract (`createEvent({event, blocks})`) is preserved; no Zod/schema changes.

**Tech Stack:** Next 16 (App Router) · Tailwind v4 · shadcn/ui (Radix-backed) · React 19 client component · vitest for the pure helper.

**Design doc:** [docs/plans/2026-05-17-eventar-phase-1.5b-form-redesign.md](docs/plans/2026-05-17-eventar-phase-1.5b-form-redesign.md)

---

## Task 1 — Verify shadcn/ui v4 compatibility + install base deps

**Files:**
- Create: `components.json` (shadcn config)
- Create: `lib/utils.ts` (the `cn()` helper shadcn expects)
- Modify: `package.json` (new deps)

**Step 1: Verify versions.**

Run: `cat package.json | grep -E '"(tailwindcss|next|react)"'`
Expected: `tailwindcss: ^4`, `next: 16.2.6`, `react: 19.2.4`. If `tailwindcss` is anything other than `^4`, STOP and report — shadcn's v4 component set assumes Tailwind v4.

**Step 2: Verify shadcn CLI handles Tailwind v4.**

Run: `npx shadcn@latest --version`
Expected: `>= 2.3.0` (the v4-compatible track). If older, run `npx shadcn@canary --version` instead and use `@canary` for all subsequent `shadcn` commands.

**Step 3: Init shadcn — non-interactive flags.**

Run: `npx shadcn@latest init -y --base-color neutral --no-src-dir`
Expected: creates `components.json`, `lib/utils.ts`, updates `globals.css` with shadcn CSS variables, installs `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`.

If interactive prompts appear despite `-y`, answer: TypeScript=yes, style=new-york, base-color=neutral, css-variables=yes, components alias=`@/components`, utils alias=`@/lib/utils`.

**Step 4: Verify nothing broke.**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: tsc clean, eslint exit 0, 39/39 tests pass.

**Step 5: Verify build still green.**

Run: `npx next build 2>&1 | tail -20`
Expected: `✓ Compiled successfully`, 8/8 pages generated, no new warnings.

**Step 6: Commit.**

```bash
git add components.json lib/utils.ts package.json pnpm-lock.yaml app/globals.css
git commit -m "$(cat <<'EOF'
chore(phase-1.5b): shadcn/ui init — components.json + cn() helper + deps

Installs class-variance-authority, clsx, tailwind-merge, lucide-react,
tw-animate-css. Adds lib/utils.ts (cn() helper, shadcn convention).
Updates globals.css with shadcn CSS variables. No components added yet;
those land per-primitive in Task 2 so build verification is incremental.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Add shadcn primitives (accordion, toggle-group, select, button, input, textarea)

**Files:** Six new files under `components/ui/`. Created by the CLI; we just verify.

**Step 1: Add components one by one (so failures isolate cleanly).**

Run:
```bash
npx shadcn@latest add accordion -y
npx shadcn@latest add button -y
npx shadcn@latest add input -y
npx shadcn@latest add textarea -y
npx shadcn@latest add select -y
npx shadcn@latest add toggle-group -y
```
Expected: each command creates one file at `components/ui/<name>.tsx` and may install peer deps (`@radix-ui/react-accordion`, etc.). No prompts with `-y`.

**Step 2: Verify file inventory.**

Run: `ls components/ui/`
Expected: `accordion.tsx button.tsx input.tsx select.tsx textarea.tsx toggle-group.tsx`

**Step 3: Full verification gate.**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run && npx next build 2>&1 | tail -15`
Expected: all clean. If any of the shadcn files fail eslint (likely on `@typescript-eslint/no-explicit-any` from `React.ComponentPropsWithoutRef<typeof X>` patterns), do NOT modify the shadcn file — instead add `components/ui/**` to the lint config's relaxed-rules block alongside `*.test.ts` (the shadcn files are vendored code we don't author).

If build fails on a missing peer dep (rare; CLI installs them), `pnpm install` the missing one and re-run build.

**Step 4: Commit.**

```bash
git add components/ui/ package.json pnpm-lock.yaml eslint.config.mjs
git commit -m "$(cat <<'EOF'
feat(phase-1.5b): add shadcn primitives — Accordion, ToggleGroup, Select, Button, Input, Textarea

Vendored copies of the six shadcn/ui primitives needed for the
new-event form redesign. All Radix-backed underneath
(@radix-ui/react-{accordion,select,toggle-group}). No customisation
yet; consumed in Tasks 5-8.

If the lint config now includes a components/ui/** relaxed-rules
block: shadcn-vendored files use ComponentPropsWithoutRef patterns
that our default no-explicit-any rejects; the files are not ours to
edit, so the relaxation is the right layer.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — TDD `deriveEnd` helper in `lib/time.ts`

**Files:**
- Create: `lib/time.ts`
- Create: `lib/time.test.ts`

The helper computes the event end time from `(startTime, duration, customEnd)`. Pure function → fully unit-testable, no DOM.

**Step 1: Write the failing tests.**

Create `lib/time.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveEnd, type Duration } from './time';

describe('deriveEnd', () => {
  it('returns empty string when start time is missing', () => {
    expect(deriveEnd('', '1h', '')).toBe('');
  });

  it('adds 30m correctly', () => {
    expect(deriveEnd('09:00', '30m', '')).toBe('09:30');
  });

  it('adds 1h correctly', () => {
    expect(deriveEnd('09:00', '1h', '')).toBe('10:00');
  });

  it('adds 2h correctly', () => {
    expect(deriveEnd('13:30', '2h', '')).toBe('15:30');
  });

  it('adds 4h correctly', () => {
    expect(deriveEnd('09:00', '4h', '')).toBe('13:00');
  });

  it('adds 8h correctly', () => {
    expect(deriveEnd('09:00', '8h', '')).toBe('17:00');
  });

  it('returns customEnd verbatim when duration is "custom"', () => {
    expect(deriveEnd('09:00', 'custom', '14:45')).toBe('14:45');
  });

  it('returns empty string when duration is "custom" but customEnd is empty', () => {
    expect(deriveEnd('09:00', 'custom', '')).toBe('');
  });

  it('handles minute rollover (e.g. 23:30 + 1h = next day; clamp to 23:59)', () => {
    // We never schedule past midnight (workshops are single-day in Phase 1.5);
    // clamping makes downstream Zod validation surface "end <= start" cleanly.
    expect(deriveEnd('23:30', '1h', '')).toBe('23:59');
  });

  it('zero-pads single-digit hours and minutes', () => {
    expect(deriveEnd('08:00', '30m', '')).toBe('08:30');
    expect(deriveEnd('09:05', '30m', '')).toBe('09:35');
  });
});
```

**Step 2: Run to confirm failure.**

Run: `npx vitest run lib/time.test.ts 2>&1 | tail -15`
Expected: `Cannot find module './time'` — red.

**Step 3: Implement.**

Create `lib/time.ts`:

```ts
export type Duration = '30m' | '1h' | '2h' | '4h' | '8h' | 'custom';

const MINUTES: Record<Exclude<Duration, 'custom'>, number> = {
  '30m':  30,
  '1h':   60,
  '2h':  120,
  '4h':  240,
  '8h':  480,
};

/**
 * Compute event end time from a start time (HH:MM 24h) and a duration chip.
 * Returns '' when inputs are insufficient (caller treats as "not yet ready").
 * Clamps to 23:59 if start + duration would cross midnight; we don't schedule
 * multi-day events in Phase 1.5, and Zod's end>start refinement surfaces the
 * issue downstream.
 */
export function deriveEnd(
  startTime: string,
  duration: Duration,
  customEnd: string,
): string {
  if (duration === 'custom') return customEnd;
  if (!startTime) return '';

  const [hStr, mStr] = startTime.split(':');
  const startMins = Number(hStr) * 60 + Number(mStr);
  if (Number.isNaN(startMins)) return '';

  const endMins = Math.min(startMins + MINUTES[duration], 23 * 60 + 59);
  const h = Math.floor(endMins / 60);
  const m = endMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
```

**Step 4: Run to confirm green.**

Run: `npx vitest run lib/time.test.ts 2>&1 | tail -10`
Expected: `Test Files 1 passed, Tests 10 passed`.

**Step 5: Full-suite verification.**

Run: `npx tsc --noEmit && npx vitest run 2>&1 | tail -8`
Expected: tsc clean, 49 tests pass (39 prior + 10 new).

**Step 6: Commit.**

```bash
git add lib/time.ts lib/time.test.ts
git commit -m "$(cat <<'EOF'
feat(phase-1.5b): deriveEnd helper — start + duration chip → end time (TDD)

Pure helper used by the new Date & Time section. Handles the standard
chip values (30m / 1h / 2h / 4h / 8h) plus 'custom' (passes customEnd
through verbatim). Clamps to 23:59 on midnight crossover so Zod's
end>start refinement surfaces the issue cleanly downstream rather than
silently wrapping.

10 tests cover happy path per duration, custom path, missing start,
missing customEnd, midnight clamp, and zero-padding.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Tune Mapbox options in `VenueSearchBox.tsx`

**Files:** Modify only — `components/VenueSearchBox.tsx`.

**Step 1: Verify which option keys @mapbox/search-js-core@1.5.1 accepts.**

Run: `grep -A 30 "interface SearchBoxOptions" node_modules/.pnpm/@mapbox+search-js-core@1.5.1/node_modules/@mapbox/search-js-core/dist/searchbox/SearchBoxCore.d.ts | head -40`
Expected: a list of fields including `proximity`, `language`, `country`, `types`, `limit`. Confirm `proximity` is typed as `LngLat | LngLatLike` and `language` accepts `string`.

If `language` accepts comma-separated values (e.g. the doc-comment mentions multi-language), use `'en,zh-Hant'`. If not, use `'en'` and add a NOTE in the commit message.

**Step 2: Modify the options block.**

In [components/VenueSearchBox.tsx](components/VenueSearchBox.tsx), replace:

```tsx
options={{ types: 'poi,address,place', limit: 10 }}
```

with:

```tsx
options={{
  proximity: { lng: 114.1694, lat: 22.3193 },  // Victoria Harbour — biases ranking to HK
  language:  'en',                              // change to 'en,zh-Hant' if SDK accepts
  types:     'poi,address,place',
  limit:     10,
  // No `country` filter — global fallback retained per design doc.
}}
```

**Step 3: Verification.**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: all clean, 49 tests pass.

**Step 4: Commit.**

```bash
git add components/VenueSearchBox.tsx
git commit -m "$(cat <<'EOF'
feat(phase-1.5b): bias Mapbox search to Hong Kong; fix HKCEC-not-found

Adds `proximity` (Victoria Harbour) + `language: 'en'` to the SearchBox
options. Local landmarks like HKCEC, AsiaWorld-Expo, the Convention
Centre, etc. now surface in the top results. No `country` filter — a
typed Tokyo or London address still works (global fallback retained per
the design doc's geo-scope decision).

Verified `proximity` and `language` against
node_modules/.pnpm/@mapbox+search-js-core@1.5.1/.../SearchBoxCore.d.ts
before changing; same defensive pattern that caught the array-vs-object
`context` shape mismatch in commit 996eea7.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Build the `BasicsSection` component

**Files:** Create `components/event-form/BasicsSection.tsx`.

**Step 1: Create the component.**

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type BasicsValue = {
  title: string;
  topic: string;
  description: string;
  capacity: string;  // string because the input may be empty; coerced in submit
};

type Props = {
  value: BasicsValue;
  onChange: (patch: Partial<BasicsValue>) => void;
};

export default function BasicsSection({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="block text-sm font-medium mb-1">Event name</span>
        <Input
          value={value.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Workshop on TDD"
          required
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium mb-1">Topic tag (optional)</span>
        <Input
          value={value.topic}
          onChange={(e) => onChange({ topic: e.target.value })}
          placeholder="engineering · onboarding · etc."
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium mb-1">Description</span>
        <Textarea
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={4}
          placeholder="One paragraph about the workshop."
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium mb-1">Capacity (optional)</span>
        <Input
          type="number"
          min={1}
          value={value.capacity}
          onChange={(e) => onChange({ capacity: e.target.value })}
          placeholder="e.g. 50"
        />
      </label>
    </div>
  );
}

export function basicsSummary(v: BasicsValue): string {
  return `${v.title || '(untitled)'} · ${v.capacity || '—'} max`;
}

export function basicsValid(v: BasicsValue): boolean {
  return v.title.trim().length > 0;
}
```

**Step 2: Verification.**

Run: `npx tsc --noEmit && npx eslint .`
Expected: both clean.

**Step 3: Commit.**

```bash
git add components/event-form/BasicsSection.tsx
git commit -m "feat(phase-1.5b): BasicsSection — title/topic/description/capacity inputs

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6 — Build the `VenueSection` component

**Files:** Create `components/event-form/VenueSection.tsx`.

**Step 1: Create.**

```tsx
'use client';

import dynamic from 'next/dynamic';
import type { Venue } from '@/lib/mapbox';

const VenueSearchBox = dynamic(() => import('@/components/VenueSearchBox'), { ssr: false });

type Props = {
  value: Venue | null;
  onChange: (venue: Venue | null) => void;
};

export default function VenueSection({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <VenueSearchBox
        token={process.env.NEXT_PUBLIC_MAPBOX_TOKEN!}
        onSelect={onChange}
      />
      {value && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
          <p className="font-medium">📍 {value.venue_name}</p>
          {value.venue_address && (
            <p className="text-gray-600">{value.venue_address}</p>
          )}
          <p className="text-gray-600">
            {value.city}
            {value.region ? `, ${value.region}` : ''}, {value.country}
          </p>
          <button
            type="button"
            className="mt-2 text-xs text-blue-700 hover:underline"
            onClick={() => onChange(null)}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

export function venueSummary(v: Venue | null): string {
  return v ? `📍 ${v.venue_name} — ${v.city}, ${v.country}` : 'No venue selected';
}

export function venueValid(v: Venue | null): boolean {
  return v !== null;
}
```

**Step 2: Verification.**

Run: `npx tsc --noEmit && npx eslint .`
Expected: clean.

**Step 3: Commit.**

```bash
git add components/event-form/VenueSection.tsx
git commit -m "feat(phase-1.5b): VenueSection — wraps VenueSearchBox + selected-venue card

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7 — Build the `DateTimeSection` component

**Files:** Create `components/event-form/DateTimeSection.tsx`.

**Step 1: Create.**

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { deriveEnd, type Duration } from '@/lib/time';

// 30-min increments, 06:00–22:00 inclusive (33 slots).
const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 6; h <= 22; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    if (h !== 22) out.push(`${String(h).padStart(2, '0')}:30`);
  }
  return out;
})();

const DURATIONS: { value: Duration; label: string }[] = [
  { value: '30m',    label: '30m' },
  { value: '1h',     label: '1h'  },
  { value: '2h',     label: '2h'  },
  { value: '4h',     label: '4h'  },
  { value: '8h',     label: '8h'  },
  { value: 'custom', label: 'custom' },
];

export type DateTimeValue = {
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:MM
  duration: Duration;
  customEnd: string;   // HH:MM, used only when duration === 'custom'
};

type Props = {
  value: DateTimeValue;
  onChange: (patch: Partial<DateTimeValue>) => void;
};

export default function DateTimeSection({ value, onChange }: Props) {
  const endTime = deriveEnd(value.startTime, value.duration, value.customEnd);

  return (
    <div className="space-y-5">
      {/* Date */}
      <label className="block">
        <span className="block text-sm font-medium mb-1">Date</span>
        <Input
          type="date"
          value={value.date}
          onChange={(e) => onChange({ date: e.target.value })}
          className="w-auto"
        />
      </label>

      {/* Start time */}
      <div>
        <span className="block text-sm font-medium mb-2">Start time</span>
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <ToggleGroup
            type="single"
            value={value.startTime}
            onValueChange={(v) => v && onChange({ startTime: v })}
            className="inline-flex gap-1"
          >
            {TIME_SLOTS.map((slot) => (
              <ToggleGroupItem key={slot} value={slot} className="px-3">
                {slot}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {/* Duration */}
      <div>
        <span className="block text-sm font-medium mb-2">Duration</span>
        <ToggleGroup
          type="single"
          value={value.duration}
          onValueChange={(v) => v && onChange({ duration: v as Duration })}
          className="inline-flex gap-1"
        >
          {DURATIONS.map((d) => (
            <ToggleGroupItem key={d.value} value={d.value} className="px-3">
              {d.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {value.duration === 'custom' && (
          <label className="block mt-3">
            <span className="block text-sm font-medium mb-1">Custom end time</span>
            <Input
              type="time"
              value={value.customEnd}
              onChange={(e) => onChange({ customEnd: e.target.value })}
              className="w-auto"
            />
          </label>
        )}

        {endTime && value.startTime && (
          <p className="text-sm text-gray-600 mt-2">→ Ends {endTime}</p>
        )}
      </div>
    </div>
  );
}

export function dateTimeSummary(v: DateTimeValue): string {
  const end = deriveEnd(v.startTime, v.duration, v.customEnd);
  if (!v.date || !v.startTime || !end) return 'Not set';
  return `${formatDateShort(v.date)}, ${v.startTime}–${end} (${v.duration})`;
}

export function dateTimeValid(v: DateTimeValue): boolean {
  const end = deriveEnd(v.startTime, v.duration, v.customEnd);
  return Boolean(v.date) && Boolean(v.startTime) && Boolean(end) && end > v.startTime;
}

function formatDateShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
```

**Step 2: Verification.**

Run: `npx tsc --noEmit && npx eslint .`
Expected: clean.

**Step 3: Commit.**

```bash
git add components/event-form/DateTimeSection.tsx
git commit -m "feat(phase-1.5b): DateTimeSection — native date input + chip-grid start + duration chips

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8 — Build the `ProgramSection` component

**Files:** Create `components/event-form/ProgramSection.tsx`.

Lift the existing `BlockEditor` + `FillerEditor` + `+Add component` / `+Break` / `+Transition` logic out of [app/events/new/page.tsx](app/events/new/page.tsx) and into this component. Swap the native `<select>` for shadcn's `<Select>` to fix the white-on-white bug.

**Step 1: Create.**

Lift the existing JSX verbatim from current `app/events/new/page.tsx` (the Program + Breaks sections plus `BlockEditor`, `FillerEditor`, `labelForKind`, `emptyTopic`, `emptyBlock`, the type definitions). Replace the native `<select>` for "+ Add component…" with shadcn `<Select>`. Export `programSummary(blocks, parallelIds)` for the collapsed view.

```tsx
'use client';

import { useMemo } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { findParallelBlockIds } from '@/lib/agenda';

// ...[all BlockDraft / TopicDraft types, RICH_KINDS, FILLER_KINDS,
//     emptyTopic, emptyBlock, BlockEditor, FillerEditor, labelForKind
//     copied verbatim from current page.tsx]...

type Props = {
  date: string;                // needed for parallel detection (HH:MM compared within date)
  blocks: BlockDraft[];
  onChange: (blocks: BlockDraft[]) => void;
};

export default function ProgramSection({ date, blocks, onChange }: Props) {
  const components = blocks.filter(b => !FILLER_KINDS.includes(b.kind));
  const fillers    = blocks.filter(b =>  FILLER_KINDS.includes(b.kind));

  const parallelIds = useMemo(() => {
    const items = blocks
      .filter(b => b.start && b.end)
      .map(b => ({ id: b.localId, start_time: `${date}T${b.start}`, end_time: `${date}T${b.end}` }));
    return findParallelBlockIds(items);
  }, [blocks, date]);

  function update(localId: string, patch: Partial<BlockDraft>) {
    onChange(blocks.map(b => b.localId === localId ? { ...b, ...patch } : b));
  }
  function remove(localId: string) {
    onChange(blocks.filter(b => b.localId !== localId));
  }
  function add(kind: BlockDraft['kind']) {
    onChange([...blocks, emptyBlock(kind)]);
  }

  return (
    <div className="space-y-6">
      {/* Components */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Components</h3>
          <Select onValueChange={(v) => v && add(v as BlockDraft['kind'])}>
            <SelectTrigger className="w-auto">
              <SelectValue placeholder="+ Add component…" />
            </SelectTrigger>
            <SelectContent>
              {RICH_KINDS.map(k => <SelectItem key={k} value={k}>{labelForKind(k)}</SelectItem>)}
            </SelectContent>
          </Select>
        </header>
        {components.length === 0 && <p className="text-sm text-gray-500">No components yet.</p>}
        {components.map(b => (
          <BlockEditor
            key={b.localId}
            block={b}
            parallel={parallelIds.has(b.localId)}
            onChange={patch => update(b.localId, patch)}
            onRemove={() => remove(b.localId)}
          />
        ))}
      </section>

      {/* Fillers */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Breaks & transitions</h3>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => add('break')}>+ Break</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => add('transition')}>+ Transition</Button>
          </div>
        </header>
        {fillers.length === 0 && <p className="text-sm text-gray-500">None.</p>}
        {fillers.map(b => (
          <FillerEditor key={b.localId} block={b} onChange={patch => update(b.localId, patch)} onRemove={() => remove(b.localId)} />
        ))}
      </section>
    </div>
  );
}

export function programSummary(blocks: BlockDraft[], parallelIds: Set<string>): string {
  const cs = blocks.filter(b => !FILLER_KINDS.includes(b.kind)).length;
  const fs = blocks.filter(b =>  FILLER_KINDS.includes(b.kind)).length;
  const flag = parallelIds.size > 0 ? ' · ⚠ parallel' : '';
  return `${cs} component${cs === 1 ? '' : 's'} · ${fs} break${fs === 1 ? '' : 's'}${flag}`;
}

export function programValid(_blocks: BlockDraft[]): boolean {
  return true; // Program is optional for a draft.
}

export type { BlockDraft };
```

When pasting `BlockEditor` and `FillerEditor`, keep the existing inline Tailwind classes (no shadcn for those — they use bare `<input>` and the bare `<button>` for Remove/×, which is fine).

**Step 2: Verification.**

Run: `npx tsc --noEmit && npx eslint .`
Expected: clean.

**Step 3: Commit.**

```bash
git add components/event-form/ProgramSection.tsx
git commit -m "feat(phase-1.5b): ProgramSection — lift Program + Breaks from page.tsx; shadcn Select

Lifts the existing BlockEditor + FillerEditor + add/update/remove
machinery out of app/events/new/page.tsx so the new accordion page can
compose it. Only behavioural change: the native <select> for '+ Add
component…' becomes shadcn's <Select> — this is the categorical fix for
the white-on-white option-list bug surfaced during the Phase 1.5 smoke.

Per-block <input type='time'> stays (the chip pattern earns complexity
only for the single event-level time field per the design doc).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9 — Rewrite `app/events/new/page.tsx` to use the accordion + sections

**Files:** Modify `app/events/new/page.tsx`.

**Step 1: Replace the file.**

```tsx
'use client';

import { useState, useTransition } from 'react';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { createEvent } from './actions';

import BasicsSection, {
  type BasicsValue, basicsSummary, basicsValid,
} from '@/components/event-form/BasicsSection';
import VenueSection, {
  venueSummary, venueValid,
} from '@/components/event-form/VenueSection';
import DateTimeSection, {
  type DateTimeValue, dateTimeSummary, dateTimeValid,
} from '@/components/event-form/DateTimeSection';
import ProgramSection, {
  type BlockDraft, programSummary, programValid,
} from '@/components/event-form/ProgramSection';
import type { Venue } from '@/lib/mapbox';
import { deriveEnd } from '@/lib/time';
import { findParallelBlockIds } from '@/lib/agenda';

type SectionId = 'basics' | 'venue' | 'datetime' | 'program';

export default function NewEventPage() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<SectionId>('basics');

  const [basics, setBasics] = useState<BasicsValue>({
    title: '', topic: '', description: '', capacity: '',
  });
  const [venue, setVenue] = useState<Venue | null>(null);
  const [datetime, setDatetime] = useState<DateTimeValue>({
    date: '', startTime: '09:00', duration: '8h', customEnd: '',
  });
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);

  const v1 = basicsValid(basics);
  const v2 = venueValid(venue);
  const v3 = dateTimeValid(datetime);
  const v4 = programValid(blocks);
  const canSubmit = v1 && v2 && v3 && v4;

  function next(after: SectionId) {
    if (after === 'basics')   setOpen('venue');
    if (after === 'venue')    setOpen('datetime');
    if (after === 'datetime') setOpen('program');
    if (after === 'program')  setOpen('program'); // stay; user clicks Save in sticky bar
  }

  function onSubmit() {
    setErr(null);
    if (!v1 || !v2 || !v3) { setErr('Complete Basics, Venue, and Date & Time first.'); return; }

    const endTime = deriveEnd(datetime.startTime, datetime.duration, datetime.customEnd);
    const event = {
      title:       basics.title,
      topic:       basics.topic || undefined,
      description: basics.description,
      max_attendees: basics.capacity || undefined,
      start_time:  new Date(`${datetime.date}T${datetime.startTime}:00`).toISOString(),
      end_time:    new Date(`${datetime.date}T${endTime}:00`).toISOString(),
      ...venue!,
    };
    const blocksPayload = blocks.map((b, i) => ({
      start_time: new Date(`${datetime.date}T${b.start}:00`).toISOString(),
      end_time:   new Date(`${datetime.date}T${b.end}:00`).toISOString(),
      kind: b.kind,
      title: b.title,
      host: b.host,
      topics: b.topics,
      notes: b.notes,
      display_order: i,
    }));

    start(async () => {
      const res = await createEvent({ event, blocks: blocksPayload });
      if (res && 'error' in res) setErr(res.error);
    });
  }

  // For the program summary's parallel-block check
  const parallelIds = (() => {
    const items = blocks.filter(b => b.start && b.end).map(b => ({
      id: b.localId,
      start_time: `${datetime.date}T${b.start}`,
      end_time:   `${datetime.date}T${b.end}`,
    }));
    return findParallelBlockIds(items);
  })();

  return (
    <main className="max-w-3xl mx-auto p-6 pb-32">
      <h1 className="text-2xl font-semibold mb-6">New event</h1>

      <Accordion type="single" value={open} onValueChange={(v) => v && setOpen(v as SectionId)} collapsible>
        <SectionItem id="basics"   open={open === 'basics'}   done={v1} title="Basics"        summary={basicsSummary(basics)}>
          <BasicsSection value={basics} onChange={(p) => setBasics({ ...basics, ...p })} />
          <DoneRow disabled={!v1} onDone={() => next('basics')} />
        </SectionItem>

        <SectionItem id="venue"    open={open === 'venue'}    done={v2} title="Venue"         summary={venueSummary(venue)}>
          <VenueSection value={venue} onChange={setVenue} />
          <DoneRow disabled={!v2} onDone={() => next('venue')} />
        </SectionItem>

        <SectionItem id="datetime" open={open === 'datetime'} done={v3} title="Date & Time"   summary={dateTimeSummary(datetime)}>
          <DateTimeSection value={datetime} onChange={(p) => setDatetime({ ...datetime, ...p })} />
          <DoneRow disabled={!v3} onDone={() => next('datetime')} />
        </SectionItem>

        <SectionItem id="program"  open={open === 'program'}  done={v4} title="Program"       summary={programSummary(blocks, parallelIds)}>
          <ProgramSection date={datetime.date} blocks={blocks} onChange={setBlocks} />
          <DoneRow disabled={false} onDone={() => next('program')} />
        </SectionItem>
      </Accordion>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 p-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <ProgressDots states={[v1, v2, v3, v4]} />
          {err && <p className="text-sm text-red-700 flex-1">{err}</p>}
          <Button type="button" onClick={onSubmit} disabled={!canSubmit || pending} className="ml-auto">
            {pending ? 'Saving…' : 'Save as draft'}
          </Button>
        </div>
      </div>
    </main>
  );
}

function SectionItem({
  id, open, done, title, summary, children,
}: {
  id: string; open: boolean; done: boolean; title: string; summary: string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={id} className="border rounded-xl px-4 mb-3 bg-white">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-3 text-left">
          <span className={done ? 'text-green-700' : 'text-gray-400'}>{done ? '✓' : '○'}</span>
          <div>
            <div className="font-medium">{title}</div>
            {!open && <div className="text-sm text-gray-600 mt-0.5">{summary}</div>}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-2 pb-4">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

function DoneRow({ disabled, onDone }: { disabled: boolean; onDone: () => void }) {
  return (
    <div className="flex justify-end mt-4">
      <Button type="button" disabled={disabled} onClick={onDone}>Done</Button>
    </div>
  );
}

function ProgressDots({ states }: { states: boolean[] }) {
  return (
    <div className="flex items-center gap-1">
      {states.map((on, i) => (
        <span
          key={i}
          aria-hidden
          className={`h-2 w-2 rounded-full ${on ? 'bg-green-600' : 'bg-gray-300'}`}
        />
      ))}
    </div>
  );
}
```

**Step 2: Verification.**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: tsc clean, eslint exit 0, 49/49 tests pass.

Run: `npx next build 2>&1 | tail -20`
Expected: build clean, `/events/new` still listed (may be ƒ dynamic now due to client component sizing — acceptable).

**Step 3: Boot dev + smoke route compiles.**

Use `mcp__Claude_Preview__preview_start` with name `eventar-dev`, then `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/events/new` — expect 307.

Run `preview_logs` filtered to `error` — expect "No server errors found."

Stop the preview.

**Step 4: Commit.**

```bash
git add app/events/new/page.tsx
git commit -m "$(cat <<'EOF'
feat(phase-1.5b): accordion form — Basics / Venue / Date+Time / Program + sticky save bar

Full rewrite of app/events/new/page.tsx around four accordion sections,
each with an explicit Done button that advances focus to the next
pending section. Sticky bottom bar carries the progress dots and the
'Save as draft' submit (disabled until sections 1-3 are valid; Program
is optional for a draft).

Composes the per-section components landed in Tasks 5-8:
  BasicsSection (title/topic/description/capacity)
  VenueSection  (VenueSearchBox + selected-venue card)
  DateTimeSection (native date + start chip grid + duration chips)
  ProgramSection (lifted Program+Breaks UI with shadcn Select)

Server Action contract (createEvent {event, blocks}) is unchanged; this
commit only restructures how the form composes the payload.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 — White-on-white audit + screenshot verification

**Files:** modify only if issues found (Task 8's shadcn Select should resolve the main one).

**Step 1: Boot dev + log in (manual user step IF cookie-fix smoke not yet passed; otherwise rely on prior screenshots).**

Use `mcp__Claude_Preview__preview_start` to start the dev server.

**Step 2: Navigate to `/events/new` in the preview browser and screenshot each section.**

Use `preview_screenshot` after expanding each section.

Inspect each screenshot for:
- Text rendered in light gray (#e5e7eb or lighter) on white background
- Placeholder text invisible against input background
- Disabled button labels unreadable
- shadcn Select trigger label colour matches surrounding text

**Step 3: For any issues found, patch with explicit Tailwind classes** (e.g., `placeholder:text-gray-500` if the default is too light, `text-gray-900` on inputs explicitly, etc.).

If no issues found, skip to Step 5.

**Step 4: Re-screenshot and verify the fix.**

**Step 5: Commit (only if changes were made).**

```bash
git add <modified files>
git commit -m "fix(phase-1.5b): explicit contrast on <field/element> — was rendering <colour> on <colour>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

If no issues were found, commit empty:

```bash
git commit --allow-empty -m "chore(phase-1.5b): white-on-white audit — no further issues found; shadcn Select resolved the reported case

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11 — Final verification (tsc + tests + build) + manual smoke handoff

**Files:** none — verification only.

**Step 1: Full verification gate.**

Run:
```bash
npx tsc --noEmit
npx eslint . > /dev/null; echo "lint exit=$?"
npx vitest run 2>&1 | tail -8
npx next build 2>&1 | tail -25
```

Expected:
- tsc: no output (clean)
- lint exit=0
- 49/49 tests pass
- next build: ✓ Compiled successfully, all routes generated

**Step 2: Report deltas to user.**

Summarise:
- Commits ahead of origin (was 23 after Phase 1.5; this plan adds N more)
- New routes / files
- Any new warnings

**Step 3: Hand off Task 12b (manual smoke) to the user.**

The user re-runs the 10-step Mapbox checklist from the Phase 1.5 handoff, PLUS three new accordion-specific checks:

A. Section auto-collapse on "Done" advances to the next pending section.
B. Sticky-bar "Save as draft" is disabled until Basics + Venue + Date&Time all show ✓.
C. With Basics + Venue + Date&Time complete but Program empty, "Save as draft" succeeds (Program is optional for drafts).

Plus the original HKCEC test: typing "HKCEC" in the venue search now surfaces it in the top results.

**Step 4: Hold for user feedback.** No further commits until smoke results come back.

---

## Hard rules carried over from Phase 1.5 (do not break)

1. `'use client'` on the page; `useState`/`useMemo` only — no react-hook-form.
2. Submit calls `createEvent({event, blocks})` directly; no FormData.
3. Server Action is the authoritative Zod validator — three-layer rule unchanged.
4. `requireStaff()` at the top of any Server Action; Proxy gates `/events/new` per [proxy.ts](proxy.ts).
5. No PII in logs; no secrets in code.
6. Single `main` branch; one logical commit per task.
7. Verify Next 16 / shadcn / Mapbox APIs against installed `node_modules/**/*.d.ts` before writing code that depends on them.
