# Next stage — dual-track CME/CPD launch (scope record)

> **Status: SETTLED 2026-08-10. This is Stage 10, via a logged rescope of Stages 9–13 — Decisions Log Q33.**
> Full implementation plan: `~/.claude/plans/target-product-for-2026-proud-castle.md`.
> Terminology is Stage 1–13 per `docs/plans/STAGES.md`.

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

## 3. What this stage deliberately does NOT do

- **The versioned `body_rules` evaluator and Q26 stay deferred.** Rule packs live in `lib/cpd/rulePacks/` as code, and the ledger stores their **output plus a pack hash as values** — never a reference to a mutable config row. That is what keeps doctrine **D.1** intact: *"nothing config-referencing gets built into `credit_ledger` before this is decided."*
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
