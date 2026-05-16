# Eventar Phase 1.5 — Create-Event Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Replace the basic create-event form with a structured form (Mapbox venue autocomplete + structured agenda blocks + topics/speakers) and back it with a new `agenda_blocks` table + reshaped `events` table.

**Architecture:** All changes land in-place on `main`. One Server Action with Zod validation feeds a Postgres RPC (`create_event_with_blocks`) for atomic insert of event + N agenda blocks. TZ derived server-side from venue lat/lng via offline `tz-lookup`. UI uses Mapbox `<SearchBox>` for venue selection; native HTML5 date/time inputs; dynamic React arrays for agenda blocks and per-block topics.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS + RPC), Zod, `@mapbox/search-js-react`, `tz-lookup`, Vitest.

**Reference:** [Phase 1.5 design](./2026-05-16-eventar-phase-1.5-design.md), [vault Data Model](file:///Users/ivan/Desktop/Eventar/10%20—%20Architecture/Data%20Model.md), [vault Security + Robustness](file:///Users/ivan/Desktop/Eventar/10%20—%20Architecture/Security%20+%20Robustness.md).

---

## Pre-flight

- Working dir: `/Users/ivan/Eventar`
- `.env.local` already has: `NEXT_PUBLIC_MAPBOX_TOKEN`, plus the Supabase vars from Phase 1
- Single `main` branch — no feature branches
- Atomic commit per task

**Sanity check before starting:**
```bash
cd /Users/ivan/Eventar && pnpm test 2>&1 | tail -3 && pnpm tsc --noEmit
# Expected: 7 tests passing from Phase 1; tsc clean
```

---

## Task 1 — Install new deps + update env template

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `.env.example`

**Step 1:** Install.

```bash
cd /Users/ivan/Eventar && pnpm add @mapbox/search-js-react tz-lookup && pnpm add -D @types/tz-lookup
```

If `@types/tz-lookup` doesn't exist on npm, skip the dev dep (the package has a small JS-only API; we'll type it inline).

**Step 2:** Append to `.env.example`:

```bash
cd /Users/ivan/Eventar && cat >> .env.example <<'EOF'

# Mapbox public token for venue search (Phase 1.5)
# Get from https://account.mapbox.com → Tokens → default public token
# URL-restrict to your dev + prod origins before using
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1Ijoi…
EOF
```

**Step 3:** Verify `.env.local` already has the var (added by controller; do not echo it):

```bash
cd /Users/ivan/Eventar && grep -c "^NEXT_PUBLIC_MAPBOX_TOKEN=" .env.local
# Expected: 1
```

**Step 4:** Commit.

```bash
cd /Users/ivan/Eventar && git add package.json pnpm-lock.yaml .env.example && git commit -m "chore(phase-1.5): add @mapbox/search-js-react + tz-lookup deps"
```

---

## Task 2 — Migration 0003: `agenda_blocks` table + RLS

**Files:**
- Create: `supabase/migrations/<timestamp>_init_agenda_blocks.sql`

**Step 1:** Generate migration:

```bash
cd /Users/ivan/Eventar && supabase migration new init_agenda_blocks
```

**Step 2:** Write content. Use Edit/Write tool. Exact SQL:

```sql
create table public.agenda_blocks (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  start_time    timestamptz not null,
  end_time      timestamptz not null check (end_time > start_time),
  kind          text not null check (kind in (
                  'workshop','seminar','webinar','scientific_program',
                  'panel','roundtable','keynote','other',
                  'break','transition'
                )),
  title         text not null,
  host          text,
  topics        jsonb not null default '[]'::jsonb,
  notes         text,
  display_order int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index agenda_blocks_event_time_idx on public.agenda_blocks(event_id, start_time);

create trigger agenda_blocks_touch_updated_at
  before update on public.agenda_blocks
  for each row execute function public.touch_updated_at();

alter table public.agenda_blocks enable row level security;

-- Public sees blocks of published events only.
create policy "agenda_blocks_public_read_when_event_published" on public.agenda_blocks
  for select to anon, authenticated
  using (exists (
    select 1 from public.events e
    where e.id = agenda_blocks.event_id and e.status = 'published'
  ));

-- Organizers: full CRUD on blocks of their events.
create policy "agenda_blocks_organizer_full" on public.agenda_blocks
  for all to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = agenda_blocks.event_id and e.created_by = current_staff_id()
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = agenda_blocks.event_id and e.created_by = current_staff_id()
  ));

-- Managers: read all.
create policy "agenda_blocks_manager_read_all" on public.agenda_blocks
  for select to authenticated
  using (is_manager());
```

**Step 3:** Apply.

```bash
cd /Users/ivan/Eventar && set -a && source .env.local && set +a && supabase db push
```

**Step 4:** Verify.

```bash
cd /Users/ivan/Eventar && set -a && source .env.local && set +a && curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/agenda_blocks?select=*&limit=1"
# Expected: []
```

**Step 5:** Commit.

```bash
cd /Users/ivan/Eventar && git add supabase/migrations/ && git commit -m "feat(phase-1.5): agenda_blocks table + RLS (program + breaks unified)"
```

---

## Task 3 — Migration 0004: reshape `events` table

**Files:**
- Create: `supabase/migrations/<timestamp>_reshape_events_venue.sql`

**Step 1:** Generate:

```bash
cd /Users/ivan/Eventar && supabase migration new reshape_events_venue
```

**Step 2:** Write content:

```sql
-- Drop columns subsumed by agenda_blocks or replaced by structured venue.
-- Safe because Phase 1.5 launches with no production data.
alter table public.events drop column if exists format;
alter table public.events drop column if exists speakers;
alter table public.events drop column if exists agenda;
alter table public.events drop column if exists location;

-- Add structured venue columns (populated from Mapbox + server-side TZ derivation).
alter table public.events add column venue_name    text not null;
alter table public.events add column venue_address text;
alter table public.events add column city         text not null;
alter table public.events add column region       text;
alter table public.events add column country      text not null;
alter table public.events add column latitude     double precision not null;
alter table public.events add column longitude    double precision not null;
```

> **Note:** `not null` on new columns means we cannot run this migration if existing rows are present. If `supabase db push` fails with "column contains null values", the controller may need to truncate `events` first.

**Step 3:** Apply.

```bash
cd /Users/ivan/Eventar && set -a && source .env.local && set +a && supabase db push
```

If push fails because rows exist:

```bash
# Confirm no events first
cd /Users/ivan/Eventar && set -a && source .env.local && set +a && curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/events?select=id&limit=1"
# If [], retry the migration. Otherwise STOP and report.
```

**Step 4:** Verify schema:

```bash
cd /Users/ivan/Eventar && set -a && source .env.local && set +a && curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/events?select=*&limit=1"
# Expected: [] (the columns won't show on empty array but verify with /rest/v1/?select=* on a posted event later)
```

**Step 5:** Commit.

```bash
cd /Users/ivan/Eventar && git add supabase/migrations/ && git commit -m "feat(phase-1.5): reshape events table — drop legacy cols, add structured venue + lat/lng"
```

---

## Task 4 — Migration 0005: `create_event_with_blocks` RPC

**Files:**
- Create: `supabase/migrations/<timestamp>_rpc_create_event_with_blocks.sql`

This is the atomic insert function. Server Action calls this single RPC; either the whole thing commits or nothing does.

**Step 1:** Generate:

```bash
cd /Users/ivan/Eventar && supabase migration new rpc_create_event_with_blocks
```

**Step 2:** Write content:

```sql
create or replace function public.create_event_with_blocks(
  event_input jsonb,
  blocks_input jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  new_event_id uuid;
  block jsonb;
begin
  -- Insert event row.
  insert into public.events (
    title, topic, description, max_attendees, status,
    start_time, end_time, timezone,
    venue_name, venue_address, city, region, country, latitude, longitude,
    created_by
  ) values (
    event_input->>'title',
    event_input->>'topic',
    event_input->>'description',
    nullif(event_input->>'max_attendees','')::int,
    coalesce(event_input->>'status','draft'),
    (event_input->>'start_time')::timestamptz,
    (event_input->>'end_time')::timestamptz,
    event_input->>'timezone',
    event_input->>'venue_name',
    event_input->>'venue_address',
    event_input->>'city',
    event_input->>'region',
    event_input->>'country',
    (event_input->>'latitude')::double precision,
    (event_input->>'longitude')::double precision,
    current_staff_id()
  )
  returning id into new_event_id;

  -- Insert each agenda block. blocks_input is a JSON array.
  for block in select * from jsonb_array_elements(blocks_input)
  loop
    insert into public.agenda_blocks (
      event_id, start_time, end_time, kind, title, host, topics, notes, display_order
    ) values (
      new_event_id,
      (block->>'start_time')::timestamptz,
      (block->>'end_time')::timestamptz,
      block->>'kind',
      block->>'title',
      block->>'host',
      coalesce(block->'topics', '[]'::jsonb),
      block->>'notes',
      coalesce((block->>'display_order')::int, 0)
    );
  end loop;

  return new_event_id;
end;
$$;

-- Allow authenticated callers to invoke.
grant execute on function public.create_event_with_blocks(jsonb, jsonb) to authenticated;
```

**Step 3:** Apply.

```bash
cd /Users/ivan/Eventar && set -a && source .env.local && set +a && supabase db push
```

**Step 4:** Verify it's callable:

```bash
cd /Users/ivan/Eventar && set -a && source .env.local && set +a && curl -s -X POST \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/create_event_with_blocks" \
  -d '{"event_input": null, "blocks_input": null}'
# Expected: an error response (function exists, just rejecting null args). Anything OTHER than "function not found" is a pass.
```

**Step 5:** Commit.

```bash
cd /Users/ivan/Eventar && git add supabase/migrations/ && git commit -m "feat(phase-1.5): create_event_with_blocks RPC (atomic event + blocks insert)"
```

---

## Task 5 — TZ-from-coords helper (TDD)

**Files:**
- Modify: `lib/tz.ts`
- Modify: `lib/tz.test.ts`

**Step 1:** Add failing test. Open `lib/tz.test.ts` and append:

```ts
import { tzFromCoords } from './tz';

describe('tzFromCoords', () => {
  it('returns Europe/Berlin for Berlin coords', () => {
    // Berlin: 52.52°N, 13.405°E
    expect(tzFromCoords(52.52, 13.405)).toBe('Europe/Berlin');
  });
  it('returns America/New_York for NYC coords', () => {
    // NYC: 40.7128°N, -74.0060°W
    expect(tzFromCoords(40.7128, -74.0060)).toBe('America/New_York');
  });
  it('returns Asia/Tokyo for Tokyo coords', () => {
    expect(tzFromCoords(35.6762, 139.6503)).toBe('Asia/Tokyo');
  });
});
```

**Step 2:** Run → expect fail.

```bash
cd /Users/ivan/Eventar && pnpm test lib/tz.test.ts 2>&1 | tail -15
# Expected: failures — tzFromCoords not exported
```

**Step 3:** Implement. Append to `lib/tz.ts`:

```ts
import tzlookup from 'tz-lookup';

export function tzFromCoords(latitude: number, longitude: number): string {
  return tzlookup(latitude, longitude);
}
```

If TypeScript complains about no types for `tz-lookup`, add a declaration at top:

```ts
// at top of lib/tz.ts, before the import
declare module 'tz-lookup' {
  export default function tzlookup(lat: number, lng: number): string;
}
```

Or create a `types/tz-lookup.d.ts` file with the same declaration.

**Step 4:** Run → expect pass.

```bash
cd /Users/ivan/Eventar && pnpm test lib/tz.test.ts 2>&1 | tail -10
# Expected: 3 new tests passing + 4 existing = 7 in tz.test.ts
```

**Step 5:** Commit.

```bash
cd /Users/ivan/Eventar && git add lib/tz.ts lib/tz.test.ts && git commit -m "feat(phase-1.5): tzFromCoords helper (offline lat/lng → IANA TZ via tz-lookup)"
```

---

## Task 6 — Parallel-detection helper (TDD)

**Files:**
- Create: `lib/agenda.ts`
- Create: `lib/agenda.test.ts`

The UI will use this to flag overlapping blocks with a chip.

**Step 1:** Write failing tests:

```ts
// lib/agenda.test.ts
import { describe, expect, it } from 'vitest';
import { findParallelBlockIds, type BlockTime } from './agenda';

describe('findParallelBlockIds', () => {
  const b = (id: string, start: string, end: string): BlockTime => ({
    id, start_time: start, end_time: end,
  });

  it('returns empty set when no overlaps', () => {
    const blocks = [b('1', '09:00', '10:00'), b('2', '10:00', '11:00')];
    expect(findParallelBlockIds(blocks).size).toBe(0);
  });

  it('flags both blocks when two overlap', () => {
    const blocks = [b('1', '09:00', '10:30'), b('2', '10:00', '11:00')];
    const par = findParallelBlockIds(blocks);
    expect(par.has('1')).toBe(true);
    expect(par.has('2')).toBe(true);
  });

  it('does not flag adjacent (back-to-back) blocks', () => {
    // 9-10 and 10-11 are NOT parallel (touch at endpoint, no overlap)
    const blocks = [b('1', '09:00', '10:00'), b('2', '10:00', '11:00')];
    expect(findParallelBlockIds(blocks).size).toBe(0);
  });

  it('flags three-way overlap', () => {
    const blocks = [
      b('1', '09:00', '11:00'),
      b('2', '10:00', '12:00'),
      b('3', '10:30', '11:30'),
    ];
    const par = findParallelBlockIds(blocks);
    expect(par.size).toBe(3);
  });
});
```

**Step 2:** Run → expect fail.

```bash
cd /Users/ivan/Eventar && pnpm test lib/agenda.test.ts 2>&1 | tail -10
```

**Step 3:** Implement:

```ts
// lib/agenda.ts
export type BlockTime = {
  id: string;
  start_time: string;    // ISO or HH:MM — only compared lexicographically when same prefix
  end_time: string;
};

/**
 * Returns the set of block IDs that overlap with at least one other block.
 * Adjacent blocks (one ends exactly when the next starts) are NOT considered parallel.
 */
export function findParallelBlockIds(blocks: BlockTime[]): Set<string> {
  const parallel = new Set<string>();
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      // Strict overlap: a.start < b.end AND b.start < a.end
      if (a.start_time < b.end_time && b.start_time < a.end_time) {
        parallel.add(a.id);
        parallel.add(b.id);
      }
    }
  }
  return parallel;
}
```

**Step 4:** Run → expect pass.

```bash
cd /Users/ivan/Eventar && pnpm test lib/agenda.test.ts 2>&1 | tail -10
# Expected: 4 tests passing
```

**Step 5:** Commit.

```bash
cd /Users/ivan/Eventar && git add lib/agenda.ts lib/agenda.test.ts && git commit -m "feat(phase-1.5): findParallelBlockIds helper (overlap detection for UI flags)"
```

---

## Task 7 — Rewrite `eventInputSchema` (TDD)

**Files:**
- Modify: `app/events/new/actions.ts` (delete old schema, write new)
- Modify: `app/events/new/actions.test.ts`

**Step 1:** Rewrite tests. ==Replace contents of `app/events/new/actions.test.ts`== with:

```ts
import { describe, expect, it } from 'vitest';
import { eventInputSchema, blockInputSchema } from './actions';

const validEvent = {
  title: 'Internal Workshop',
  description: 'A test event',
  start_time: '2026-06-15T09:00:00.000Z',
  end_time:   '2026-06-15T16:00:00.000Z',
  venue_name: 'Rosewood Sand Hill',
  venue_address: '2825 Sand Hill Rd',
  city: 'Menlo Park',
  region: 'California',
  country: 'United States',
  latitude: 37.4123,
  longitude: -122.2007,
};

describe('eventInputSchema', () => {
  it('accepts a valid event', () => {
    expect(eventInputSchema.safeParse(validEvent).success).toBe(true);
  });
  it('rejects empty title', () => {
    expect(eventInputSchema.safeParse({ ...validEvent, title: '' }).success).toBe(false);
  });
  it('rejects end before start', () => {
    const bad = { ...validEvent, end_time: '2026-06-15T08:00:00.000Z' };
    expect(eventInputSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects missing venue_name (strict v1)', () => {
    const { venue_name, ...rest } = validEvent;
    expect(eventInputSchema.safeParse(rest).success).toBe(false);
  });
  it('rejects out-of-range latitude', () => {
    expect(eventInputSchema.safeParse({ ...validEvent, latitude: 95 }).success).toBe(false);
  });
  it('coerces optional max_attendees', () => {
    const r = eventInputSchema.safeParse({ ...validEvent, max_attendees: '50' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.max_attendees).toBe(50);
  });
});

describe('blockInputSchema', () => {
  const validBlock = {
    start_time: '2026-06-15T09:00:00.000Z',
    end_time:   '2026-06-15T10:00:00.000Z',
    kind: 'workshop' as const,
    title: 'Intro',
    topics: [{
      title: 'Why test-first?',
      speaker_name: 'Jane Doe',
      speaker_credential: 'Sr. Engineer',
      speaker_affiliation: 'Acme Co',
    }],
  };
  it('accepts a valid workshop block', () => {
    expect(blockInputSchema.safeParse(validBlock).success).toBe(true);
  });
  it('rejects break with non-empty topics', () => {
    const bad = { ...validBlock, kind: 'break' as const };
    expect(blockInputSchema.safeParse(bad).success).toBe(false);
  });
  it('accepts break with empty topics', () => {
    const ok = { ...validBlock, kind: 'break' as const, topics: [] };
    expect(blockInputSchema.safeParse(ok).success).toBe(true);
  });
  it('rejects invalid kind', () => {
    expect(blockInputSchema.safeParse({ ...validBlock, kind: 'banana' as any }).success).toBe(false);
  });
});
```

**Step 2:** Run → expect fail.

```bash
cd /Users/ivan/Eventar && pnpm test app/events/new/actions.test.ts 2>&1 | tail -15
```

**Step 3:** Rewrite `app/events/new/actions.ts`. ==Replace entire file== with:

```ts
'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { tzFromCoords } from '@/lib/tz';

const KINDS = [
  'workshop','seminar','webinar','scientific_program',
  'panel','roundtable','keynote','other',
  'break','transition',
] as const;

const topicSchema = z.object({
  title: z.string().trim().min(1).max(200),
  speaker_name: z.string().trim().min(1).max(100),
  speaker_credential: z.string().trim().max(120).optional().default(''),
  speaker_affiliation: z.string().trim().max(120).optional().default(''),
});

export const blockInputSchema = z.object({
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  kind: z.enum(KINDS),
  title: z.string().trim().min(1).max(200),
  host: z.string().trim().max(120).optional().default(''),
  topics: z.array(topicSchema).default([]),
  notes: z.string().max(2000).optional().default(''),
  display_order: z.number().int().nonnegative().default(0),
})
.refine(d => new Date(d.end_time) > new Date(d.start_time), {
  message: 'Block end must be after start', path: ['end_time'],
})
.refine(d => !(d.kind === 'break' || d.kind === 'transition') || d.topics.length === 0, {
  message: 'Break/transition blocks must not have topics', path: ['topics'],
});

export const eventInputSchema = z.object({
  title: z.string().trim().min(1, 'Event name required').max(200),
  topic: z.string().trim().max(80).optional().default(''),
  description: z.string().max(4000).optional().default(''),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  venue_name: z.string().trim().min(1, 'Pick a venue from the dropdown').max(200),
  venue_address: z.string().trim().max(300).optional().default(''),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120).optional().default(''),
  country: z.string().trim().min(1).max(120),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  max_attendees: z.coerce.number().int().positive().optional(),
})
.refine(d => new Date(d.end_time) > new Date(d.start_time), {
  message: 'End time must be after start time', path: ['end_time'],
});

export type EventInput = z.infer<typeof eventInputSchema>;
export type BlockInput = z.infer<typeof blockInputSchema>;

/** Whether a block's time range fits inside the event envelope. */
function blockFitsEnvelope(block: BlockInput, event: { start_time: string; end_time: string }): boolean {
  return new Date(block.start_time) >= new Date(event.start_time)
      && new Date(block.end_time)   <= new Date(event.end_time);
}

export async function createEvent(input: {
  event: unknown;
  blocks: unknown;
}): Promise<{ ok: true; id: string } | { error: string }> {
  await requireStaff();

  const eventParse = eventInputSchema.safeParse(input.event);
  if (!eventParse.success) {
    return { error: eventParse.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  const blocksRaw = Array.isArray(input.blocks) ? input.blocks : [];
  const blockParse = z.array(blockInputSchema).safeParse(blocksRaw);
  if (!blockParse.success) {
    return { error: blockParse.error.issues.map(i => `block ${i.path.join('.')}: ${i.message}`).join('; ') };
  }

  // Envelope-fit validation
  const outOfEnvelope = blockParse.data.find(b => !blockFitsEnvelope(b, eventParse.data));
  if (outOfEnvelope) {
    return { error: `Block "${outOfEnvelope.title}" runs outside the event's start/end window` };
  }

  const timezone = tzFromCoords(eventParse.data.latitude, eventParse.data.longitude);

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('create_event_with_blocks', {
    event_input:  { ...eventParse.data, timezone, status: 'draft' },
    blocks_input: blockParse.data,
  });

  if (error) return { error: error.message };
  if (!data || typeof data !== 'string') return { error: 'no id returned' };

  revalidatePath('/dashboard');
  redirect(`/events/${data}/edit`);
}
```

**Step 4:** Run → expect pass.

```bash
cd /Users/ivan/Eventar && pnpm test 2>&1 | tail -10
# Expected: all suites green
```

**Step 5:** Commit.

```bash
cd /Users/ivan/Eventar && git add app/events/new/actions.ts app/events/new/actions.test.ts && git commit -m "feat(phase-1.5): rewrite createEvent Server Action — Zod schemas, RPC, envelope-fit"
```

---

## Task 8 — Mapbox SearchBox + basic-info form section

**Files:**
- Create: `components/VenueSearchBox.tsx`
- Modify: `app/events/new/page.tsx` (full rewrite — drop old form)

**Step 1:** Verify Mapbox React API for the current installed version. Read:

```bash
cd /Users/ivan/Eventar && ls node_modules/@mapbox/search-js-react/dist/ | head -20 && cat node_modules/@mapbox/search-js-react/package.json | grep '"version"'
```

Then read the SearchBox prop types:

```bash
cd /Users/ivan/Eventar && grep -rE "export.*SearchBox|interface.*SearchBoxProps|type.*SearchBoxProps" node_modules/@mapbox/search-js-react/dist/ | head -10
```

Confirm the props named `accessToken`, `value`, `onChange`, `onRetrieve`. If the API differs, adapt accordingly in the next step.

**Step 2:** Create the wrapper component:

```tsx
// components/VenueSearchBox.tsx
'use client';

import { useState } from 'react';
import { SearchBox } from '@mapbox/search-js-react';

export type Venue = {
  venue_name: string;
  venue_address: string;
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
};

type Props = {
  token: string;
  onSelect: (venue: Venue) => void;
};

export default function VenueSearchBox({ token, onSelect }: Props) {
  const [value, setValue] = useState('');

  return (
    <SearchBox
      accessToken={token}
      value={value}
      onChange={setValue}
      onRetrieve={(res: any) => {
        // SearchBox returns a FeatureCollection-like object on retrieve.
        // Extract: text (name), full_address, context (city/region/country), geometry.coordinates [lng, lat]
        const f = res?.features?.[0];
        if (!f) return;
        const ctx: Record<string, { name: string }> = {};
        for (const c of (f.properties?.context ?? [])) {
          // c.id looks like "place.123", "region.456", "country.789"
          const key = String(c.id).split('.')[0];
          ctx[key] = c;
        }
        const [longitude, latitude] = f.geometry?.coordinates ?? [];
        onSelect({
          venue_name:    f.properties?.name ?? f.properties?.feature_name ?? value,
          venue_address: f.properties?.full_address ?? f.properties?.address ?? '',
          city:    ctx['place']?.name   ?? '',
          region:  ctx['region']?.name  ?? '',
          country: ctx['country']?.name ?? '',
          latitude,
          longitude,
        });
        setValue(f.properties?.name ?? value);
      }}
      placeholder="Search for a venue, hotel, or address…"
      options={{ types: 'poi,address,place', limit: 10 }}
    />
  );
}
```

> **API verification gate**: If the property names above (`properties.name`, `properties.context`, `properties.full_address`, etc.) don't match what `@mapbox/search-js-react` actually returns, ==use a `console.log(res)` once during development== to inspect the response shape, then adapt. The Mapbox Search SDK structure has changed across versions; trust the live `res` object over my template.

**Step 3:** Full rewrite of `app/events/new/page.tsx`:

```tsx
'use client';

import { useMemo, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { createEvent } from './actions';
import type { Venue } from '@/components/VenueSearchBox';
import { findParallelBlockIds } from '@/lib/agenda';

const VenueSearchBox = dynamic(() => import('@/components/VenueSearchBox'), { ssr: false });

type TopicDraft = {
  title: string;
  speaker_name: string;
  speaker_credential: string;
  speaker_affiliation: string;
};
type BlockDraft = {
  localId: string;
  start: string;   // HH:MM
  end: string;     // HH:MM
  kind: 'workshop'|'seminar'|'webinar'|'scientific_program'|'panel'|'roundtable'|'keynote'|'other'|'break'|'transition';
  title: string;
  host: string;
  topics: TopicDraft[];
  notes: string;
};

const RICH_KINDS = ['workshop','seminar','webinar','scientific_program','panel','roundtable','keynote','other'] as const;
const FILLER_KINDS = ['break','transition'] as const;

function emptyTopic(): TopicDraft {
  return { title: '', speaker_name: '', speaker_credential: '', speaker_affiliation: '' };
}
function emptyBlock(kind: BlockDraft['kind']): BlockDraft {
  return {
    localId: crypto.randomUUID(),
    start: '', end: '', kind, title: '', host: '',
    topics: kind === 'break' || kind === 'transition' ? [] : [emptyTopic()],
    notes: '',
  };
}

export default function NewEventPage() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Basics
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState<Venue | null>(null);
  const [capacity, setCapacity] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');

  // Program + breaks (same underlying list — split for UI only)
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);
  const components = blocks.filter(b => !(['break','transition'] as readonly string[]).includes(b.kind));
  const fillers    = blocks.filter(b =>  (['break','transition'] as readonly string[]).includes(b.kind));

  const parallelIds = useMemo(() => {
    const items = blocks
      .filter(b => b.start && b.end)
      .map(b => ({ id: b.localId, start_time: `${date}T${b.start}`, end_time: `${date}T${b.end}` }));
    return findParallelBlockIds(items);
  }, [blocks, date]);

  function updateBlock(localId: string, patch: Partial<BlockDraft>) {
    setBlocks(bs => bs.map(b => b.localId === localId ? { ...b, ...patch } : b));
  }
  function removeBlock(localId: string) {
    setBlocks(bs => bs.filter(b => b.localId !== localId));
  }
  function addBlock(kind: BlockDraft['kind']) {
    setBlocks(bs => [...bs, emptyBlock(kind)]);
  }

  function onSubmit() {
    setErr(null);
    if (!venue) { setErr('Pick a venue from the dropdown'); return; }
    if (!date)  { setErr('Pick a date'); return; }
    if (!name)  { setErr('Enter an event name'); return; }

    const event = {
      title: name,
      description,
      start_time: new Date(`${date}T${startTime}:00`).toISOString(),
      end_time:   new Date(`${date}T${endTime}:00`).toISOString(),
      max_attendees: capacity || undefined,
      ...venue,
    };
    const blocksPayload = blocks.map((b, i) => ({
      start_time: new Date(`${date}T${b.start}:00`).toISOString(),
      end_time:   new Date(`${date}T${b.end}:00`).toISOString(),
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

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">New event</h1>

      {/* === BASICS === */}
      <section className="space-y-4 bg-white rounded-2xl border p-6">
        <h2 className="text-lg font-medium">Event basics</h2>

        <Labelled label="Event Name">
          <input className="ev-input" value={name} onChange={e => setName(e.target.value)} required />
        </Labelled>

        <Labelled label="Description">
          <textarea className="ev-input" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
        </Labelled>

        <Labelled label="Location">
          <VenueSearchBox token={process.env.NEXT_PUBLIC_MAPBOX_TOKEN!} onSelect={setVenue} />
          {venue && (
            <p className="text-xs text-gray-600 mt-1">
              📍 {venue.venue_name} — {venue.city}{venue.region ? `, ${venue.region}` : ''}, {venue.country}
            </p>
          )}
        </Labelled>

        <Labelled label="Capacity (optional)">
          <input className="ev-input" type="number" min={1} value={capacity} onChange={e => setCapacity(e.target.value)} />
        </Labelled>

        <Labelled label="Date">
          <input className="ev-input" type="date" value={date} onChange={e => setDate(e.target.value)} required />
        </Labelled>

        <div className="grid grid-cols-2 gap-4">
          <Labelled label="Start"><input className="ev-input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required /></Labelled>
          <Labelled label="End"><input className="ev-input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required /></Labelled>
        </div>
      </section>

      {/* === PROGRAM === */}
      <section className="space-y-4 bg-white rounded-2xl border p-6">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Program</h2>
          <select
            className="ev-input w-auto"
            value=""
            onChange={e => {
              if (!e.target.value) return;
              addBlock(e.target.value as BlockDraft['kind']);
              e.target.value = '';
            }}
          >
            <option value="">+ Add component…</option>
            {RICH_KINDS.map(k => <option key={k} value={k}>{labelForKind(k)}</option>)}
          </select>
        </header>
        {components.length === 0 && <p className="text-sm text-gray-500">No components yet.</p>}
        {components.map(b => (
          <BlockEditor
            key={b.localId}
            block={b}
            parallel={parallelIds.has(b.localId)}
            onChange={patch => updateBlock(b.localId, patch)}
            onRemove={() => removeBlock(b.localId)}
          />
        ))}
      </section>

      {/* === BREAKS === */}
      <section className="space-y-4 bg-white rounded-2xl border p-6">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Breaks & transitions</h2>
          <div className="flex gap-2">
            <button type="button" className="ev-btn-secondary" onClick={() => addBlock('break')}>+ Break</button>
            <button type="button" className="ev-btn-secondary" onClick={() => addBlock('transition')}>+ Transition</button>
          </div>
        </header>
        {fillers.length === 0 && <p className="text-sm text-gray-500">None.</p>}
        {fillers.map(b => (
          <FillerEditor key={b.localId} block={b} onChange={patch => updateBlock(b.localId, patch)} onRemove={() => removeBlock(b.localId)} />
        ))}
      </section>

      {/* === ACTIONS === */}
      <div className="flex items-center justify-end gap-3">
        {err && <p className="text-sm text-red-700 mr-auto whitespace-pre-wrap">{err}</p>}
        <button type="button" disabled={pending} onClick={onSubmit} className="rounded-md bg-black text-white px-4 py-2 font-medium disabled:opacity-50">
          {pending ? 'Saving…' : 'Save as draft'}
        </button>
      </div>

      <style jsx global>{`
        .ev-input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
        }
        .ev-input:focus { outline: 2px solid rgba(0,0,0,.1); }
        .ev-btn-secondary {
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 0.375rem 0.75rem;
          font-size: 0.875rem;
          background: white;
        }
      `}</style>
    </main>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
    </label>
  );
}

function labelForKind(k: string): string {
  const map: Record<string, string> = {
    workshop: 'Workshop', seminar: 'Seminar', webinar: 'Webinar',
    scientific_program: 'Scientific Program', panel: 'Panel',
    roundtable: 'Roundtable', keynote: 'Keynote', other: 'Other',
    break: 'Break', transition: 'Transition',
  };
  return map[k] ?? k;
}

/* ===== Block editors ===== */

function BlockEditor({ block, parallel, onChange, onRemove }: {
  block: BlockDraft; parallel: boolean;
  onChange: (patch: Partial<BlockDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border rounded-xl p-4 space-y-3 bg-gray-50/30">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide bg-black text-white px-2 py-0.5 rounded">{labelForKind(block.kind)}</span>
          {parallel && <span className="text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded">⚠ Parallel session</span>}
        </div>
        <button type="button" onClick={onRemove} className="text-xs text-red-700 hover:underline">Remove</button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Labelled label="Start"><input className="ev-input" type="time" value={block.start} onChange={e => onChange({ start: e.target.value })} /></Labelled>
        <Labelled label="End"><input className="ev-input" type="time" value={block.end} onChange={e => onChange({ end: e.target.value })} /></Labelled>
      </div>
      <Labelled label="Title">
        <input className="ev-input" value={block.title} onChange={e => onChange({ title: e.target.value })} />
      </Labelled>
      <Labelled label="Host / Chairperson">
        <input className="ev-input" value={block.host} onChange={e => onChange({ host: e.target.value })} />
      </Labelled>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Topics</span>
          <button type="button" onClick={() => onChange({ topics: [...block.topics, emptyTopic()] })} className="text-xs text-blue-700 hover:underline">+ Add topic</button>
        </div>
        {block.topics.map((t, i) => (
          <div key={i} className="border rounded-lg p-3 mb-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Topic {i + 1}</span>
              <button type="button" onClick={() => onChange({ topics: block.topics.filter((_, j) => j !== i) })} className="text-xs text-red-700 hover:underline">Remove</button>
            </div>
            <Labelled label="Topic title"><input className="ev-input" value={t.title} onChange={e => onChange({ topics: block.topics.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} /></Labelled>
            <Labelled label="Speaker name"><input className="ev-input" value={t.speaker_name} onChange={e => onChange({ topics: block.topics.map((x, j) => j === i ? { ...x, speaker_name: e.target.value } : x) })} /></Labelled>
            <Labelled label="Credential"><input className="ev-input" value={t.speaker_credential} onChange={e => onChange({ topics: block.topics.map((x, j) => j === i ? { ...x, speaker_credential: e.target.value } : x) })} /></Labelled>
            <Labelled label="Affiliation"><input className="ev-input" value={t.speaker_affiliation} onChange={e => onChange({ topics: block.topics.map((x, j) => j === i ? { ...x, speaker_affiliation: e.target.value } : x) })} /></Labelled>
          </div>
        ))}
      </div>
    </div>
  );
}

function FillerEditor({ block, onChange, onRemove }: {
  block: BlockDraft;
  onChange: (patch: Partial<BlockDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border rounded-xl p-3 grid grid-cols-12 gap-2 items-end">
      <div className="col-span-3"><Labelled label="Start"><input className="ev-input" type="time" value={block.start} onChange={e => onChange({ start: e.target.value })} /></Labelled></div>
      <div className="col-span-3"><Labelled label="End"><input className="ev-input" type="time" value={block.end} onChange={e => onChange({ end: e.target.value })} /></Labelled></div>
      <div className="col-span-5"><Labelled label="What"><input className="ev-input" placeholder={block.kind === 'break' ? 'Lunch / coffee' : 'Walk to room B'} value={block.title} onChange={e => onChange({ title: e.target.value })} /></Labelled></div>
      <div className="col-span-1"><button type="button" onClick={onRemove} className="text-xs text-red-700 hover:underline">×</button></div>
    </div>
  );
}
```

**Step 4:** Type-check + run tests:

```bash
cd /Users/ivan/Eventar && pnpm tsc --noEmit && pnpm test
# Expected: tsc clean, all tests pass
```

**Step 5:** Boot dev server and screenshot via Bash to confirm it renders without runtime errors:

```bash
cd /Users/ivan/Eventar && pnpm dev > /tmp/dev.log 2>&1 &
DEV_PID=$!
for i in {1..30}; do grep -q "Ready" /tmp/dev.log && break; sleep 1; done
# Hit the page (will redirect to /login because middleware gates it — that's OK, proves no compile crash)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/events/new
# Expected: 307 (redirect to /login) — proves the route compiles without runtime error
kill $DEV_PID 2>/dev/null; wait $DEV_PID 2>/dev/null
```

If compile fails, fix and re-run. Likely fixes:
- Mapbox SearchBox import path / props
- `crypto.randomUUID()` not available in old Node (Node 24 has it — fine)
- Tailwind classes not generated (Tailwind v4 should auto-detect)

**Step 6:** Commit.

```bash
cd /Users/ivan/Eventar && git add components/VenueSearchBox.tsx app/events/new/page.tsx && git commit -m "feat(phase-1.5): new create-event form — Mapbox venue search, dynamic agenda blocks, breaks UI"
```

---

## Task 9 — Update edit page to render new fields

**Files:**
- Modify: `app/events/[id]/edit/page.tsx`

The edit page currently expects `events.format`, `events.agenda`, `events.speakers`, `events.location` — all dropped. Update it to display new venue + render agenda blocks (read-only for Phase 1.5; full edit is deferred).

**Step 1:** Read current file to see what to change:

```bash
cd /Users/ivan/Eventar && cat app/events/\[id\]/edit/page.tsx
```

**Step 2:** Rewrite to use new schema. Key changes:
- Read agenda_blocks alongside event
- Display venue_name / address / city / country
- Display agenda blocks list (read-only)

```tsx
// app/events/[id]/edit/page.tsx
import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';
import { publishEvent } from './actions';

export default async function StaffEventPage({ params }: { params: Promise<{ id: string }> }) {
  try { await requireStaff(); } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: event } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
  if (!event) notFound();

  const { data: blocks } = await supabase
    .from('agenda_blocks').select('*').eq('event_id', id).order('start_time', { ascending: true });

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <p className="text-sm text-gray-500">Status: <strong>{event.status}</strong></p>
      <h1 className="text-3xl font-semibold">{event.title}</h1>
      <p className="text-gray-700">
        {formatInTz(event.start_time, event.timezone)} → {formatInTz(event.end_time, event.timezone)} ({event.timezone})
      </p>

      <section>
        <h2 className="text-sm font-medium text-gray-700">Venue</h2>
        <p>{event.venue_name}</p>
        {event.venue_address && <p className="text-gray-600 text-sm">{event.venue_address}</p>}
        <p className="text-gray-600 text-sm">
          {event.city}{event.region ? `, ${event.region}` : ''}, {event.country}
        </p>
      </section>

      {event.description && (
        <section>
          <h2 className="text-sm font-medium text-gray-700">About</h2>
          <p className="whitespace-pre-wrap">{event.description}</p>
        </section>
      )}

      {(blocks?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-sm font-medium text-gray-700 mb-2">Program</h2>
          <ul className="divide-y border rounded-xl">
            {blocks!.map(b => (
              <li key={b.id} className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-gray-500">{b.kind}</span>
                  <span className="text-sm text-gray-700">
                    {formatInTz(b.start_time, event.timezone)} → {formatInTz(b.end_time, event.timezone)}
                  </span>
                </div>
                <p className="font-medium mt-1">{b.title}</p>
                {b.host && <p className="text-sm text-gray-600">Chair: {b.host}</p>}
                {Array.isArray(b.topics) && b.topics.length > 0 && (
                  <ul className="mt-2 text-sm space-y-1">
                    {b.topics.map((t: any, i: number) => (
                      <li key={i}>
                        • {t.title} — <em>{t.speaker_name}</em>
                        {t.speaker_credential && <span className="text-gray-500"> ({t.speaker_credential})</span>}
                        {t.speaker_affiliation && <span className="text-gray-500">, {t.speaker_affiliation}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {event.status === 'draft' && (
        <form action={async () => { 'use server'; await publishEvent(event.id); }}>
          <button className="rounded-md bg-black text-white px-4 py-2">Publish</button>
        </form>
      )}
      {event.status === 'published' && (
        <a className="text-blue-700 underline" href={`/events/${event.id}`} target="_blank" rel="noreferrer">
          View public page →
        </a>
      )}

      <p className="text-xs text-gray-500">Full edit UI is deferred. For now, delete and re-create to change details.</p>
    </main>
  );
}
```

**Step 3:** Type-check.

```bash
cd /Users/ivan/Eventar && pnpm tsc --noEmit
```

**Step 4:** Commit.

```bash
cd /Users/ivan/Eventar && git add app/events/\[id\]/edit/page.tsx && git commit -m "feat(phase-1.5): edit page renders new venue + agenda blocks (read-only)"
```

---

## Task 10 — Update public info page

**Files:**
- Modify: `app/(public)/events/[id]/page.tsx`

Mirror the changes from Task 9 but for the unauthenticated public view. Same data shape, slightly more "marketing-y" rendering.

**Step 1:** Replace contents:

```tsx
// app/(public)/events/[id]/page.tsx
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';

export const dynamic = 'force-dynamic';

export default async function PublicEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: event } = await supabase
    .from('events')
    .select('id, title, description, status, start_time, end_time, timezone, venue_name, venue_address, city, region, country')
    .eq('id', id)
    .maybeSingle();

  if (!event || event.status !== 'published') notFound();

  const { data: blocks } = await supabase
    .from('agenda_blocks')
    .select('id, kind, title, host, topics, start_time, end_time')
    .eq('event_id', id)
    .order('start_time', { ascending: true });

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-gray-500">Event</p>
        <h1 className="text-4xl font-semibold mt-1">{event.title}</h1>
        <p className="text-gray-700 mt-2">
          {formatInTz(event.start_time, event.timezone)} → {formatInTz(event.end_time, event.timezone)} ({event.timezone})
        </p>
        <p className="text-gray-700 mt-1">
          📍 {event.venue_name}{event.venue_address ? `, ${event.venue_address}` : ''} — {event.city}{event.region ? `, ${event.region}` : ''}, {event.country}
        </p>
      </header>

      {event.description && (
        <section>
          <h2 className="text-lg font-medium mb-2">About</h2>
          <p className="whitespace-pre-wrap text-gray-800">{event.description}</p>
        </section>
      )}

      {(blocks?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-2">Program</h2>
          <ul className="divide-y border rounded-xl">
            {blocks!.map(b => (
              <li key={b.id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-gray-500">{b.kind}</span>
                  <span className="text-sm text-gray-700">
                    {formatInTz(b.start_time, event.timezone)} → {formatInTz(b.end_time, event.timezone)}
                  </span>
                </div>
                <p className="font-medium mt-1">{b.title}</p>
                {b.host && <p className="text-sm text-gray-600">Chair: {b.host}</p>}
                {Array.isArray(b.topics) && b.topics.length > 0 && (
                  <ul className="mt-2 text-sm space-y-1">
                    {b.topics.map((t: any, i: number) => (
                      <li key={i}>
                        • {t.title} — <em>{t.speaker_name}</em>
                        {t.speaker_credential && <span className="text-gray-500"> ({t.speaker_credential})</span>}
                        {t.speaker_affiliation && <span className="text-gray-500">, {t.speaker_affiliation}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="pt-6 text-sm text-gray-500">Registration opens here in phase 2.</footer>
    </main>
  );
}
```

**Step 2:** Type-check.

```bash
cd /Users/ivan/Eventar && pnpm tsc --noEmit
```

**Step 3:** Commit.

```bash
cd /Users/ivan/Eventar && git add "app/(public)/events/[id]/page.tsx" && git commit -m "feat(phase-1.5): public info page renders venue + agenda blocks"
```

---

## Task 11 — Final verification (tsc + tests + build + dev smoke)

**Files:** none — verification only.

**Step 1:** Full test suite.

```bash
cd /Users/ivan/Eventar && pnpm test 2>&1 | tail -15
# Expected: all suites green (lib/auth + lib/tz with tzFromCoords + lib/agenda + app/events/new/actions)
```

**Step 2:** Type-check.

```bash
cd /Users/ivan/Eventar && pnpm tsc --noEmit
# Expected: no errors
```

**Step 3:** Production build.

```bash
cd /Users/ivan/Eventar && pnpm build 2>&1 | tail -30
# Expected: "Compiled successfully"
```

**Step 4:** Boot dev server, hit /login (200), hit /events/new (307 → /login), confirm routes resolve.

```bash
cd /Users/ivan/Eventar && pnpm dev > /tmp/dev.log 2>&1 &
DEV_PID=$!
for i in {1..30}; do grep -q "Ready" /tmp/dev.log && break; sleep 1; done
echo "/login:"           && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
echo "/events/new:"      && curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3000/events/new
kill $DEV_PID 2>/dev/null; wait $DEV_PID 2>/dev/null
```

Expected:
- `/login` → 200
- `/events/new` → 307 redirect (middleware gate working, page compiles)

**Step 5:** If everything passes, no commit needed (verification only). Report success.

---

## Task 12 — User smoke test (manual)

==This task is for the user, not for an implementer subagent.==

**Steps for user:**

1. Run dev server:
   ```bash
   cd /Users/ivan/Eventar && pnpm dev
   ```

2. Open `http://localhost:3000/login` in browser. Sign in with `ahf.ivan@gmail.com`.

3. Land on `/dashboard`. Click **New event**.

4. Fill in the form:
   - Event Name: "Phase 1.5 Smoke Test"
   - Description: "Testing the new create-event form"
   - Location: type "Rosewood" → pick any result from Mapbox dropdown
   - Capacity: 50
   - Date: tomorrow's date
   - Start: 09:00 / End: 17:00
   - Add a "Workshop" component:
     - Start 09:00 / End 10:00
     - Title: "Intro"
     - Host: "Your Name"
     - Topic: "Why test-first?" / Speaker "Jane Doe" / Credential "Sr Eng" / Affiliation "Acme"
   - Add a "Break":
     - Start 10:00 / End 10:15
     - Title: "Coffee"
   - Add another Workshop with overlapping time (e.g., 10:30–11:30 alongside another component at 10:30–11:30) → verify ⚠ Parallel chip appears

5. Click **Save as draft**. Should redirect to `/events/<id>/edit` showing the event with all blocks rendered.

6. Click **Publish**. Open `/events/<id>` in incognito → verify public render shows venue + agenda.

7. If anything misbehaves, report back with the error or screenshot.

---

## Done with Phase 1.5

End state:
- ✅ Mapbox venue autocomplete on Location field
- ✅ Date / time pickers (native HTML5)
- ✅ TZ derived server-side from venue coordinates
- ✅ Multi-component program with topics + speakers
- ✅ Breaks/transitions in separate UI section, same table
- ✅ Parallel-overlap visual flag (not save-blocking)
- ✅ Speaker credential + affiliation per topic
- ✅ Schema cleaned up (`format`, `speakers`, `agenda` columns dropped; venue columns added)
- ✅ Atomic event + blocks insert via Postgres RPC
- ✅ All tests passing; tsc clean; build clean

Future polish (deferred):
- Edit existing events (full form, not just read-only render)
- Drag-to-reorder agenda blocks
- Manual venue fallback when Mapbox doesn't know a place
- Map preview of selected venue
- Speaker headshots
