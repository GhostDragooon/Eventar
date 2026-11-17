# Handoff 2026-11-16: B9 RAG foundation, Stage 1

## §0 Ivan's action list

**Decide (recommendation first)**
1. **Push d514501, dcbc3ad and the handoff commit?** Recommend yes. Origin/main is `a6ec981`; main is 3 ahead (Stage 1 code, graph refresh, this handoff). Give the go naming the SHA: `git push origin <tip SHA>:refs/heads/main (tip is the commit that holds this handoff)`. The CI workflow `rag-api.yml` has never run; the first push runs it.
2. **May a `body_admin` read an organisation-private accreditation letter that names their body?** Recommend keep "no" (deny by default) until a reader case appears.
3. **Apply the eight `20261117*_rag_*` migrations to Seoul?** Recommend not yet. Nothing reads them there. Wait for Stage 8.

**Execute (only you)**
1. Put the corpus files in `scratch-demo/rag-corpus/` (unblocks card B9-S2-B).
2. Review the 24 seed cases and the other R2.8 items in `docs/plans/2026-08-29-rag-execution-plan.md`.

**Queued for Claude**
- Card B9-S2-A (Python evaluation scaffold) can start now. B9-S2-B waits for the corpus.
- Semantic graph pass over the changed docs (72 files, mostly peer skill files). The refresh below was AST-only.

**Other sessions**
- Peer edits stay unstaged: `app/`, `components/`, `AGENTS.md`, `.claude/skills`, `docs/plans/.claude`, `docs/plans/2026-11-05-db-cleanup-dependency-map.md`.

## What was built

Commit `d514501` (46 files). Eight migrations, 15 tables, Hard Rule 11 on seven audited tables, five definer functions. `services/rag_api/` with `/health` and `/whoami`. Details: vault note `20 — Roadmap/B9 Stage 1 — RAG Foundation (2026-11-16).md`, reviews in `docs/plans/rag/REVIEW-S1-*.md`.

## Gates (local stack)

tsc 0; eslint 0 errors, 11 warnings; vitest 2250 passed; next build 0; `test:rls` 564 + 57 passed; pytest 71 passed. Not run: the GitHub workflow. Not applied: Seoul.

## Graph state

- Repo graph (`dcbc3ad`): 6446 nodes, 11140 edges, 603 communities. Built by AST merge of 48 changed code files. A plain `graphify update .` was tried first and rejected: it dropped INFERRED edges from 873 to 87. Changed docs have no semantic pass and are not in the manifest.
- Vault graph: 879 nodes, 1545 edges, 63 communities. Decisions Log nodes carried over; Q53, the Stage 1 note and an Index reference added by hand-written extraction.

Closing: repo graph done (2026-11-17) · vault note done (/Users/ivan/Desktop/Eventar/20 — Roadmap/B9 Stage 1 — RAG Foundation (2026-11-16).md) · vault graph done (2026-11-17)
