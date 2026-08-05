# Frontend review — 2026-08-05

_Unattended scheduled run, ~03:25–07:30. Landed as 8 commits on `main`, **not pushed**._

> **Read this first:** the headline is not the eight fixes. It is that **six of them are one defect
> repeated** — a Supabase query whose `error` was destructured away, so a failed read rendered as
> real emptiness or a real zero. That is CLAUDE.md rule 12, and the repo's own history says it has
> now surfaced three times. §6 proposes making it un-writable rather than fixing it a fourth time.
>
> One of the six is not cosmetic: on `/events/[id]/edit` a failed agenda read rendered an empty
> form, and the next **Save wrote that emptiness over the real agenda**. Silent data loss from a
> transient read error.

---

## 1. Coverage

Every route in scope was reached **in a real browser against the local stack**, signed in as
`demo-staff@local.test` via the Mailpit magic link, on seeded data. Nothing in this report is
source-inferred unless it says so.

| Route | Reached | Notes |
|---|---|---|
| `/` | ✅ | Marketing hero, audience toggle, "how it works" |
| `/login` | ✅ | Magic-link request + the expired/used-link refusal |
| `/dashboard` | ✅ | Lifecycle tabs, counts cross-checked vs DB |
| `/events` (public) | ✅ | |
| `/events/[id]` (public) | ✅ | Registered a real attendee end to end |
| `/events/[id]/edit` | ✅ | Published the event through the real UI |
| `/events/[id]/details` | ✅ | |
| `/events/[id]/checkin` (roster) | ✅ | Counts cross-checked vs DB |
| `/events/[id]/analytics` | ✅ | Figures cross-checked vs DB |
| `/events/[id]/poster` | ✅ | |
| `/events/new` | ✅ | |
| `/analytics` | ✅ | |
| `/settings` | ✅ | |
| `/checkin` (door picker) | ✅ | |
| `/checkin/confirm` | ✅ | **All six refusal states, each forced for real** |
| `/survey` | ✅ | Submitted a real response; verified the row |

**Closed the whole loop against real systems**, not just page loads: registered → published →
self-serve check-in → `registrations.status='attended'` → **a real `credit_ledger` row
(`credit_earned`, 3 hrs)** → survey submitted → the numbers appearing on `/analytics`.

**Refusal states, each forced by mutating real state rather than trusting the code path:**

| State | How forced | What the attendee sees |
|---|---|---|
| Too early | 180-min seed offset | "Check-in opens at 10:51 on Wed 5 Aug — an hour before the event starts." |
| After the event | window elapsed naturally mid-session | "Check-in for this event has closed. Please see a member of staff." |
| Self-serve disabled | `checkin_modes.self_serve=false` | "Self check-in isn't enabled for this event — please see reception." |
| Cancelled registration | `status='cancelled'` | "This registration was cancelled." + how to fix it |
| Unpublished event | `status='draft'` | "This event isn't open yet — your registration is valid." |
| Unknown code | fake code | "Code not recognised" + present it to the organiser |

All six are distinct, true, and actionable. **This part of the product is in good shape** — the
Stage 7 work on it holds up under adversarial poking, and I found nothing to fix in the refusal
copy itself.

**Not covered, and why:** dark mode (locked to "light always; dark = explicit toggle only", and the
toggle is off the attendee path); the camera QR scan (needs real hardware); `1280px` and `375px`
were both checked, `768px` was not.

### The instrument lied twice, as the brief warned

Both caught by cross-verifying before writing anything down:

1. **"React isn't hydrating on `/survey`."** A wedged tab (0×0 viewport, `visibilityState:hidden`)
   returned no React fiber on the `<form>` and no class change on a controlled radio. In a fresh
   tab the same probes showed a fiber, the class flipping, and a **real row landing in
   `survey_responses`**. There was never a bug.
2. **"The pass page's Confirm button isn't wired."** Same wedged-tab reading; the button had
   already written `attended` + a credit to the database on the previous tab.

The fiber-key probe is unreliable here — as `2026-08-01-m2-frontend-unfreeze.md` §Stage-3 defect 4
already records. **A fresh `tabs_create` per page is the reliable workaround**; real `computer`
clicks failed on ~4 pages while `javascript_tool` `.click()` worked throughout.

---

## 2. What I fixed

Most significant first. All eight are on `main`, unpushed.

### 2.1 A failed agenda read became a deleted agenda — `2ad5f09`

`app/events/[id]/edit/page.tsx:69`

- **Before:** the `agenda_blocks` query discarded its error. A failed read rendered the edit form
  with **zero agenda blocks**, looking exactly like an event that has no agenda. The organiser
  presses **Save changes** and `update_event_with_blocks` round-trips that emptiness — the real
  agenda is **replaced with none**. No error, no warning, no moment where anything looked wrong.
- **After:** throws to the branded error boundary. The agenda stays on disk.
- **Why it is the top item:** the comment *directly above the query* already documents this exact
  wipe hazard one level down (omitting a *column* from the select silently wiped its value). The
  same hazard existed at the *query* level and was open. The sibling registrations count two lines
  below already threw — so the fix is the file's own convention, not a new idea.

### 2.2 Load failures rendered as "nothing here" — `54cfa83` (public), `c20b2ad` (staff)

Five more sites, same swallowed-`error` shape. Split into two commits because the failure modes
differ: the public ones render **absence**, the staff ones render **a confident zero**.

| Route | Before, on a failed read | After |
|---|---|---|
| `/checkin` | "**No open events.** Check-in unlocks 60 minutes before an event starts." — a specific explanation for an emptiness that was a failed query, on the screen an operator opens to find the door they are running | error boundary |
| `/checkin` counts | every event "**0 / 0 checked in**" | error boundary |
| `/analytics` | **0 attended, 0 responses** | error boundary |
| `/dashboard` | the "no events yet" empty state | error boundary |
| `/events` | "**no upcoming events**" — tells the public this organiser runs nothing | error boundary |
| `/events/[id]` | the **whole Agenda section vanished** | error boundary |
| `/events/[id]` | a failed event read fell through to `notFound()` — someone opening the link in their **confirmation email** is told the event does not exist, indistinguishable from cancelled | error boundary |

The `/analytics` one is the compliance-relevant one: **attendance is what CPD credit is issued
against**, so a silently-zero attendance figure is a wrong regulator-facing number, not a cosmetic
glitch.

**Verified the fix, not just the code.** I revoked `SELECT` on `agenda_blocks` from `anon` *and*
`authenticated` to force a genuine error, confirmed `/events/[id]` renders **"Something broke — Your
data is safe. Try again"** with a support digest instead of a silently agenda-less page, then
restored both grants and re-verified with `has_table_privilege`.

**Deliberately left degrading:** `generateMetadata`'s own query still swallows. A metadata failure
should not take down a page that can otherwise render, and its fallback ("Event", noindex) claims
nothing false.

### 2.3 Every QR check-in was reported as a "self-scan" — `c739e32`

`components/details/AttendanceSection.tsx:67`

`check_in_method='qr'` is written by **two different acts**: a staff member scanning the attendee's
code with the camera, and the attendee tapping "Confirm I'm here" on their own pass. The two
screens that display it **disagreed, and each was wrong for one case** — the roster called both
"QR", the details page called both "Self-scan". So a staff-witnessed camera scan was reported to
the organiser as something the attendee did alone.

On an accredited event that is the difference between attendance a staff member witnessed and
attendance nobody did — precisely what an accrediting body would ask about.

- **Now:** "By QR", true of both, and matching what the roster already says.
- **Not fixed here:** actually *separating* the two needs a distinct method value in the data
  model. That changes what a stored value means → **escalated, §4 decision 1**.

### 2.4 The door check-in button had no visible focus ring — `7bc7f59`

`app/(public)/checkin/confirm/ConfirmButton.tsx:56`

The base layer sets `outline-ring/50` on `*` — an outline **colour with no width** — so this button
had no focus style of its own and fell back to the UA default ring, drawn dark against its own dark
blue fill. It is the **only interactive control on the page**, so a keyboard or switch user had one
target to find and the weakest possible indicator pointing at it.

Matches the hand-written app convention (`SurveyForm`'s segmented control,
`RegistrationCloseEditor`) rather than the `ui/` primitives' `ring-3/ring-ring`. Registration was
already covered — it composes `ui/Button` and `ui/Input`, which carry their own.

> **Verification gap, stated plainly:** I confirmed the class is applied, that Tailwind emitted the
> matching `.focus-visible\:ring-offset-2:focus-visible` rule, and that the button is **54px** tall.
> I could **not** observe the ring under real keyboard focus — the Next dev-tools overlay captures
> `Tab` in this environment. The CSS is present and correct; the rendered ring is unverified.

### 2.5 Create-form labels disagreed with themselves — `f7acee2`

`app/events/new/` — two related problems:

- **Casing:** "Save Draft" / "Publish Event" were the app's **only** Title Case buttons. The edit
  branch of *the same component* says "Save changes" / "Save & Preview", and the edit page calls the
  identical action "Publish event". → sentence case.
- **Copy naming a button that didn't exist:** the intro read *"Save as draft first"* above a button
  reading *"Save Draft"*. This is the **same defect the brief cites as recently fixed** (an error
  telling organisers to press "Save as draft"), surviving one layer over in the guidance text. Now
  quotes both buttons verbatim.

Also corrected a stale label reference in a `publish_event` RLS test comment.

### 2.6 Analytics misquoted the question respondents answered — `10da4b8`

`components/analytics/SessionDistributionSlice.tsx:23`

The Q2 slice displayed **"Which session was most valuable to you?"** in quotation marks. The survey
actually asks **"Which speaker or session provided the most clinical utility?"** — a different,
narrower question about clinical value rather than preference, presented as if verbatim. Q1 and Q3
on the same page already quote exactly.

It matters here more than on a normal dashboard: this page is what an organiser exports and shows an
accrediting body, and a misquoted question misrepresents what the responses under it mean.

### 2.7 The demo fixture rotted and its banner over-promised — `5530764`

`scripts/demo/seed-demo.ts`

- The clock knob added in `7c6908c` moves the **event's** window on every re-seed but never touched
  its `agenda_blocks`. Children kept their original times, so a re-seed produced an event starting
  today whose agenda was dated **eleven days earlier** — I hit this on the first page I opened.
  Blocks now shift by the same delta.
- The banner printed **"✅ REGISTER"** while the fixture was still a `draft`, which every attendee
  surface correctly refuses. Publication is a separate gate from the clock; the one line the tester
  reads was the only thing wrong. Both halves now defer to `published`, and the header prints the
  real status instead of a hardcoded `(draft)` it kept showing after publishing.

---

## 3. Found and deliberately NOT fixed

1. **Poster's "Date" row shows a time.** `/events/[id]/poster` renders `Date: 05 Aug 2026, 19:36`
   directly above `Time: 05 Aug 2026, 19:36 → 23:36`. Redundant and the label is loose, but nothing
   is *false*, and `formatInTz` has no date-only variant so it needs a new formatter. Not worth the
   diff against rule 3.
2. **190 arbitrary `text-[Npx]` values bypass the type scale** (carried, `2026-08-02` audit). The
   Text-size setting still does nothing for most of the app. `/settings` now discloses this honestly
   ("Some icons and badges keep a fixed size"), which is the *honest* version of a real limitation.
   Deliberately out of scope: it is a 47-file mechanical sweep that wants its own review.
3. **22 headings still bypass the typography tokens** (carried from Stage 1). Same reason.
4. **`staff.role` accepted by `StaffShell` and never used** (carried). Dead prop; removing it is
   cleanup, surfacing it as a badge is a design decision. Neither is this run's remit.
5. **`generateMetadata` still swallows its query error** — deliberate, see §2.2.
6. **`/dashboard`, `/events/[id]/checkin`, `/events/[id]/edit`, `/poster`, `calendar.ics` still
   swallow errors on their *single-row* `event` lookups**, falling through to `notFound()`. Lower
   severity than the list queries (a 404 is wrong but not a fabricated number) and it is six more
   sites. Folded into §6's proposal instead of patched piecemeal.

---

## 4. Decisions for Ivan

### Decision 1 — a self-serve tap and a staff scan are the same value in the database

`self_check_in()` hardcodes `check_in_method='qr'`; `mark_attended(p_method)` is passed `'qr'` for a
camera scan and `'manual'` for keyed entry. **Nothing distinguishes "the attendee tapped their own
pass" from "a staff member scanned them."** I made the labels stop *claiming* a distinction
(§2.3), but the data genuinely cannot support one.

This is a compliance question, not a UI one: unattended self-certification and staff-witnessed
attendance are different evidentiary categories, and Stage 9's body review is likely to ask.

| # | Option | Advocated by | Cost |
|---|---|---|---|
| **A** | **Leave as-is.** Both stay `'qr'`, labels stay neutral ("By QR"). | `ponytail` (YAGNI — no one has asked); CLAUDE.md rule 13 (out of active phase) | The distinction is **unrecoverable for every event already run**. If the body asks in Stage 9, the answer is "we cannot tell you." |
| **B** | **Add `'self'` as a third `check_in_method`.** Migration widens the CHECK, `self_check_in` writes `'self'`, both screens split the row. | `ui-ux-pro-max` (a control's label must name what happened); `impeccable-design-polish` | Migration + CHECK change + backfill decision for existing `'qr'` rows (they are genuinely ambiguous — probably leave them). Touches an audited definer. |
| **C** | **Derive it instead of storing it.** Leave the column; infer from the `audit_events` row, which already records actor. | `ponytail` (no schema change) | Only works where an audit row exists and reliably carries the actor; a report-time join, so every consumer pays. Fragile in exactly the case that matters. |
| **D** | **B, but deferred to Stage 9** — write the DEFERRED entry now with "the body asks how attendance was witnessed" as its trigger, matching how 55/56/57 were handled. | CLAUDE.md rule 13; the repo's own DEFERRED convention | Ambiguous rows keep accruing until then. |

**My recommendation: D**, then B when the trigger fires. B is right, but it is a data-model change
during a deploy-gated stage, and this repo's convention is to write the trigger down rather than
build ahead of the answer.

### Decision 2 — how to stop the swallowed-error class recurring

Six instances this run; the repo's history records the same class twice before. Fixing instance
seven by hand is not a strategy. Full options in §6 — it needs one call from you, so it is a
decision, not a finding.

### Decision 3 — what `high-end-visual-design` and `gpt-taste` wanted, that decision 1 rules out

Per your instruction I ran the pipeline but did **not** act on anything that changes the locked
language. Recorded so it is not silently lost, and **not recommended** — you already declined this:

- **Elevate the palette beyond the single blue ramp** (`high-end-visual-design`) — a warmer neutral
  ground and a secondary accent to break up long organiser forms. **Ruled out**: your decision 1
  fixes palette values *and* roles. Also the exact move that produced the 4.55:1 → 4.23:1 WCAG
  failure.
- **Replace the serif headings with a display face** (`gpt-taste`) — argues the system serif stack
  (Iowan/Palatino/Georgia) reads as a default rather than a choice. **Ruled out**: locked, and it
  would add a webfont request the current stack deliberately avoids.
- **Motion pass on roster row transitions** (`emilkowalski-motion`) — animate rows moving to
  checked-in. **Not done**: genuinely tempting and inside the language, but the roster is a live
  door surface where an operator scans for a name under time pressure; motion there needs a
  deliberate call and a `prefers-reduced-motion` path, not an unattended one.

No two pipeline skills **deadlocked** on anything inside the locked language, so there is no forced
3-option choice beyond the above. Everything else was decidable and got decided.

---

## 5. Final gate numbers — measured, not assumed

Run after the last commit (`10da4b8`), full suite, from `/Users/ivan/Eventar`:

| Gate | Baseline (brief) | Baseline (measured, pre-change) | **Final (measured)** | |
|---|---|---|---|---|
| `tsc --noEmit` | clean | clean | **clean** | ✅ |
| `eslint .` | 0 err + 5 warn | 0 err + **6** warn | **0 err + 5 warn** | ✅ improved |
| `vitest run` | 530 / 165 skipped | 530 / 165 skipped | **530 passed / 165 skipped** | ✅ held |
| `next build` | clean, **21** entries | clean, **22** entries | **clean, 22 entries** | ✅ held |

Two corrections to the brief's baseline, both verified by diffing my own pre-change run:

- **eslint was 6 warnings, not 5**, before I started. The sixth was `'checkinOpen' is assigned a
  value but never used` in `seed-demo.ts` — a genuine bug, not noise: the variable existed *because*
  the banner was supposed to respect publication and didn't. Fixing that (§2.7) consumed the
  variable and returned the count to the documented 5.
- **`next build` emits 22 route entries, not 21** — and did so on my pre-change baseline too, so
  this was already stale before this run. Baseline and final route lists are **byte-identical
  (`diff` clean)**, which is the invariant that actually matters.

`pnpm test:rls` was **not** run — see §7.

> ### ⚠️ Another session is editing this repo right now — read before trusting the table
>
> Immediately after my last commit, four files I never touched appeared modified in the working
> tree, timestamped **23:32–23:34**, i.e. *after* my final gate run:
>
> ```
> lib/cron/dispatchDue.ts
> lib/cron/dispatchDue.test.ts
> app/api/cron/dispatch/route.test.ts
> tests/cron/dispatch_idempotency.rls.test.ts
> ```
>
> It is coherent, deliberately-commented work — ordering `selectDue()` by soonest-closing window so
> the caller's batch cap drops the least-urgent mail rather than an arbitrary one. **Someone else's
> in-progress feature, not mine.**
>
> **I left it completely alone** — not committed, not stashed, not reverted. `handoff_04082026.md`
> §2 records that uncommitted worktree changes with no commits behind them are exactly how work got
> nearly destroyed before, so this is deliberate.
>
> **What that means for the numbers above:** the table is measured on *my* commits, with the tree
> clean. Re-running with their work present gives **533 passed / 167 skipped** and `tsc` still
> clean — so the combined tree is green too, but **my 530/165 is the figure for my changes alone.**
> Whoever owns that cron work should land it themselves.

---

## 6. The thing worth acting on beyond any single fix

**Six of eight commits are the same defect.** `const { data } = await supabase...` is valid
TypeScript, passes `tsc`, passes `eslint`, passes every test, and silently converts an infrastructure
failure into a confident, wrong, user-facing claim. The type system cannot see it because
`PostgrestResponse` legitimately allows ignoring `error`.

This is the same shape as the hazard `handoff_04082026.md` §3 documents about `create or replace`:
**every gate green while the thing is broken.** The repo has already been bitten by the empty-vs-
failed collapse twice, and by this specific query shape at least three times.

| # | Option | Cost |
|---|---|---|
| **A** | **Lint rule** — ban destructuring `data` from a `supabase` call without `error`. | ~1h to write as a custom ESLint rule; some false positives on genuinely optional reads (the `generateMetadata` case is a real one and would need an inline disable + reason). Catches it at author time, which is the only place it is cheap. |
| **B** | **A typed wrapper** — `mustSelect(...)` that throws on error, making the safe path the short one. | Touches ~20 call sites; a new abstraction, so it argues against `ponytail`. But it makes the correct thing the *default*, not the disciplined thing. |
| **C** | **Codemod the remaining 6 single-row sites now** and write it into CLAUDE.md's hard rules. | Cheapest; relies on humans reading a rule, which is what already failed three times. |

**My recommendation: A.** It is the only one that fails at author time, and this codebase's whole
posture — grant-level revokes, negative tests asserting `42501`, definer-only writes — is
"make the wrong thing impossible rather than discouraged." A lint rule is that posture applied to
the frontend. C is worth doing anyway as the cleanup pass.

---

## 7. What I could not verify — read this before trusting anything above

- **The focus ring is not visually confirmed.** Class present, Tailwind rule emitted, button 54px.
  The rendered ring under keyboard focus is **unverified** (Next dev overlay captures `Tab`).
- **`pnpm test:rls` was not run.** `PROJECT_STATE.md` lists 149/149 as a standing invariant. I
  changed no SQL, no migration, no RLS policy and no Server Action — but I did not prove it, and
  the socket-exhaustion caveat makes a casual run unreliable anyway. **Worth one clean run before
  Stage 8.**
- **Only 1280px and 375px** were checked. 768px was not.
- **Dark mode was not exercised.** Locked to explicit-toggle-only and off the attendee path.
- **The camera QR scan path was not exercised** — needs real hardware. Manual entry and self-serve
  were both driven end to end.
- **The `error.tsx` boundary was proven once**, on `/events/[id]`, by forcing a real grant failure.
  The other six throw sites are the same mechanism but were not individually forced.

### One thing I broke and repaired — disclosed in full

Early on I ran `supabase db reset` to clear stale fixture data. **It failed partway**: it dropped
and recreated the database, then aborted at migration `20260802182411`, whose self-verifying
assertion `service_role lost its events write path` fired. Root cause is the **known CLI 2.109
grant-zeroing issue** already documented in `seed.sql`'s header — the assertion runs *before*
`seed.sql` restores the grants, so `db reset` cannot complete on this stack.

**The local database was empty for several minutes.** Recovered by restoring the baseline DML
grants, running `supabase migration up` (10 migrations applied cleanly), then `seed.sql`. Verified
after: **88/88 migrations two-sided**, `has_table_privilege(service_role, events, INSERT/UPDATE)`
both true, all 18 public tables present.

**No remote database was touched at any point** — everything was `127.0.0.1:54322`. Nothing was
lost that the seed script does not regenerate. But it is a real trap for the next session:

> **`supabase db reset` does not work on this stack.** It fails at `20260802182411` because that
> migration's grant assertion runs before `seed.sql` restores what CLI 2.109 zeroes. Use
> `scripts/demo/reset-demo.ts`, or `migration up` + `psql -f supabase/seed.sql`. This deserves a
> line in CLAUDE.md next to the `db push` correction.

---

## 8. Honest summary

The **attendee door — the part you told me to spend the depth on — is in good shape.** All six
refusal states are distinct, true and actionable; I forced each one against real state and found
nothing to fix in them. The self-serve loop mints a correct credit. That is the Stage 7 work
holding up under adversarial poking, and it is the most important sentence in this document.

What I found instead was one systemic defect wearing six costumes, one of which quietly eats an
organiser's agenda. The individual fixes are small. **§6 is the finding**; the eight commits are
mostly its symptoms.
