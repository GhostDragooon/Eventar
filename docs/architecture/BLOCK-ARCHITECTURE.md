# Block Architecture — the system skeleton and its guardrails

_Written 2026-07-11 per Ivan's direction: a framework all subsequent work must fit into, as add-on blocks against a stable core. **Structure only — no component detail here.** Detail lives in the vault architecture notes and per-sprint plans. Change control: this doc is a guardrail; altering the block map or fitting rules is a flagged decision (stage into vault Decisions Log as Q29 when Ivan locks it)._

## The shape: a modular monolith

One deployable app (Next.js) + one Postgres (Supabase). **Modularity is enforced at the data layer** — table ownership, RLS, grants, and SECURITY DEFINER functions as the internal API — not by splitting services. Blocks are logically separate, physically co-located. This is deliberate: a solo-operated trust platform needs hard internal boundaries and zero distributed-systems overhead.

```
┌─────────────────────── Tier 2 — SURFACES (thin, replaceable) ───────────────────────┐
│  S-Public      S-Organiser      S-Attendee       S-Auditor        S-Integration      │
│  (reg/checkin/ (staff routes —  (wallet —        (portal —        (/api/* cron +     │
│   survey)       LIVE, unfrozen   post-Stage 13)   post-Stage 13)   future API)       │
│                  2026-08-01)                                                        │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
┌─────────────────────── Tier 1 — DOMAIN BLOCKS (the product) ─────────────────────────┐
│  B1 Events &      B2 Professional   B3 Credit        B4 Certification                │
│     Attendance       Registry          Engine            & Signing                   │
│  [SHIPPED]        [SHIPPED]        [GATED → 13]      [PLANNED → 11]                  │
│                                                                                       │
│  B5 Communications  B6 Audit &        B7 Assistive AI   B8 Behavioural Detection     │
│  [PARTIAL]             Evidence          [PLANNED → 13,     [PLANNED → 13,           │
│                     [PLANNED → 13]       advisory-only]      advisory-only]          │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
┌─────────────────────── Tier 0 — KERNEL (constitutional) ─────────────────────────────┐
│  K1 Identity & Access      K2 Integrity Substrate      K3 Security Shell             │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

**Dependency direction is one-way: Tier 2 → Tier 1 → Tier 0.** Nothing in the kernel knows a domain block exists. Nothing in a domain block knows a surface exists.

## Tier 0 — Kernel (constitutional: changes need a Decisions Log entry)

- **K1 Identity & Access** — tenancy root (`organisations`), `users` mirror, `staff` + 5-role model, native auth (attendee OTP / staff password+TOTP), the RLS regime, `requireStaff`/`require_active_staff`. *Owns the question: who is acting, for which tenant, with what standing.*
- **K2 Integrity Substrate** — the `audit_events` hash chain + `write_audit_event`, the chain *mechanics* every trusted record reuses (advisory-lock sequencing, GUC-pinned deterministic hashing, append-only grant posture per Hard Rule 11, audit-insert-last), the replay-from-zero property, migration discipline. *Owns the question: can anyone silently change the past.* (Note: `credit_ledger` is B3's **data**, built by applying K2's **mechanics** — the substrate stays domain-blind.)
- **K3 Security Shell** — `withSecurity` wrapper, rate limiting, abuse tiers, Turnstile/strike ladder (pending keys), CSP/headers, no-PII-in-logs. Enforcement acts on **measurements only**; inference produces flags (see B8). *Owns the question: is this request allowed to happen at this rate, in this shape.*

## Tier 1 — Domain blocks

| Block | Status | Owns (tables/functions) | Consumes |
|---|---|---|---|
| **B1 Events & Attendance** | ✅ shipped (pre-pivot backbone) | events, agenda_blocks, registrations, check-ins (self/staff), surveys, speaker check-ins, posters/QR | K1, K2, K3 |
| **B2 Professional Registry** | ✅ shipped (Stage 3); **Stage 10 in progress** — MCHK + 15 HKAM Colleges seeded 2026-08-13; **primary-licence-per-body shipped 2026-08-14** (Task 10.2/10.9 — `practitioner_licences_one_primary_idx` re-scoped to `(user_id, body_id)`, so one practitioner can hold `is_primary=true` at more than one body at once, per ADR-0001 §4(b); `declare_licence` gained `track`/`cycle_started_on` and a `status='active'` check on the body, closing DEFERRED item 30 — **block-contract tier change**, the function's signature and guard shape both widened); **the prior-approval deadline advisory shipped 2026-08-14** (Task 10.9/10.9 — `accrediting_bodies.cycle_config` carries a sourced `prior_approval` key per body, read-only, advises but never gates `set_event_cpd_config`); **multi-body-per-event newly in scope for 2026** (D-A, settled — `docs/adr/0002-multi-body-accreditation.md`): one event can carry many simultaneous accrediting bodies, reversing the "one event, one body" assumption `events.accrediting_body_id` (a single scalar UUID) was built on; **✅ schema + backfill + compatibility bridge shipped 2026-08-15** (Task 10.8/10.9, sub-task C3 — `20260815020000_accreditation_groups_and_roles.sql`): `event_accreditation_groups`/`event_accreditations`/`event_accreditation_occurrences`/`registration_roles`, the tie-validation guard, the credit-freeze extension, and `set_event_cpd_config()`'s existing single-body surface now transparently syncs into the new tables as a degenerate one-group case so no event falls through a gap with legacy columns set but no accreditation-group row — **the multi-body organiser UI (C5) is not built**, this is still a single-body-at-a-time write surface underneath | accrediting_bodies, organisers, practitioner_licences + licence lifecycle functions, event_accreditation_groups/event_accreditations/event_accreditation_occurrences/registration_roles | K1, K2 |
| **B3 Credit Engine** | 🟡 core shipped (Stage 5, `credit_ledger`/`record_credit_entry`/`award_attendance_credit`) + **provisional per-body rule packs shipping in Stage 10, now needing to handle multiple bodies per event** (D-A); credit is already posted eagerly at check-in per Decision 10 — under multi-body that can mean up to ~13 provisional ledger rows per attendee per event, which stays safe only *if* a provisional-vs-confirmed attestation tier ships alongside it (**proposed, not built** — see R5/M4, `docs/adr/0002-multi-body-accreditation.md` and `docs/doctrine.md`'s OPEN forks); the *versioned* `body_rules`/deterministic-evaluator half stays 🔒 gated → **Stage 13** (body review + Q26, doctrine D.1); **✅ the storage shape the future award engine will read is shipped 2026-08-15** (Task 10.8/10.9, sub-task C3, shared with B2 above) — `event_accreditation_groups`/`event_accreditations`/`event_accreditation_occurrences` exist, are backfilled from every pre-existing accredited event, and the tie-validation trigger enforces ADR-0002's "Award selection" rule at write time; **C4's actual award-selection engine (reading these tables to compute a credit value from real attendance) is NOT built** — this ships only the schema + the single-body compatibility writer, no multi-body reader exists yet | versioned body_rules/cycles, the deterministic evaluator (bounded grammar — never a general rules engine), `credit_ledger` + `record_credit_entry`, disputes, issuance wiring, roster ingestion | B1 attendance, B2 registry, K2 mechanics |
| **B4 Certification & Signing** | 📋 planned → **Stage 11** | KMS signing, certificates, hash registry, revocation. Phase-2 bolt-ons (RFC 3161 TSA, W3C VCs) attach HERE, without kernel change | B3 verdicts/entries, K2 |
| **B5 Communications** | 🟡 partial (templates+log shipped; cron trigger still missing — DEFERRED, blocks Stage 8) | email templates, `email_log` (insert-first rule), cron jobs, provider adapter. Other blocks request sends; only B5 sends | K3 (rate), all blocks as clients |
| **B6 Audit & Evidence Access** | 📋 planned → **Stage 13** — Stage 13's own text names "evidence locker" and "auditor portal" explicitly; Stage 12 is narrowly "Pilot (soft → public launch)," gated on real accredited events + invoice paid, not a feature-build stage | auditor identities/case scoping, evidence-pack generation, offline verification instructions | B1–B4 reads, K2 |
| **B7 Assistive AI** | 📋 planned → **Stage 13** — **advisory-only** | tagging/summarisation, provenance, cost containment | reads B1; may never write B3/B4 authoritative records |
| **B8 Behavioural Detection** | 📋 planned → **Stage 13** — **advisory-only** | request_events, scoring job → flags for human review. Locked at never-auto-action | K3 signals |

## Tier 2 — Surfaces

Thin by contract: business rules live behind Server Actions / definer functions, never in UI. The 22 existing routes (as of Stage 10) are S-Public + S-Organiser. S-Organiser was frozen until the M2 review; **the review happened and the freeze is LIFTED for S-Organiser as of 2026-08-01** (`docs/plans/2026-08-01-m2-frontend-unfreeze.md`, which carries the admission-checklist run for the one non-Tier-2 piece). S-Attendee (wallet), S-Auditor (portal), and any real S-Integration API remain post-Stage-13 blocks-of-work — the design authority is now vault `30 — Reference/Frontend Design Standard.md` (Q32), not the locked `Design Language.md` this paragraph originally meant — and the unfreeze does not promote them.

## The fitting rules (how anything bolts on)

1. **One owner per table.** Every table belongs to exactly one block; only the owning block's functions write it.
2. **Cross-block writes go through the owning block's definer functions** — never direct table access. Definer functions ARE the internal API. Cross-block reads are RLS-scoped.
3. **Every new domain table ships the standard kit**: `organisation_id` + RLS + Hard Rule 11 grant-matrix row + three-layer validation + its negative test.
4. **Every trusted-record mutation**: audited definer function, audit insert last, actor derived server-side.
5. **Authority split is absolute**: measurements may act; inference (B7/B8) may only flag. No exceptions, ever.
6. **Config that shapes verdicts is data, versioned append-only** (doctrine) — no in-place semantic mutation, no config-referencing writes into B3's ledger before Q26 resolves.
7. **Bolt-ons must not touch the kernel.** If a proposed add-on requires a K1–K3 schema change, it isn't a bolt-on — it's a constitutional amendment: flag it, log it, then build.
8. **Deferred ≠ dropped**: partial blocks carry re-entry criteria in `docs/DEFERRED.md`, reviewed each sprint boundary.

## New-work admission checklist (the guardrail — run before any new feature/table/module)

1. Which **block** owns it? (Can't answer in one block → the proposal is two pieces of work, or the block map needs a flagged decision.)
2. Does it write only via **audited paths** and read only via **RLS**?
3. Does it respect the **dependency direction** (no kernel edits, no sideways table writes)?
4. Does it have a **kill/rollback story** (feature can be disabled without orphaning records)?
5. If shipped partially, what is the **re-entry criterion** for the rest?
6. Is it on the **current milestone's critical path**? If not: DEFERRED entry, not code.

## Where known future items slot (so nothing floats)

Turnstile/strike ladder → K3 · staff MFA-mandatory → K1 (S4) · pg_cron emails + Resend cutover → B5 · certificate-issued notification → B5 (client: B4) · evidence packs → B6 · roster ingestion → B3 · VCs/TSA anchor → B4 bolt-ons · cross-jurisdiction polymorphism → B2/B3 accepted debt · `set_staff_role()` audit → K1 (mechanics from K2) · pricing/billing → **new block B9 (Commercial)** when it becomes code at all (invoice-first = zero code, no block needed yet) · multi-body accreditation → B2/B3 · prior-approval deadline advisory → B2 (reads accrediting_bodies data, no new block).

## Change-control tiers

| Tier | Examples | Bar to change |
|---|---|---|
| Kernel (K1–K3) | roles, chain mechanics, grant posture | Decisions Log entry + Ivan sign-off + full protocol |
| Block contracts | a block's definer-fn signatures, table ownership | Flagged in the sprint plan + this doc updated |
| Block internals | new function inside a block, internal refactor | Normal sprint discipline |
| Surfaces | UI (post-freeze) | Cheapest — S-Organiser unfrozen 2026-08-01; other surfaces still gated by their own milestones |
