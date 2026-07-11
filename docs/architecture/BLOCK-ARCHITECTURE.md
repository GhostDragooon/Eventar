# Block Architecture — the system skeleton and its guardrails

_Written 2026-07-11 per Ivan's direction: a framework all subsequent work must fit into, as add-on blocks against a stable core. **Structure only — no component detail here.** Detail lives in the vault architecture notes and per-sprint plans. Change control: this doc is a guardrail; altering the block map or fitting rules is a flagged decision (stage into vault Decisions Log as Q29 when Ivan locks it)._

## The shape: a modular monolith

One deployable app (Next.js) + one Postgres (Supabase). **Modularity is enforced at the data layer** — table ownership, RLS, grants, and SECURITY DEFINER functions as the internal API — not by splitting services. Blocks are logically separate, physically co-located. This is deliberate: a solo-operated trust platform needs hard internal boundaries and zero distributed-systems overhead.

```
┌─────────────────────── Tier 2 — SURFACES (thin, replaceable) ───────────────────────┐
│  S-Public      S-Organiser      S-Attendee       S-Auditor        S-Integration      │
│  (reg/checkin/ (staff routes —  (wallet —        (portal —        (/api/* cron +     │
│   survey)       FROZEN)          post-M4)         post-M4)         future API)       │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
┌─────────────────────── Tier 1 — DOMAIN BLOCKS (the product) ─────────────────────────┐
│  B1 Events &      B2 Professional   B3 Credit        B4 Certification                │
│     Attendance       Registry          Engine            & Signing                   │
│  [SHIPPED]        [SHIPPED 3a]      [GATED → 3b]     [PLANNED → S4]                  │
│                                                                                       │
│  B5 Communications  B6 Audit &        B7 Assistive AI   B8 Behavioural Detection     │
│  [PARTIAL]             Evidence          [PLANNED → S5,     [PLANNED → S5,           │
│                     [PLANNED → S5]       advisory-only]      advisory-only]          │
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
| **B2 Professional Registry** | ✅ shipped (3a) | accrediting_bodies, organisers, practitioner_licences + licence lifecycle functions | K1, K2 |
| **B3 Credit Engine** | 🔒 gated (3b: body review + Q26) | versioned body_rules/cycles, the deterministic evaluator (bounded grammar — never a general rules engine), `credit_ledger` + `record_credit_entry`, disputes, issuance wiring, roster ingestion | B1 attendance, B2 registry, K2 mechanics |
| **B4 Certification & Signing** | 📋 planned (S4) | KMS signing, certificates, hash registry, revocation. Phase-2 bolt-ons (RFC 3161 TSA, W3C VCs) attach HERE, without kernel change | B3 verdicts/entries, K2 |
| **B5 Communications** | 🟡 partial (templates+log shipped; cron/Resend pending) | email templates, `email_log` (insert-first rule), cron jobs, provider adapter. Other blocks request sends; only B5 sends | K3 (rate), all blocks as clients |
| **B6 Audit & Evidence Access** | 📋 planned (S5) | auditor identities/case scoping, evidence-pack generation, offline verification instructions | B1–B4 reads, K2 |
| **B7 Assistive AI** | 📋 planned (S5) — **advisory-only** | tagging/summarisation, provenance, cost containment | reads B1; may never write B3/B4 authoritative records |
| **B8 Behavioural Detection** | 📋 planned (S5) — **advisory-only** | request_events, scoring job → flags for human review. Locked at never-auto-action | K3 signals |

## Tier 2 — Surfaces

Thin by contract: business rules live behind Server Actions / definer functions, never in UI. The 19 existing routes are S-Public + S-Organiser; S-Organiser is **frozen** until the M2 review. S-Attendee (wallet), S-Auditor (portal), and any real S-Integration API are post-M4 blocks-of-work with the design language already locked.

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

Turnstile/strike ladder → K3 · staff MFA-mandatory → K1 (S4) · pg_cron emails + Resend cutover → B5 · certificate-issued notification → B5 (client: B4) · evidence packs → B6 · roster ingestion → B3 · VCs/TSA anchor → B4 bolt-ons · cross-jurisdiction polymorphism → B2/B3 accepted debt · `set_staff_role()` audit → K1 (mechanics from K2) · pricing/billing → **new block B9 (Commercial)** when it becomes code at all (invoice-first = zero code, no block needed yet).

## Change-control tiers

| Tier | Examples | Bar to change |
|---|---|---|
| Kernel (K1–K3) | roles, chain mechanics, grant posture | Decisions Log entry + Ivan sign-off + full protocol |
| Block contracts | a block's definer-fn signatures, table ownership | Flagged in the sprint plan + this doc updated |
| Block internals | new function inside a block, internal refactor | Normal sprint discipline |
| Surfaces | UI (post-freeze) | Cheapest — but frozen until M2 |
