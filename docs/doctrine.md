# Engineering Doctrine — Eventar CPD Platform

> **What this is.** The settled architectural doctrine that governs where the
> hardwired-vs-configurable line falls, distilled from the 2026-07-10 design
> sessions. It lives in the repo (not the vault) because it must diff against the
> code and be read *at the moment of a code decision*.
>
> **Relationship to other sources.** `CLAUDE.md` holds the enforceable Hard Rules
> (the ones a session must never break). The vault `02 — Decisions Log.md` holds
> Q-numbered product/architecture decisions. This doc holds the *reasoning model*
> those two express — the doctrine that says why a rule is a rule and where a new
> question falls. When a doctrine item hardens into an enforceable rule it moves
> to `CLAUDE.md`; when an open fork below is decided it becomes a vault Q-entry.
>
> **Reading discipline.** This was distilled from a long brainstorm. The two Hard
> Rules are locked. Everything else is **current best model, revisable** — the
> taxonomy below leaked twice while being written, which is exactly why it is not
> locked. Do not treat the polish of this document as settledness.

---

## The two governing Hard Rules (LOCKED)

1. **Integrity is structural; domain is configuration.** Any guarantee that
   protects tamper-evidence, audit authenticity, actor authenticity, append-only
   semantics, tenancy isolation, or data residency must be structural and
   immutable — not reachable by any configuration flag, per-body setting, or
   runtime toggle. Any rule that reflects how a specific body/organiser/event
   operates must be configuration (data), so new bodies onboard without a code
   change.
2. **Configuration is data; scaling is row-based.** New bodies, organisers,
   events, categories, cycles, retention windows, and role labels are added as
   data rows, never as new tables/columns/code branches. If onboarding a body
   requires a migration or a deploy, the design has hardwired something that
   should have been configurable. Body hierarchy (HKAM Colleges, AHP Boards) uses
   `parent_body_id` — still row-based.

---

## Six-tier classification (CURRENT BEST MODEL — revisable)

A working filing system over the two Hard Rules. It grew two compartments during
its own definition (the role split; the interpretation-immutability tier), so it
is explicitly not locked.

| Tier | Meaning | Examples |
|---|---|---|
| I. Guarantee-hardwired | Configurability would make the system lie | Append-only ledgers, hash chains, definer-only write paths, server-derived actor identity, RLS tenancy isolation, immutable config versions, canonical hashing, bitemporal separation |
| II. Decision-hardwired | Globally fixed for consistency, ADR-revisable | Single canonical interpretation path, dispute-during-credit policy, base platform privilege set |
| III. Configurable with bounds | Varies by body/organiser/event; validated + versioned when it affects history | Cycle config, category taxonomy, retention windows, role labels, workflow params, presentation templates |
| IV. Invariant (historical interpretation) | Interpretation-affecting config must be versioned so it can't rewrite past records' meaning | Ledger inherits evaluation logic from the config version in force at activity time |
| V. Architecture commitments | Costly to change, ADR + migration, not integrity-inseparable | PostgreSQL, Supabase, Next.js |
| VI. Deployment constraints | Regulatory/vendor-driven, adjustable | Singapore data residency, Hong Kong KMS keys |

---

## Settled doctrine (revisable, but not in active dispute)

- **Interpretation-immutability (first-class).** Any configurable rule whose
  change would alter the interpretation of an existing record MUST be append-only
  versioned. Non-interpretation config (email templates) may be updated in place.
- **Bitemporal separation.** `valid_domain_time` (when the activity occurred,
  derived from the organiser-attested event record, *never* user-asserted) drives
  config-version selection. `system_transaction_time` (when the row was written)
  anchors the hash chain. A December activity logged in January is evaluated under
  December's rules.
- **Never hash raw JSONB.** Key order isn't guaranteed and a benign backfill would
  invalidate every historical hash. Canonicalize first — adopt **RFC 8785 (JSON
  Canonicalization Scheme)**, do not hand-roll. *Where* the serializer runs is
  determined by the D.1 fork below, not chosen independently.
- **Config versions are strictly append-only.** `effective_from` + `version_seq`
  only; no `effective_until`/`superseded_at` updated in place (that would break the
  append-only claim). Derive the active version by query. Backdated corrections are
  privileged, audited, and produce `credit_adjusted` ledger entries — never a
  silent reinterpretation of history.
- **Config schema compatibility.** Immutable bytes; versioned decoders keyed to a
  `schema_generation`; read-side normalization hydrates absent keys to documented
  defaults. Never rewrite old rows.
- **Validation boundary.** Structural validation (shape, non-negative, non-empty)
  in the DB; compliance/evaluation logic in the application layer. No dedicated
  rules-engine service until a body demands conditional rules the app layer can't
  cleanly express.
- **Role split.** Platform roles (hardwired, map to RLS) are separate from
  body-specific labels (configurable mapping rows). Scoped, not built —
  `docs/plans/role-split-inventory.md`.
- **Signed payload ≠ presentation.** The canonical signed payload (stable
  structured data) is separate from the PDF layer; the signature anchors the
  payload, so re-rendering in any body's template never invalidates the proof.
- **Single global hash chains kept.** `audit_events` and `credit_ledger` each keep
  one global `chain_seq`-ordered chain. Per-stream chains are deferred on
  *evidence* (a measured write-concurrency profile showing the advisory lock is the
  bottleneck), not built against a hypothetical.

---

## OPEN forks & gaps (NOT settled — decide deliberately, log as vault Q-entries when decided)

### D.1 — The config-hash fork (highest-value open decision)
Determines whether canonical serialization sits on the ledger's critical write
path or is quarantined in a cheap config side-chain. **Current lean:
chained-version-table.** Decide on merits; do not default.

| Dimension | Pinned-in-hash | Chained-version-table (reference-only + chained config) |
|---|---|---|
| Serializer location | every ledger write, in DB | once per config write, one place |
| Serializer-bug blast radius | all ledger history | config chain only, re-verifiable |
| Ledger preimage | modified (adds config hash) | untouched (the just-hardened one) |
| Whole-vs-fragment | ambiguous, needs resolving | interpretation picks fragment at read time |
| Config-table integrity | not load-bearing (pinned into ledger) | load-bearing → must itself be chained |
| Evidence bundle | self-contained, single-row self-verifying | ledger row + config version + config chain |

Pinned-in's one real edge: a single exported row proves its own rules. Chained's
edge: three costs removed (footgun off the hot path, no serializer-breaks-history
coupling, no fragment ambiguity) and the hardened ledger preimage stays untouched.

### Evaluator-versioning gap (named, deferred)
`credit_ledger` stores credits; the "compliant" verdict is a *read-time projection*
(code) of rows against config. Reproducing a 2025 verdict needs the rows (solved),
the config in force (D.1), AND the *evaluator* in force (a release tag / code hash)
— which is pinned in **neither** D.1 arm. Current doctrine delivers *input*
reproducibility, not *verdict* reproducibility. Re-entry: when a verdict is first
computed.

### KMS-signing vs RFC 3161 (reverted to undecided)
RFC 3161 TSA anchoring is the mechanism *on record* (deferred, Phase 2). "KMS
signing is decided" was never a logged decision — it reverts to undecided until it
earns a vault Q-entry.

### Cycle as a first-class entity
Data-model question (each licence-cycle instance as a row). Untangled from chain
scoping — only becomes load-bearing if per-stream chains are ever adopted. Decide
when balance-projection needs it.

---

## Discarded / DO NOT REVIVE
- **The consolidated "Section 5" SQL draft — DO NOT EXECUTE.** Machine-generated,
  wrong in ~11 checkable ways. Hardest flag: it **dropped `chain_seq` and
  reintroduced `clock_timestamp()` ordering**, silently undoing the verified-correct
  in-lock `chain_seq` redraw (live functions confirmed correct: `redraws_seq_in_lock
  = true`). A "never run this draft" flag, not a production alarm.
- **`hashed_national_id`** — a PDPO-weighted PII-collection decision that rode in on
  a SQL draft. Removed. Re-enters only via its own vault Q-entry + PDPO assessment
  if cross-body identity matching becomes a concrete need `licence_number` can't serve.
- **Per-stream chains, presentation-template versioning, rules-engine service** —
  all deferred on evidence/need, see `docs/DEFERRED.md`.

---

## PENDING — vault Decisions Log Q-entries (stage; write to vault on explicit go)
Draft entries for `/Users/ivan/Desktop/Eventar/02 — Decisions Log.md`:
- **Q26 (OPEN):** config-hash fork — pinned-in-hash vs chained-version-table. Lean
  chained. Re-entry: real body relationship or 3b review.
- **Q27 (OPEN):** evaluator-versioning — verdict reproducibility needs the evaluator
  versioned, not just inputs. Re-entry: first verdict computed.
- **Q28 (REVERTED-TO-OPEN):** signature mechanism — RFC 3161 TSA is the deferred
  anchor on record; KMS-signing is not a logged decision. Undecided until logged.
