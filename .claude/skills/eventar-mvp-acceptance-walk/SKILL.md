---
name: eventar-mvp-acceptance-walk
description: Use when running the MVP acceptance walk or REVIEW-FINAL.
category: verification
---

# MVP acceptance walk: one open MAJOR or red gate means not done

Declare the MVP complete only when every checklist row passes on the final HEAD with evidence. One open BLOCKER or MAJOR, one red gate, or one unrun row keeps it open. Lead with the verdict.

Hard rule: nothing dies in silence. A quiet data change, a dead-end instruction, or a partial write with no plain recovery path is a MAJOR. Triage each into fix-now (tied to a named ruling) or defer (written in the summary with its reason and the stage it waits for). A deferred item is never reported as fixed.

- Tag each checklist row: [X] executed this run, [R] read in code, [I] inferred. A row without an [X] tag is not a pass.
- Re-run each headline MAJOR yourself before presenting it. Name the MAJORs that rest only on an agent's run.
- Order the work so the walk judges final copy. Run the reviewers and the backtest read-only first, then one fix wave, then the full gate chain, and run the user-lens walk last. Do not edit copy while a backtest greps exact strings: the edit invalidates its checks, and hot reload changes pages mid-walk.
- Run the gate chain on the final tip per `eventar-static-gates`. Quote live `check:ui-*` counts, never the handoff's; label each hit that predates the base commit.
- A step an agent did not reach at its cap is a gap. If you run it yourself, mark it orchestrator-executed with its evidence; never add it to the agent's PASS count.
- A subset vitest run is a spot check. Say so; never write "gates green" for it.
- Screenshots: list per step whether the image is on disk. "Inspected inline" is not a screenshot.
- One `docs/plans/mvp/REVIEW-FINAL-<lens>.md` per lens, plus `REVIEW-FINAL-summary.md` with the checklist table. Each lens reads and writes only its own file.
- Rows for PROJECT_STATE, vault and graph stay NOT RUN until Ivan rules on the findings. Do not commit, stage or push the review files without his go.
