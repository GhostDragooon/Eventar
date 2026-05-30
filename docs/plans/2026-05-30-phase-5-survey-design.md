# Phase 5 — Survey flow (design)

> Date: 2026-05-30 · Status: approved, ready for implementation plan
> Roadmap row: Phase 5 "Survey flow" — `survey_responses`, emails stubbed.

## Goal / demo end-state

An attendee who has been **checked in** (`registrations.status = 'attended'`) can open
`/survey?code=WK-XXXX`, answer a fixed 5-question template, and submit — producing one
row in `public.survey_responses`. Re-opening the link after submitting shows a
"thanks, already submitted" state. No email is sent in Phase 5.

## Decisions locked this session

| # | Decision | Rationale |
|---|---|---|
| Route | `/survey?code=…` (no event id in path) | Mirrors `/checkin/confirm?code=`. The code resolves the registration *and* its event via FK; an event id in the URL is redundant and a mild enumeration surface. **Deviates from the roadmap's literal `/survey/:id?code=`** — logged below. |
| Eligibility | Require `status = 'attended'` | PRD: survey goes to attendees ~10 min after the event. A not-yet-attended code shows a "survey not available yet" state. |
| Email | **None** in Phase 5 (submission-only) | No natural Phase-5 trigger exists for a survey email — that's the T+10min cron in Phase 9 (real send in Phase 7). Matches the roadmap demo (manual navigation, no email). |
| Questions | The 5 mockup questions, **fixed standard template** | Per-event customization (the "survey builder") is explicitly deferred. Questions defined as data in `lib/surveyTemplate.ts` so the future builder moves them from a code constant to a DB table with minimal churn. |
| Required fields | **All 5 optional** | User decision. Fully-empty submission is permitted (flagged below). |
| Rating UI | n/a — mockup has no 1–5 ratings | The mockup **replaces** the vault's 3-rating schema entirely (see Conflict). |
| Navigation | Manual (`/survey?code=`), **no link from check-in** | Roadmap keeps Phase 5 navigation manual. |
| Empty submission | Allowed | Per "all optional." A "≥1 answer" guard is a trivial later add if junk rows appear. |

## ⚠️ Conflict surfaced (CLAUDE.md Rule 7) — mockup supersedes vault data model

The vault `10 — Architecture/Data Model.md` §`survey_responses` (the documented source of
truth) specced **three numeric 1–5 ratings** (`speaker_rating`, `content_rating`,
`structure_rating`) + free-text `comments`, and Phase 6 analytics is written around it
("avg ratings 4.6/4.2/4.8"). The user-provided mockup has **five entirely different
questions, none of which is a 1–5 rating.** These cannot both be the schema.

**Resolution:** the mockup is authoritative (explicit, newer instruction). This requires:
1. Rewriting `Data Model.md` §`survey_responses` to the schema below.
2. Adjusting the Phase 6 analytics plan (no "avg ratings"; instead distributions over the
   new categorical questions).
3. A new entry in `02 — Decisions Log.md` recording the route deviation + schema change.

These vault edits are part of the implementation plan (they are "summary docs" → written
*after* the phase-completion checks, per the protocol).

## The 5 questions (the standard template)

Defined in `lib/surveyTemplate.ts` as `{ id, prompt, kind, options? }`. Display labels live
here; the DB stores stable **slugs**, never display text.

| # | Prompt (display) | Kind | Slug values |
|---|---|---|---|
| 01 SESSION FORMAT | "Which event format did you find most valuable?" | single | `scientific_presentations`, `clinical_panels`, `interactive_qa`, `peer_networking` |
| 02 KEY HIGHLIGHTS | "Which speaker or session provided the most clinical utility?" | text | — (free text, max 2000 chars) |
| 03 VALUE PROPOSITION | "What was the most valuable aspect of this summit?" | single | `clinical_application`, `faculty_caliber`, `peer_collaboration` |
| 04 EXPECTATIONS | "Overall, did the event meet your professional expectations?" | single (segmented) | `exceeded`, `met`, `partially`, `not_met` |
| 05 FUTURE PREFERENCES | "Select areas for future programmatic expansion:" | multi | `expanded_qa`, `increased_clinical_depth`, `structured_networking`, `subspecialty_topics` |

UI uses the **exact mockup layout, design and copy**, rendered on the M3 indigo tokens +
`PublicShell` (consistent with the Phase 4.6 reskin). Footer: "Approximate completion time:
2 minutes" + Submit.

## Schema (replaces vault spec)

```sql
create table public.survey_responses (
  id                 uuid primary key default gen_random_uuid(),
  registration_id    uuid not null unique references public.registrations(id) on delete cascade,
  event_id           uuid not null references public.events(id) on delete cascade,
  session_format     text,                              -- Q1 slug
  key_highlights     text,                              -- Q2 free text
  value_proposition  text,                              -- Q3 slug
  expectations       text,                              -- Q4 slug
  future_preferences text[] not null default '{}',      -- Q5 slugs
  submitted_at       timestamptz not null default now(),
  constraint survey_session_format_ck check (
    session_format is null or session_format in
      ('scientific_presentations','clinical_panels','interactive_qa','peer_networking')),
  constraint survey_value_proposition_ck check (
    value_proposition is null or value_proposition in
      ('clinical_application','faculty_caliber','peer_collaboration')),
  constraint survey_expectations_ck check (
    expectations is null or expectations in
      ('exceeded','met','partially','not_met')),
  constraint survey_future_preferences_ck check (
    future_preferences <@ array[
      'expanded_qa','increased_clinical_depth','structured_networking','subspecialty_topics'
    ]::text[]),
  constraint survey_key_highlights_len_ck check (
    key_highlights is null or char_length(key_highlights) <= 2000)
);
```

- `registration_id unique` → one survey per registration → **DB-level idempotency**.
- CHECK constraints keep all three validation layers intact today (Rule 8). The future
  builder phase owns relaxing them.

## Three-layer validation (Rule 8)

1. **Form** — native radio / checkbox / textarea; client only offers template options.
2. **Zod** (`schema.ts`) — enum membership against `surveyTemplate` slug sets, all
   `.optional()`, `future_preferences` ⊆ template set, `key_highlights` `.max(2000)`.
3. **DB** — the CHECK + UNIQUE constraints above.

## RLS

```sql
alter table public.survey_responses enable row level security;
-- no anon/public policies → public denied; writes go through supabaseAdmin (service role)
create policy "survey_organizer_select_own" on public.survey_responses
  for select using (exists (
    select 1 from public.events e
    where e.id = survey_responses.event_id and e.created_by = app_private.current_staff_id()));
create policy "survey_manager_select_all" on public.survey_responses
  for select using (app_private.is_manager());
```
Mirrors the existing `registrations` policies; helpers are `app_private`-qualified
(post `fix_security_lints`).

## Route + page state machine

`app/(public)/survey/page.tsx`, `export const dynamic = 'force-dynamic'`. Mirrors
`/checkin/confirm` exactly:

| Condition | State |
|---|---|
| no `code` | empty state ("no survey code") |
| `!isValidRegistrationCode(code)` | "code not recognised" |
| registration not found / event not `published` | "code not recognised" |
| `status !== 'attended'` | "survey not available yet" |
| a `survey_responses` row already exists | "thanks, already submitted" |
| eligible (attended, no response) | render `SurveyForm` |

Loads via `supabaseAdmin` (anon can't read registrations), same `!inner(events…)` embed +
local cast pattern as the confirm page.

## Action

`app/(public)/survey/actions.ts` → `submitSurvey(code, answers)`:
1. `'use server'`, `supabaseAdmin` (anon has no insert policy; code is the bearer token).
2. Validate code format → Zod-parse `answers`.
3. Look up registration by `registration_code`; require it exists, event `published`,
   `status = 'attended'`. (Re-check server-side — never trust the page render.)
4. Insert `survey_responses` row. Unique-violation on `registration_id` → return
   `{ error: "You've already submitted this survey." }` (idempotent, fail-visible).
5. `revalidatePath('/survey')`, return `{ ok: true }`.

Empty submission allowed (all-optional). The insert omits keys the user left blank;
`future_preferences` defaults to `{}`.

## Files

| File | What |
|---|---|
| `supabase/migrations/<ts>_init_survey_responses.sql` | table + CHECK + UNIQUE + RLS; **applied to remote via MCP** (CLI `db push` blocked by pre-existing drift) |
| `lib/surveyTemplate.ts` | question/option definitions + slug types (single source for render + Zod) |
| `app/(public)/survey/page.tsx` | state-machine page |
| `app/(public)/survey/SurveyForm.tsx` | client form, exact mockup layout |
| `app/(public)/survey/schema.ts` | Zod schema |
| `app/(public)/survey/actions.ts` | `submitSurvey` server action |
| `app/(public)/survey/schema.test.ts` | option / optional / subset rules |
| `app/(public)/survey/actions.test.ts` | happy path, not-attended reject, already-submitted idempotency, bad code (mocked-admin pattern from existing tests) |
| DB types regen | regenerate generated Supabase types |

## Static gates (running invariants to update)

Current: tsc clean · eslint clean · **vitest 83/83 across 10 files** · **next build 11 routes**.
Phase 5 adds `/survey` (→ **12 routes**) and ≥2 new test files (vitest count rises — record
the new number in the phase note).

## Out of scope (flagged)

- Survey **builder** / per-event question customization — explicitly deferred.
- Survey **email** (queue + send) — Phase 7 (real) / Phase 9 (T+10min cron).
- A **roster → survey link** — roadmap keeps Phase 5 navigation manual.

## Vault edits owed (after phase-completion checks)

1. `10 — Architecture/Data Model.md` §`survey_responses` — replace 3-rating schema.
2. `20 — Roadmap/Phase 5 — Survey flow.md` — new note (mirrors this design).
3. `02 — Decisions Log.md` — route deviation + schema-change decision.
4. Phase 6 analytics plan — categorical distributions instead of avg ratings.
