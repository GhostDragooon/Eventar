# Post-M2 execution map (2026-08-03)

_What happens after the M2 frontend unfreeze, sequenced by what is actually executable rather than by milestone number. Companion to `roadmap-to-mvp.md` (the spine) and `2026-07-12-program-plan-A-to-E.md` (per-phase scope/spec/exit)._

> **Goal restated (Ivan, 2026-08-02/03):** ship ASAP — all functionality up and running, then debugged and backtested for a stable beta. Judge every item against *"does a beta event fail without it?"* Sort everything into **BUILD GAPS** (code that doesn't exist or doesn't work — this is the job) and **INJECTION POINTS** (code complete, waiting on a value). Never report the second as a blocker.

---

## 0. The naming trap — read this first

**There are two different things called "M2" and they are not the same milestone.**

| Name | What it means | Status |
|---|---|---|
| **"M2" in `PROJECT_STATE.md`** | the **frontend unfreeze** for S-Organiser (tokens, shell, CPD config, scheduler) | ~90% done |
| **"M2" in `roadmap-to-mvp.md`** | **CPD engine live** — versioned `body_rules` + the deterministic evaluator + roster ingestion, *and* the freeze review | **engine half NOT STARTED**, double-gated |

We have done the **unfreeze half** of roadmap-M2. The **engine half** — the actual CPD value engine — has not started and cannot start: it is gated on Q26, which is gated on the body review (Milestone C), which is not scheduled.

So "after M2" does **not** mean "on to M3". It means: close the unfreeze half, then the path forks into work we control (deploy + hardening) and work we don't (the body).

---

## 1. Three deferrals whose stop-conditions have fired or fire next

`DEFERRED.md` items carry re-entry criteria. Three now matter, and **one has already been crossed**.

### 🔴 Item 56 — organiser↔body authorisation model. **TRIGGER FIRED.**

Its re-entry criterion reads: *"Before ANY surface (UI, API, or import) lets a non-service-role actor set `events.accrediting_body_id` — that surface cannot ship without this model."*

M2 Stage 3 shipped exactly that surface. Verified on the local stack 2026-08-03:

```
has_function_privilege('authenticated', 'set_event_cpd_config', 'EXECUTE') -> true
```

An authenticated organiser can bind their own event to any *active* accrediting body and self-assert accreditation. The **grant-layer** hole from the July review stays shut (the columns are still locked; only the audited definer writes them), and the function is role-gated, owner-checked, active-body-checked and capped at 24h — so this is **not** a security regression. What is missing is the **product** model: nothing represents which organisations may legitimately claim a relationship with which body.

`handoff_02082026.md` §5 acknowledged this in prose ("the organiser still self-asserts. Approval workflow is B3 / Milestone C") but `DEFERRED.md` was never updated. **This must close before any real body sees the platform** — it is the first question a body's review asks.

### 🟠 Item 57 — attendance-credit window is ±24h, not the real check-in window
Fires *"before the first real (non-demo) event issues credit"* → **Milestone B**. Underlying cause is unchanged: `self_check_in` enforces no time window, no `checkin_modes.self_serve` check and no publication check; the credit guard compensates at one remove.

### 🟠 Item 55 — global `credit_ledger` advisory lock has no acquisition timeout
Fires *"before the first real live event with meaningful concurrent check-in volume"* → **Milestone B**. Cheap knob (`SET LOCAL lock_timeout`, degrade to `skip` rather than block the scanner); per-body chains are the real fix at scale.

**Together these are the pre-Milestone-B gate.** None is a build gap today; all three become one the moment a real event runs.

---

## 2. Sequence

### N0 — Close the M2 unfreeze half *(executable now)*
1. **Stage 4 — roster licence eligibility** (`2026-08-02-m2-execution-plan.md` §3). Heed §3.2: `registrations` has no `user_id`, `public.users` has no email, organiser staff have **no read policy** on `practitioner_licences` — this needs a `SECURITY DEFINER` function mirroring `award_attendance_credit`, it is *not* a free RLS read.
2. **CPD config at event creation** — reuse `set_event_cpd_config()` from the create action; do **not** widen the RPC column whitelist.
3. **The two background fixes** (unaudited publish path; check-in mode never exposed). Both touch `app/events/new/actions.ts` — expect a conflict, rebase the second.
4. **Three-lens phase-completion protocol** — owed, never run for any M2 stage, not claimed anywhere.

### N1 — Full-stack backend review *(Ivan's explicit ask; executable now)*
Not the same as the three-lens protocol — that reviews *the diff*; this reviews *the system*. Suggested spine: grant/RLS matrix across all audited tables (Hard Rule 11 posture per table) · every `SECURITY DEFINER` function's gate + `search_path` + audit-last ordering · both hash chains under adversarial edit · the definer-function inventory against the audited-function-template debt (item 22, ~12 near-identical functions) · migration history two-sidedness · `get_advisors` clean.

### N2 — Frontend review *(after N1)*
Cold-start operator journey end to end; WCAG AA on every text-on-colour pair (Stage 1 shipped a 4.23:1 regression by adopting a token's *value* without its *role*); the 189 `text-[calc(...)]` sites are now scale-correct but still un-tokenised — unifying them onto the type scale is quality work needing sign-off on non-zero deltas (18px → `title-lg` is +2px across 34 sites).

### N3 — Milestone B, field-proven *(gated on Ivan's D0 go)*
Deploy track in strict sequence, each step verified before the next: CI-green replay → **Singapore provisioning** → Vercel (env matrix incl. `NEXT_PUBLIC_SITE_URL` **and now `CRON_SECRET`**) → **Resend cutover** (domain verify, remove `devEmailStub` at all call sites) → Turnstile → privacy notice → full prod backtest. Then the scheduler trigger goes back in (one file — `vercel.json` or pg_cron; **Vercel Hobby caps crons at once-daily, which would miss every reminder window**).
**Close items 55/56/57 before the first real event.** Exit: ≥3 real events, ≥50 check-ins, 0 integrity incidents, ≥1 referenceable NGO.

### N4 — Milestone C, body engaged *(parallel, external, the long pole)*
Outreach → review meeting → the **7+2 questions** → Q26 resolved. Re-evaluation trigger armed: B done + 4 weeks of dead outreach across both bodies → wedge review, **not more backend**.

### N5 — roadmap-M2 engine half *(only after C)*
Versioned `body_rules`/`body_cycles` per the Q26 arm · the deterministic evaluator (bounded grammar, never a general rules engine) · evaluator versioning (Q27) · issuance wired to real rule references · roster ingestion. Debt that must close here: items 25/26 (ledger + disputes CI coverage), 29/30 (licence not-found philosophies + `status='active'` gate), 31 (`record_credit_entry` cross-field validation), 32 (`is_manager()` app-layer parity), 34 (licence state machine).

### N6 — M3 signed & verifiable → N7 — D/M4 pilot
Per `2026-07-12-program-plan-A-to-E.md`. Unchanged by anything here, except that **the email cron listed in M3's scope already shipped** (`/api/cron/dispatch`, 2026-08-03) — M3 inherits only the certificate-issued notification and the trigger wiring.

---

## 3. Critical path is not engineering

N0–N2 are days. N3 is gated on one Ivan decision. **N4 is the long pole and it is someone else's calendar.** N5 cannot start before N4 lands. The single highest-leverage move remains scheduling the body review — it unblocks the engine, resolves Q26, and produces the pilot body in one conversation.

## 4. Ivan-critical, carried
D0 deploy go · price · first internal-meeting / body-review date · NGO intros · privacy-notice sign-off · HKCP manual sourcing · AWS account (M3) · type-scale delta sign-off (N2) · whether to reconcile the vault's Sprint-numbered roadmap body into the A–E spine.
