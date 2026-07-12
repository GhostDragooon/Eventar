# Program plan A → E — scope, spec, outcomes, execution

_2026-07-12. The phase-level work plan for the consolidated roadmap (`roadmap-to-mvp.md` table). Planning only: each phase gets scope (in/out), spec, expected outcome (exit criteria), and a rough execution plan. Detailed executable plans are still written at each phase start (`superpowers:writing-plans`, task-by-task TDD) per standing convention — this document is the contract those plans implement._

**End-state commitment (what "product-ready at end of E" means)** — the checklist §E must fully satisfy:
1. **Functionally complete against the block map:** B1 events/attendance, B2 registry, B3 credit engine incl. external activities + evidence locker, B4 certification + public verify, B5 communications, B6 auditor evidence — all live. (B7 AI / B8 detection are advisory-by-design and demand-triggered; excluded from the production bar unless a body asks — see Q4.)
2. **Operationally ready:** CI (replay-from-zero + tamper + vitest + e2e) gating every merge; backups + a rehearsed restore; error alerting + uptime monitoring; incident + DSR runbooks exercised once.
3. **Security/compliance ready:** K1–K3 hardened (TOTP mandatory, Turnstile + strike ladder, grant matrix verified), external-grade security pass clean, PDPO artifacts final (privacy policy, consent versions, retention jobs per body), Singapore residency in force.
4. **Commercially ready:** pricing published, invoice-first billing operating, organiser guide + body-onboarding guide written, support channel + SLA stated, **and the acceptance test: accrediting body #2 onboards without hand-holding.**

**Cross-phase invariants (never relaxed):** three-lens phase-completion protocol (dev + user + security-reviewer on auth/PII/ledger surfaces) + live backtest before any "done" · three-layer validation on every mutation · audited definer functions, audit-insert-last · Hard Rule 11 grant posture with negative tests · frontend freeze until the M2 review, then only the approved scope · Q26 before anything config-referencing · no deploy by momentum · vault `Agent Working Method` governs process; sprint plans name the skills their subagents must use.

---

## A — Demo-ready *(now; ~3–5 agent working days)*

**Objective:** everything needed to walk into any room — internal, NGO, or body — with a working demonstration and credible collateral.

**Scope IN:** demo pack scripts (seed/reset/ledger-driver/template-render — task #6); replay-from-zero + chain/tamper CI harness (#3); `set_staff_role()` audited function + Hard-Rule-11 posture (#4); grant-hygiene batch + RLS `afterAll` fix (#5); collateral drafts under **CPD Ledger** naming (#7: product one-pager, trust one-pager, outreach email); graph refresh (#1); privacy-notice *draft* (sign-off in B); run-sheet rehearsal support.
**Scope OUT:** deploy (D0 held), all frontend, anything 3b.

**Spec:**
- `scripts/demo/seed-demo.ts` — Demo CPD Alliance org, Clinical Update Seminar pre-created as draft, 6 attendees (1 pre-registered), event start ≈ now+45 min so registration + check-in windows overlap; `reset-demo.ts` — teardown/reseed + both chains verified green; local stack only.
- `ledger-demo` — the trust-moment choreography: practitioner session → `declare_licence`; staff session → `verify_licence`; check-in → `record_credit_entry` (service-role); live `UPDATE` rejected `42501`; superuser tamper caught by `verify_ledger_chain()`; presentable output.
- Template-render script — confirmation + reminder (per-attendee, data-URI QR standing in for the `cid:` attachment).
- CI: local script + GitHub Actions job — spin local stack, `supabase db reset` (all migrations + seed), assert both chain verifiers green, one owner-level tamper caught. Green before Singapore ever provisions.
- `set_staff_role(p_staff_id, p_role)` — SECURITY DEFINER, staff-gated, writes `staff_role_changed` audit event last; column-level or trigger posture so role changes cannot bypass it (design call at task start); negative tests assert `42501` specifically.
- Grant hygiene: explicit `revoke ... from public` on the 3 residual bare-PUBLIC entries with `pg_proc.proacl` re-query proof; RLS suite `afterAll` error-checking sweep.
- Collateral: one-pager (loop diagram, CPD Ledger integrity story, pilot structure, price placeholder), trust one-pager (chain design, grant matrix, Q24 retention citations, replay posture), 5-sentence outreach email to a CPD/education-committee secretariat.

**Expected outcome (exit):** run sheet rehearsed twice under 15 minutes (Ivan rehearses; scripts verified end-to-end by agent beforehand); tamper rejection demonstrated live; CI job green twice consecutively; tasks #1, #3–#7 closed; collateral final except the price figure; PROJECT_STATE + handoff updated after the three checks.

**Execution (rough):** order #6 → #3 (shared local-stack work) → #4 → #5 → #7 → #1. Each engineering task: TDD, static gates, per-task review; #4/#5 additionally get the security-reviewer lens. Atomic commits; one phase-completion pass at the end covering the batch.
**Ivan during A:** price decision; pick the first internal-meeting date; rehearse.

---

## B — Field-proven *(weeks 1–4; ops-led, engineering in support)*

**Objective:** the platform hosted and proven on real events with real attendees — zero integrity incidents.

**Scope IN:** D0 flip → deploy track: CI-green replay → **Singapore provisioning** (fresh project, migrate, Seoul → dev/staging) → Vercel (env matrix incl. `NEXT_PUBLIC_SITE_URL`) → **Resend cutover** (domain verify, devEmailStub removal at all 3 call sites, smoke registration) → **Turnstile** wiring per ADR → privacy notice published → full prod backtest (all 19 routes + registration→email→check-in→survey). Then: 2–3 internal-meeting trials, 2–3 NGO trial events, friction triage (bug fixes only — freeze holds; feature asks parked for M2), minimal observability (uptime check + error alerting), **walk-in handling designed** the first time a door needs it (build only on explicit freeze-exception call).
**Scope OUT:** any new surface, 3b, paid tickets.

**Spec:** deploy runbook committed as it executes (becomes the ops doc); per-event trial retro note (capture rate, incidents, friction list); NGO reference quote collected.

**Expected outcome (exit):** ≥3 real events end-to-end on the hosted URL, ≥50 real check-ins, **0 integrity incidents**, ≥1 referenceable NGO, capture-rate ≥80% on QR flows, friction list fully triaged, deploy runbook exists.

**Execution (rough):** week 1 = deploy track (sequenced, each step verified before the next); weeks 1–4 = trial cadence with agent on live support during events + same-week fixes. Incident log from day one.
**Ivan during B:** D0 go; NGO intros + scheduling; privacy-notice sign-off; run the events.

---

## C — Body engaged *(parallel to B; lands weeks 4–6 on their calendar)*

**Objective:** the external validation gate: real answers from a real accrediting body + a pilot agreement in motion.

**Scope IN:** finalize outreach (from #7) → Ivan sends to HKCP's CPD/education secretariat; **MCHK fallback activates at +2 weeks of silence**; proxy dry-run of demo + questions; the review meeting (demo beats 1–6, then the **7+2 questions** — original seven plus external-evidence handling and session-granularity, behavioural phrasing per the Q5 rule); same-week close-out: answers → Decisions Log (Q26 resolved or explicitly still open), review-prep statuses updated, 3b outlines annotated; pilot proposal/MoU draft with price.
**Scope OUT:** any 3b SQL before the answers exist.

**Expected outcome (exit):** meeting held; all 9 questions answered verbatim-captured; Q26 resolvable; external-activity evidence policy and session-vs-event point attachment known; pilot interest classified (committed / warm / dead) and proposal delivered.

**Execution (rough):** outreach send early in B (latency is theirs); dry-run any week; meeting when it lands; close-out ritual is one agent-session. **Re-evaluation trigger armed:** Milestone B done + 4 weeks of dead outreach across both bodies → wedge review (organiser-first or white-label), not more backend.

---

## M2 — CPD engine live *(Sprint 3b; ~2–3 weeks engineering after C)*

**Objective:** the actual CPD value engine — credits evaluated against real, versioned body rules — plus the freeze-ending review.

**Scope IN — engine half:** `body_rules` + `body_cycles` versioned per the Q26 resolution (append-only config, chained per the winning arm); the **deterministic evaluator** — bounded grammar, never a general rules engine — computing floors/caps/categories (the body documents confirm the shapes: per-category floors, ≤N-of-M caps, per-activity ceilings); **evaluator versioning** (Q27: verdict outputs pin the evaluator version); issuance wiring (attendance → `record_credit_entry` with real rule references); roster ingestion (uploads, column mapping, diff, verification-badge recompute); retro-trust upgrade model. **Governance half:** accreditation confirmation workflow (submit → confirmed with body reference), reviewer workflow per review answers, PDF format per body answer, cross-body mechanics per Q25. **Debt that must close here:** credit-ledger + disputes CI coverage via real event-transition fixtures; `declare_licence` FK-error message; `record_credit_entry` cross-field validation; licence-status state-machine decision; `is_manager()` app-layer parity when the first `organiser_admin` is provisioned.
**Then the M2 freeze review with Ivan** → scoped unfreeze decision (task #8 theme/organiser shell + which surfaces, per the mockups-v2 artifact and IA spec).
**Scope OUT:** signing (M3), external activities (E — unless Q2 answer pulls schema-readiness earlier), session/track UI.

**Expected outcome (exit):** end-to-end backtest with the real HKCP ruleset: fixture event + attendance → correct ledger entries including cap/floor edge cases and an unmatched-body case; both chains verify; roster round-trip proven; three-lens protocol passed; **M2 review held and unfreeze scope written down.**

**Execution (rough):** executable plan first; subagent-driven development with per-task spec + quality review; security-reviewer lens on every new definer function; migrations via CLI `db push`; live backtests throughout; answers-to-schema traceability (each rule cites its source answer or document).

---

## M3 — Signed & verifiable *(Sprint 4; ~2–3 weeks)*

**Objective:** records a third party can verify without trusting us — plus the first approved frontend wave.

**Scope IN:** AWS/KMS setup (ECC_P256 sign-only in ap-east-1, IAM users, CloudTrail alerts, keys in Supabase Vault — ops timeboxed ½ week); Q28 formalized (KMS as the MVP signing mechanism earns its Decisions Log entry); `sign-certificate` flow (canonical payload → SHA-256 → `kms.Sign` → signed PDF via the body-approved template + hash-registry row + revocation flag); **verify-this-record public URL** (registry lookup: paste/scan a record ref → chain + signature verified ✓); **staff TOTP mandatory** + minimal enrolment screen (the one standing freeze exception) + `amr`-freshness gating on sensitive actions; email cron lands (pg_cron → existing reminder/survey actions + certificate-issued notification; `queued`-is-terminal respected); **calendar links** (.ics + Google/Outlook) in the confirmation email; **unfreeze wave 1** per the M2 scope call: two-theme token system + settings toggle + the organiser shell (sidebar, counted tabs, readiness strip, needs-attention queue).
**Scope OUT:** auditor portal, external activities, wallet v1 (D), AI/detection.

**Expected outcome (exit):** a certificate issued from a real completed event verifies offline against the published public key AND via the public URL; stale-MFA attempt provably blocked; cron sends observed in `email_log` + real inboxes; theme + shell shipped and passing the full protocol; e2e smoke (register → check-in → issue → verify) green in CI.

**Execution (rough):** AWS ops first (timeboxed), signing flow TDD against fixtures, then cron + calendar links, then the frontend wave with ui-ux-pro-max + frontend-patterns bound into implementer prompts and e2e-runner coverage per surface.

---

## D / M4 — Pilot-complete, lean cut *(~2 weeks engineering + pilot events on the body's calendar)*

**Objective:** the paid pilot executed to its written success criteria.

**Scope IN:** thin UI slice — organiser accreditation UI (submit, status, reference) and **CPD Ledger wallet v1** (cycle card with floors/caps from the real evaluator, credit history with record refs, pass view — straight from the approved mockups) + participants basics; HKCP rules seeded from their manual (sourced by then via the pilot relationship); **2 real accredited events** run end-to-end with real practitioners; evidence pack hand-generated and **accepted by the body's administrator**; invoice issued and **paid**; support runbook v1; walk-in mechanism live (from B's design).
**Scope OUT (deliberately deferred to E):** auditor self-serve portal, external activities (default — see Q2), session/track UI, AI/detection, segmented comms.

**Expected outcome (exit):** the pilot success checklist, all green: 1 body onboarded with real rules · 2 real events · ≥50 real credits issued and correct against the rules · evidence pack accepted · invoice paid · 0 integrity incidents · practitioners can see their credits in the wallet unaided.

**Execution (rough):** UI slice via subagent-driven dev with heavy user-lens review (cold-start practitioner journey); pilot ops playbook (pre-event checklist, on-site support, post-event verification ritual per event); per-event retro feeding E's backlog.

---

## E — CPD platform, production-ready *(post-pilot; ~6–10 weeks engineering across a quarter, trigger-paced)*

**Objective:** close the gap from "pilot-grade with one body" to the §"End-state commitment" checklist — a product a second body adopts without us in the room.

**Scope IN (waves, roughly in order):**
1. **External activities + evidence locker** — manual entry with per-body activity taxonomies (the 12 collected forms are the source material), evidence upload (Supabase Storage, RLS-scoped buckets, per-body retention enforcement + deletion jobs), **verification tiers on every ledger entry** (`attendance_verified` / `organiser_attested` / `self_declared`), evaluator consumes tier-aware caps (e.g. self-study ceilings). *This is the wave that makes the CPD Ledger a complete cycle record.*
2. **Session/track model** — sessions with rooms/tracks + per-session roles (chair/panelist/presenter), per-session check-in mode, multi-track agenda UI + public programme page (per the Schedule references), per-hour point attachment where body rules demand it.
3. **Auditor portal (B6)** — invite-only auditor accounts, case scoping, evidence-pack generator (ZIP + manifest + offline chain-verification instructions), `audit.` host separation.
4. **Org self-serve admin** — team management on `set_staff_role`, org-scoped audit-log read surface, branding, consent-text versions surface.
5. **Communications v2** — segmented sends with consent checks, suppression/bounce handling, template gallery.
6. **Reports v2 + zh-HK** — cross-event trends, compliance snapshots per body; traditional-Chinese pass on practitioner-facing surfaces first (Q5 default).
7. **Production hardening to the checklist** — strike ladder live, DR restore rehearsal, external-grade security pass, observability dashboards, organiser + body-onboarding guides, support channel + SLA, pricing published.
8. *(Demand-triggered, possibly post-E:)* B7 AI tagging with full cost containment; B8 detection flags; bulk-verify endpoint; VCs/TSA anchor — each already has a DEFERRED trigger.

**Expected outcome (exit — the acceptance test):** every item in §"End-state commitment" checked, demonstrated by **onboarding accrediting body #2 end-to-end without hand-holding** (their rules seeded from documents + one config session, their first accredited event run, their evidence pack accepted) — plus one full quarter of operation with zero integrity incidents.

**Execution (rough):** each wave = its own executable plan → TDD → three-lens → live backtest → DEFERRED sweep, exactly like every sprint before it; waves 1–2 sequenced first (biggest product gaps), 3–7 interleaved with pilot-driven demand; quarterly roadmap re-review against real usage; the standing re-entry triggers in DEFERRED keep governing anything not explicitly scheduled.

---

## Effort + critical path summary

| Phase | Engineering effort | Wall-clock driver |
|---|---|---|
| A | 3–5 agent days | us |
| B | ~1 wk deploy + support | trial calendar (ours/NGOs') |
| C | days (drafting + close-out) | **the body's calendar — the program's long pole** |
| M2 | 2–3 wks | starts only after C |
| M3 | 2–3 wks | AWS setup inside |
| D/M4 | ~2 wks + events | body's event dates |
| E | 6–10 wks across a quarter | pilot feedback + triggers |

Cumulative: **pilot ~10–14 weeks out; production-ready (end of E) realistically ~2 quarters out** — with the body's calendar, not engineering, as the dominant term in both. Anything that shortens the C long pole (warm intro, earlier meeting) pulls the whole program left.

## Open questions (defaults baked in — silence = defaults hold)

1. **Pilot event shape** — single-track seminar (default) or multi-track conference? If conference: session/track schema-readiness moves from E-wave-2 into M2, and per-session check-in into D.
2. **Manual external entries in the pilot?** Default: OUT of D, first wave of E — pilot story is "attendance-verified credits first." Pull IN only if the body review says a partial cycle picture kills pilot value.
3. **Billing through E** — stay invoice-first (default), Stripe self-serve only when body #2/#3 demands it?
4. **B7 AI / B8 detection** — excluded from E's production bar (default; they're advisory-by-design with cost/abuse surface), shipped post-E on demand?
5. **zh-HK depth** — practitioner-facing surfaces first (default), organiser side later?
6. **Support model through E** — founder-run + docs + stated SLA (default), or a ticketing tool earlier?
