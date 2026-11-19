# Handoff 2026-11-19: MVP walk, frontend coherence pass, and three UI guides (planned, not applied)

## §0 Ivan's action list

**Decide (recommendation first)**
1. **Push the coherence commit?** Recommend yes after you look at it live. Origin/main is `8505306`. Give the go naming the SHA (`git push origin <tip SHA>:refs/heads/main`).
2. **Styling render (S1) and typography render (T1): not built yet.** When you give the go, the next session builds both specimen routes, then stops for your picks. Nothing from the three guides is applied to product code.
3. **Eight open copy and behaviour decisions** from the walk are unchanged (plan file, "Needs Ivan's decision").

**Execute (only you)**
- Nothing blocking. You will provide no more guide sets (motion, styling and typography are all in).

**Queued for Claude**
1. Build S1 (`app/dev-preview-uiport/styling/`) and T1 (`app/dev-preview-uiport/typography/`), then review with `design-taste-frontend`, `emil-design-eng`, `impeccable-design-polish`. Stop for picks.
2. Apply M2, then S2, then T2, per layer (globals.css, `components/ui`, shells, call sites), with Batch 3 rows 3 to 6 inside it.
3. Batches 4 and 5, Step 6 security, Step 7 close (gates, dev review, user review, backtest).
4. Live after-screenshots of Batches 1 to 3, plus 375px and dark baselines (never captured).
5. Clean up the walk fixtures in the local DB (list in the plan file, "Status at pause").

**Other sessions**
- Peer RAG session (`b6f0a7`) idle. Its files stay unstaged: `.claude/skills/`, `docs/plans/.claude`, `docs/plans/2026-11-05-db-cleanup-dependency-map.md`, `graphify-out/` scratch, repo-root `GATES.md`.

## The plan

Executable plan: `docs/plans/2026-11-19-coherence-and-ui-guides-plan.md` (copy of `~/.claude/plans/pasted-content-id-7954-eventar-majestic-eagle.md`). Read its status sections first: "Status at lock", "Motion pass: LOCKED picks", then the Styling and Typography sections and "Combined execution order".

## What is done (in the commit)

- **Batch 1:** 28 dead Tailwind classes replaced with defined tokens (16 files).
- **Batch 2:** 52 copy rows (Verb + Noun actions, leaked internals removed, one name per action, organiser spelling, licence wording), with tests updated.
- **Batch 3 rows 1, 2, 7, 8:** `ConfirmDialog` matches `Dialog` (20px, `bg-on-surface/60`, shared `Button`); discard dialog order Keep editing then red Discard changes; pricing toast moved to `useToast`; select popover `shadow-lg`.
- **Dev-only specimens** (production 404 via `app/dev-preview-uiport/layout.tsx`): `batch3/` (rows 3 to 6 render) and `motion/` (10 motion patterns, all locked).

## Rulings recorded this session (2026-11-19)

- Render before any visual change (memory `frontend-changes-show-render-first`).
- Motion: all 10 patterns approved; shake = 7px, 300ms, `[0,-7,7,-4,4,0]`, banner only; tooltips, drag-to-dismiss sheet and transform-only bars are in scope.
- Styling: OKLCH as logic (matched L per set, `in oklch` gradients), not copied values; `--outline-variant` becomes alpha; dark menus and dialogs step to `surface-container-high`; concentric radius amends ruling 2 (menu rows = outer minus padding).
- Typography: curly quotes swept app-wide incl. emails; small caps on every acronym; `headline-lg` and the hero go fluid (amends ruling 1); card titles clamp at 3 lines.

## Gates (this session, local)

tsc 0; eslint 0 errors, 11 warnings (same as `d9ed559`); affected vitest files pass except the known `PublishDraftButton` flake. **Not run:** full `vitest run`, `next build`, `check:ui-*`, the phase-completion dev and user reviews, backtest. This is a pause handoff mid-phase, not a phase close.

## Not verified

- Batches 1 to 3 have not been seen live after applying.
- Motion specimen: slow-drag spring-back and reduced-motion not exercised in a browser.

## Graph state

- **Repo graph:** 6485 nodes, 11503 edges, 595 communities. INFERRED edges went from 894 to 898.
  - **How it was built:** code-only AST merge. All 899 code files were re-extracted, because extracting only the 105 changed files dropped 515 cross-file import and call edges.
  - **Not covered:** the 86 changed docs (mostly peer skill files) got no semantic pass. They stay out of the manifest, so the next `--update` picks them up.
  - **`graph.html`:** not regenerated, since the graph is over the 5000-node viz limit. Its tracked deletion is left unstaged.
- **Vault graph:** 889 nodes, 1562 edges, 61 communities, 23 hyperedges.
  - **What was extracted:** the new note `Frontend Coherence + UI Guides (2026-11-19).md` and the changed `MVP Close` note. All 11 existing node ids and 20 existing edges were kept.
  - **Script fix:** in the extraction chunk, before merging, 4 link targets were changed by script to the vault's existing ids (`30___reference_frontend_design_standard`, `02___decisions_log`, `20___roadmap_phased_roadmap`). The extraction agent stopped on an API error after it had written a complete chunk. The chunk was validated by script before merging.

Closing: repo graph done (2026-11-19) · vault note done (/Users/ivan/Desktop/Eventar/20 — Roadmap/Frontend Coherence + UI Guides (2026-11-19).md) · vault graph done (2026-11-20)
