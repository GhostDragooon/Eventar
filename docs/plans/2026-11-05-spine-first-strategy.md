# Spine-first strategy — DIRECTION (2026-11-05)

> **Status: DIRECTION, not locked (Ivan, 2026-11-05).** This is the heading we are working toward, not a fixed plan. It will change as partners join and as the AI tooling matures. Logged in the vault as Decisions Log **Q48** (direction). `STAGES.md` stays the stage authority until §7 item 1 is decided. Known breakers are in §7a.

## 1. End goal

Run professional events cleanly. Produce attendance evidence that regulators will accept. Make the accreditation hand-off practical for the organisers and bodies that actually join us.

We do not need every College, or a full multi-body points engine, at launch. We start with the event spine and prove it with real events. After that we add accreditation slices, one at a time, with the partners who come on board.

## 2. Product shape

### Spine (the core product)
Create → publish → register → check-in / roster → post-event record. This is block **B1 Events & Attendance**, and everything else sits on top of clean capture.

### Accreditation / CPD module
This module is separate from the spine. It covers data handling and the hand-off to bodies (blocks B2, B3 and the College export). It is not a live rule engine at launch.

### Points / credit (B3)
- The live award path stays deterministic, auditable SQL (`award_attendance_credit`, `credit_ledger`). This is already true.
- Rule content has a provable history, not a version number. Every create or change of a body's `category_taxonomy` / `cycle_config` writes a `body_rule_content_changed` row to `audit_events` with the old and new content and a sha256 hash of each; a `body_rule_content_baseline` row per body anchors today's content (migration `20261105100000`). For an award posted after the 2026-11-05 baseline, the rules in force can be reconstructed by hand from those rows and the award's posting time; nothing does this matching automatically, and earlier awards cannot be traced this way. The audit row is written inside the changing statement, an accepted exception to "audit insert last" because body edits are rare migration or admin operations. Real versioning (`body_rules`, a pack id on the ledger) stays Stage 13.
- No LLM and no QC engine is ever on the live award path.
- **Inputs are confirmed twice, by Ivan first:**
  1. **Before the event can award credit.** Ivan approves each accredited event's body, category and hours. That approval is a new state on the event's CPD config, written to `audit_events` as the last statement (pivot rule "audit insert last"). **Not built yet.**
  2. **After posting.** Ivan confirms the posted rows through the existing `confirm_credit_entry()` (`body_confirmed` tier, `eventar_staff` actor). The function exists. **The review queue UI is not built.**
- `body_admin` can already call `confirm_credit_entry()` (`require_active_staff('body_admin','eventar_staff')`). More confirmers are added by role grant, not a new path.
- No multi-college points *content* at launch. Rule content exists only for bodies whose partners are live (see §4).

### Document digest (B9 Rule Authoring / Source Evidence)
An LLM digests each body's guideline documents. The output is used only to author, look up and maintain the **rule pack** (the versioned points-calculation artefact; "Board Pack" is its external name, per `CONTEXT.md`). The digest produces evidence that supports a pack. It never produces the pack itself, and it never awards points.
- Per ADR-0003 it runs offline, as preparation work. A job must be able to finish without any external model input. It is never on the check-in or award paths.

### QC engines (B7 Assistive AI, advisory-only)
These are narrow, typed, confidence-gated classifiers. Examples:
- guideline chunk classification (feeds B9)
- rule pack completeness check
- attendance-evidence quality / hand-off readiness

**Each engine produces a flag. A human clears or overrides it.** No engine blocks, approves or changes a record on its own. This follows the pivot hard rule "measurement vs inference": inference signals produce flags for humans and never trigger automatic action. B7 may never write B3/B4 authoritative records.

Each engine is a single narrow job, not one general "CPD brain", and none of them calculates points.

**Engine vendor: not decided.** Jev (TypeSafe AI's "System One" decision model) is a candidate; see §6.

## 3. Go-to-market and expansion

- Do not build full accreditation coverage before launch.
- Reach out, see who joins, and start with those partners.
- Add the next body's rule content only when a real organiser will run an accredited event under it.
- A body is "live" for an organiser when it has rule content (`category_taxonomy.role_mappings`) and an active `organisation_body_authorisations` row for that organiser (the picker in `lib/cpd/authorisedBodies.ts` already filters on it).

## 4. What exists today (checked 2026-11-05, local DB + git)

Stage 10 built the **machinery**. The **rule content** is almost all still missing.

| Piece | State |
|---|---|
| Multi-body schema (`event_accreditation_groups` et al.) | shipped 2026-08-15 |
| Award engine iterates bodies, `proportional` / `explicit_schedule` (C4) | shipped 2026-08-15 |
| Multi-body organiser wizard (C5) | shipped 2026-08-21 |
| Prior-approval deadline advisory (HKCP only) | shipped 2026-08-14 |
| College / MCHK CSV export | shipped `e9d4f4c` |
| `role_award_rule` enforcement | shipped `20260826000000` |
| 15 HKAM Colleges + MCHK in the registry | seeded as registry rows only |
| Rule content (`role_mappings`) | **HKCP and MCHK only**, provisional, from public web sources, static jsonb with no version |
| Pack hash on `credit_ledger` | does not exist (2026-08-21 decision: computed at export time only) |
| Rule-content history | **shipped 2026-11-05** (`20261105100000`, local + Seoul): audit row per change with old/new content + hashes, one baseline row per existing body |
| Versioned `body_rules` / deterministic evaluator | not built; Stage 13, gated on Q26 + doctrine D.1 |

So the College rows are static and have no rules. An event accredited by, say, HKCA awards nothing until HKCA gets `role_mappings`. That matches this strategy: content is added per partner.

## 5. Priority order

1. **Close the MVP formally.** Spine + both personas, acceptance criteria signed off. Decide 1–3 are built (`6799639`, `a93d25d`). Still open: the Terms/Privacy pages decision, then sign-off.
2. **Critical security.** **Mostly done; verify, then close.**
   - confirmed-email staff guard: `0ed292c`
   - `bulk_update_event_status` role gate: `4396d28`
   - Next 16.4.5: `73361e3`
   - clickjacking: `frame-ancestors 'none'` at `next.config.ts:14`
   - Remaining: dependency hygiene.
3. **Stage 8.** Deploy (Singapore), Resend / Turnstile / privacy notice as needed, real events and real check-ins.
4. **Partner outreach → first accreditation slice.** Rule content for that partner's body only. Build the two confirmation steps from §2. Add B9 digest and B7 QC engines only where they serve that slice.

## 6. Jev assessment (2026-11-05, from public pages)

- **What it is:** a hosted, closed-weight decision model API from TypeSafe AI (`POST …/v1/systemone`, API key). It returns choice probabilities plus confidence. It is not an LLM and does not generate text. There are no public weights and no stated licence. **It cannot run offline.**
- **Maturity:** thin. The `jev-ai` GitHub org has 14 repos, all updated the same day, with 0–7 stars, and its own README says it is not the official product site. Speed and cost figures are vendor claims. The pages' own caveat: a valid typed output does not guarantee a correct decision.
- **Fit:** its shape (typed output, confidence, human review left to the caller) matches §2's QC engines.
- **Blocks before adoption:**
  1. Hard rule 7: no premature external services.
  2. ADR-0003: rule pack jobs must finish without external model input. A hosted API is allowed only as an optional advisory step that a job can finish without; making it a required step needs an ADR-0003 amendment.
  3. Data flow: no PII may leave (ADR-0003 package split).
  4. A vendor / terms review: licence, pricing, data retention.
- **Not yet read:** typesafe.ai's own docs. The Reddit review was not reachable.

## 7. Open (Q48 "Not decided")

1. **Where B9 digest + B7 QC engines go in `STAGES.md`.** Stage 10 is "Dual-track engine (provisional rules)", and its machinery is shipped (§4); it is not the LLM + Jev build. Options:
   - (a) Close Stage 10 as shipped. Move B9/B7 into Stage 12 (per partner slice) and log the rescope in Q48.
   - (b) Rename Stage 10 to the LLM + QC build. This costs a renumber across `STAGES.md`, `PROJECT_STATE.md`, `BLOCK-ARCHITECTURE.md` and live plans.
   - (c) Leave B9/B7 in Stage 13 as mapped today.
2. **Stage 11 (KMS-signed, verifiable record).** This is what makes evidence "regulators will accept". Keep it before the pilot, move it, or drop it?
3. **Jev: adopt, trial or skip.** A trial would be an advisory-only, non-PII, optional B7 step, admitted via the block checklist.

## 7a. Known breakers (reviewed 2026-11-05)

1. **Rule content had no history. FIXED** by migration `20261105100000` (see §2, §4). Applied locally and to Seoul on 2026-11-05 (with the 18 earlier pending migrations).
2. **The "Ivan approves first" gate is only safe inside `award_attendance_credit()`.** Credit posts at check-in and the ledger is append-only, so a UI-only gate lets check-ins before approval write permanent rows. **Deferred** (Ivan: not an issue at this stage). Re-entry: when the approval step is built.
3. **Ivan's confirmations would be recorded as `body_confirmed`.** Evidence a regulator reads would say the body confirmed what Eventar confirmed. **Deferred.** Re-entry: before any confirmed row appears in a College export.
4. **One confirmer does not scale.** Per-row confirmation on a multi-body event (~13 rows per attendee) needs a per-event bulk confirm. **Deferred.** Re-entry: the first multi-body accredited event.
5. **A partner can be authorised for a body with no rule content.** `organisation_body_authorisations` does not require `role_mappings`, so such an event awards nothing. **Deferred.** Re-entry: the first authorisation for a body other than HKCP or MCHK.

Items 2–5 are tracked in `docs/DEFERRED.md`.

## 8. Non-goals (this phase)

- Rule content for bodies with no live partner.
- Any LLM or QC engine on the live credit award path.
- Building every College rule pack up front.
- A general reasoning or explanation layer.

## 9. Agent instruction

Treat the spine as the product. Treat accreditation as a partner-led module on top of clean capture. Keep the award deterministic. Use an LLM only for document digest (offline, B9). Use QC engines only as narrow, confidence-gated flaggers that a human clears (B7). Expand body coverage only with partners who join. Do not invent scope beyond this plan, and treat §7 as undecided.
