# CPD Sprint 3b — Body-Reviewer Workflow + Accreditation Confirmation (design outline)

> **Status: design outline, not an implementation plan.** This is deliberately not code-complete — every task below names an anticipated shape and the specific question the external review needs to answer before it can be detailed into real SQL. Writing this as full implementation now would mean pre-deciding the two things the review exists to inform (the body-reviewer workflow, the `accredited`-confirmation granularity), which is exactly the mistake [[Sprint 3a|2026-07-09-cpd-sprint-3a-implementation.md]]'s split was designed to avoid. **Purpose of this document:** something concrete to walk into the external-voice review with — the reviewing body/organiser/practitioner reacts to a named shape and answers a specific question, rather than an abstract "how does your accreditation process work."

**Gate:** per Decisions Log Q24/Q25 and `docs/DEFERRED.md` item 24 — one accrediting body, one organiser, one practitioner review this design (and the shipped demo artefact) before any task below gets detailed into a real migration. This document is the second artefact they react to, alongside the demo.

**How this becomes an implementation plan:** for each task, the review either **confirms the provisional default** (fast path — detail into SQL following Sprint 3a's exact conventions: `text`+CHECK, `gen_random_uuid()`, `SECURITY DEFINER` + Rule 6 grant hygiene, audit-write-last) or **changes it** (detail follows the changed shape instead). Nothing below is built until one of those two things happens.

---

## What's already locked — this outline builds on it, doesn't reopen it

Before the four open tasks: two things the review sometimes gets credited with deciding that are actually already resolved. Getting these wrong in the review conversation would re-litigate settled ground.

- **Event Lifecycle's decision-state machine already has a pre-publish review state.** Five stored states (Q23 item 4, locked): `draft`, `pending_body_review`, `published`, `credited`, `cancelled`. `attestation_status` (`organiser_attested`/`body_confirmed`) is a **field** on `published` events, not a separate state. This outline's Task 2 question is narrower than "should a review state exist" — it already does, pre-publish. The open question is whether *post-publish confirmation* also needs its own state, or stays a field-level flip as currently designed.
- **Cross-body recognition's architecture is already locked (Q25).** It happens at the ledger level via event dual-accreditation, not on `accrediting_bodies` or `practitioner_licences`. This outline's Task 4 question is operational mechanics only — how each body formalises recognition on their end — not whether the ledger-level approach is right.

---

## Task 1: Body reviewer accreditation workflow

**Anticipated shape:**
- `accreditation_submissions` table — an organiser's request for a body to accredit an event, distinct from the event itself (an event can have zero, one, or multiple submissions across bodies for dual-accreditation, per the Q25 ledger-level recognition model above)
- `submit_event_accreditation` / `approve_event_accreditation` / `reject_event_accreditation` definer functions — audited-mutation shape matching Sprint 3a's `declare_licence` template (gate → mutation → audit-write-last)
- `body_reviewer_permissions` table — **column shape already exists** in Data Model.md (Q23-locked): `organiser_user_id`, `body_id`, `can_approve`, `can_reject`, `can_request_changes`, `status`. Not being re-designed; what's open is the *process* wrapping it.
- `organiser_users` table (role enum including `'reviewer'`) — also already column-shaped in Data Model.md, same status.

**Review question:** How many reviewers per body (one, or a pool)? What turnaround SLA, if any, does the body expect or require? Do bodies want auto-approval for pre-qualified/repeat providers, or is every submission manually reviewed? Does the body need integration with an existing member/roster database to cross-check submissions, or is manual review sufficient at pilot scale?

**Provisional default, pending confirmation:** single reviewer queue per body (no multi-reviewer consensus/escalation logic). No SLA enforcement — a submission sits in `pending_body_review` indefinitely until a reviewer acts (no auto-timeout, no auto-escalation). Manual approval only, no auto-approval path. No member-database integration (matches `docs/DEFERRED.md`'s "Body register CSV upload integration" being separately deferred to "first body enterprise contract").

**If confirmed as-is:** `accreditation_submissions` + the three definer functions + wiring `organiser_users`/`body_reviewer_permissions` (already column-shaped) is a Sprint-3a-sized task, straightforward to detail.

**If changed:** multi-reviewer/SLA/auto-approval would each add real schema (a `reviewer_assignments` join, an SLA-deadline column + a `pg_cron` sweep, an auto-approval rule table) — meaningfully larger than the default. Worth knowing which way it goes before estimating 3b's size.

---

## Task 2: Post-publish accreditation confirmation granularity

**Anticipated shape:**
- The confirmation flip itself: `attestation_status` on the `published` event (or, if the review says otherwise, on something more granular — see below) transitions `organiser_attested` → `body_confirmed`
- `event_accreditation_confirmed` audit event, written by a new `confirm_event_accreditation` definer function (staff/body-reviewer-actor shape, same template as `verify_licence` in Sprint 3a)
- Consequence for the ledger: `credit_earned` rows already carry `attestation_status` "at the time the credit was earned" (Credit Ledger §6) — confirmation doesn't rewrite existing ledger rows, it changes what *new* rows record and can trigger a `credit_adjusted` entry for a body that wants historical entries retroactively marked confirmed (open sub-question, not yet asked below — add it to the review conversation if it comes up).

**Review question:** Does the body confirm accreditation **at the event level** (one flip covers every attendee's credit for that event) or **per-attendee** (each attendee's attendance/credit is individually confirmed, e.g. because the body wants to audit specific attendance evidence before confirming that person's credit)? Does post-publish confirmation need its **own distinct stored state** (separate from the already-existing pre-publish `pending_body_review`), or does the existing field-level `attestation_status` flip on `published` already cover it? What in the body's actual process triggers confirmation — a scheduled batch review, an on-demand request, continuous as attendance data arrives?

**Provisional default, pending confirmation:** event-level confirmation (one flip, not per-attendee). No new stored state — confirmation stays a field-level `attestation_status` change on the already-`published` event, consistent with Q23 item 4's existing design. No batch/scheduling mechanism — confirmation happens whenever a reviewer acts, no automation.

**If confirmed as-is:** small task — one definer function + one audit event type, no new states, no new tables beyond Task 1's submission-review plumbing.

**If changed to per-attendee:** meaningfully larger — confirmation would need its own table keyed on individual `credit_ledger`/registration rows rather than a single event-level field flip, plus UI (frozen, so this would need an explicit unfreeze conversation) for a reviewer to act attendee-by-attendee.

---

## Task 3: Body-specific PDF audit response format

**Anticipated shape:** per-body PDF template, rendered from the credit ledger's own projection query (Credit Ledger §9 — the PDF is already designed as "a projection of the ledger at a point in time," this task is the per-body *template* layered on top of an already-locked rendering approach).

**Review question:** Does the body want a PDF that mimics their **existing CPD record/declaration form** structure (e.g. matching PT Board's own "CPD Record Form" layout, or IA's "CPD Declaration Form"), or is a **standardised Eventar format** acceptable? What accompanying letter/cover format, if any? What metadata beyond the core form fields does the body's own audit process expect (e.g. a specific verification-URL placement, a specific signature block)?

**Provisional default, pending confirmation:** standardised Eventar format (one template, body logo + name inserted), not a per-body form-mimicking layout. Includes: KMS signature reference, verification URL, hash-chain reference — all per Credit Ledger §9's already-locked footer design. No body-specific cover letter.

**If confirmed as-is:** genuinely small — a templating task, not a design task; ships incrementally per body per `docs/DEFERRED.md`'s existing "Per-body PDF export templates... Sprint 5+" entry (this task may not even need to be in 3b at all — reconsider its sprint placement once the review answers this).

**If changed:** per-body form-mimicking is a real content/design task per body (8 bodies × a distinct layout), likely too large for 3b itself — would probably stay deferred to Sprint 5+ regardless of the review's answer, just confirmed rather than assumed.

---

## Task 4: Cross-body recognition — operational mechanics only

**Anticipated shape:** nothing new architecturally (Q25 already locked: ledger-level via event dual-accreditation, not a schema change to `accrediting_bodies`/`practitioner_licences`). What's anticipated here is purely the **operational rule layer** on top of the already-locked architecture — e.g. a lookup table of which body-pairs mutually recognise which activity categories, if any do.

**Review question:** For bodies with overlapping membership (e.g. a practitioner licensed under both HKICPA and a professional body requiring similar ethics training), does the body **want** automatic cross-recognition, or does it insist on practitioner-declared/independent claims per body (no automation at all)? If automation is wanted: does recognition apply to **points/hours only**, or also to category-floor requirements and audit/retention formats?

**Provisional default, pending confirmation:** practitioner-declared only — no automatic cross-body credit duplication or routing. A practitioner who completes one activity recognised by two bodies must independently declare/claim it against each licence; Eventar doesn't infer or auto-populate the second claim.

**If confirmed as-is:** no new schema at all — this task may not need to exist in 3b; the default is "don't build automation," which is already the state of the system without any 3b work.

**If changed:** a real schema addition (a `cross_recognition_rules` table keyed on body-pairs + category, referenced by the credit-earning path) — meaningfully new work, not covered by anything drafted so far.

---

## What this outline deliberately does not include

- Full SQL for any of the four tasks above — that's what "detail after review" means
- A stance on Task 3's sprint placement (3b vs. staying at its currently-deferred Sprint 5+) — explicitly left for the review to inform, noted inline above
- Any change to Sprint 3a's already-shipped-or-shippable scope — this document doesn't touch `credit_ledger`'s core schema, `practitioner_licences`, or the six licence-mutation functions; those proceed independent of this outline entirely

## Related

[[10 — Architecture/Credit Ledger]] §6 (attestation status), §9 (PDF export) · [[10 — Architecture/Event Lifecycle]] §4, §9.1/§9.3 (decision-state machine, Q23 item 4) · [[10 — Architecture/Data Model]] `organiser_users`/`body_reviewer_permissions` (column-shaped, Q23 item 5) · [[02 — Decisions Log#Q25|Decisions Log Q25]] (cross-body recognition architecture, locked) · `docs/plans/2026-07-09-cpd-sprint-3a-implementation.md` (the ungated half, ready to build now) · `docs/DEFERRED.md` item 24 (the gate this document exists to satisfy)
