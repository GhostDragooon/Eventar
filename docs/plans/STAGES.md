# Stages — the only roadmap vocabulary

> **Canonical as of 2026-08-03 (Ivan).** One linear numbering. **"M1–M4", "Sprint 0–5", "Milestone A–E" and "Phase 7/8/9" are retired.** Do not introduce a new naming axis. If a doc uses an old term, translate it with the table below and treat this file as the authority.
>
> The old scheme had **four overlapping axes** and, worse, **two different things both called "M2"** (the CPD engine *and* the frontend unfreeze). That ambiguity was live in `PROJECT_STATE.md` and `roadmap-to-mvp.md` simultaneously.

## The stages

| Stage | Name | Hit when… | Status |
|---|---|---|---|
| **1** | Foundations | multi-tenancy, `public.users` mirror, audit hash chain, consent/DSR | ✅ shipped 2026-07-04 |
| **2** | Security shell | `withSecurity`, audited definer path, rate limiting, attendee identity, CSP + headers | ✅ shipped 2026-07-08 |
| **3** | Registry & ledger | accrediting bodies, organisers, practitioner licences, `credit_ledger` + its own chain | ✅ shipped 2026-07-10 |
| **4** | Demo-ready & privilege hygiene | seed/reset/render/ledger demo scripts, `set_staff_role`, grant hygiene, CI replay harness | ✅ shipped 2026-07-18 |
| **5** | Attendance-verified issuance | `award_attendance_credit`, event-config freeze trigger, reconcile path, the closed loop | ✅ shipped 2026-07-25 |
| **6** | Organiser frontend & scheduler | token fusion, staff shell, CPD config surface, `/api/cron/dispatch`, Text size actually scaling | ✅ shipped 2026-08-03 |
| **7** | Hardening & pre-flight | full backend + frontend review, the fired deferrals closed, unaudited publish path, check-in mode reachable | ✅ shipped 2026-08-04 |
| **8** | Deploy & field-proven | Singapore → hosting → Resend cutover → Turnstile → privacy notice; ≥3 real events, ≥50 check-ins, 0 integrity incidents | 🟡 open; **deferred to Oct/Nov 2026** (Ivan, 2026-08-10) — October dress-rehearsal deploy budgeted instead, see `docs/plans/2026-08-10-dual-track-stage-scope.md` |
| **9** | **Colleges engaged** | MCHK Administrator + pilot Specialty Colleges confirmed; CSV column list locked; rule-pack numbers sourced against primary documents | external — their calendar |
| **10** | **Dual-track engine (provisional rules)** | MCHK/HKAM split at registration, minute-level proration, 2026–28 taxonomy, lightweight per-body rule packs, certificates, College export, multi-body-per-event (Task 10.8/10.9), prior-approval deadline advisory (Task 10.9/10.9) | ← **CURRENT** (rescoped 2026-08-10; Task 1 shipped 2026-08-13; task total widened to 9 on 2026-08-14 — Task 10.9 (prior-approval) builds BEFORE Task 10.8 (multi-body); task number is an identity, not a build-order index; see `docs/plans/PROJECT_STATE.md`) |
| **11** | Signed & verifiable | KMS-signed certificate verifies against the published key; public verify-this-record URL; staff TOTP mandatory | after Stage 10 |
| **12** | **Pilot (soft → public launch)** | 1–2 Specialty Colleges + 1 MCHK provider on provisional rule packs, 2 real accredited events, College export accepted, **invoice paid** | after Stage 11 · target Nov–Dec 2026 |
| **13** | **CPD engine (versioned rules) + platform** | the **deferred** work: versioned `body_rules`/`body_cycles`, the deterministic evaluator (**Q26**), roster ingestion, per-body ledger chains — plus evidence locker, session/track model, auditor portal, zh-HK | post-pilot |

> **Rescope logged 2026-08-10 (Ivan) — Decisions Log Q33.** Stages 9, 10, 12 and 13 were re-pointed at the dual-track CME/CPD launch. The versioned `body_rules` evaluator that used to be Stage 10 moved to **Stage 13**; it stays gated on Q26 and doctrine D.1. Rule 1 below forbids *silent* renumbering — this is the logged kind, and the alternative (appending as Stage 14, which would then run *before* 9–13 in calendar time) was considered and rejected as worse for the next reader. Scope record: `docs/plans/2026-08-10-dual-track-stage-scope.md`.

## Translating the old names

| Old term | Now |
|---|---|
| M1 · Sprint 1 | Stage 1 |
| Sprint 2 | Stage 2 |
| Sprint 3a | Stage 3 |
| Milestone A | Stage 4 |
| "CPD MVP Stages 0–8" | Stage 5 (its internal 0–8 were *task* numbers, not stages) |
| "M2 frontend unfreeze" · "Stage C / Stage T" | Stage 6 |
| Milestone B | Stage 8 |
| Milestone C | Stage 9 |
| **"M2" in `roadmap-to-mvp.md`** · Sprint 3b (the versioned-evaluator/body_rules content) | **Stage 13** ← corrected 2026-08-14; this row said "Stage 10" until then, which the Q33 rescope note two sections up directly contradicts (Stage 10 is now the *newer* "dual-track provisional-rules" work — different content, not a renumber of Sprint 3b) |
| M3 · Sprint 4 | Stage 11 |
| D / M4 · Sprint 5 | Stage 12 |
| E | Stage 13 |
| Phase 7 (Resend) · Phase 8 (deploy) · Phase 9 (cron) | Phase 9 shipped inside Stage 6; Phases 7–8 fold into Stage 8 |

## Rules

1. **Stages are sequential and never renumbered.** New work appends; it does not insert.
2. **Sub-work inside a stage is a numbered task** (`Stage 7 task 3`), never a nested stage or letter.
3. **Historical handoffs keep their original wording** — rewriting them would falsify the record. Translate via the table above; they are dated evidence, not instructions.
4. A stage is done only when its phase-completion checks pass — see `CLAUDE.md`.
