# Model the regulator's taxonomy, not a simplification of it

The 2026 dual-track plan proposed tagging each event with `participation_type` (active/passive), `content_domain` (clinical/non-clinical) and an `is_professionalism_ethics` boolean. Reading the primary source — *HKAM Principles and Guidelines on CME/CPD, Cycle 2026-2028*, approved by EC 07.01.2025 — showed that model does not match the regime it is meant to serve, so we adopted the Academy's own vocabulary instead: the **FCAA category code** (`6.1`…`6.16`) recorded **per registration**, not per event.

## Why

Three findings, each from the source:

- **§6.1 vs §6.2 are different categories for the same activity.** An attendee earns 1 point per hour; someone *chairing or presenting at that same meeting* earns "3 points if no collection of data is involved, 6 points if collection or analysis of data is involved", set by each College. Active/Passive is therefore a property of **a person's role**, not of the event. An event-level flag is wrong for every attendee at any meeting that has a chair.
- **There are sixteen categories, not four.** §6.1–6.16 each carry their own caps — publications ≤10 per publication, teaching ≤15 per cycle, examining ≤10 per exam, and so on — and §6.11 carries an explicit non-overlap rule ("These activities should not be counted under 6.1"). A 2×2 cannot express any of them, so per-cycle cap enforcement would have needed a migration later.
- **"Medical Professionalism & Ethics" is not an axis.** It is one example listed inside §6.16 (*Other Non-medical / Non-clinical Professional Development*), which is capped at 5 points per cycle. Modelling it as an orthogonal boolean loses the cap and misplaces the concept.

## Consequences

The category code goes in `credit_ledger.category`, which is already inside the hash envelope and permanently NULL today — so this costs no migration and no chain-versioning event. Clinical vs non-clinical becomes derivable from the code rather than stored twice.

Only `6.1` and `6.2` are offered in the organiser UI at launch; the remaining fourteen unlock with no schema change.

Participation is captured per registration, defaulting to attendee, so an organiser marks only the chairs and presenters.

**This supersedes the "primary licence per track" decision taken earlier the same day.** §4(b) — "Fellows holding multiple Fellowships under different Colleges must fulfil requirements for each of these Fellowships" — means a dual-College Fellow is `track = 'hkam'` twice, so a per-track unique index reproduces the exact defect it was meant to fix. The index keys on `(user_id, body_id)`; since a College *is* a body, that matches §4(b) per-Fellowship and §4(c) per-College.

Two further facts recorded here because they contradict assumptions elsewhere in the plan: the per-event hours ceiling is **set by each College** (§7), not the platform's `cpd_hours <= 24`; and the end-of-cycle return goes **College → Academy Education Committee**, which then informs MCHK (§2(d)) — not College → MCHK directly.
