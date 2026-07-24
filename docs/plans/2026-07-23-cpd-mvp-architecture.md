# CPD Platform — Full Architecture with MVP Highlight (2026-07-23)

> ⚠️ **OPEN / LIVING DOCUMENT — subject to further update.** This is not a frozen spec. Tags, tiers, and components will change as the build progresses, the body review lands, and Ivan revises scope. Treat every 🟢/🟡/🔵/⚪ as provisional. Canonical copy lives in the Obsidian vault (`20 — Roadmap/CPD MVP — Architecture (2026-07-23).md`); this repo copy is the build-facing mirror.
>
> **Status:** OPEN DRAFT for Ivan's review. Feeds the execution plan.
> **Two calls signed off (2026-07-23):**
> 1. Target = **full product map**, MVP is the highlighted slice within it — every deferred feature is a real requirement with a home, nothing dropped.
> 2. **Config-free attendance issuance is admissible into B3 before Q26** — a raw tamper-evident credit with a snapshot `cpd_hours` and NO `body_rules` evaluation writes no config reference, so it threads doctrine #6 and does not pre-empt Q26. *Stated as **implementation doctrine** — the contract may change when body-rule evaluation lands; not a universal architectural truth.*
> 3. **Reconcile is core (🟢), not optional** (2nd review, Decision C) — the decoupled attendance/credit design makes it the recovery path AND the retroactive-post path once an attendee resolves to a licence later.
>
> Grounds in `docs/architecture/BLOCK-ARCHITECTURE.md` (the block map). All reviewer points + their resolutions are tracked in the execution plan's **Issues Raised → Resolution** table (`docs/plans/2026-07-23-cpd-issuance-execution-plan.md`).

## Runtime Contract (design invariants — mirrored in the execution plan)
1. **Attendance is authoritative for presence** — a credit failure never changes or rolls back attendance.
2. **Credit is best-effort + eventually consistent** — issued inline on a fresh check-in (`result === 'ok'`); transient misses + late-resolving identities heal via **reconcile [H, 🟢]**.
3. **Idempotency is enforced at the DB** (partial unique index), not by app control flow alone.
4. **Two transactions by design** — attendance (B1) and credit (B3) stay decoupled so B1 never depends on B3 and attendance never rolls back on a credit error (Decision A).

## Legend
`🟢 MVP-Primary` must-have — the loop is broken/unsafe/unauditable without it ·
`🟡 MVP-Secondary` nice-to-have — demo works without it, cheap to add ·
`🔵 Deploy-gate` not needed for the seeded demo, required before real public users (the D0 list) ·
`⚪ Full` real requirement, outside the MVP slice (accreditation, scale, extra surfaces).
State: ✅ shipped · 🟡 partial · ⏳ substrate-only/unwired · 📋 planned · 🔒 gated.

---

## Tier 0 — Kernel (constitutional; changes need a Decisions Log entry)

| Block | Capability | State | Tier |
|---|---|---|---|
| **K1 Identity & Access** | multi-tenancy (`organisations`, RLS, 5-role) | ✅ | 🟢 |
| | staff auth (login) | ✅ OTP/magic-link | 🟢 |
| | PDPO: consent / DSR / `pseudonymise_user` (backend) | ✅ | 🟢 (privacy-notice **sign-off** = 🔵) |
| | **2FA / staff password+TOTP MFA** | ⏳ S4 | 🔵 (single-factor fine for demo) |
| | self-serve **attendee accounts** (OTP + registration linking) | ⏳ substrate | ⚪ (unlocks self-serve credit) |
| **K2 Integrity Substrate** | `audit_events` chain, `write_audit_event`, HR11 grant posture, replay | ✅ | 🟢 (the tamper-evidence the credit rides) |
| **K3 Security Shell** | RLS, `requireStaff`, rate-limit, no-PII-logs, report-only CSP/headers | ✅ | 🟢 (never-lazy-about-security baseline) |
| | **Turnstile / bot strike-ladder** | ⏳ needs Cloudflare keys | 🔵 (bot-protection before public) |
| | abuse-tier wiring (`withSecurity`/`abuseTier`) | ⏳ substrate | ⚪ (wires with first authed attendee surface) |

## Tier 1 — Domain blocks

| Block | Capability | State | Tier |
|---|---|---|---|
| **B1 Events & Attendance** | create · publish · register · check-in (self+staff) · survey · analytics · QR · .ics | ✅ | 🟢 **core loop** |
| | `events.accrediting_body_id` + `cpd_hours` (CPD config) | **NEW** | 🟢 (min a credit needs) |
| | `cpd_points` · `cpd_category` · per-session CPD values | — | ⚪ |
| | event-field **freeze-after-first-attendance** trigger *(reviewer #4)* | **NEW** | 🟡 (ledger already tamper-safe via snapshot; guards future-credit consistency) |
| **B2 Professional Registry** | licences, 8 HK bodies, `declare_licence` | ✅ 3a | 🟢 (credit needs licence@body — seeded for demo) |
| **B3 Credit Engine** | `credit_ledger` + `record_credit_entry` (issuance mechanics) | ✅ 3a | — |
| | **Attendance-Verified Issuance (config-free)** — the MVP build | **NEW** | 🟢 (detailed below) |
| | reconcile / retry / `pending_credit` reliability | **NEW** | 🟡 reconcile · ⚪ retry-queue |
| | evaluator + versioned `body_rules`/cycles + disputes + roster ingestion | 🔒 Q26 | ⚪ **(accreditation)** |
| **B4 Certification & Signing** | KMS signing, signed PDF, hash registry, revocation | 📋 S4 | ⚪ (demo Beat 6 "next release") |
| **B5 Communications** | email templates + `email_log` (insert-first) | ✅ | 🟢 (stub/rendered for demo) |
| | real send: Resend cutover + pg_cron | ⏳ devEmailStub | 🔵 |
| **B6 Audit & Evidence Access** | auditor identities, evidence packs, offline verify | 📋 S5 | ⚪ |
| **B7 Assistive AI** | tagging/summary, advisory-only, cost containment | 📋 S5 | ⚪ |
| **B8 Behavioural Detection** | `request_events`, scoring → flags, never auto-action | 📋 S5 | ⚪ |
| **B9 Commercial — PAYMENT** | Q30 pass-through (Stripe placeholder); **invoice-first = zero code** for the pilot | future | ⚪ (payment code post-M4; pilot invoices) |

## Tier 2 — Surfaces (thin by contract; rules live behind Server Actions/definer fns)

| Surface | Capability | State | Tier |
|---|---|---|---|
| **S-Public** | event **discovery/finder** (`/events` + `/events/[id]`), register, self-check-in, survey | ✅ basic | 🟢 (browse+register shipped) |
| | search / filter by body·category·CPD·date · calendar view | — | ⚪ (finder enhancement) |
| **S-Organiser** | create/publish/roster/analytics | ✅ **frozen** | 🟢 (CPD-value via **seed**, not a new field, under freeze) |
| **S-Attendee** | wallet / "my CPD" readout | 📋 post-M4 | ⚪ (credit shows via ledger readout for demo) |
| **S-Auditor** | evidence portal | 📋 post-M4 | ⚪ |
| **S-Integration** | external API | 📋 post-M4 | ⚪ |

## Cross-cutting — UX & Performance (all ⚪ Full, land with the M2 frontend unfreeze)

The frontend freeze holds until the M2 review, so none of these are MVP — they're real full-product polish that ships when surfaces unfreeze. Each prefers the **native/already-installed** primitive over a new dependency (ponytail).

| Item | Build on (native/installed, not a new dep) | State | Tier |
|---|---|---|---|
| **Skeleton loaders** | Next.js `loading.tsx` route convention (a `Loading()` component already exists) — per-surface skeletons | ⏳ post-freeze | ⚪ Full |
| **Caching** | *data layer* (may land earlier, non-frozen): Next 16 fetch/`revalidate` + `unstable_cache`, DB indexes. *client layer*: React 19 primitives before any SWR/React-Query dep | ⏳ (data slice can precede unfreeze) | ⚪ Full (data slice ⚪-earlier) |
| **Optimistic rendering** | React 19 `useOptimistic` on mutations (check-in, register) — no library | ⏳ post-freeze | ⚪ Full |
| **Tooltips** | `@base-ui/react` (already a dependency) Tooltip primitive — no new dep | ⏳ post-freeze | ⚪ Full |

> These bind to the **S-Attendee / S-Organiser** surfaces. They cannot enter the MVP without breaking the freeze; they're logged here so the unfreeze plan (post-M2) already carries them. `caching`'s data-layer slice (query indexes, route revalidation) is the one piece that could land earlier as backend work if a real surface shows measurable slowness — decide then, don't pre-optimise.

---

## B3 Attendance-Verified Issuance — component design (reviewer comments folded in)

The one **NEW** build for the MVP. Config-free: no `body_rules`, no evaluation — a raw `attendance_verified` credit with a snapshot value.

```
 B1 ATTENDANCE  self-check-in │ staff scan │ [roster import → ⚪]
      │  ── FRESH transition ONLY  (idempotency lever: the existing 'already' return + row lock)
      ▼
 [D] ELIGIBILITY GUARD  event is CPD? (body_id + cpd_hours>0)  ──no──▶ log "not_cpd", stop
      ▼
 [E] IDENTITY RESOLUTION  registration.email → K1 user → B2 active licence @ event.body
      │   normalize lower(trim()); no match ──▶ log "no_licence", stop  (the DEFAULT pre-self-serve)
      ▼
 [G] ISSUANCE  record_credit_entry(attestation='attendance_verified', hours=snapshot, body=event.body, effective_date)
      │   [C] partial-unique (user_id,event_id) WHERE entry_type='attendance'  ──conflict──▶ idempotent skip
      ▼
 K2 LEDGER  append-only · hash-chained · own advisory lock · tamper-evident
      ├─ [F] OBSERVABILITY  structured outcome: issued │ skipped(reason) │ failed
      ├─ RELIABILITY  [H] idempotent reconcile ···→··· [J] retry wrapper + pending_credit + queue
      ├─ IMMUTABILITY  value snapshot = inherent ···→··· [I] event-field freeze trigger
      └─ [KS] KILL SWITCH  one guard disables issuance; attendance keeps working
      ▼
 SURFACE  [MVP: ledger/SQL readout + existing tamper beat] ···→··· [M] S-Attendee wallet
```

| | Component | Reviewer | Tier |
|---|---|---|---|
| A | `events.accrediting_body_id` + `cpd_hours` | plan | 🟢 |
| B | Fresh-transition idempotency gate (award only on real check-in) | #1 | 🟢 |
| C | Partial unique index `(user_id,event_id) WHERE entry_type='attendance'` *(re-keyed — no `registration_id` in ledger)* | #1 | 🟢 |
| D | Eligibility guard — skip non-CPD events | #2 | 🟢 |
| E | Identity resolution, `lower(trim())` normalized | #5 | 🟢 |
| F | Structured outcome logging (issued/skipped/failed + reason) | #3,#5,#6 | 🟢 |
| G | Issuance `attendance_verified` + inherent value snapshot | #4 | 🟢 |
| KS | Kill switch (disable issuance, attendance survives) | guardrail | 🟢 |
| O | Tests: idempotency · non-CPD · no-match · (RLS-writer *already* HR11-covered) | #6 | 🟢 |
| H | Idempotent reconcile — heals transient misses + posts retroactively when an attendee resolves later | #3,#10,#12 | 🟢 **(promoted)** |
| I | Event-field freeze after first attendance (trigger) | #4 | 🟡 |
| J | Retry wrapper + `pending_credit` + reconcile job/queue | #3 | ⚪ |
| K | `creditIssued` status in attendance API response | #3 | ⚪ (needs unfrozen UI to show) |

**Reviewer resolution summary:** #1 idempotency → primary lever is the fresh-transition gate (covers self+staff, double-click, retry, race via the existing row lock), unique index re-keyed to real columns as the backstop · #2 guard → one line, primary · #3 partial-failure → log now (primary), retry/queue is the ⚪ full-product tier · #4 snapshot is inherent+primary, freeze-trigger is 🟡 · #5 normalize+log → primary · #6 the 4 named tests → primary, RLS-writer already covered by HR11.

---

## The MVP, stated plainly

**🟢 MVP-Primary (the shippable demo):** K1 staff-auth + multi-tenancy · K2 chain · K3 baseline security · B1 core loop + CPD-config columns · B2 registry (seeded) · **B3 config-free issuance (A,B,C,D,E,F,G,KS,O) + H reconcile** · B5 stub email · S-Public browse+register · S-Organiser (frozen, seed-driven). Result: one real attendance = exactly one tamper-evident credit — idempotent (across both paths, retries, and a true race), guarded, observable (ids only), killable, and **reconcilable** — on seeded identities.

**🟡 MVP-Secondary (one item, Ivan's call to include):** I event-field freeze trigger — the ledger is already tamper-safe via the value snapshot; this only guards future-credit consistency.

**🔵 Deploy-gates (before real public users, the D0 list — not demo blockers):** Turnstile · real email (Resend) · staff TOTP 2FA · privacy-notice sign-off · Singapore provisioning.

**⚪ Full product (real, deferred, each gets a `DEFERRED.md` re-entry row):** B3 evaluator/`body_rules` (accreditation, Q26) · B4 signing · B6 auditor · B7 AI · B8 detection · B9 payment · self-serve attendee accounts + wallet (S-Attendee) · advanced finder · retry-queue · roster ingestion · zh-HK/i18n · **UX/perf polish (skeleton loaders, caching, optimistic rendering, tooltips — post-M2 unfreeze)**.

## Admission checklist (B3 issuance — passes)
① block = B3 issuance (config-free) · ② writes via `record_credit_entry` definer, `credit_ledger` append-only per HR11, reads via RLS · ③ consumes B1/B2/K2, no kernel edit (event columns are B1) · ④ kill switch [KS] disables without orphaning · ⑤ ⚪ items carry `DEFERRED.md` re-entry rows.

## Execution plan
Full task-by-task plan (rev.1, with the Issues-Raised→Resolution log): `docs/plans/2026-07-23-cpd-issuance-execution-plan.md`. Shape: migration (A,C) → helper (D,E,F,G,KS) → wire both paths (B, explicit serverless-safe try/catch) → seed → live invariant tests incl. a `Promise.all` race (O) → **reconcile (H, 🟢)** → run-sheet + close-out. 🟡 I (event-freeze) only if included. Everything ⚪ → `DEFERRED.md`.
