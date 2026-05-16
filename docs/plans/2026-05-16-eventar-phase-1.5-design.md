# Eventar — Phase 1.5 Design (Create-Event Redesign)

**Date:** 2026-05-16
**Status:** Approved — ready for writing-plans
**Scope:** Surgical edits in place on `main`. No new branch. Lands after Phase 1, supersedes the unfinished Task 13 smoke test of the old form.

---

## 1. What changes (high level)

The create-event form gets a structured rewrite. Top-level changes:

| Old | New |
|---|---|
| Title | **Event Name** (label only; column stays `title`) |
| Max attendees | **Capacity** (label only; column stays `max_attendees`) |
| Free-text Location | **Mapbox SearchBox** — typing "Rosewood" pops up real venues with address, city, country, lat/lng |
| Separate TZ picker | ==No TZ input — derived server-side from lat/lng== via offline `tz-lookup` |
| `events.format` (single value) | Subsumed by per-block `kind` field — dropped |
| `events.speakers` jsonb | Subsumed by per-block `agenda_blocks.topics` — dropped |
| `events.agenda` text | Replaced by structured `agenda_blocks` rows — dropped |
| No agenda structure | New table: `agenda_blocks` (program components + breaks/transitions in one table) |

==No production data exists== — all column drops are safe.

---

## 2. Form structure

```
┌─ Event basics ──────────────────────────────────────┐
│ Event Name      [_____________________________]     │  ← was "Title"
│ Description     [_____________________________]     │
│                 [_____________________________]     │
│ Location        [🌍 Rosewood … (Mapbox SearchBox)] │  ← autocomplete
│                 City + Country shown (read-only)    │
│ Capacity        [____]  (optional)                  │  ← was "Max attendees"
│ Date            [📅 2026-06-15]                     │  ← native input
│ Start  [🕐 09:00]    End    [🕐 16:00]              │  ← native inputs
└─────────────────────────────────────────────────────┘

┌─ Program (components) ────────[+ Add block]─────────┐
│  Each block has: kind, title, time, host, topics    │
│  Topics: [{title, speaker_name, speaker_credential, │
│           speaker_affiliation}, ...]                │
│  Parallel-overlap blocks flagged with ⚠ chip        │
└─────────────────────────────────────────────────────┘

┌─ Breaks & transitions ────────[+ Add break]─────────┐
│  Quick-add: just kind (break|transition) + time     │
│  + title (e.g. "Lunch", "Coffee", "Walk to room B") │
└─────────────────────────────────────────────────────┘

                              [Save as draft] [Cancel]
```

Date + Start + End use native HTML5 inputs (`<input type="date">`, `<input type="time">`). Combined into ISO timestamps client-side before submit.

---

## 3. Schema changes

### Migration 0003 — `agenda_blocks` table + RLS

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
                -- [{title, speaker_name, speaker_credential, speaker_affiliation}, ...]
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

create policy "agenda_blocks_public_read_when_event_published" on public.agenda_blocks
  for select to anon, authenticated
  using (exists (
    select 1 from public.events e
    where e.id = agenda_blocks.event_id and e.status = 'published'
  ));

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

create policy "agenda_blocks_manager_read_all" on public.agenda_blocks
  for select to authenticated
  using (is_manager());
```

### Migration 0004 — events table reshape

```sql
-- Drop redundant columns (subsumed by agenda_blocks)
alter table public.events drop column format;
alter table public.events drop column speakers;
alter table public.events drop column agenda;
alter table public.events drop column location;

-- Add structured venue columns
alter table public.events add column venue_name    text not null;
alter table public.events add column venue_address text;
alter table public.events add column city         text not null;
alter table public.events add column region       text;          -- state / province / null
alter table public.events add column country      text not null;
alter table public.events add column latitude     double precision not null;
alter table public.events add column longitude    double precision not null;
-- events.timezone already exists; populated server-side from lat/lng on save
```

==Both migrations applied via `supabase db push` in one batch.==

---

## 4. Server-side TZ derivation

On save, the Server Action:
1. Reads `latitude` + `longitude` from FormData
2. Calls `tz-lookup` (offline npm package, ~80KB, pure-JS) to get IANA TZ
3. Sets `events.timezone` to the result
4. ==Browser never sees or computes TZ.==

This means `events.timezone` is **derived state**, not user input. Tests assert that creating an event in Berlin produces `timezone='Europe/Berlin'`.

---

## 5. Topic jsonb shape — `speaker_role` → `speaker_credential`

```jsonb
{
  "title": "Why test-first?",
  "speaker_name": "Jane Doe",
  "speaker_credential": "MD, PhD",     // was speaker_role
  "speaker_affiliation": "Acme Co"
}
```

Both `speaker_credential` and `speaker_affiliation` are independent fields (credential = degree/title; affiliation = institution).

---

## 6. Validation rules

Server-side (Zod + DB constraints):

- **Event Name**: required, trim, 1–200 chars
- **Description**: optional, ≤ 4000 chars
- **Venue selection**: must pick from Mapbox (==strict v1, no manual override==) — venue_name + city + country + lat + lng all required
- **Capacity**: optional, positive integer
- **Date + Start + End**: required, End > Start (computed before zod parses)
- **Timezone**: derived server-side; never trusted from client

Per-block:

- **Block envelope fit**: `event.start_time ≤ block.start_time AND block.end_time ≤ event.end_time` — save-blocking error
- **Parallel blocks**: allowed; UI flags with ⚠ chip
- **Break/transition kinds**: `topics` must be empty
- **Other kinds**: `topics` may be any length including 0
- **Title**: required
- **End > Start**: enforced by DB CHECK

Per-topic:

- **Topic title**: required if topic row exists
- **speaker_name**: required if topic row exists
- **speaker_credential / speaker_affiliation**: optional

---

## 7. Save flow — transactional

`createEvent` Server Action:

```
1. requireStaff()
2. Parse + validate FormData via Zod (event + agenda_blocks shape)
3. Derive timezone from lat/lng (tz-lookup)
4. Within a single Supabase transaction (RPC or sequenced):
   a. INSERT into events
   b. INSERT N rows into agenda_blocks
5. revalidatePath('/dashboard')
6. redirect(`/events/${event.id}/edit`)
```

If step 4 fails partway, rollback the whole thing (Supabase RPC with `begin / rollback`).

> Note: `supabase-js` doesn't expose transactions natively from the client. Implementation will use a Postgres function `create_event_with_blocks(event_input jsonb, blocks_input jsonb[])` called via `.rpc()`. Atomic insert.

---

## 8. UI components & dependencies

New deps (3, all small):

| Package | Why | Size |
|---|---|---|
| `@mapbox/search-js-react` | Mapbox SearchBox React component | ~50KB |
| `tz-lookup` | Offline lat/lng → IANA TZ | ~80KB |
| (no others) | | |

Env var added: `NEXT_PUBLIC_MAPBOX_TOKEN` — public token, URL-restricted in Mapbox dashboard to localhost:3000 (+ later prod domain).

---

## 9. Out of scope (deferred)

- ✗ Manual venue override (free-text fallback when Mapbox doesn't know a place) — phase 7+
- ✗ Edit existing events — phase 1.5 scope is **create** only; edit page will be updated to display new fields but full edit form is a follow-up
- ✗ Reorder agenda blocks with drag-and-drop — keyboard-only / up-down arrows for now
- ✗ Map preview of selected venue — text-only confirmation under the SearchBox
- ✗ Speaker headshots / images on topics — text-only
- ✗ Bulk import of agenda blocks from CSV — out of MVP

---

## 10. Risks + open items

| Risk | Mitigation |
|---|---|
| Mapbox token URL-restriction not set | Documented in onboarding step; verified by attempting to use token from a 3rd domain |
| `tz-lookup` returns wrong TZ for border areas | Acceptable for MVP; tested for major venues |
| User picks a venue Mapbox doesn't know | Strict v1: no save. Documented as known limitation. |
| Server-side timezone differs from organizer's mental model | Display the derived TZ in the form preview before save (e.g., "This event will be scheduled in Europe/Berlin") |
| Parallel blocks confusing | UI chip + agenda-view layout shows parallel columns |
| Existing `requireStaff()` and RLS layers still apply | No change — agenda_blocks policies piggy-back on events ownership |

---

## 11. References

- [[Data Model]] — base data model (will be updated post-merge)
- [[Security + Robustness]] — §1 (input validation 3 layers), §5 (race conditions), §6 (secrets)
- [[Decisions Log]] — Phase 1.5 questions Q1–Q7 to be appended
- [Mapbox Search SDK docs](https://docs.mapbox.com/mapbox-search-js/guides/)
- [`tz-lookup` README](https://www.npmjs.com/package/tz-lookup)
