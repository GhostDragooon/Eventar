# Phase 7 — Resend integration (design)

_Date: 2026-06-04_
_Status: design approved (brainstorm 2026-06-04). Implementation plan: see follow-up `2026-06-04-phase-7-resend.md` produced by `writing-plans` skill._
_Roadmap reference: [[20 — Roadmap/Phased Roadmap]] Phase 7 — "Add Resend"._

---

## Context

Phase 1–6.5 + R1 security batch + M1 migration reconcile shipped. All 4 Phase-8 deploy gates closed. Phase 7 brings the first real outbound email — replacing the `console.log` stub at `app/(public)/events/[id]/actions.ts::registerForEvent` step 6 with a real `resend.emails.send` call wrapped in a production-grade facade.

Email scope is strictly **Email #1 only** (registration confirmation, sent inline on the registration request). Email #2 (60-min reminder with personal QR) and Email #3 (10-min survey invite) wait for Phase 9 (pg_cron) — both need a scheduled trigger that Phase 7 deliberately doesn't introduce.

## User direction recorded during brainstorm

> "Setup the infra 1st, we'll deal with the Resend credentials later. Focus on the infra and flow."
>
> "Don't worry about the transient thing, testing and all that. But make sure the infra can fit in retrospectively with minimal friction. I don't want to spend days just to rectify the config when the API and things are ready. Be sure those infra is well structured and in place, ready for plug-and-play. And build the temp in parallel for testing purposes only, and ready to be removed without any fuzz."

Key implications:
1. Production code (`lib/resend.ts`, `emails/confirmation.tsx`, the `registerForEvent` integration) is the **primary architecture** — it's what survives long-term.
2. A **separate, parallel temp layer** (`lib/devEmailStub.ts`) makes dev testing possible without credentials, but exists only as a removable plugin.
3. **Removal cost** is the design metric: removing the temp must be a contained 3-minute operation (delete one file + 3 lines), not a grep hunt.
4. Drop the queued-row sweeper / Phase 9 reconciliation framing — those rows are throwaway dev data the user explicitly doesn't want to clean up.

---

## Scope

### In scope
- `lib/resend.ts` — production Resend SDK client + `sendEmail()` facade.
- `lib/devEmailStub.ts` — testing-only stub, deletable.
- `emails/confirmation.tsx` — React Email template for Email #1.
- `registerForEvent` integration — replace step 6+7 stub with the facade call + branching email_log update.
- New env vars: `RESEND_API_KEY` (required when temp removed), `RESEND_FROM_EMAIL` (optional, defaults to `'Eventar <onboarding@resend.dev>'`).
- New tests covering the facade, the stub, the template, and the integration (~+9 tests).
- Updates to `.env.example` documenting both new env vars.
- `PROJECT_STATE.md` rotation (Phase 7 → JUST SHIPPED; Phase 8 → ACTIVE).

### Out of scope (deferred)
- Email #2 reminder (Phase 9 — needs pg_cron scheduler).
- Email #3 survey invite (Phase 9 — same).
- Queued-row sweep / backfill (per user direction; would be a one-shot script if ever needed).
- Retry-with-backoff inside `sendEmail` (Phase 9 cron handles retries by design).
- React Email preview server (`@react-email/preview-server`) — defer until template iteration intensifies.
- Custom domain verification on Resend (operational, not code).
- HTML rendering smoke across email clients (manual step post-credentials).
- CI smoke against Resend sandbox.
- Sentry / structured error tracking (deferred per O1 in earlier consolidated punch list).

---

## Removal protocol — read this first

**This is what makes the temp layer "plug-and-play."** When `RESEND_API_KEY` lands in `.env.local`, you remove the temp layer in 3 minutes:

```
1. Add RESEND_API_KEY (and RESEND_FROM_EMAIL if custom) to .env.local

2. rm lib/devEmailStub.ts
   rm lib/devEmailStub.test.ts

3. In app/(public)/events/[id]/actions.ts:
   - delete the `sendEmailStub` import line
   - delete the conditional line `const sendEmail = process.env.RESEND_API_KEY ? ...`
   - replace with: `const { sendEmail } = await import('@/lib/resend');`
     OR  hoist to a static import at the top of the file
   - delete the `else if ('skipped' in result)` branch  (TypeScript will flag the dead code)

4. Update app/(public)/events/[id]/actions.test.ts:
   - drop the "uses stub" test case
   - keep the "real returns ok" and "real returns error" cases

5. pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run
```

If you find yourself doing more than the above, the design failed and we should revisit.

---

## Design

### A. Architecture

#### Files (3 new + 1 edit + env-example)

```
lib/
├─ resend.ts                                    NEW    production Resend SDK client
├─ resend.test.ts                               NEW    facade unit tests
├─ devEmailStub.ts                              NEW    ⚠️ DELETE WHEN CREDENTIALS LAND
└─ devEmailStub.test.ts                         NEW    ⚠️ DELETE WITH ABOVE

emails/
├─ confirmation.tsx                             NEW    React Email template
└─ confirmation.test.tsx                        NEW    template render tests

app/(public)/events/[id]/
├─ actions.ts                                   EDIT   registerForEvent step 6+7 swap
└─ actions.test.ts                              EDIT   +3 new test cases

.env.example                                    EDIT   RESEND_API_KEY + RESEND_FROM_EMAIL
```

#### `lib/resend.ts` — production facade (the eventual-only file)

Single exported async function with a typed result:

```ts
export type SendEmailResult =
  | { ok: true; id: string }
  | { error: { code: string; message: string } };

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult>;
```

Implementation:
- `import 'server-only'` at top.
- Reads `RESEND_API_KEY` lazily on each call. **Throws** with a clear message if unset — this is a production misconfig and must surface, not silently degrade.
- Reads `RESEND_FROM_EMAIL` with default `'Eventar <onboarding@resend.dev>'`.
- Instantiates the Resend client per call (cheap; Resend's client is just a config object holding the API key).
- Maps Resend SDK responses: success → `{ ok, id }`; rejection → `{ error: { code, message } }` where `code` is the Resend error code (e.g. `rate_limit_exceeded`, `validation_error`) and `message` is the human-readable form. **No PII in either field** (Rule 10) — recipient email is the only PII we send to Resend and we never include it in the returned error.

No retry, no backoff, no caching. Phase 9 cron is the retry mechanism for #2/#3; #1 confirmations are fire-and-forget per registration.

#### `lib/devEmailStub.ts` — temp layer (the deletable file)

```ts
// ⚠️ DEV STUB — testing/dev convenience only.
//
// REMOVE THIS FILE once RESEND_API_KEY is set in .env.local:
//   See docs/plans/2026-06-04-phase-7-resend-design.md §"Removal protocol"
//
// No grep hunt required. The removal is a localized operation.

import type { SendEmailResult } from './resend';

export type StubSendEmailResult = SendEmailResult | { skipped: true };

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<StubSendEmailResult> { /* ... */ }
```

Implementation:
- `import 'server-only'` at top.
- Logs the deferred send to console: `'[email stub] would send confirmation to <UUID-of-recipient>'`. **UUIDs only** (Rule 10) — never the actual recipient address. The `to` parameter is received but not logged.
- Returns `{ skipped: true }` always.

#### Integration in `registerForEvent`

The env switch is the **single point of temp/real selection**:

```ts
// TEMP: dual import while credentials are being set up.
// REMOVE both this import block and the conditional below
// once RESEND_API_KEY is in .env.local. See docs/plans/2026-06-04-phase-7-resend-design.md.
import { sendEmail as sendEmailReal } from '@/lib/resend';
import { sendEmail as sendEmailStub } from '@/lib/devEmailStub';

// ...inside registerForEvent, after step 5 (registration row inserted):

// Step 6 — render template + dispatch
const sendEmail = process.env.RESEND_API_KEY ? sendEmailReal : sendEmailStub;
const origin = await getRequestOrigin();
const html = renderConfirmationEmail({
  recipientName: full_name,
  eventTitle: event.title,
  eventStart: formatInTz(event.start_time, event.timezone),
  eventVenue: assembleVenue(event),
  eventUrl: `${origin}/events/${event.id}`,
  registrationCode: candidate, // the WK-XXXXXX that succeeded the unique-collision retry
});
const result = await sendEmail({
  to: email,
  subject: `You're registered: ${event.title}`,
  html,
});

// Step 7 — close the ledger per outcome; registration_id always set
const update: Record<string, unknown> = { registration_id: reg.id };
if ('ok' in result) {
  update.status = 'sent';
  update.sent_at = new Date().toISOString();
} else if ('skipped' in result) {
  // TEMP: this branch goes away when the stub is removed.
  // Status stays 'queued' (set at step 4) — no Phase 9 sweep planned per user direction.
  console.log(`[email queued] confirmation for event ${event.id} registration ${reg.id} — RESEND_API_KEY unset`);
} else {
  update.status = 'failed';
  update.error = `${result.error.code}: ${result.error.message}`;
}
await admin
  .from('email_log')
  .update(update)
  .eq('id', log.id);
```

**Why the env check is INSIDE the function, not at module top-level:** the value is captured per call rather than at import time, which makes per-test env manipulation work without `vi.resetModules()` gymnastics. Costs one extra ternary evaluation per registration — negligible.

#### Env vars

Both lazy-read in the production facade. Documented in `.env.example`:

```
# Resend transactional email (Phase 7+). Required for sending Email #1; in
# dev without it the registerForEvent action falls back to lib/devEmailStub.ts.
RESEND_API_KEY=re_…

# Sender identity. Defaults to "Eventar <onboarding@resend.dev>" sandbox.
# Override once a custom domain is verified on Resend.
RESEND_FROM_EMAIL='Eventar <noreply@your-domain.example>'
```

### B. Render pipeline + data flow

#### End-to-end inside `registerForEvent` step 6

```
event row + registrations row in hand
       │
       ▼
1. assemble template props from request-context helpers
   ├─ recipientName     = reg.full_name
   ├─ eventTitle        = event.title
   ├─ eventStart        = formatInTz(event.start_time, event.timezone)
   ├─ eventVenue        = assembleVenue(event)
   ├─ eventUrl          = `${getRequestOrigin()}/events/${event.id}`
   └─ registrationCode  = candidate (the WK-XXXXXX assigned at step 5)
       │
       ▼
2. render template (sync; throws on JSX bug)
   const html = renderConfirmationEmail(props)
       │
       ▼
3. build envelope
   const subject = `You're registered: ${event.title}`
       │
       ▼
4. dispatch via facade
   const result = await sendEmail({ to, subject, html })
       │
       ▼
5. update email_log per result (see §A integration code above)
```

#### `emails/confirmation.tsx` — template shape

Pure presentation. Receives pre-formatted props (no `lib/tz.ts` or `lib/origin.ts` imports in `emails/*`). Renders synchronously via `@react-email/render`.

Layout regions (top to bottom):

1. **Brand header** — `<Container>` + `<Heading>` "Eventar" in primary indigo `#4F46E5`-aligned hex.
2. **Greeting** — `<Text>` "Hi {recipientName},"
3. **Body intro** — `<Text>` thanks-for-registering line.
4. **Event details card** — `<Section>` with rows for "When" (eventStart) and "Where" (eventVenue), small left-icon glyphs (text-only — no images yet).
5. **Registration code block** — `<Section>` highlighting the WK-XXXXXX in a monospace `<Text>` with `letterSpacing` and a brand-tinted background. Label: "Your registration code · keep this for the door."
6. **CTA button** — `<Button>` "View event details" → `eventUrl`.
7. **Reminder note** — small `<Text>` "We'll send your personal QR code shortly before the event." (Sets expectation for Email #2 without committing Phase 7 to deliver it.)
8. **Footer** — `<Hr>` + small `<Text>` "— Eventar".

All styling inline via React Email component props. No external CSS, no Tailwind classes (won't survive email client rendering).

#### Props contract

```ts
export type ConfirmationEmailProps = {
  recipientName: string;
  eventTitle: string;
  eventStart: string;          // pre-formatted including TZ
  eventVenue: string;          // pre-assembled "Venue, Address"
  eventUrl: string;            // absolute URL
  registrationCode: string;
};
```

Why pre-formatted at the call site: the template stays a pure presentation layer with no request-context dependencies, making it trivially unit-testable and (in a hypothetical Phase 9 backlog sweep) usable from non-request contexts.

#### Helper: `assembleVenue(event)`

Small inline helper in `actions.ts` (no new file). Returns:
- `event.venue_name + ', ' + event.venue_address` if both present
- just `event.venue_name` otherwise

### C. Error handling + testing

#### Failure matrix

| Failure mode | Source | Registration outcome | `email_log` outcome | User-visible |
|---|---|---|---|---|
| `RESEND_API_KEY` unset (dev temp state) | `devEmailStub.sendEmail` → `{ skipped }` | ✅ success | stays `queued` | Form success |
| `RESEND_API_KEY` unset in production (misconfig) | `lib/resend.ts::sendEmail` throws | ❌ throws → registration fails | `queued` orphan | Generic "Registration failed" |
| Resend timeout / 5xx | SDK rejects | ✅ success | `failed` + code+message | Form success |
| Resend 429 rate-limit | same | ✅ success | `failed` + `rate_limit_exceeded` | Form success |
| Invalid recipient (Resend rejects) | same | ✅ success | `failed` + `validation_error` | Form success |
| `RESEND_FROM_EMAIL` unset | default to sandbox value | ✅ success | normal | normal |
| Template render throws (JSX bug) | `renderConfirmationEmail` | ❌ propagates | `queued` orphan | Generic fail |

**Design principles enforced:**
1. **Registration succeeds whenever the registration row inserted** (CLAUDE.md hard rule 2). Email failures update the ledger, not the registrant's outcome.
2. **Production misconfig must surface** (CLAUDE.md rule 12). Missing `RESEND_API_KEY` throws in production rather than silently queuing — silent prod stub behavior would be a worse bug than a visible failure.
3. **No PII in logs or in `email_log.error`** (Rule 10). Recipient email is sent to Resend (necessarily) but never logged or stored in the error column.

#### Tests

```
lib/resend.test.ts                            (NEW, 3 tests)
├─ throws when RESEND_API_KEY missing
├─ returns { ok, id } on resend SDK success    (vi.mock the SDK)
└─ returns { error: { code, message } } on SDK rejection

lib/devEmailStub.test.ts                      (NEW, 1 test)
└─ returns { skipped: true } without consuming recipient PII (log assertion: only UUIDs)

emails/confirmation.test.tsx                  (NEW, 2 tests)
├─ rendered HTML contains registrationCode, eventTitle, eventUrl
└─ rendered HTML contains no "undefined"/"null" literals from missing optional props

app/(public)/events/[id]/actions.test.ts      (EXTEND, +3 cases)
├─ RESEND_API_KEY unset → stub path → registration succeeds, email_log stays 'queued'
├─ RESEND_API_KEY set, resend mock returns ok → email_log → 'sent' with sent_at
└─ RESEND_API_KEY set, resend mock returns error → email_log → 'failed' with code+message
```

#### Mocking strategy

- `lib/resend.test.ts`: `vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send: vi.fn() } })) }))`. Per-test override the inner `send` mock.
- `lib/devEmailStub.test.ts`: no mocks needed — stub is dependency-free.
- `emails/confirmation.test.tsx`: render the template via `@react-email/render`, assert substring presence on the resulting HTML string.
- `actions.test.ts` extensions: `vi.mock('@/lib/resend', ...)` and `vi.mock('@/lib/devEmailStub', ...)`; manipulate `process.env.RESEND_API_KEY` per test via `beforeEach`/`afterEach`.

**No network calls in vitest.** Snapshot-style email-client rendering fidelity (Gmail, Outlook, Apple Mail) is a manual smoke step, performed once after credentials land.

#### Test count

- Before: 169
- After: ~178 (+9)

When the temp is removed:
- `lib/devEmailStub.test.ts` deleted → -1
- `actions.test.ts` "uses stub" case dropped → -1
- Net post-removal: ~176 tests

### D. Code quality conventions to follow

Mirroring project conventions established in earlier phases:

1. `'use server'` on `actions.ts` files only; `'server-only'` import at the top of `lib/resend.ts`, `lib/devEmailStub.ts`, and any non-action server module.
2. Q18A pattern: every RLS-gated `UPDATE` chains `.select('id').maybeSingle()` + null-check. (The `email_log` update is NOT RLS-gated — service-role bypasses RLS — so Q18A doesn't directly apply; but Q18B's `revalidatePath` doesn't apply either because the email send doesn't change UI state.)
3. CLAUDE.md hard rule 2: `email_log` row inserted FIRST (already at step 4), send SECOND (step 6). The Phase 7 changes only affect step 6 and step 7's update — the FIRST/SECOND ordering is preserved.
4. CLAUDE.md rule 10: UUIDs only in any new `console.log` / `console.error`. The stub's log uses recipient UUID via the email_log id, not the recipient email. The error column stores `code + message`, no PII.

---

## Open follow-ups (decisions deferred, not blocking implementation)

### Sender display + `from` address
Default to `'Eventar <onboarding@resend.dev>'` for now. When a custom domain is verified, edit `.env.local` → `RESEND_FROM_EMAIL='Eventar <noreply@your-domain.example>'`. No code change. Documented in `.env.example`.

### Template visual copy
I'll write minimal indigo-themed copy following the M3 palette established in Phase 4.6. You can iterate freely on `emails/confirmation.tsx` — the props contract isolates layout changes from the integration. The first-pass copy is a placeholder, not a brand decision.

### Reminder note expectation-setting
The template ends with "We'll send your personal QR code shortly before the event." This commits Phase 7 to nothing (Phase 9's domain) but sets attendee expectation that another email arrives. Worth reviewing post-Phase-9 to ensure consistency.

---

## Phase 8 implications

When the temp layer is removed and Phase 8 deploys to Vercel:

1. **`RESEND_API_KEY`** must be set in Vercel env (Project Settings → Environment Variables).
2. **`RESEND_FROM_EMAIL`** must be set in Vercel env if using a custom domain (otherwise sandbox).
3. **Domain verification on Resend** is operational, not code. Should happen before first prod registration with the real send path active.
4. The "production misconfig throws" behavior means a missing key on Vercel will cause registration failures with a clear error in logs. Better than silent queueing in prod.

---

## References

- Roadmap: [[20 — Roadmap/Phased Roadmap]] Phase 7
- Earlier decisions: [[02 — Decisions Log#Q3]] (Resend chosen over Postmark), [[02 — Decisions Log#Q6]].6 (React Email templates)
- Active discipline: CLAUDE.md hard rules 2, 4, 9, 10, 11, 12; Q18A/B patterns
- Current PROJECT_STATE: `docs/plans/PROJECT_STATE.md` (Phase 7 marked ACTIVE post-commits)
- Brainstorm session: this conversation, 2026-06-04 (3 questions answered: Resend state, no-key behavior = queued, approach 1 = minimal infra)

---

## Implementation plan

Produced by the `writing-plans` skill in a follow-up step. Filename convention: `docs/plans/2026-06-04-phase-7-resend.md` (no `-design` suffix).
