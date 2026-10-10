# Specification Quality Checklist: Event authoring

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

- Validation pass 1 found requirements the approved plan does not cover (stale-form detection for concurrent edits, an unsaved-changes warning, image-upload failure handling, an unverified claim about check-in windows, and an overlapping-sessions rule that would have decided multi-track by the back door). They were removed or reworded rather than kept, so the specification stays inside the plan's scope (CLAUDE.md rules 3 and 13). Concurrent edits are recorded as an assumption (last-save-wins in this version), not a clarification, because a reasonable default exists.
- Database packages (P4, P5, P9a) and the ADR appear only under Assumptions as dependencies; the requirements describe behaviour.
- Two items are flagged for the human at the checkpoint: the session description becoming public on the agenda and poster, and the deferral of track, location, tags and a per-session published flag (decision D7), each with its re-entry criterion in the plan.
- **Validation pass 2 (2026-10-02, after an independent read-only review of all three specs; every finding below was re-checked in code or against the local database before it was acted on).** Corrected: the story about stable sessions is now P1 (the plan orders it first); the refusal grounds for a day are one thing everywhere ("attendance, or covered by an accreditation"); the claim that credit mappings point at a session was dropped (only survey answers do); the quoted copy and the "cannot be changed at all" overclaim were corrected; "side by side" and "sessions move with their day" were replaced by what the code and plan actually do; a change back to an earlier value is now a new email (a content-hash de-duplication would silently drop it); the server, not the page, refuses locked-field edits; the early draft of the publish-at-once assumption contradicted the approved plan and is now a flagged proposal that defaults to the plan.
- **Flagged for Ivan (reasonable defaults, so no clarification markers were used):** (1) publish-at-once on the create form through the same confirmation, or keep it as the plan has it; (2) how each day's own start and end are defined (default: same time of day every day), to be confirmed before package P5 because the strict check-in window turns a wrong guess into a lockout; (3) the vault-versus-code conflict on which time zone organisers type times in; (4) a session description becoming public text (notes are already API-readable for a published event, verified on the local database); (5) the classification of fields that are neither logistics nor capacity.
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`; none are incomplete.
