# Phase 5 — Survey Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> Design doc: `docs/plans/2026-05-30-phase-5-survey-design.md` (read it first).

**Goal:** An attendee with `status='attended'` opens `/survey?code=WK-XXXX`, answers a fixed 5-question template, and submits — producing one `public.survey_responses` row. Re-opening shows "already submitted." No email in Phase 5.

**Architecture:** Structural twin of `/checkin/confirm`. Code is the bearer token; the page loads the registration via `supabaseAdmin` (anon can't read PII), runs a state machine, and renders the form when eligible. `submitSurvey` Server Action writes via `supabaseAdmin` (anon has no insert policy). Idempotency is the `registration_id unique` constraint. Questions live as data in `lib/surveyTemplate.ts` (single source for render + Zod), so the future survey builder moves them from a code constant to a DB table with minimal churn.

**Tech Stack:** Next.js 16 App Router, Server Actions, Tailwind v4 (M3 indigo tokens), Supabase (service-role admin client), Zod 4, Vitest.

**Conventions to honor (from existing code):**
- Tests target the **pure Zod schema** (see `app/(public)/events/[id]/actions.test.ts`). Do **not** add a Supabase-mocking harness — the repo has none. Actions are verified by the backtest.
- No generated DB types file exists; pages cast query results locally (see `confirm/page.tsx` `RegRow`). Do the same.
- RLS helper functions are `app_private.current_staff_id()` / `app_private.is_manager()` (post `fix_security_lints`). Use the **qualified** names.
- Migrations are **applied to remote via the Supabase MCP `apply_migration`** (CLI `db push` is blocked by pre-existing drift — keep the new migration a matched local+remote pair).

---

### Task 1: Survey template module (the standard template as data)

**Files:**
- Create: `lib/surveyTemplate.ts`

**Step 1: Write the module**

```ts
// lib/surveyTemplate.ts
//
// Single source of truth for the Phase-5 standard survey template. Display
// labels live here; the DB stores stable slugs (never display text). When the
// survey builder lands (future phase) these definitions move from this constant
// to a DB table — the render + validation code reads the same shape either way.

export const SESSION_FORMAT_VALUES = [
  'scientific_presentations', 'clinical_panels', 'interactive_qa', 'peer_networking',
] as const;
export const VALUE_PROPOSITION_VALUES = [
  'clinical_application', 'faculty_caliber', 'peer_collaboration',
] as const;
export const EXPECTATIONS_VALUES = [
  'exceeded', 'met', 'partially', 'not_met',
] as const;
export const FUTURE_PREFERENCE_VALUES = [
  'expanded_qa', 'increased_clinical_depth', 'structured_networking', 'subspecialty_topics',
] as const;

export type SessionFormat = (typeof SESSION_FORMAT_VALUES)[number];
export type ValueProposition = (typeof VALUE_PROPOSITION_VALUES)[number];
export type Expectation = (typeof EXPECTATIONS_VALUES)[number];
export type FuturePreference = (typeof FUTURE_PREFERENCE_VALUES)[number];

type Option<T extends string> = { value: T; label: string };

// Ordered question definitions used to render SurveyForm. The kind drives the
// control: 'single' = radio cards, 'segmented' = 4-up bar, 'multi' = checkboxes,
// 'text' = textarea.
export const SESSION_FORMAT_OPTIONS: Option<SessionFormat>[] = [
  { value: 'scientific_presentations', label: 'Scientific Presentations' },
  { value: 'clinical_panels',          label: 'Clinical Panel Discussions' },
  { value: 'interactive_qa',           label: 'Interactive Q&A Sessions' },
  { value: 'peer_networking',          label: 'Peer Networking' },
];
export const VALUE_PROPOSITION_OPTIONS: Option<ValueProposition>[] = [
  { value: 'clinical_application', label: 'Practical insights for clinical application' },
  { value: 'faculty_caliber',      label: 'Scientific caliber of faculty' },
  { value: 'peer_collaboration',   label: 'Peer-to-peer collaboration opportunities' },
];
export const EXPECTATIONS_OPTIONS: Option<Expectation>[] = [
  { value: 'exceeded',  label: 'Exceeded' },
  { value: 'met',       label: 'Met' },
  { value: 'partially', label: 'Partially' },
  { value: 'not_met',   label: 'Not Met' },
];
export const FUTURE_PREFERENCE_OPTIONS: Option<FuturePreference>[] = [
  { value: 'expanded_qa',              label: 'Expanded Interactive Q&A' },
  { value: 'increased_clinical_depth', label: 'Increased Clinical Depth' },
  { value: 'structured_networking',    label: 'Structured Networking' },
  { value: 'subspecialty_topics',      label: 'Diverse Sub-specialty Topics' },
];

export const KEY_HIGHLIGHTS_MAX = 2000;
```

**Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: clean (no other files reference it yet).

**Step 3: Commit**

```bash
git add lib/surveyTemplate.ts
git commit -m "feat(survey): standard survey template definitions (Phase 5)"
```

---

### Task 2: Zod schema + tests (TDD)

**Files:**
- Create: `app/(public)/survey/schema.ts`
- Test: `app/(public)/survey/schema.test.ts`

**Step 1: Write the failing test**

```ts
// app/(public)/survey/schema.test.ts
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, it, expect } from 'vitest';
import { surveyInputSchema } from './schema';

describe('surveyInputSchema', () => {
  it('accepts a fully-filled valid response', () => {
    const r = surveyInputSchema.safeParse({
      session_format: 'scientific_presentations',
      key_highlights: 'Dr. Lee on biomarkers',
      value_proposition: 'clinical_application',
      expectations: 'exceeded',
      future_preferences: ['expanded_qa', 'subspecialty_topics'],
    });
    expect(r.success).toBe(true);
  });

  it('accepts a fully-empty response (all fields optional)', () => {
    const r = surveyInputSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.future_preferences).toEqual([]);
  });

  it('rejects an unknown session_format slug', () => {
    expect(surveyInputSchema.safeParse({ session_format: 'banana' }).success).toBe(false);
  });

  it('rejects an unknown expectations slug', () => {
    expect(surveyInputSchema.safeParse({ expectations: 'meh' }).success).toBe(false);
  });

  it('rejects a future_preferences slug outside the template set', () => {
    expect(surveyInputSchema.safeParse({ future_preferences: ['expanded_qa', 'nope'] }).success).toBe(false);
  });

  it('rejects key_highlights longer than 2000 chars', () => {
    expect(surveyInputSchema.safeParse({ key_highlights: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('trims key_highlights', () => {
    const r = surveyInputSchema.safeParse({ key_highlights: '  hi  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.key_highlights).toBe('hi');
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm exec vitest run app/\(public\)/survey/schema.test.ts`
Expected: FAIL — cannot resolve `./schema`.

**Step 3: Write the schema**

```ts
// app/(public)/survey/schema.ts
import { z } from 'zod';
import {
  SESSION_FORMAT_VALUES,
  VALUE_PROPOSITION_VALUES,
  EXPECTATIONS_VALUES,
  FUTURE_PREFERENCE_VALUES,
  KEY_HIGHLIGHTS_MAX,
} from '@/lib/surveyTemplate';

// All fields optional (user decision: all questions optional, empty submit allowed).
export const surveyInputSchema = z.object({
  session_format:     z.enum(SESSION_FORMAT_VALUES).optional(),
  key_highlights:     z.string().trim().max(KEY_HIGHLIGHTS_MAX, 'Too long').optional(),
  value_proposition:  z.enum(VALUE_PROPOSITION_VALUES).optional(),
  expectations:       z.enum(EXPECTATIONS_VALUES).optional(),
  future_preferences: z.array(z.enum(FUTURE_PREFERENCE_VALUES)).default([]),
});

export type SurveyInput = z.infer<typeof surveyInputSchema>;

// Returned by the Server Action. Never throws on user-recoverable errors.
export type SubmitSurveyResult = { ok: true } | { error: string };
```

**Step 4: Run to verify it passes**

Run: `pnpm exec vitest run app/\(public\)/survey/schema.test.ts`
Expected: PASS (7 tests).

**Step 5: Commit**

```bash
git add "app/(public)/survey/schema.ts" "app/(public)/survey/schema.test.ts"
git commit -m "feat(survey): zod input schema + tests (Phase 5)"
```

---

### Task 3: Migration — survey_responses table + RLS (apply to remote)

**Files:**
- Create: `supabase/migrations/<TIMESTAMP>_init_survey_responses.sql` (use `date +%Y%m%d%H%M%S`)

**Step 1: Write the migration**

```sql
-- Phase 5: survey responses. One per registration. Anon submits via the
-- service-role admin client (no anon RLS policy); code is the bearer token.
-- Columns store stable slugs from lib/surveyTemplate.ts; CHECK constraints pin
-- them (layer-3 validation). The future survey builder owns relaxing these.
create table public.survey_responses (
  id                 uuid primary key default gen_random_uuid(),
  registration_id    uuid not null unique references public.registrations(id) on delete cascade,
  event_id           uuid not null references public.events(id) on delete cascade,
  session_format     text,
  key_highlights     text,
  value_proposition  text,
  expectations       text,
  future_preferences text[] not null default '{}',
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

create index survey_responses_event_idx on public.survey_responses(event_id);

alter table public.survey_responses enable row level security;

-- No anon/public policies → public denied (RLS default-deny). Writes go through
-- supabaseAdmin (service role bypasses RLS).

-- ORGANIZER SELECT on their own event's survey responses.
create policy "survey_organizer_select_own"
  on public.survey_responses
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = survey_responses.event_id and e.created_by = app_private.current_staff_id()
  ));

-- MANAGER SELECT all.
create policy "survey_manager_select_all"
  on public.survey_responses
  for select to authenticated
  using (app_private.is_manager());
```

**Step 2: Apply to remote via MCP**

Use `apply_migration` (Supabase MCP) with name `init_survey_responses` and the SQL body.
**Important:** if the MCP records a different timestamp on remote than the local filename, rename the local file to match (as `e0b01d2` did last session) so drift doesn't widen.

**Step 3: Verify**

- `list_tables` (or `execute_sql`: `select column_name, data_type from information_schema.columns where table_name='survey_responses' order by ordinal_position`) → 9 columns present.
- `get_advisors` (type `security`) → no NEW advisor fired (the CHECK/RLS table introduces none; confirm `function_search_path_mutable` count is unchanged).

**Step 4: Commit**

```bash
git add supabase/migrations/*_init_survey_responses.sql
git commit -m "feat(survey): survey_responses table + RLS, applied to remote (Phase 5)"
```

---

### Task 4: The page (state machine, mirrors /checkin/confirm)

**Files:**
- Create: `app/(public)/survey/page.tsx`

**Step 1: Write the page**

Mirror `app/(public)/checkin/confirm/page.tsx` structure (PublicShell + PageWrap + EmptyState helpers — copy those small helpers locally; do not extract/refactor the confirm page, per Rule 3). Logic:

```tsx
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTz } from '@/lib/tz';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { PublicShell } from '@/components/shell/PublicShell';
import SurveyForm from './SurveyForm';

export const dynamic = 'force-dynamic';

export default async function SurveyPage({
  searchParams,
}: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;

  if (!code) return /* EmptyState "No survey code" */;
  if (!isValidRegistrationCode(code)) return /* EmptyState "Code not recognised" */;

  const admin = supabaseAdmin();
  // Local cast — same pattern as confirm/page.tsx RegRow.
  type RegRow = {
    id: string;
    full_name: string;
    status: string;
    events: { id: string; title: string; status: string } |
            Array<{ id: string; title: string; status: string }> | null;
  };
  const { data: reg } = (await admin
    .from('registrations')
    .select('id, full_name, status, events!inner(id, title, status)')
    .eq('registration_code', code)
    .maybeSingle()) as { data: RegRow | null };

  if (!reg || !reg.events) return /* EmptyState "Code not recognised" */;
  const event = Array.isArray(reg.events) ? reg.events[0] : reg.events;
  if (!event || event.status !== 'published') return /* EmptyState "Code not recognised" */;

  if (reg.status !== 'attended') {
    return /* EmptyState icon="hourglass_empty" title="Survey not available yet"
              body="The survey opens once you've been checked in at the event. See the
                    organiser if you've already attended." */;
  }

  // Already submitted? (idempotent UX — DB unique is the real guard.)
  const { data: existing } = await admin
    .from('survey_responses')
    .select('id')
    .eq('registration_id', reg.id)
    .maybeSingle();
  if (existing) {
    return /* EmptyState icon="check_circle" title="Thanks — already submitted"
              body="We've recorded your feedback for {event.title}." */;
  }

  return (
    <PublicShell>
      <SurveyForm code={code} fullName={reg.full_name} eventTitle={event.title} />
    </PublicShell>
  );
}
```

Use the same `EmptyState` / `PageWrap` helper components and M3 token classes as `confirm/page.tsx`. (`formatInTz` import is only needed if you show event time — optional; keep imports used.)

**Step 2: Verify build**

Run: `pnpm exec tsc --noEmit && pnpm exec next build`
Expected: tsc clean; build lists route `/survey` → **12 routes**. (SurveyForm doesn't exist yet → create a placeholder default export first, or do Task 5 before building.)

**Step 3: Commit** (after Task 5 so the build is green)

---

### Task 5: SurveyForm client component (exact mockup layout)

**Files:**
- Create: `app/(public)/survey/SurveyForm.tsx`

**Step 1: Write the component**

`'use client'`. State holds the answers; `useTransition` + `submitSurvey` (Task 6) on submit; on `{ ok }` render a success panel (mirror `ConfirmButton`'s ok-state styling), on `{ error }` render a `role="alert"` error.

Reproduce the mockup's exact layout, copy, and design on M3 tokens:
- Card container (`bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm`), `max-w-2xl mx-auto`.
- Numbered uppercase section labels (`01. SESSION FORMAT` …) in `font-label-md ... uppercase tracking-wider text-on-surface-variant`, bold question line below.
- **Q1 / Q3 (single):** 2-col (Q1) / stacked (Q3) radio "cards" — pill-bordered rows with a leading radio dot; selected = green-tinted border+bg as in the mockup (`border-primary bg-primary-container/15` or the closest token). Map over `SESSION_FORMAT_OPTIONS` / `VALUE_PROPOSITION_OPTIONS`.
- **Q2 (text):** `<textarea>` with the placeholder "Enter session name or specific clinical takeaway…", `maxLength={KEY_HIGHLIGHTS_MAX}`.
- **Q4 (segmented):** single bordered bar split into 4 equal cells (Exceeded / Met / Partially / Not Met); selected cell tinted. Map over `EXPECTATIONS_OPTIONS`.
- **Q5 (multi):** 2-col checkbox cards over `FUTURE_PREFERENCE_OPTIONS`; toggles membership in a `future_preferences` array.
- Footer row: italic "Approximate completion time: 2 minutes" (left) + filled **Submit** button (right, `bg-primary text-on-primary rounded-full`).

A11y: each control group wrapped in `<fieldset>` + `<legend>` (legend = the question prompt); radios share a `name`; checkboxes are real `<input type="checkbox">`; the segmented control is a radio group too. All optional → no `required`.

Props: `{ code: string; fullName: string; eventTitle: string }`. Build the `SurveyInput` object from state and pass to `submitSurvey(code, answers)`.

**Step 2: Verify**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec next build`
Expected: clean; `/survey` route builds (12 routes total).

**Step 3: Commit**

```bash
git add "app/(public)/survey/page.tsx" "app/(public)/survey/SurveyForm.tsx"
git commit -m "feat(survey): survey page state machine + form UI (Phase 5)"
```

---

### Task 6: submitSurvey Server Action

**Files:**
- Create: `app/(public)/survey/actions.ts`

**Step 1: Write the action**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { surveyInputSchema, type SubmitSurveyResult } from './schema';

/**
 * Public survey submission via /survey?code=WK-XXXX. No auth — the code IS the
 * bearer token. Admin client because anon has no insert policy on
 * survey_responses. Server re-validates eligibility (event published + attended)
 * — never trusts the page render. One survey per registration is enforced by the
 * registration_id UNIQUE constraint; a unique-violation maps to a friendly
 * "already submitted" (fail-visible, idempotent).
 */
export async function submitSurvey(
  code: string,
  rawAnswers: unknown,
): Promise<SubmitSurveyResult> {
  if (!isValidRegistrationCode(code)) return { error: 'Invalid code format.' };

  const parsed = surveyInputSchema.safeParse(rawAnswers);
  if (!parsed.success) return { error: 'Some answers were invalid. Please review and resubmit.' };
  const answers = parsed.data;

  const admin = supabaseAdmin();

  // Re-check eligibility server-side.
  type RegRow = {
    id: string;
    status: string;
    events: { id: string; status: string } | Array<{ id: string; status: string }> | null;
  };
  const { data: reg, error: lookupErr } = (await admin
    .from('registrations')
    .select('id, status, events!inner(id, status)')
    .eq('registration_code', code)
    .maybeSingle()) as { data: RegRow | null; error: unknown };
  if (lookupErr) throw lookupErr;
  if (!reg || !reg.events) return { error: 'This code is not recognised.' };
  const event = Array.isArray(reg.events) ? reg.events[0] : reg.events;
  if (!event || event.status !== 'published') return { error: 'This code is not recognised.' };
  if (reg.status !== 'attended') return { error: 'The survey opens once you have been checked in.' };

  const { error: insertErr } = await admin.from('survey_responses').insert({
    registration_id: reg.id,
    event_id: event.id,
    session_format: answers.session_format ?? null,
    key_highlights: answers.key_highlights ?? null,
    value_proposition: answers.value_proposition ?? null,
    expectations: answers.expectations ?? null,
    future_preferences: answers.future_preferences,
  });

  if (insertErr) {
    // 23505 = unique_violation on registration_id → already submitted.
    if ((insertErr as { code?: string }).code === '23505') {
      return { error: "You've already submitted this survey." };
    }
    throw insertErr;
  }

  revalidatePath('/survey');
  return { ok: true };
}
```

**Step 2: Verify**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint .`
Expected: clean. (Confirm `SurveyForm` now imports `submitSurvey`.)

**Step 3: Commit**

```bash
git add "app/(public)/survey/actions.ts"
git commit -m "feat(survey): submitSurvey server action (Phase 5)"
```

---

### Task 7: Full static gates

**Step 1: Run all four gates**

Run:
```bash
pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build
```
Expected:
- tsc: clean
- eslint: clean
- vitest: **90/90 across 11 files** (was 83/83 across 10; +7 from `schema.test.ts`)
- next build: **12 routes** (adds `/survey`)

Record the new vitest count + route count in the phase note (Task 9).

**Step 2: Commit** any incidental fixes.

---

### Task 8: Phase-completion protocol (MANDATORY — see ~/.claude/CLAUDE.md)

Do **not** write the handoff/vault notes until all three pass.

1. **Dev-perspective review** — dispatch a code-reviewer agent on the diff: correctness, RLS correctness (anon truly can't read/write survey_responses; organizer/manager scoping right), the qualified `app_private.*` refs, idempotency path, no PII in logs, Rule-8 three layers intact.
2. **User-perspective review** — dispatch a SEPARATE agent: cold-start journey to `/survey?code=` for each state (no code, bad code, not-attended, eligible, already-submitted), read every empty-state message, confirm the form matches the mockup and the success/error feedback is honest.
3. **Backtest** — against real DB: seed/locate an `attended` registration, exercise `submitSurvey` (or the live form on `:3000`), then `execute_sql` to read the `survey_responses` row back and assert the slugs persisted + CHECK constraints accept valid / reject invalid slugs. Then assert anon is denied SELECT (RLS). Clean up any test row (or use a rollback txn).

Fix whatever they find; re-run the affected gate.

---

### Task 9: Summary docs (AFTER Task 8 passes)

- **Vault edits owed** (source of truth):
  1. `10 — Architecture/Data Model.md` §`survey_responses` — replace the 3-rating schema with the slug-column schema.
  2. `20 — Roadmap/Phase 5 — Survey flow.md` — new note mirroring the design.
  3. `02 — Decisions Log.md` — entry: route deviation (`/survey?code=` vs roadmap's `/survey/:id`), and the schema change (mockup supersedes 3-rating spec).
  4. Phase 6 analytics plan — categorical distributions instead of avg ratings.
- **Handoff:** `docs/plans/handoff_DDMMYYYY.md` — what shipped, new running invariants (12 routes, 90 tests), open items carried forward (migration drift, Phase-8 gates).
- Update `CLAUDE.md` static-gate invariant numbers if it pins them.

---

## Sequencing note

Tasks 1→2 are pure TDD. Task 3 (migration) is independent and can run anytime before Task 6's backtest. Tasks 4–6 depend on 1–3. Task 4's `next build` needs Task 5's `SurveyForm` to exist — do 4 and 5 together, build once. Then 6, then the full gate (7), then the protocol (8), then docs (9).
