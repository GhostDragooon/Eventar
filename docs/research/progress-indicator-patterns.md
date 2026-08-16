# Progress indicator patterns — selection reference

**Date:** 2026-08-16
**Source:** mobile screenshot of a social-media infographic ("Types of Progress Bars"), posted by a UX/UI designer (credited "Omar" in the source post) via a sponsored/shared Facebook post. UGC, non-authoritative — captured as a starting taxonomy, not a design-system spec.
**Status:** Reference document only. Candidate mappings to Eventar surfaces below are a starting point, not a locked decision.

---

## The core principle stated in the source

"Always choose the progress indicator based on the user's need for information, not just the visual style." — i.e. the choice is functional (does the user need to know *how much is left* vs *that something is happening* vs *where they are in a sequence*), not aesthetic.

## The 4 types captured (a 5th, "Progress + Time", was cut off in the screenshot and its content isn't captured here)

### 1. Step Progress Bar
Shows the steps in a process and the current step (numbered nodes connected by a line, e.g. Checkout ✓ → Shipping (current) → Payment → Confirm).
**Best for:** multi-step flows like checkout, onboarding.

### 2. Determinate Progress Bar
Shows exact progress as a percentage (a filled bar + "50%" label).
**Best for:** file upload, form completion, data loading — anything where remaining work is measurable in advance.

### 3. Indeterminate Progress Bar
Shows activity without a specific progress value (an animated/striped bar with no percentage).
**Best for:** loading tasks of unknown duration.

### 4. Milestone Progress Bar
Highlights key milestones achieved in a process (more nodes than a step bar, e.g. Customer ✓ → Shipping ✓ → Payment (current) → Confirm → Success).
**Best for:** project tracking, task completion — longer journeys with named checkpoints rather than a fixed short sequence.

### 5. Progress + Time
Not captured — the screenshot was cut off before this type's description and use case were visible. If this note is revisited, re-source the full infographic to fill this in.

## Candidate mapping to Eventar surfaces (starting point, not decided)

| Type | Candidate Eventar use |
|---|---|
| Step | Multi-step registration / checkout flow (the pattern the vault's Design Session Log already informally describes as "N of 5 complete" on the event form — this is that pattern, now named) |
| Determinate | File upload / CSV import progress (e.g. bulk registrant import), form-completion indicators |
| Indeterminate | Any unknown-duration async load (server action pending states, report generation) |
| Milestone | CPD credit-earning journey or an event's own lifecycle (registered → checked in → attended → credit posted) — closer in spirit to the Gantt-style timeline screenshot already sitting unreviewed in the vault's "UI-UX Design References" note than to a plain step bar |

## Why this note exists

`30 — Reference/Frontend Design Standard.md` has zero existing coverage of progress indicators (confirmed by grep before writing this). Two informal, unlinked mentions already existed in the vault — the event form's "N of 5 complete" bar (Design Session Log) and an unreviewed Gantt-style progress screenshot (UI-UX Design References) — but nothing named the general taxonomy or gave a selection rule. This note is that missing piece; it doesn't replace or duplicate either existing mention.
