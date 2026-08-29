# RAG (B9) execution plan — 2026-08-29

_Governing spec: [2026-08-29-rag-guideline-v0.5.2.md](2026-08-29-rag-guideline-v0.5.2.md). Block admission: [../architecture/B9-admission-2026-08-29.md](../architecture/B9-admission-2026-08-29.md). Decisions Log: Q41 (draft at [decisions-Q41-draft-rag-adoption.md](decisions-Q41-draft-rag-adoption.md), pending vault paste)._

_This plan turns the guideline's nine stages into concrete Eventar-shaped work — files to touch, migrations to write, gates to pass, and what to hand to which agent. **Nothing here is on the current MVP week's critical path.** Kick-off waits on Stage-10.4/10.9 close plus the pre-work below._

## The five running invariants

Every stage below closes only when all five gates pass on a clean local stack:

1. `pnpm exec tsc --noEmit` clean.
2. `pnpm exec eslint .` — 0 errors (existing 5–10 pre-existing `devEmailStub` warnings tolerated).
3. `pnpm exec vitest run` — full suite green.
4. `pnpm exec next build` — 25+ routes, no build errors.
5. `pnpm test:rls` — 201/201+ against the local Supabase stack (never the Seoul production project; `.env.local` currently points at Seoul, so re-point via `scripts/demo/dev-local.sh` before any `test:rls` run).

Plus the RAG-specific additions:

6. `pytest services/rag_api/tests -q` — Python unit + integration green.
7. Architecture import-boundary test green (retrieval routers cannot import the privileged client).
8. `scripts/ci/replay-and-verify.sh` — replay-from-zero PASS with both hash chains clean and zero probe residue.

And every "shipped" claim runs the three-lens phase-completion protocol from `~/.claude/CLAUDE.md`: dev-lens agent + user-lens agent (SEPARATE agents) + backtest against real DB.

## Pre-work (before any Stage-1 code)

None of these are code. All are blockers on the container host or on documentation:

- **P1. Container host account.** Pick Railway or Fly.io (per guideline §2.5 item 5). Create the account, set up a project, note the region (Singapore/Tokyo preferred for latency + PDPO alignment). Record in the external processor register (§6.7 of the guideline).
- **P2. Vault paste of Q41.** Copy [decisions-Q41-draft-rag-adoption.md](decisions-Q41-draft-rag-adoption.md) into vault `02 — Decisions Log.md` under the next free Q. Bump Q-number if Q41 is taken.
- **P3. Vault RAG note.** Paste [vault-updates-2026-08-29.md](vault-updates-2026-08-29.md) content into the vault (four notes touched).
- **P4. Supabase pg_cron availability check.** Confirm pg_cron is enabled on the target project. Local stack: `create extension if not exists pg_cron;` If enabling requires a Supabase-paid tier that Eventar isn't on yet, that's a purchase decision — flag before Stage 1.
- **P5. pgvector availability check.** Same as P4 but for pgvector. Should be trivially available on Supabase.

Estimated pre-work effort: **1 day of Ivan-time** (all decisions + a few CLI checks).

## Stage 1 — security + schema foundation

**Goal**: security controls and every audited-mutation table exist and pass their negative tests. Not a byte of retrieval logic yet.

**Deliverables**:
- `services/rag_api/` directory tree:
  - `services/rag_api/pyproject.toml` (uv-locked)
  - `services/rag_api/Dockerfile`
  - `services/rag_api/src/rag_api/main.py` (FastAPI app with `/health` only for this stage)
  - `services/rag_api/src/rag_api/auth/` — JWT verify + membership resolve + role authorise (matches [lib/auth.ts](../../lib/auth.ts) semantics)
  - `services/rag_api/src/rag_api/privileged/` — service-role client isolated in its own module
  - `services/rag_api/src/rag_api/user_scoped/` — anon-key + forwarded-JWT client for RLS-scoped reads
  - `services/rag_api/tests/` — pytest fixtures + a two-organisation security fixture mirroring `tests/helpers/`
- New Next.js Server Action `/app/rag/actions.ts` (or similar) fronting the FastAPI `/health` call, gated by `withSecurity()`.
- Migrations under `supabase/migrations/` (timestamps `20261101xxxxxx`):
  - `20261101000000_rag_init_extensions.sql` — `create extension if not exists vector; create extension if not exists pg_cron;`
  - `20261101010000_rag_schema_core.sql` — `documents`, `document_versions`, `document_relationships`, `document_approvals`
  - `20261101020000_rag_schema_processing.sql` — `processing_jobs`, `parse_runs`, `parsed_elements`, `chunks`
  - `20261101030000_rag_schema_indexes.sql` — `embedding_indexes`, `retrieval_index_assignments` (per-index embedding tables come at Stage 4)
  - `20261101040000_rag_schema_pinning.sql` — `pack_versions`, `pack_sources`, `pack_source_passages`
  - `20261101050000_rag_schema_evaluation.sql` — `evaluation_cases`, `retrieval_traces`
  - `20261101060000_rag_grants_rls.sql` — RLS policies + Hard Rule 11 grant matrix (`REVOKE INSERT/UPDATE/DELETE ... FROM public, anon, authenticated, service_role` for each of the seven audited-mutation tables)
  - `20261101070000_rag_definer_functions.sql` — `SECURITY DEFINER` functions that are the only write path to audited-mutation tables (mirror the `record_credit_entry`/`write_audit_event` pattern already in the repo)
- New TS test suite `tests/rls/rag_audited_table_writes.rls.test.ts` — a table-per-row assertion of the grant matrix for all seven audited RAG tables (SQLSTATE `42501` on every forbidden direct write; positive round-trip for any retained grant per `tests/rls/audited_table_writes.rls.test.ts` precedent).

**Tests** (all must pass):
- Python unit: JWT verify, membership resolve, authorisation decisions per role.
- Python integration: two-organisation fixture confirms `organisation_a` cannot read `organisation_b` rows through the user-scoped client.
- Python architecture: `tests/rag/import_boundary_test.py` fails CI if any file under `src/rag_api/routers/` imports from `src/rag_api/privileged/`.
- TS RLS: `rag_audited_table_writes.rls.test.ts` green.
- Replay-and-verify PASS.

**Gates**: five running invariants + gates 6–8. Full phase-completion protocol.

**Estimated effort**: **7–10 days** (first Python in the repo, first pgvector migration, first `_rag_*` test suite — pace-setter cost).

**Dependencies**: P1, P4, P5.

## Stage 2 — evaluation foundation

**Goal**: the empty scaffolding for measurement — no cases yet, just the structure to add them.

**Deliverables**:
- `services/rag_api/evaluation/` directory:
  - `cases/development/` (empty), `cases/frozen_validation/` (empty), `cases/security/` (empty), `cases/regression/` (empty)
  - `metrics/registry.py` — metric formula register per guideline §12.4 (Document Recall @k, Passage Recall @k, Passage Precision @k, etc.). Each metric declares `pending_baseline` threshold.
  - `runner.py` — takes a partition name + a pipeline_version, emits a JSON report.
- Seed 20–30 development cases (P3 for guidance — Ivan or a delegated author writes them based on the HKAM Guide to CPD / HKCP CPD Manual if available, or a public alternative).
- `docs/plans/rag-evaluation-cases-seed.md` — table of seed cases with expected sources + passages + answerability. This is where authoring effort actually lives.

**Tests**:
- Python unit: each metric formula returns the correct value on a hand-crafted trace.
- Integration: `runner.py` executes end-to-end against the seed set, produces the report, exits 0.

**Gates**: five + 6–7. Phase-completion protocol.

**Estimated effort**: **3–5 days** for the scaffolding + runner. Case authoring is separate work — **1 day per 10 well-written cases** with real regulator content, more if we're writing them against synthetic content.

**Dependencies**: Stage 1 (schema exists). Real cases depend on the corpus arriving (see Stage 5).

## Stage 3 — one format end-to-end (FTS-only)

**Goal**: prove the full path — register → job → parse → chunk → FTS retrieve → gate → return — before adding embeddings or every parser. **Only ONE format** in this stage.

**Deliverables**:
- Pick the format: recommend **DOCX** because python-docx is the most predictable parser and we can hand-craft an evaluation-friendly source. PDF has the bake-off cost. Excel and HTML both have edge cases that pull attention off the pipeline shape.
- `services/rag_api/src/rag_api/parsers/docx.py` — python-docx-based parser adapter conforming to the common parser interface (§10 of the guideline). Writes `parse_runs` + `parsed_elements`.
- `services/rag_api/src/rag_api/chunkers/hierarchical.py` — parent/child chunking per guideline §11. Writes `chunks` referencing the approved `parse_runs.id`. Contextual header for `text_for_embedding` uses only approved metadata.
- `services/rag_api/src/rag_api/retrievers/fts.py` — Postgres FTS candidate retrieval, RLS-scoped.
- `services/rag_api/src/rag_api/gate.py` — the nine-stage gate per guideline §10.
- `services/rag_api/src/rag_api/routers/documents.py` — `POST /documents`, `POST /documents/{id}/processing_jobs`, `GET /processing_jobs/{id}`, `POST /processing_jobs/{id}/retry`, `POST /processing_jobs/{id}/cancel`.
- `services/rag_api/src/rag_api/routers/retrieve.py` — `POST /retrieve` returning the guideline §11 response contract.
- `services/rag_api/src/rag_api/worker.py` — polls `processing_jobs` via the transactional claim (`FOR UPDATE SKIP LOCKED`), runs the offline pipeline.
- A `set_processing_job_claimed(...)` `SECURITY DEFINER` function + a pg_cron job that pokes the worker on a short interval.
- Next.js Server Action `app/rag/retrieve/actions.ts` fronting `POST /retrieve`, gated by `withSecurity()`.

**Tests**:
- Unit: parser adapter, chunker, gate logic.
- Integration: register a DOCX → job runs → chunks exist → FTS retrieval returns them → gate passes → response contract validated.
- Cancellation: `POST /cancel` mid-stage results in `cancelled` without partial artefacts.
- Recovery: kill the worker mid-run, restart, verify no duplicate active chunks.
- Security: two-organisation retrieval — organisation A never sees organisation B's chunks.
- Backtest: run the full Next.js → Server Action → FastAPI → Postgres path with a real Supabase JWT. Verify the response, query `retrieval_traces` back, assert `resolved_organisation_scope` matches.

**Gates**: five + 6–8. Phase-completion protocol with all three lenses.

**Estimated effort**: **10–15 days** — the pipeline is small but every component is new, and this is the stage where cross-block reads first bite (if the retrieve router needs event/registry context it must go through B1/B2 definer functions per BLOCK-ARCHITECTURE fitting rule 2).

**Dependencies**: Stages 1 + 2. Enough of the seed case set to run one meaningful evaluation.

## Stage 4 — embedding + hybrid retrieval

**Goal**: candidate embedding index + vector retrieval + RRF fusion + activation flow + rollback proof.

**Deliverables**:
- Migration `20261102000000_rag_first_embedding_table.sql` — creates the first per-index embedding table (e.g. `emb_<uuid_prefix>`) per guideline §7.10. Named by controlled convention, never interpolated from user input.
- `services/rag_api/src/rag_api/embedders/` — embedding provider adapter (starts as a mock; real provider decided post-bake-off).
- `services/rag_api/src/rag_api/retrievers/vector.py` — pgvector KNN retrieval.
- `services/rag_api/src/rag_api/retrievers/fusion.py` — RRF fusion per guideline §14.1.
- `services/rag_api/src/rag_api/indexes/activate.py` — the atomic pointer-swap in `retrieval_index_assignments`. Rollback is the same code with the previous approved index.
- Extend the Server Action + `POST /retrieve` to use hybrid retrieval when an active embedding index exists.

**Tests**:
- Unit: RRF math.
- Integration: build a candidate index → reconcile chunk count == embedding count → activate → retrieve returns higher-quality results than FTS-only on the seed set → rollback swaps back.
- Rollback backtest: activate index A → run 5 retrievals → activate index B → run 5 retrievals → rollback to A → verify `retrieval_traces.pipeline_versions.embedding_index` matches the restored version.

**Gates**: five + 6–8. Phase-completion protocol.

**Estimated effort**: **5–7 days** for the pipeline + activation, plus **1–2 weeks** for the embedding provider bake-off (open-ended — a data-boundary decision blocks it).

**Dependencies**: Stage 3 shipped. Embedding provider decision (Decisions Log entry required per guideline §6.7).

## Stage 5 — remaining formats, one at a time

**Goal**: add PDF (bake-off), Excel (dual-load), static HTML. Each format is its own slice with its own three-lens review.

**Deliverables** (per format):
- Parser adapter under `services/rag_api/src/rag_api/parsers/`.
- Parser QC checks per guideline §3.3.
- Bake-off record where relevant (PDF: Docling vs Unstructured — the winner recorded on `parse_runs.parser_name`).
- Regression cases added to `evaluation/cases/regression/`.

**Order**:
1. **PDF** first — highest value (regulator manuals are usually PDF). Bake-off adds cost but this stage's value is real.
2. **Excel** — the HKAM cycle-return format that Colleges send. Dual formula/cached-value load is the tricky bit.
3. **Static HTML** — lowest risk, useful for online regulator content saved to disk.

**Tests** (per format):
- Parser adapter unit tests.
- Real-file integration tests using fixtures under `services/rag_api/tests/fixtures/<format>/`.
- Regression test for every known-defect fixture.

**Gates**: five + 6–8 per format. Phase-completion protocol per format.

**Estimated effort**: **5–8 days per format** including the bake-off for PDF.

**Dependencies**: Stage 4 shipped. Real regulator files for each format (P3 covers HKCP manual availability).

## Stage 6 — gate calibration

**Goal**: turn `pending_baseline` thresholds into approved numbers.

**Deliverables**:
- Expanded evaluation cases per guideline §12.3 stratification: answerable + unanswerable, temporal + supersession, exact-value + table, single-source + multi-source.
- Model-specific + query-class-specific + version-tagged score thresholds recorded in a new `services/rag_api/gate/thresholds.yaml` (or equivalent).
- Frozen validation set locked, versioned, and stored under `evaluation/cases/frozen_validation/`.

**Tests**:
- Answerable cases pass, unanswerable cases fail-closed with the right reason codes.
- Threshold changes require a new `gate_version` + a re-run of the frozen validation set.

**Gates**: five + 6–7. Phase-completion protocol.

**Estimated effort**: **7–10 days** of iterative measurement + calibration.

**Dependencies**: Stage 4 shipped (embeddings needed for score thresholds).

## Stage 7 — reranker evaluation (optional)

**Goal**: decide whether a reranker is worth adding.

**Deliverables**:
- Only run if Stage 6 error analysis identifies a material retrieval problem a reranker could plausibly fix.
- If run: candidate rerankers (Cohere / open-source cross-encoder / etc.) evaluated on the same corpus + gold cases per guideline §15.
- Decisions Log entry for whichever is picked (or "no reranker" if none picked).

**Tests**:
- Same evaluation harness, plus the rerank-precision metric.

**Gates**: five + 6–7.

**Estimated effort**: **5–10 days** if we run it. Zero if we don't.

**Dependencies**: Stage 6. Data-boundary approval for any external reranker.

## Stage 8 — observability evaluation

**Goal**: decide whether internal `retrieval_traces` are enough, or an external platform (Langfuse, Helicone, etc.) is worth adding.

**Deliverables**:
- Only run after internal traces are stable and data-boundary approved.
- If run: candidate platforms evaluated per guideline §6.7 register criteria.

**Tests**:
- Redaction correctness for anything shipped externally.

**Gates**: five + 6–8.

**Estimated effort**: **3–7 days** if run.

**Dependencies**: Stage 6. Data-boundary approval.

## Stage 9 — production release

**Goal**: pass the fifteen-item release gate (§3.5 of the guideline) and go live.

**Deliverables**:
- `docs/runbooks/rag.md` — incident procedure, escalation, rollback steps.
- Backup + restoration procedure documented and rehearsed.
- Production configuration in the container host (secrets in the host's secret store, not the repo).
- Final activation of the approved embedding index.
- A `credit_ledger`-untouched proof (a DB-level query showing the RAG deploy wrote nothing into B3 tables), captured in the release evidence directory.

**Tests**:
- Everything above, run against the production stack in a rehearsal window.
- Backtest: end-to-end retrieval through the real Next.js → FastAPI → production Supabase path with a real JWT.

**Gates**: all fifteen items of §3.5 green + full phase-completion protocol.

**Estimated effort**: **3–5 days** of release hygiene, plus rehearsal time.

**Dependencies**: Stage 6 (thresholds locked). Real container host provisioned + credentials rotated. Vault paste of Q41 completed.

## Total sequencing view

```
Pre-work (1d Ivan)
    ↓
Stage 1 security+schema (7–10d)
    ↓
Stage 2 evaluation scaffold (3–5d) — case authoring is separate
    ↓
Stage 3 one format e2e — DOCX (10–15d)
    ↓
Stage 4 embeddings+hybrid (5–7d + 1–2wk bake-off)
    ↓
Stage 5 remaining formats (5–8d × 3 = 15–24d)
    ↓
Stage 6 gate calibration (7–10d)
    ↓
Stage 7 reranker eval (0 or 5–10d)
    ↓
Stage 8 observability eval (0 or 3–7d)
    ↓
Stage 9 production release (3–5d)
```

Wall-clock ballpark, assuming solo build with normal Eventar interruptions: **~10–14 weeks** for a real Stage-9 release, longer if the embedding bake-off or corpus availability drags.

Stages 1–3 are the minimum viable slice: after those, retrieval works over one format with FTS-only, gated, RLS-scoped. That is a valid stopping point if priorities change.

## Handing stages to subagents

Per Eventar's phase-completion protocol, **every "shipped" claim runs three separate agents**. Suggested dispatches:

- **Dev-lens agent** per stage: `feature-dev:code-reviewer` or `superpowers:code-reviewer`. Prompt: "Review the diff for stage N of the RAG build against `docs/plans/2026-08-29-rag-guideline-v0.5.2.md`. Verify Hard Rule 11 grant matrix + 42501 tests on every audited table. Verify no B3 write. Verify import-boundary test present. Verify audit-insert-last on any processing_jobs transition that writes audit_events."
- **User-lens agent** per stage: `general-purpose` with an explicit user-role brief. Prompt: "You are an organiser (or body_admin / eventar_staff — pick per the stage). Walk the shipped surface. Look for misleading copy, dead ends, dependencies I have to discover. Read every error message in context."
- **Backtest** per stage: driven from the main session via curl + Supabase MCP + `pytest -q`. Not delegated.

Every stage's plan file (created at kick-off) records which agent ran which lens, what they found, and what was fixed.

## What is deliberately NOT in this plan

- **A rule-pack editor UI.** Rule packs are code. The RAG surface for authors is a lookup + citation-copy workbench, dev-only until a real end-user role exists (guideline §4.3).
- **`participation_evidence` ingestion.** Personal data, outside Phase 1 (guideline §2.6).
- **Live web crawling.** Deferred (guideline §2.6).
- **OCR execution.** Detection required, execution deferred (guideline §2.6).
- **Any write to `credit_ledger` or another B3 table.** Permanent boundary (guideline §1.2).

## Kickoff readiness

- [ ] Q41 pasted into vault `02 — Decisions Log.md`
- [ ] Vault notes updated per [vault-updates-2026-08-29.md](vault-updates-2026-08-29.md)
- [ ] Container host account provisioned
- [ ] pg_cron + pgvector confirmed available on target Supabase project
- [ ] Grant-MVP week (Stage 10.4/10.9) closed
- [ ] Q26 / doctrine D.1 fork resolved OR explicit go-ahead to proceed in parallel

When all six ticks land, Stage 1 can start.
