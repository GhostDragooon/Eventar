# Execution plans index — B through E

_2026-07-12. Companion to `2026-07-12-program-plan-A-to-E.md`. Milestone A has a full executable plan (`2026-07-12-milestone-A-executable.md`). This index gives B its runbook, C its checklist, and M2/M3/D/E honest skeletons — each states its **detailing gate**: the event that must happen before its full task-by-task plan can be written without guessing. Writing detailed SQL/UI plans ahead of these gates is exactly the mistake the standing rules prohibit._

---

## B — Field-proven: deploy runbook + trial cadence (detailing gate: NONE — executable now, starts on Ivan's D0 flip)

**Deploy sequence (each step verified before the next; becomes `docs/ops/deploy-runbook.md` as it executes):**
1. **Pre-flight:** CI replay/tamper job green (A-Task 7/8) · `supabase migration list` two-sided · backlog pushed.
2. **Singapore provisioning (Ivan creates project, agent migrates):** new project `ap-southeast-1` → `supabase link` → `db push` full chain → seed → smoke via MCP/SQL (`verify_audit_chain`, table counts) → Seoul relabelled dev/staging. Record project ref + keys in `.env.local`/Vercel only (Credentials note conventions).
3. **Vercel:** project linked to repo, env matrix set (`NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` → Singapore, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` = canonical URL, `RESEND_*`, `NEXT_PUBLIC_MAPBOX_TOKEN`). Deploy → all 19 routes smoke.
4. **Resend cutover:** domain verify → key live → **devEmailStub removal at all 3 call sites** per the Phase-7 removal protocol → smoke registration receives real email.
5. **Turnstile:** Ivan provisions Cloudflare keys → wire per ADR Finding 2 (public registration + login) → verify challenge fires for scripted traffic, not for humans.
6. **Privacy notice:** publish Ivan-approved notice; consent version bump in `lib/legalVersions.ts` if wording changes.
7. **Prod backtest:** full loop (register → email → self-check-in → staff scan → survey) + `pnpm test:rls` against staging (never prod ledger) + uptime/error alerting minimal setup.

**Trial cadence (weeks 1–4):** per event — pre-event checklist (seed real event, print poster, device kit) → live support during the event (incident log open) → same-week retro note (capture rate, friction: bug vs feature-parked) → fixes land freeze-safe only. Walk-in handling: design note the first time a door needs it; **build requires an explicit freeze-exception call from Ivan.**

**Exit:** Milestone B criteria (≥3 events, ≥50 check-ins, 0 integrity incidents, ≥1 NGO reference, runbook exists).

---

## C — Body engaged: checklist (detailing gate: NONE — mostly Ivan-executed; agent prepares + closes out)

1. Collateral final (A-Task 11 + Ivan's price) → outreach sent to HKCP CPD/education secretariat (Ivan).
2. **Fallback armed:** +2 weeks silence → MCHK send (identical pack).
3. Proxy dry-run: demo beats 1–6 + the **7+2 questions** rehearsed once against a friendly professional.
4. The meeting (Ivan): demo → questions (behavioural phrasing per review-prep Q5 rule) → pilot offer + price.
5. **Same-week close-out (agent):** answers captured verbatim → Decisions Log (Q26 resolved or explicitly still open; external-evidence policy; session-granularity fact) → review-prep statuses → 3b outlines annotated → pilot proposal/MoU draft.
6. Re-evaluation trigger stands: B done + 4 weeks dead outreach on both bodies → wedge review session, not more backend.

**Exit:** all 9 questions answered; pilot interest classified; proposal delivered.

---

## M2 — CPD engine (Sprint 3b): skeleton (detailing gate: **C's answers + Q26 resolution**)

**Why gated:** `body_rules` schema shape depends on the Q26 arm; evaluator grammar + caps depend on the body's actual rule semantics; reviewer workflow + PDF format are literally two of the review questions. Detailing SQL before C = building on guesses (the mistake the 3a/3b split exists to prevent).

**The executable plan, when written (at C close-out), will cover — task families already outlined in `2026-07-09-cpd-sprint-3b-design.md` + `2026-07-10-cpd-sprint-3b-engine-design.md`:**
E1 versioned `body_rules`/`body_cycles` (per Q26 arm, append-only, own chain if chained-table wins) · E2 deterministic evaluator (bounded grammar; floors/caps/categories incl. per-category minimums; **evaluator version pinned in outputs** — Q27) · E3 issuance wiring (attendance → `record_credit_entry` with rule refs) · E4 roster ingestion (uploads, mapping, diff, badge recompute) · E5 retro-trust upgrade · G1–G4 governance (accreditation confirmation w/ body reference, reviewer workflow + licence state-machine decision, PDF per body answer, cross-body per Q25) · debt closure (ledger CI fixtures via real transitions, `declare_licence` error copy, `record_credit_entry` cross-validation, `is_manager` parity) · **HKCP rules seed traceable line-by-line to manual/answers** · exit gate incl. the M2 freeze review with Ivan → unfreeze scope written.

**Standing spec constraints (already decided, not gated):** every new table multi-tenant + RLS + Hard-Rule-11 row + negative tests · audited definer mutations, audit-insert-last · security-reviewer lens mandatory · three-lens + live backtest with real HKCP fixture end-to-end.

---

## M3 — Signed & verifiable (Sprint 4): skeleton (detailing gate: **M2 shipped + unfreeze scope decided + body's PDF answer**)

Task families: AWS/KMS ops (timeboxed ½wk: ECC_P256 ap-east-1, IAM pair, CloudTrail alerts, keys in Vault) · Q28 formalized (KMS entry in Decisions Log) · `sign-certificate` (canonical payload → SHA-256 → `kms.Sign` → signed PDF on body template + `certificates` + hash-registry + revocation flag; payload-separate-from-presentation principle per Q28 note) · **verify-record public URL** (registry lookup page — first new public surface post-unfreeze) · TOTP mandatory + enrolment screen + `amr`-freshness gates on issue/revoke/publish-rules/roster-apply · pg_cron email jobs (reminder/survey/cert-issued; `queued`-is-terminal caveat) · calendar links in confirmation · **unfreeze wave 1** (two-theme tokens + settings toggle + organiser shell per approved scope, with ui-ux-pro-max + frontend-patterns bound into implementer prompts, e2e-runner coverage per surface).

**Exit:** offline + URL verification of a real certificate; stale-MFA blocked (proven); cron observed in `email_log` + inbox; e2e smoke green in CI.

---

## D/M4 — Pilot-complete (lean): skeleton (detailing gate: **M3 + pilot contract + pilot event dates**)

Task families: organiser accreditation UI (submit/status/reference) · **CPD Ledger wallet v1** (cycle card w/ real evaluator output, history w/ record refs, pass view — from approved mockups) · participants basics · walk-in mechanism (from B's design, now built) · pilot ops playbook (per-event: pre-flight checklist → live support → post-event verification ritual: credits posted correct, chain verified, body notified) · evidence pack hand-generation procedure · invoice issue/track.

**Exit:** the pilot success checklist all green (1 body real rules · 2 real events · ≥50 correct credits · pack accepted · invoice paid · 0 integrity incidents · practitioners self-serve their wallet).

---

## E — Production-ready: skeleton (detailing gate: **pilot retro + per-wave triggers**; waves get their own executable plans as they arm)

Waves (order per program plan §E, each an independent executable plan when its trigger fires):
**W1 External activities + evidence locker** — the backfill/new-joiner mechanism (Ivan 2026-07-12: past events + new joiners — practitioners arrive mid-cycle with existing records): manual entry w/ per-body taxonomies (the 12 collected forms are source material), Supabase Storage buckets (RLS-scoped, per-body retention enforcement + deletion jobs), **verification tiers** (`attendance_verified`/`organiser_attested`/`self_declared`) on ledger entries, tier-aware evaluator caps. Trigger: pilot retro / first onboarding cohort.
**W2 Session/track model** — sessions w/ rooms/tracks + roles (chair/panelist/presenter), per-session check-in mode, multi-track agenda + programme page (Schedule references), per-hour point attachment. Trigger: first multi-track accredited event (or pulled earlier if C's session-granularity answer demands).
**W3 Auditor portal (B6)** — invite-only accounts, case scoping, evidence-pack generator + offline verify instructions, host separation. Trigger: body asks for self-serve, or body #2 onboarding.
**W4 Org self-serve admin** — team mgmt on `set_staff_role`, org-scoped audit-log read surface, branding, consent-version surface. **Role-scoped concurrency requirement (Ivan 2026-07-12): organiser dashboards assume ~1 active event; administrator views (eventar_staff, body_admin) must present ALL concurrent events — RLS already scopes visibility; the UI work is admin-grade list/filter views.**
**W5 Communications v2** — segmented sends w/ consent checks, suppression, template gallery.
**W6 Reports v2** — cross-event trends, compliance snapshots. (zh-HK: pulled OUT of fixed waves per Ivan — trigger-driven: "pilot body/audience requires it".)
**W7 Production hardening** — strike ladder live, DR restore rehearsal, external security pass, observability dashboards, organiser + body-onboarding guides, support channel + SLA, pricing published. **Payments (Ivan 2026-07-12, vault Q30): Stripe as placeholder direction only, pass-through processing, multiple options later, structured to stay outside HKMA SVF/MSO licensing — no client-money holding, ever.**

**Exit = the program plan's End-state checklist + acceptance test: body #2 onboards without hand-holding.**
