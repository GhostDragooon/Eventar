# One event, many accrediting bodies

The schema has assumed, since Sprint 3a (2026-07-09/10), that an event answers to at most one accrediting body: `events.accrediting_body_id` is a single scalar `uuid` column (`references public.accrediting_bodies(id)`, added `20260724155845`), and `set_event_cpd_config()` writes exactly one body + one `cpd_hours` value per event. Real evidence forced a reversal of that assumption: **an event can be accredited by many bodies simultaneously, each awarding its own point value, and that value can itself vary by day within the same event.** This is now settled architecture for 2026 (Ivan, 2026-08-14), not deferred work — it lands inside Stage 10 (`docs/plans/STAGES.md`), the current dual-track engine stage.

## Why

- **The ICI (Innovative Cardiovascular Initiative) Summit 2026 is one event, accredited by 13 bodies at once.** Its real accreditation sheet lists 11 HKAM Specialty Colleges plus MCHK plus CNE as simultaneous accrediting bodies for the same conference — not 13 separate events, not a primary body with secondary reciprocity, 13 concurrent accreditations of one FCAA.
- **Point values are split by day, not fixed per event.** The same sheet awards different point totals for Day 1, Day 2, and "Both Days" attendance, per body. A single `cpd_hours` scalar on the event row cannot represent this even for one body, let alone thirteen.
- **A scalar FK is structurally incapable of this shape.** `events.accrediting_body_id uuid` (confirmed against `information_schema.columns`) can hold exactly one body id. There is no way to widen a single foreign key into "many bodies, each with its own day-scoped point rule" without a genuine data-model change — this is not a validation gap or a UI limitation, it is the column's own cardinality.

This reversal does not touch ADR-0001's own decision. ADR-0001 settled that *category* (which of a body's own categories a participation falls under) is captured **per registration**, not per event, because participation role is a property of the person, not the meeting. That placement is unaffected by how many bodies accredit the event — it becomes, if anything, more clearly correct: a chair at a 13-body summit still chairs once, and each of the 13 bodies independently maps that one role into its own category vocabulary (see the proposed consequence below).

Eventar's relationship to iCMECPD (HKAM's own CME/CPD portal) is **coexistence, not integration** (D-C, settled): Eventar produces evidence a College or Fellow can submit into iCMECPD themselves; it does not write to iCMECPD directly, and multi-body accreditation does not change that boundary.

## Consequences

An event's relationship to accrediting bodies moves from "one FK" to "many, each carrying its own day-scoped point terms" — the natural data-model consequence of the finding above. `set_event_cpd_config()` and every reader of `events.accrediting_body_id`/`events.cpd_hours` (the freeze trigger, the CPD readiness strip, the organiser CPD-config surface) will need to be re-derived against a one-to-many shape rather than the current scalar pair; the exact table/function design is implementation work for Stage 10, not decided by this ADR.

Provisional per-body rule packs (already planned for Stage 10) now need to run once per accrediting body on the event, not once per event. Because credit is posted **eagerly at check-in** (Decision 10, already settled, unrelated to this reversal), a single attendee's check-in at a 13-body event could produce up to 13 immutable `credit_ledger` rows in one transaction, each computed from a provisional (unconfirmed) rule pack. That fan-out is a real consequence of this ADR and is tracked as a **proposed, unbuilt dependency** in `docs/doctrine.md`'s OPEN forks (M4/R5): it is safe only if a provisional-vs-confirmed attestation tier ships alongside it, so a wrong provisional row stays findable-by-hash and correctable. Not built; do not treat eager multi-body posting as safe until that dependency resolves.

`docs/architecture/BLOCK-ARCHITECTURE.md`'s B2 (Professional Registry) and B3 (Credit Engine) rows have been updated to carry this as in-scope work, referencing this ADR.

### The attribution model (Ivan, 2026-08-14)

What a practitioner earns from one event is resolved **per body**, by intersecting three independent facts. This is the reason the engine has to be an open, pack-driven system rather than a calculator:

1. **Does this body accredit this event?** A practitioner may hold licences at bodies A, B and C; if C has not accredited the event, C simply produces nothing — not zero points, no claim at all. The iteration is over the event's accreditations, not over the practitioner's licences.
2. **Does the practitioner hold a standing licence at that body?** A body accrediting the event awards nothing to someone who answers to it in no capacity. Credit exists only at the **intersection** of (bodies accrediting the event) × (bodies the practitioner holds a verified licence at).
3. **What did they actually attend?** Day-level attendance is a **yes/no per day**, taken from the check-in record — not a proration, not an inference from the event's length. Two days attended earns whatever that body publishes for two days; four days earns four days' worth. Events are not assumed to be one or two days long.

Each body then applies **its own** point values and **its own** caps to that same attendance fact. Two bodies reading one identical check-in record can legitimately reach different numbers, and one of them can legitimately reach none. Nothing is summed or averaged across bodies at any point.

**Consequence for the schedule's storage:** a body publishes an award schedule keyed by attendance scope (the ICI sheet's Day 1 / Day 2 / Both Days columns are exactly this). Those values are stored **as published**, and the applicable one is selected by matching the attendance record against each row's scope. An earlier proposal to store only per-day rows and derive multi-day totals by summation was **withdrawn** — it assumed additivity the regime does not guarantee, and a body remains free to publish a combined value that is not the sum of its parts. Whether a given body's multi-day value is additive or explicitly published is a property of that body's pack, which is precisely the variation the pack system exists to absorb.

**Prerequisite, not yet built:** `registrations` carries exactly one `check_in_at`/`check_in_method` (`20260523010000_init_checkin_columns.sql`), so fact 3 above is currently unrepresentable — Eventar cannot distinguish "attended Day 1 only" from "attended both days". Day-level attendance capture is a hard prerequisite for day-scoped awarding. It is narrower than the multi-track session model deferred under rule 13: **days are a flat yes/no per registration, not concurrent tracks**, so this does not reopen multi-track scheduling.

#### Attendance units, and what MVP records (Ivan, 2026-08-14)

Attendance is counted in **units**, and the unit is **configuration, not a constant**: **daily by default**, with half-day and session granularities available where a body or event needs them. A five-day event with daily granularity has five units; attending two of them is `2/5`. One day is one unit.

**Two award schemes must both be expressible, because real bodies use both:**
- **Proportional** — the default. Units attended × the unit's value, or `N/M` of the event total. This is what most bodies need and what a new body gets without configuring anything.
- **Explicit per-scope schedule** — the body publishes a value per attendance scope, and those values need not be uniform or additive. ICI proves this is not hypothetical: Pathologists award **5 for Day 1 but 6 for Day 2**, so the specific unit attended matters, not merely how many.

The pack declares which scheme that body uses. This is the concrete reason the engine is pack-driven — the same two-day event, the same check-in record, resolved by a proportional pack and an explicit-schedule pack, must legitimately produce different numbers.

**MVP scope:** one check-in per unit, **no check-out**. The out/proration half (Task 10.5's `check_out_at`/`minutes_attended`) is deliberately not part of the MVP path — presence at a unit is a yes/no, not a measured duration. This keeps plan-file Decision 5's spirit ("no session model") intact while making unit-level attendance representable, and Decision 10 (full credit at check-in) still holds: the award is resolvable the moment the last unit is checked in, with no dependency on the scheduler (which has no trigger — DEFERRED 61).

#### Storage shape (Ivan, 2026-08-14)

Per-unit attendance lives against an **occurrence** — not against the event, and not as repeated date fields on the registration.

```
event_occurrences (id, event_id, ordinal, occurrence_type, name,
                   starts_at, ends_at, attendance_points default 1)

registration_checkins (id, registration_id, occurrence_id,
                       checked_in_at, check_in_method,
                       unique (registration_id, occurrence_id))

event_accreditations (id, event_id, body_id, credit_value, unit)

event_accreditation_occurrences (accreditation_id, occurrence_id,
                                 primary key (accreditation_id, occurrence_id))
```

**Whole points are stored; fractions are computed.** Each occurrence carries `attendance_points`, default 1. A five-day event has five occurrences worth one point each; attending two is stored as two occurrence check-ins and *read* as `2/5` or 40%. **No fractional value such as `0.2` is ever stored.** The model is identical at every granularity — daily, half-day, or session — because only the number and type of occurrences changes, never the arithmetic.

**Accreditation scope uses stable occurrence IDs via a linking table, never ordinals.** An earlier proposal to put `occurrence_ordinals int[]` on the accreditation is **rejected**: the ordinal is a display and ordering value, not an identity. If an organiser inserts a session between occurrence 2 and 3, every later ordinal shifts while the occurrence ID stays stable — an array of ordinals would silently re-point an existing accreditation at different days, and any `credit_ledger` row already computed from it would be wrong with nothing having failed. Ordinals must never become permanent ledger identities. The linking table also expresses, without schema change: one accreditation covering all occurrences, another covering selected days or sessions, several bodies applying different scopes to one event, and an audit query showing exactly which occurrences supported a given award.

**Compatibility.** `registrations.check_in_at` and `check_in_method` are **retained and become legacy summary fields**, maintained as the earliest successful occurrence check-in. This keeps all eight existing read sites working unchanged (dashboard stats, the attendee confirm page, event details, the roster and its Realtime post-image merge, event analytics, `lib/analytics/arrivalLatency.ts`) with no application rewrite. **`registration_checkins` is the authoritative attendance record**; the two columns on `registrations` are a denormalised summary and must not be read as the source of truth for anything award-related.

**Daily is the default and must not be burdensome.** A single-day event gets exactly one occurrence, generated automatically — the organiser never sees the concept. A multi-day event generates one occurrence per calendar day. The first implementation supports **daily occurrence generation through the organiser interface only**; half-day and session occurrences use the same schema but are created through configuration initially. Check-out time and attendance duration stay outside the first implementation.

**Still not the deferred multi-track model.** Occurrences are flat, sequential and non-overlapping. Multi-track means *concurrent* sessions a practitioner chooses between, with per-track capacity and conflict rules. Plan-file Decision 5 stands; state this in the migration comment so a later session does not read occurrences as the deferral quietly reopening.

**Two gaps inside this design, open and not yet decided** — both are places a silently-wrong number could reach the ledger, so they need settling before implementation, not during:

1. **Which accreditation row applies when several are satisfied.** Under the linking table, ICI's Pathologists need three accreditation rows — 5 linked to {Day 1}, 6 linked to {Day 2}, 11 linked to {Day 1, Day 2}. A practitioner attending both days satisfies *all three* (each row's occurrence set is a subset of what they attended). The selection rule must be explicit. Proposed: **take the single row whose occurrence set is the largest subset of what was attended, and never sum rows together** — which yields 11, and is consistent with this ADR's "stored as published, selected not computed" principle. It matters where a body's combined value is not the sum of its parts: if "Both Days" were published as 12, summing the day rows gives 11 and selecting gives 12, and only one of those is what the body actually published.
2. **How a proportional body is distinguished from an explicit-schedule one.** A proportional body has one accreditation row covering every occurrence, awarding `credit_value × (points earned / points available)`. An explicit-schedule body has several scoped rows and awards the selected row's value outright. Inferring the scheme from the row shape ("one row covering everything means proportional") is fragile — a single-day event makes the two shapes identical. An explicit `award_scheme` column on `event_accreditations`, or on the body's pack, is the safer option.

#### Worked example — ICI Summit 2026

Three of the sheet's published schedules (the figures confirmed to date):

| Body | Day 1 | Day 2 | Both Days |
|---|---|---|---|
| HK College of Pathologists | 5 | 6 | 11 |
| HK College of Anaesthesiologists | 4.5 | 5.5 | 10 |
| CNE (Continuing Nursing Education) | 5 | 5.5 | 10.5 |

Take a practitioner holding verified licences at **three** bodies: the College of Pathologists, the College of Anaesthesiologists, and the College of Psychiatrists. The first two appear on the ICI sheet; **Psychiatrists does not** — the sheet carries 11 of HKAM's 15 Colleges, so four Colleges accredit nothing here.

*Attends both days* → **two** ledger rows: 11 points at Pathologists, 10 at Anaesthesiologists. Psychiatrists produces **no row at all** — not a zero, not an excluded entry, simply no claim, because that body never accredited this event.

*Attends Day 2 only* → the same two bodies, now 6 and 5.5. One identical check-in record, two different numbers, selected by scope.

Note what the table already demonstrates: the three bodies disagree on the value of the *same* day (Day 2 is worth 6, 5.5 and 5.5 respectively), and **CNE is a nursing body sitting alongside ten medical Colleges on one sheet** — cross-profession attribution is present in the very first real event, not a later-market concern. No single per-event scalar, and no arithmetic performed across bodies, can produce these numbers; each comes from its own body's published schedule. That is the case for a pack-driven engine rather than a calculator.

### Proposed consequence (not yet built)

**R1 — proposal, not decided.** Under multi-body accreditation, the 13 bodies on a single sheet do not share one category vocabulary: HKAM Colleges use codes 6.1–6.16 (per ADR-0001); MCHK and CNE, both on the ICI Summit sheet, don't use HKAM's numbering at all; and HKCP's own Operational Guidelines use point tables keyed by category **A–F** — a different alphabet from HKAM's 6.1–6.16, for the **same** Fellow at the **same** event, because HKCP is a College *under* HKAM. One event-wide category value cannot serve all of that.

The proposal under consideration is to store a `role` (attendee / chair / presenter) on the registration — the same per-registration placement ADR-0001 already settled — and let each accrediting body's own rule pack map that role into *that body's* category vocabulary independently. This does **not** re-litigate ADR-0001's placement decision (category-bearing information still lives on the registration, not the event); it is a proposal about which vocabulary a given body draws that category from once more than one body is reading the same registration. Not settled, not built — flagged here as the natural next question this reversal raises, for a deliberate decision before Stage 10 implements the per-body rule-pack read path.
