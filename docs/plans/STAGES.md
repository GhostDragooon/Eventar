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
| **7** | Hardening & pre-flight | ← **CURRENT.** Full backend + frontend review, the fired deferrals closed, unaudited publish path, check-in mode reachable | 🟡 in progress |
| **8** | Deploy & field-proven | Singapore → hosting → Resend cutover → Turnstile → privacy notice; ≥3 real events, ≥50 check-ins, 0 integrity incidents | gated on Ivan's deploy go |
| **9** | Body engaged | review meeting held; the 7+2 questions answered; Q26 resolvable; pilot proposal delivered | external — their calendar |
| **10** | CPD engine | versioned `body_rules`/`body_cycles`, the deterministic evaluator, roster ingestion, issuance against real rules | gated on Stage 9 |
| **11** | Signed & verifiable | KMS-signed certificate verifies against the published key; public verify-this-record URL; staff TOTP mandatory | after Stage 10 |
| **12** | Pilot | 1 body onboarded with real rules, 2 real accredited events, evidence pack accepted, **invoice paid** | after Stage 11 |
| **13** | Platform | external activities + evidence locker, session/track model, auditor portal, zh-HK, body #2 unaided | post-pilot |

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
| **"M2" in `roadmap-to-mvp.md`** · Sprint 3b | **Stage 10** ← the collision: this was never the same as "M2 frontend unfreeze" |
| M3 · Sprint 4 | Stage 11 |
| D / M4 · Sprint 5 | Stage 12 |
| E | Stage 13 |
| Phase 7 (Resend) · Phase 8 (deploy) · Phase 9 (cron) | Phase 9 shipped inside Stage 6; Phases 7–8 fold into Stage 8 |

## Rules

1. **Stages are sequential and never renumbered.** New work appends; it does not insert.
2. **Sub-work inside a stage is a numbered task** (`Stage 7 task 3`), never a nested stage or letter.
3. **Historical handoffs keep their original wording** — rewriting them would falsify the record. Translate via the table above; they are dated evidence, not instructions.
4. A stage is done only when its phase-completion checks pass — see `CLAUDE.md`.
