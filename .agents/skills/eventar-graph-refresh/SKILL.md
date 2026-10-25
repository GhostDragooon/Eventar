---
name: eventar-graph-refresh
description: Use when refreshing or committing graphify-out/ graph.
category: git-workflow
---

# Eventar graph refresh: commit tracked outputs only

Refresh `graphify-out/` incrementally, then commit only the tracked outputs. Never commit the local backups.

1. Run `graphify --update` over git-tracked changes, then `graphify cluster-only .` to name the communities. macOS has no `timeout` binary; do not wrap the command in one.
2. Judge health against the previous graph before calling anything a regression. The nine self-loop edges, all in `tests/rls/` and `tests/cpd/` files, were already there on 2026-10-15.
3. Stage and commit with a pathspec so peer-staged files stay out: `git add -- <paths>` then `git commit --only -- <paths>`. Add only paths that still exist: `git add` aborts the whole list if one path is missing or already staged as deleted. Pass deletions to `git commit --only -- <paths>` by path.
6. Code-only refresh: if changed docs get no semantic pass, leave them out of the saved manifest so the next refresh extracts them. Marking them seen first is the partial-update trap. Paths: `GRAPH_REPORT.md`, `graph.json`, `graph.html`, `manifest.json`, `cost.json`, `cache/stat-index.json`, and the `cache/semantic/*.json` files for changed sources.
4. Leave out the dated `graphify-out/YYYY-MM-DD/` backup folders and `.graphify_labels.json.sig`. Both are untracked local artifacts.
5. If a semantic chunk fails mid-run, look for a partial `.graphify_chunk_*.json` before re-dispatching. Abort the update rather than merge a partial chunk.
