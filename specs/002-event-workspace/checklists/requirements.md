# Specification Quality Checklist: Event workspace

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-02
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Validation pass 1: all items pass after three corrections made while validating: the "after the event" check-in finding was worded as the evidence supports it (an "ok" answer, not a proven write); an edge case about walk-ins and capacity was removed because the product's current behaviour is unverified and the plan does not cover it; the device-clock edge case no longer promises a server-synchronised countdown the plan does not include; a stale-form conflict edge case was dropped and recorded as an assumption (last-save-wins in this version).
- The database-enforced rules (check-in window, audited registrant edit) are named as requirements on behaviour; the mechanism (packages P3 and P6 of the plan) appears only under Assumptions, where dependencies belong.
- One assumption is flagged for the human at the checkpoint instead of a clarification, because a reasonable default exists: who may edit a registrant (any active organiser member of the owning organisation, plus platform staff) versus administrators only.
- **Validation pass 2 (2026-10-02, after an independent read-only review of all three specs; every finding below was re-checked in code before it was acted on).** Corrected: "near-duplicate" homes became "overlapping" (the findings log's own verdict is that they are not duplicates); the Manage actions now include Cancel and the Cancelled tab, and the stale "archive" subtitle is named exactly; roles are "presenter and chair" as the product has them; the "refused without revealing whether it exists" promise changed today's read-only fallback and collided with the separate cross-organisation task, so it is scoped to "no action" with not-found reserved for other organisations' events; the check-in requirements no longer name a mechanism ("live push") or invent numbers (2 s, 10 of 10), and "narrow" is defined as 375 px; the unaudited write path now has a requirement (no direct write may change a registrant's name or email) so SC-004 is provable; the non-rotated check-in code is recorded as a risk, not a feature; D15/D16 and the owning block were added.
- Flagged for Ivan in Assumptions: who may edit a registrant, the check-in code that is not rotated (risk), and the Programme stat row and calendar that survive the merge.
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`; none are incomplete.
