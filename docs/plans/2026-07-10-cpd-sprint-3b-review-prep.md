# CPD Sprint 3b — External-Voice Review: Going-In Position

> The conductor's script for the one external review (one accrediting body, one organiser, one practitioner) that gates all of Sprint 3b. Walk in with the demo + the two design outlines (`2026-07-09-cpd-sprint-3b-design.md` governance, `2026-07-10-cpd-sprint-3b-engine-design.md` engine) + this. Each item below carries a **going-in default**, its **OSINT confidence**, and — critically — **which of three categories it falls in**, so the meeting's outcome is read correctly.

## The three categories (read the meeting's success through these)
1. **Body-dependent facts (ask)** — Q3 PDF preference, Q5 rule-change behaviour, Q7 roster availability. Not derivable from public documents; only the body knows.
2. **Safe defaults (confirm)** — Q1 manual queue, Q2 event-level, Q4 practitioner-declared, Q6 grammar. Grounded, the body confirms rather than decides; manual/default is the floor and ships regardless.
3. **Open internal design the review *informs* but does *not* close** — the retroactive-trust-upgrade model and the deterministic evaluator. **These close in order: Q26 + retro-trust model together (post-fact), then the evaluator.** A good meeting makes the engine *designable*, not *designed* — if review notes omit category 3, "review done" gets misread as "3b unblocked" when the engine is still un-designed.

## How to run Q5 (the one architecturally load-bearing item) — DO NOT get this wrong
Q5 (config-hash fork) is a **behavioural** question, not a fork choice. The body **cannot** pick pinned-in-hash vs chained-version-table — those are our internal trade-offs. In the room, ask only about their **rule-change behaviour**: when they change a rule mid-cycle, does it reach back to activities already logged, or apply only forward — and how often do they change rules at all? **Never mention hash architecture.** That one behavioural fact is what makes Q26 decidable; *we* pick the arm from it afterward. Walking in framing Q5 as "the body chooses the fork" either confuses them or lets an offhand preference masquerade as an architecture decision.

## The seven questions

| Q | Going-in default | OSINT confidence | Category | Body genuinely resolves |
|---|---|---|---|---|
| **Q1 Reviewers** | Manual, single queue, no SLA, no member-DB | High (mirrors real committee-based, multi-week process — HKCR 2wk advance, HKCAAVQ 4wk) | Safe default | Only if they want *more* (pool / auto-approval — new schema) |
| **Q2 Confirmation** | Event-level flip `organiser_attested`→`body_confirmed`, audited (`event_accreditation_confirmed`, actor server-derived); corrections append, originals stand | High (all 8 bodies confirm at activity level, not per-attendee) | Safe default (+ 1 sub-Q) | Confirms; sub-Q: historical rows retro-marked, or forward-only? |
| **Q3 PDF format** | Standardised Eventar format + body logo + verification URL + KMS signature block | Low (auditor *preference*, not a published rule) | **Body fact — ask** | Yes — the one governance question OSINT can't answer |
| **Q4 Cross-body** | Practitioner-declared only, no automation (already the system's state) | Medium (recognition exists — HKICPA↔US State Board; IA/MPFA *asymmetric* Type 7 — but per-pair rules undocumented) | Safe default | Only if they want automation (then needs documented per-pair rules) |
| **Q5 Config-hash fork** | **Fully open, no lean** | N/A (not OSINT-decidable) | **Open internal design — informs, doesn't close** | Resolves the *input* (rule-change behaviour), not the fork |
| **Q6 Rule structure** | Seeded `cycle_config`+`category_taxonomy` grammar holds — **storage only** | High for *storage* (8 bodies, HKCR 16-type stress-tested); **evaluator-fit unverified** | Safe default (storage) + open (evaluator) | Confirms storage grammar; evaluator is category 3 |
| **Q7 Roster** | Self-declared until a body provides a register; verification-badge gated on one | High (locked model — Law Society keeps no records, members self-maintain) | **Body fact — ask** | Yes — will they provide one, in what format? |

## Three self-audit corrections that held (don't re-introduce the errors)
1. **Q5 lean retracted.** An earlier weak lean toward chained-version-table was pinned to HKCR's "effective 2027" language — a non-sequitur (forward-only rule application is identical under both arms). Fork stays fully open, no tilt. Letting a weak lean attach to an unrelated fact is the default-by-momentum we guard against.
2. **Q6 confidence narrowed to storage.** "The grammar fits" is verified for *storing* rules, not *evaluating* them. The deterministic evaluator (attendance × versioned rules → floor met/cap breached, HKCR's passive/active cap across 16 types) is unbuilt and unverified — the single largest engine unknown. See engine outline E2.
3. **Q2 audit event added; retroactive mechanism marked open.** The confirmation flip is a status mutation and must be audited (same class as the flagged staff-audit gap). And "corrections append" does not actually resolve *how* an append-only, per-row-pinned ledger represents a trust upgrade — it's one problem with three instances (event confirmation, licence verification, future signals), coupled to Q26 (query-time projection weakens pinned-in's self-contained-row argument). See engine outline E5.

## Net
**Four confirmations (Q1, Q2, Q4, Q6-storage), three real body decisions (Q3, Q5, Q7), one of those three architecturally load-bearing (Q5).** Plus two category-3 items the meeting informs but does not close (the evaluator, the retro-trust model), which must be carried in the notes so the outcome isn't over-read. Tighter than seven questions imply — but only if category 3 is on the page.

## Related
Governance outline · engine outline (E2 evaluator, E5 retro-trust) · `docs/doctrine.md` (Q26 both arms) · vault `02 — Decisions Log` Q25 (cross-body locked), Q26/27 (open) · `docs/plans/roadmap-to-mvp.md` (the review is the long pole)
