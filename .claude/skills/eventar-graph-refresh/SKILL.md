---
name: eventar-graph-refresh
description: Use when refreshing or merging the Eventar vault graph.
category: tooling
---

# Eventar graph refresh: bare update for the repo graph, merge only for the vault graph

Refresh the repo graph with a bare `graphify update .` from /Users/ivan/Eventar. Never run a bare `graphify update` on the vault at /Users/ivan/Desktop/Eventar. It rebuilds from markdown structure and drops the curated semantic edges (2026-11-21: 915 nodes and 1579 edges fell to 1816 and 1058).

Repo graph:
1. Run `graphify update .` from /Users/ivan/Eventar.
2. Confirm: `grep -n "Built from commit" graphify-out/GRAPH_REPORT.md` must match `git rev-parse --short HEAD`.

Vault graph, for a new or changed note (run from /Users/ivan/Desktop/Eventar):
1. Back up `graphify-out/graph.json` to the scratchpad, not into the repo.
2. Write the note first. Take the node id from a sibling note: look up its `id` by `source_file` in graph.json. Do not hand-slug the id. Em dashes and `+` give irregular underscores.
3. Run `/Users/ivan/.local/share/uv/tools/graphifyy/bin/python .claude/skills/eventar-graph-refresh/scripts/merge-vault-note.py NODE_ID "SOURCE_FILE" "LABEL" TARGET_ID...`. Targets are the notes the new note cites, such as `02___decisions_log`.
4. Run `graphify cluster-only .` in the vault folder. It backs up the curated graph and re-clusters.
5. Check that node and edge counts rose by the new note only. graph.json keeps edges under `links`, not `edges`.

Facts to keep:
- `build_merge` returns the graph in memory. Nothing is written until `to_json(..., force=True)` runs; the script does this. Evidence: a probe printed `922 1590`, and the file still read `921 1587` afterwards.
- Closing order stays: repo graph, vault note, vault graph. Never write "done" for a step that did not run.

Script: `scripts/merge-vault-note.py` (pointer above).
