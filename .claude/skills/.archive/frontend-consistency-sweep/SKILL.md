---
name: frontend-consistency-sweep
description: Use when sweeping UI consistency for dialog, menu or toast.
category: frontend-design
---

# Frontend consistency sweep: read every site, draft batches, apply only on Ivan's word

A sweep changes many sites to one shared recipe. Ivan approves each batch before any edit lands.

1. Read every site the sweep names (file and line range). Quote its current classes. Never write a "before" from memory.
2. Draft one batch as rows: `Where | Before | After`. Mark a row that does not apply (for example a sticky bar is not a popover) as dropped, with the reason.
3. Where two rules or two skills disagree on a row, do not pick. Give at least three options, each naming its source and cost (see `design-decision-specimen-round`).
4. Stop. Wait for Ivan to say "Apply Batch N", or to name row numbers ("Apply rows 1, 2, 7, 8"). Apply only the named rows and hold the rest. When Ivan questions a row ("row 3, check the spacing"), render the after state on a scratch preview route, measure it with the DOM-rect method in `rendered-alignment-measurement`, and show the numbers. Do not change product code for that row until he approves it. Leave the batch uncommitted until he asks for a commit.
5. Apply with a cheaper model (see `subagent-dispatch` model rule). Split by disjoint file sets, give each agent the exact class mapping and a Budget line.
6. Verify yourself before reporting: `git diff --stat -- <paths>`; every changed line contains a mapped class and nothing else; the dead-class grep returns nothing outside the allowed comments; eslint on changed files.
7. Report the batch as applied only after step 6. Name anything left for the next batch.
