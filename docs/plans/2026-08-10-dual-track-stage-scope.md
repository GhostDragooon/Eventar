# Next stage — dual-track CME/CPD launch (scope record)

> **Status: SETTLED 2026-08-10. This is Stage 10, via a logged rescope of Stages 9–13 — Decisions Log Q33.**
> Full implementation plan: `~/.claude/plans/target-product-for-2026-proud-castle.md`.
> Terminology is Stage 1–13 per `docs/plans/STAGES.md`.
>
> **Amended 2026-08-14 (Ivan, D-A/D-B, prospect/strategy session):** multi-body-per-event moves to explicitly IN SCOPE for 2026 — forced by the ICI Summit 2026's 13-accrediting-body sheet — as new Workstream E below, and a prior-approval deadline advisory (S3) is added as Workstream F, built FIRST. Stage 10's task total is now **9** (was 7); see `docs/plans/PROJECT_STATE.md`'s 2026-08-14 section and `~/.claude/plans/target-product-for-2026-proud-castle.md` Tasks 10.8–10.9 for detail. This is distinct from, and does not reopen, the multi-track/session-model exclusion in §3 below (rule 13), which stays deferred. §1's numbering-question record and §2/§3's original text are historical and left as written; the amendments are additive.

## 1. The numbering question — DECIDED (Ivan, 2026-08-10): option B, logged as Q33

**Stages 9, 10, 12 and 13 were re-pointed; the versioned evaluator moved from Stage 10 to Stage 13.** `STAGES.md` carries the change and a pointer to this file. The reasoning that led there is kept below, because the rejected options explain why the ladder now looks the way it does.

### Original framing (kept for the record)

`STAGES.md` rule 1: *"Stages are sequential and never renumbered. New work appends; it does not insert."*

The 2026 dual-track scope does not fit the existing ladder cleanly:

- It is **not Stage 10**. Stage 10 is the versioned `body_rules` evaluator, gated on Stage 9 and Q26 — and this work explicitly **defers** that (doctrine D.1 stays intact; see §3).
- It **cannot insert** between 8 and 9 — rule 1 forbids it.
- It **partially replaces the path** through Stages 9→12: rather than *body review → evaluator → pilot*, it is *dual-track platform with provisional rules → pilot with Colleges*.

Three ways to record it, all legitimate under rule 1:

| Option | Shape | Cost |
|---|---|---|
| **A. Append as Stage 14** | New stage, runs *before* 9–13 in calendar time | Stage numbers stop implying order, which is the one property they had |
| **B. Rescope Stages 9–12** | 9 becomes "Colleges engaged", 10 "dual-track engine (provisional rules)", 12 "pilot"; the evaluator moves to 13+ | Edits stages already declared, which rule 1 is designed to prevent |
| **C. Stage 8 absorbs it** | This is all "deploy & field-proven" — the product needed to be field-proven *with* | Stage 8 becomes enormous and its exit criteria stop being checkable |

**Recommendation: B**, with the edit recorded in the Decisions Log. Rule 1 exists to stop silent renumbering, not to freeze scope forever — and A produces a ladder where 14 precedes 9, which is worse for the next reader than an honest, logged rescope.

## 2. What the next stage contains

Four workstreams, sequenced Aug→Dec. Detail in the plan file.

| | Workstream | Block | Gist |
|---|---|---|---|
| **A** | Dual-track identity | B2 | MCHK + 15 HKAM Colleges as `accrediting_bodies` rows; `track` on `practitioner_licences`; the practitioner licence UI that has never existed |
| **B** | Minute-level proration | B3 | `check_out_at` / `minutes_attended` on `registrations`; prorated hours; **venue-scan ships with it** |
| **C** | Taxonomy + rule packs | B3 | Three event fields + freeze-trigger widening; provisional per-body packs as code, not tables |
| **D** | Certificates + College export | B6 | CSV export first (it is what Colleges need); stored certificates after event end |
| **E** *(added 2026-08-14, D-A)* | Multi-body-per-event | B3 | Task 10.8/10.9 — new `event_accreditations` table (event × body × `applies_from`/`applies_to` × `credit_value`); `award_attendance_credit` reworked to iterate every accreditation row and post one `credit_ledger` row per body the practitioner holds a verified licence at. Forced by the ICI Summit 2026's 13-accrediting-body sheet |
| **F** *(added 2026-08-14, D-B/S3)* | Prior-approval deadline advisory | B3 | Task 10.9/10.9 — built FIRST, ahead of A's Task 10.2 and of E. A `prior_approval` key added into the existing `accrediting_bodies.cycle_config` jsonb; a pure-function deriving `(start_time, cycle_config) → {deadline, passed, unknown}`, surfaced advisory-only at body-selection time, never blocking the save |

> **Proposal, unconfirmed (R1 — Claude's recommendation from the 2026-08-14 session, not Ivan's decision):** store a `role` (attendee/chair/presenter) on the registration and let each body's rule pack map role → its own category code, instead of Workstream C's single category-column design — because HKAM's 6.1–6.16 codes, MCHK, and CNE (all on the ICI Summit's real accreditation sheet) don't share one vocabulary. This is a proposed reshaping of Task 10.3/10.9's design, not a decision, and Task 10.3/10.9 itself is left unedited here — see `docs/DEFERRED.md` (R1) and `~/.claude/plans/target-product-for-2026-proud-castle.md` for the task's actual detail.

## 3. What this stage deliberately does NOT do

- **The versioned `body_rules` evaluator and Q26 stay deferred.** Rule packs live in `accrediting_bodies.category_taxonomy` (existing not-null jsonb, per Decision 11 in the Task 10.1–10.9 plan — corrected 2026-08-14; this line said `lib/cpd/rulePacks/` until then, which never matched what Task 10.1 actually shipped), and the ledger stores their **output plus a pack hash as values** — never a reference to a mutable config row. That is what keeps doctrine **D.1** intact: *"nothing config-referencing gets built into `credit_ledger` before this is decided."*
- **No `credit_ledger` migration.** The hash envelope is a hardcoded 18-key `jsonb_build_object` with no version marker; adding a column would retroactively invalidate every row. `points`, `category` and `reason` are already hashed and permanently NULL, and `hours` is unconstrained numeric — all four carry the new data for free.
- **No session/multi-track model.** Proration is per event, one in one out (rule 13's deferred data-model decision stays deferred).

## 4. Entry preconditions

| # | Precondition | State as of 2026-08-10 |
|---|---|---|
| 1 | Seoul ↔ local migration parity | ⚠️ **1 behind** — `20260806000200_email_log_origin` unapplied; `supabase db push --linked` is blocked by the auto-mode classifier, so Ivan runs it |
| 2 | `organisation_body_authorisations` non-empty | ❌ **0 rows on both Seoul and local** — `set_event_cpd_config` refuses every event until seeded. Workstream A task 2 |
| 3 | Replay-from-zero green | ✅ closed 2026-08-10 (`d60b596`) |
| 4 | Block-architecture admission checklist | ✅ run for Workstream A; **flag: extending `declare_licence` is a block-contract tier change**, needing this doc + `BLOCK-ARCHITECTURE.md` updated, not just sprint discipline |
| 5 | Stage 8 deploy | Deferred to Oct/Nov by Ivan; October dress-rehearsal deploy budgeted instead |

## 5. Live database hygiene — found 2026-08-10, needs a decision

Seoul carries **27 `accrediting_bodies` rows: 8 real, 19 test fixtures** left by RLS/CPD suites.

| Group | Count | Ledger rows | Deletable |
|---|---|---|---|
| `RLS-CPD-*` (attendance_issuance fixture) | 6 | 2 each | **No** |
| `RLS-FREEZE-*` (freeze-trigger fixture) | 4 | 1 each | **No** |
| `ELIG-*` (eligibility fixture), `status='active'` | 6 of 8 | 1 each | **No** |
| `ELIG-*` with no ledger row | 2 | 0 | Yes, after their event + licence |
| `GUARD-*` | 1 | 0 | Yes |

**16 of 19 are permanently undeletable** — `credit_ledger.body_id` is a `NO ACTION` FK, so the body, its events, its licences and its practitioners are all pinned forever. This is DEFERRED 27's blast radius realised on the live database.

**8 are `status='active'`, so `accrediting_bodies_public_read_active` exposes them in the organiser body picker on production.**

**DECIDED (Ivan, 2026-08-10): leave the data, fix the fixtures.** The 8 `active` rows stay visible for now. Whenever that call is revisited, one `UPDATE` setting them to `status='deferred'` removes them from every picker without deleting anything and without touching the ledger — fully reversible, and it achieves everything deleting the 3 deletable rows would.

**Fixture fix shipped `843eb91`.** Four suites (`roster_eligibility`, `attendance_issuance`, `event_freeze_trigger`, `audited_table_writes`) now upsert a fixed sentinel body on the `(organisation_id, short_name)` unique constraint instead of minting `SHORT-${Date.now()}` per run. Four other suites were **deliberately left alone** — `practitioner_licences`, `licence_mutations`, `organisers` and `organisation_body_authorisation` delete their body in `afterAll` and never write the ledger, and Seoul's row list proves it: none of them is present.

> ⚠️ **The actual root cause is not the fixtures.** `.env.local` points at **Seoul**, so `pnpm test:rls` runs against the **live production database** — that is how 19 fixture bodies got there. The sentinel stops the growth; it does not change where the tests point. It also means the sentinel change is **unverified by execution**, because running those suites would write to production and `attendance_issuance` posts permanent ledger rows. Verify by pointing `.env.local` at the local stack first. The durable fix remains DEFERRED 27's: a throwaway Supabase branch per run.

## 6. Verification

Per the plan file. The two that gate this stage specifically:

- `select count(*) from verify_ledger_chain() where not link_valid or not content_valid` must be **0** after every ledger-touching change.
- `bash scripts/ci/replay-and-verify.sh` → exit 0, `REPLAY + TAMPER GATE: PASS`.
