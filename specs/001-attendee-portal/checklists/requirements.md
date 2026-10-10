# Specification Quality Checklist: Attendee portal

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

- Validation pass 1: all items pass. Two things were tightened while validating: the chrome list in FR-009 now matches the stated scope (the check-in confirmation page is covered only by FR-012), and the session-flash edge case was reworded as an observable behaviour rather than a mechanism.
- Project vocabulary is deliberate: decision codes (D6, D9, D12 to D16, Q26, Q32), "Hard Rule 6/12" and finding IDs (A1 to A6, I6) point at records this project already keeps (`docs/plans/handoff_20261001-core-ux.md`, the vault Decisions Log, `CLAUDE.md`). Dependencies name existing pieces (door classifier, account layout) in the Assumptions section only, where the template asks for them.
- One assumption is flagged for the human at the checkpoint instead of being marked as a clarification, because a reasonable default exists and the cost of a wrong guess is a label: the menu's "Profile and memberships" becomes "Profile and licences".
- **Validation pass 2 (2026-10-02, after an independent read-only review of all three specs; every finding below was re-checked in code before it was acted on).** Corrected: the organiser "way back" requirement misread finding I7 (the Programme button already shows on a phone; it is the public-view caption that is hidden and `aria-hidden`), so FR-011 now asks for both the button and the label; the "never flash Sign in" requirement reversed a documented static-prerender trade-off on the landing page and is now scoped to what the plan does (the interim state and a safe fallback); the "destination remembered across separate sign-ins" clause promised something that does not exist and was dropped; the invite page is an organiser-door page, so FR-009 no longer puts the practitioner menu on it; Claim past events keeps Ivan's 2026-09-21 visibility rule and is flagged; three overclaims in the background text were corrected (the pre-registration nudge exists, the "proof of registration" line shows only when email was not sent, the pages do cross-link); stale vocabulary ("post-M4") replaced; decision-carrying requirements D15 and D16, the owning block and the stale sign-in message (FR-016) were added.
- Flagged for Ivan in Assumptions (reasonable defaults, so no clarification markers): the "Profile and licences" rename, and Claim past events shown only while there is something to claim.
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`; none are incomplete.
