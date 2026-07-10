# CPD Sprint 3b — Engine Half: Rules, Evaluator, Issuance, Roster (design outline)

> **Status: design outline, not an implementation plan — and ungated *as design* (this is design, not build-ahead).** The companion governance outline (`2026-07-09-cpd-sprint-3b-design.md`) covers *who reviews/confirms*. This covers the *engine* — the part that turns "attended an event" into "earned N credits that are compliant against body X's rules in force at the time." That engine is in neither Sprint 3a (which built ledger *storage* + the writer) nor the governance outline. It is the actual CPD value core, it is the MVP critical path, and it is **double-gated** (the config-hash fork Q26 + the external body review). This document exists so the moment those gates lift, the engine is *designable fast* — and so there is something concrete to put in front of the body alongside the demo.

**Framing that governs every task below — the three-layer open-framework line:**
- **Config/data layer → fully open, now.** Body rules/cycles/categories/retention as versioned rows keyed on `body_id`. New body = new rows, zero code (Hard Rule 2).
- **Governance/workflow layer → open interfaces, defaults now.** Defaults behind a seam a per-body override slots into later; no speculative overrides.
- **Evaluator layer → bounded-grammar interpreter, NOT a general rules engine.** Open over the *data within* a fixed rule grammar (verified against 8 bodies); bounded *on the grammar*; grammar *extended on documented demand only*. Building a configurable interpreter for unseen body logic is the deferred rules-engine over-build — do not.

**How the review's answers land here (category 3 — informs, does not close):** the body meeting resolves *inputs* (Q5 rule-change behaviour, Q6 grammar-fit confirmation, Q7 roster availability). It does **not** design the evaluator or decide the retroactive-trust model. Those close in order: **Q26 + the retroactive-trust model together, then the evaluator builds on both.** A successful meeting makes the engine *designable*; it does not make it *designed*.

---

## E1: `body_rules` / `body_cycles` / versioned config DDL

**Gate:** rule *content* shape — **ungated** (verified against 8 bodies this session, storage-fit confirmed). Versioning *mechanism* — **Q26-shaped** (pinned-in vs chained changes whether this table is itself hash-chained and whether the ledger references it or pins its hash).

**Anticipated shape:**
- `body_rules` — the versioned, effective-dated rule set per body: cycle config (length, start, floors), category taxonomy (categories, per-category floors, per-type caps, core minimum, passive/active caps), units (points/hours), retention. The JSONB shape 3a already seeded into `accrediting_bodies.cycle_config`/`category_taxonomy` is the storage grammar; this task makes it **versioned** (append-only versions, `effective_from` + `version_seq`, derive active by query — per doctrine, no `effective_until` updated in place).
- `body_cycles` — per-licence cycle instances if cycle-as-entity is confirmed (open Q from the roadmap; only needed if balance-projection keys on cycle_id).
- RFC 8785 canonical serialization applied before any config hash, **regardless of which Q26 arm wins** (both arms hash canonicalized config; only *where* differs).

**Review input it needs:** Q6 (does the pilot body's real rule set fit the grammar) + Q5 (backdating behaviour → informs Q26 → informs whether this table is chained).

**If grammar-fits (expected):** pure config rows for the pilot body, same shape as the 3a seed but versioned. Small.
**If grammar-miss:** a *documented* grammar extension for that body's specific need (new config field + the matching evaluator branch in E2) — on evidence, not speculatively.

---

## E2: The deterministic evaluator (the hard, un-verified part)

**Gate:** **Q26** (reads versioned config) + **review** (Q6 confirms grammar). This is the category-3 "review informs, does not close" build — it follows both.

**Anticipated shape:** a pure, deterministic function `evaluate_compliance(licence_id, as_of_date)` that projects the licence's `credit_ledger` entries against the `body_rules` version **in force at each entry's `valid_domain_time`** (bitemporal — a December activity is judged under December's rules even if evaluated in March), and returns the per-cycle verdict: floor met / core satisfied / each cap respected / total. No AI. No mutation — it reads the ledger and the versioned config, computes, returns.

**The worked stress test that must pass (the reason Q6 storage-fit ≠ evaluator-fit):** HKCR's **16 activity sub-types with per-type caps + a passive/active cap across them**. Storing 16 types is trivial; the evaluator must deterministically compute "did this practitioner breach the passive cap *aggregated across* those 16 types, under the rule version in force at each activity's date, within the correct cycle window." If the evaluator handles HKCR, it handles the eight verified bodies. **This function is currently unbuilt and unverified — it is the single largest engine unknown.**

**Bounded-grammar discipline (the pushback made concrete):** the evaluator interprets the fixed grammar (floors, caps, cores, units, cycle windows). It does **not** interpret arbitrary conditional/computed rule logic. A body whose real rules need logic outside the grammar → extend the grammar (E1 field + one evaluator branch) to *their documented rule*, on demand.

**Coupled open decision → Q27 (evaluator-versioning):** the verdict is read-time code. For a *reproducible* historical verdict, the evaluator's own version (release tag / code hash) must be pinnable alongside the config version — pinned in neither Q26 arm today. Flag: verdict-reproducibility needs the evaluator versioned; input-reproducibility (rows + config) is what Q26 gives. Decide when the first verdict is exported (post-MVP acceptable; named so it isn't lost).

---

## E3: Issuance — attendance × rules → ledger entries

**Gate:** **review** (governance Task 2 — accreditation-confirmation semantics decide what `attestation_status` new entries carry and when) + **Q26** (entries reference/pin config).

**Anticipated shape:** the wiring 3a deliberately stubbed. On the event `published → credited` transition (Event Lifecycle Q23 item 4), a deterministic job (pg_cron per the roadmap, or transition-triggered) reads the event's attendance rows × the accredited body's `body_rules` version in force at the event's `valid_domain_time`, and writes `credit_earned` entries via the existing `record_credit_entry` (service_role-only, definer). **Store all credits including unmatched-body cases; filter in a view (ADR 0015)** — never drop an unmatched attendance silently (Rule 12). Each entry carries its `attestation_status` at write time (`organiser_attested` unless the body has confirmed) and its config reference/hash (per Q26).

**Review input it needs:** governance Task 2 (event-level vs per-attendee confirmation; what triggers it) — decides the attestation the issuance job stamps.

**If governance defaults hold (event-level):** issuance stamps event-level `attestation_status`; one clean path. Sprint-3a-sized once E1/E2 exist.
**If per-attendee:** issuance must stamp per-registration attestation — larger, and needs the per-attendee confirmation table from governance Task 2.

---

## E4: Roster ingestion + verification badges

**Gate:** **Q7** (does the pilot body provide a roster, in what format). Do not build until a body commits to providing one.

**Anticipated shape (Slice 0.6 Pillar 2, already locked as the model):** `roster_uploads` (Excel/CSV, refreshed annually) + `body_members` (versioned), a column-mapping model, a diff report, and a verification-badge recompute for `practitioner_licences` whose number matches a roster row. Self-declared-until-roster is the correct default; verification is an **additive trust signal, not a tamper surface** — an unverified licence is flagged, never blocked.

**Review input it needs:** Q7 — will they provide one, and its shape. If no roster at pilot: this task doesn't ship; licences stay self-declared+flagged. Zero engine risk either way.

---

## E5 (cross-cutting decision, not a build task): the retroactive-trust-upgrade model — one problem, three instances

**Gate:** **decidable now, but coupled to Q26** (the fork shapes the clean answer). Resolve in the same decision cluster as Q26, before E2/E3 detail.

**The one problem:** how does an append-only, per-row-pinned ledger represent a **trust upgrade that arrives after a row is written**? Three instances, identical shape:
1. **Event confirmation** — body confirms an event *after* credits were earned under `organiser_attested`.
2. **Licence verification** — a roster arrives and verifies a licence *after* credits were earned against it unverified.
3. **Future signals** — any later-arriving trust signal on an already-written entry.

**The three candidate mechanisms (each with a real cost — pick one, once, apply to all three):**
- **Leave pinned** (append-only clean): historical rows keep their write-time trust; only new rows reflect the upgrade. Cost: a body-confirmed event's pre-confirmation credits still read as merely attested.
- **Append `credit_adjusted`**: one adjustment row per upgraded entry. Cost: `credit_adjusted` semantically means a *points* change; an attestation-only adjustment (`points=null`) is a semantic stretch + row explosion.
- **Project trust at query time** (read event/licence current status in the evaluator/projection): always-current. Cost: the per-row pinned `attestation_status` becomes redundant/misleading, and **rows stop being self-contained — which directly weakens pinned-in-hash's core argument (Q5/Q26 coupling).**

**Why it's coupled to Q26:** the clean answer differs by arm. Chained-version-table makes query-time projection natural (trust is a reference, not a frozen value); pinned-in-hash makes leave-pinned or append the honest options (the row's own hash commits its write-time state). So this is not decidable *independent* of the fork — it closes *with* it.

**Review input it needs:** Q5's sub-question (does the body expect historical entries retroactively marked on confirmation, or only forward) — a *behavioural input* that informs which mechanism is acceptable, not a choice of mechanism.

---

## Build-order legend (so the sequence is legible when gates lift)

| Task | Gate(s) | Unblocks when |
|---|---|---|
| E1 rule content shape | ungated | — (grammar verified; only versioning mechanism waits on Q26) |
| E5 retroactive-trust model | Q26 (coupled) | Q26 decided (same cluster) |
| E1 versioning mechanism | Q26 | Q26 decided |
| E2 evaluator | Q26 + review (Q6) | Q26 + grammar confirmed |
| E3 issuance | review (gov. Task 2) + Q26 | confirmation semantics + Q26 |
| E4 roster | review (Q7) | body commits a roster |

**The one thing that lifts the most gates:** Q26. It is decided from **one behavioural fact** the body relationship gives — how they handle mid-cycle rule changes (reach back / forward / how often). Get that fact, decide Q26, and E1-versioning + E5 + E2 all become designable in sequence.

## What this outline deliberately does not include
- Any SQL — that's post-gate detailing (same discipline as the governance outline).
- A Q26 decision, or a tilt toward either arm — the fork stays fully open, no lean.
- A general/configurable rules engine — the evaluator is a bounded-grammar interpreter, extended on documented demand only.

## Related
Governance outline `2026-07-09-cpd-sprint-3b-design.md` · `docs/doctrine.md` (Q26 fork both arms, Q27 evaluator-versioning, bitemporal, RFC 8785, config-versioning append-only) · vault `02 — Decisions Log` Q23 item 4 (lifecycle states), Q25 (cross-body), Q26/27 (open) · vault `10 — Architecture/Credit Ledger` (§ issuance, § PDF projection), `10 — Architecture/Event Lifecycle` · `docs/DEFERRED.md` (rules-engine-service deferral, roster, per-body PDF)
