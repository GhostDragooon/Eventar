# RAG (B9) execution plan — 2026-08-29

_Governing spec: [2026-08-29-rag-guideline-v0.5.2.md](2026-08-29-rag-guideline-v0.5.2.md). Block admission: [../architecture/B9-admission-2026-08-29.md](../architecture/B9-admission-2026-08-29.md). Decisions Log: Q41 (draft at [decisions-Q41-draft-rag-adoption.md](decisions-Q41-draft-rag-adoption.md), pending vault paste)._

_This plan turns the guideline's nine stages into concrete Eventar-shaped work — files to touch, migrations to write, gates to pass, and what to hand to which agent. **Nothing here is on the current MVP week's critical path.** Kick-off waits on Stage-10.4/10.9 close plus the pre-work below._

## Revision R1 — 2026-11-16 (draft, awaiting Ivan's review)

_Scope set by Ivan, 2026-11-16: revise this plan in place; borrow patterns from ragflow, do not run it; cluster with e-means, never k-means, and only where evaluation shows a gain; this session produces a plan only. No code, no migration, no change of active phase. Every changed passage below is marked **R1**. Sources and numbers: `.claude/skills/rag-engine-planning/references/rag-state-of-art-2026-11.md`, plus the two research reports summarised in "R1 evidence" at the end of this file._

**What R1 changes, in one screen**

| # | Change | Where | Status |
|---|---|---|---|
| R1-a | Chunker borrows ragflow's `laws` hierarchy merge: every child chunk carries its full heading chain. The chain feeds the deterministic contextual header. | Stage 3 | In plan |
| R1-b | Gold set gains four strata and two metrics. Zero-result queries are never dropped from scoring. | Stage 2 | In plan |
| R1-c | Vector search is exact (no ANN index) for this corpus size. | Stage 4 | In plan |
| R1-d | Reranker evaluation becomes expected, not optional. | Stage 7 | In plan |
| R1-e | Clustering has three named roles, each with an entry trigger. e-means is the only permitted algorithm. | New section "Clustering (e-means)" | In plan |
| R1-f | Verbatim-evidence check added to the gate. | Stage 3 | In plan |
| R1-g | Decision record number corrected: vault Q41 is taken; RAG adoption takes the next free number, Q53. | Pre-work P2 | In plan |
| D1–D5 | Five changes that touch the governing guideline. | "R1 flagged decisions" | **Ruled 2026-11-16 (Ivan): all five recommendations accepted** |

**What R1 does not change**: the block (B9), the boundary (no B3 write, no generation in Phase 1), the security design (Hard Rule 11 matrix with `42501` tests, forwarded JWT, privileged client confined to `services/rag_api/privileged/`), the stage count, and the kick-off gate.

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
  - **R1:** Q41 is taken (vault Q41 = Core-UX design round, 2026-10-01). The vault's highest entry on 2026-11-16 is Q52, so RAG adoption pastes as **Q53**. Re-check the number on the day of the paste. In-repo references that still say "Q41" for RAG adoption: this file, the guideline (lines 4, 409, 1012–1074), `B9-admission-2026-08-29.md`, `BLOCK-ARCHITECTURE.md:50`. They are corrected in one sweep at paste time, not before.
- **P3. Vault RAG note.** Paste [vault-updates-2026-08-29.md](vault-updates-2026-08-29.md) content into the vault (four notes touched).
- **P4. Supabase pg_cron availability check.** Confirm pg_cron is enabled on the target project. Local stack: `create extension if not exists pg_cron;` If enabling requires a Supabase-paid tier that Eventar isn't on yet, that's a purchase decision — flag before Stage 1.
- **P5. pgvector availability check.** Same as P4 but for pgvector. Should be trivially available on Supabase.

- **P6 (R1). Corpus language count.** Count Traditional Chinese content in the Phase-1 corpus (pages or characters per document). Postgres `tsvector` has no Chinese word parser, so any non-trivial share triggers flagged decision D5 before Stage 3. Half an hour once the first documents are in hand.

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

**R1 additions**:
- Seed cases cover four more strata from day one: unanswerable (the gate must fail), table lookup (an exact value from a table cell), multi-section (evidence in two or more sections), and Traditional Chinese queries if P6 finds Chinese content.
- Two more metrics in `metrics/registry.py`: gate false-pass rate (a fail-expected case that passes) and citation exact-match (the returned span equals the expected passage span). A wrong pass is the worst outcome for this service, so false-pass rate is the headline number.
- Scoring rule: a query that returns nothing scores zero. It is never removed from the set. (ragflow's `rag/benchmark.py` deletes such queries, which inflates its recall. Do not copy that.)
- Cases are written by a person against real passages. Synthetic cases are allowed only as a supplement and are hand-checked, because generated questions copy the generator's wording and inflate scores.
- Size guide from current practice: 50–100 cases give a useful signal; 200–300 labelled query/passage pairs give trustworthy recall@k. The Stage-6 frozen set aims for the upper range.

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

**R1 additions** (patterns read from ragflow source, Apache-2.0; re-implemented here, no ragflow code or service is added):
- **Heading chain per chunk (R1-a).** `chunkers/hierarchical.py` follows the idea of ragflow's `hierarchical_merge` (`rag/nlp/__init__.py`, v0.20.5): detect the document's numbering family, bind each leaf to its nearest preceding ancestor at every level, and store the chain in `chunks.section_path`. The deterministic contextual header in `text_for_embedding` is that chain plus approved metadata (body, document title, version, effective date). This gives most of the benefit of "contextual retrieval" while `chunks.text` stays untouched, as guideline §7.8 requires.
- **Own numbering patterns.** ragflow's English patterns stop at PART / Chapter / Section / Article and `N.N.N`. HK regulator manuals need their own set (for example `Appendix A`, `Schedule 1`, `(a)(i)`, and `第N條`). The pattern set is a versioned constant; a change is a chunker version change.
- **Front-matter hygiene.** Drop the table of contents before chunking and ignore dot-leader lines (`1.2 ..... 14`). Drop running headers and footers. Each rule records what it removed in `parse_runs`, so nothing disappears silently (Rule 12).
- **Tables stay whole.** A table is one chunk with its caption and header row, `is_table = true`. Stage 5 extends this to PDF and Excel.
- **Source position on every chunk.** `page_start`, `page_end` and `location` are filled for every chunk at write time. A passing result with no `source_location` is already a hard fail (guideline §10.4 item 8).
- **Verbatim-evidence check (R1-f).** Before the gate returns `pass`, each returned passage is compared byte-for-byte with `chunks.text` at its stored `character_start`/`character_end`, and `content_sha256` is re-verified. A mismatch is a hard fail with its own reason code. This is deterministic code, not a model.
- **Deterministic query expansion only.** The approved synonym list (guideline §5.2) gains two maintained glossaries: body names and acronyms, and English ↔ Traditional Chinese term pairs. No LLM query rewriting and no hypothetical-document expansion: published evidence shows the latter helps mainly where the model already knows the answer, which is not the case for HK regulator text.

**Tests**:
- Unit: parser adapter, chunker, gate logic.
- Unit (R1): heading-chain binding on a fixture with skipped levels; contents-table removal; verbatim-evidence check fails on a one-character change.
- Integration: register a DOCX → job runs → chunks exist → FTS retrieval returns them → gate passes → response contract validated.
- Cancellation: `POST /cancel` mid-stage results in `cancelled` without partial artefacts.
- Recovery: kill the worker mid-run, restart, verify no duplicate active chunks.
- Security: two-organisation retrieval — organisation A never sees organisation B's chunks.
- Backtest: run the full Next.js → Server Action → FastAPI → Postgres path with a real Supabase JWT. Verify the response, query `retrieval_traces` back, assert `resolved_organisation_scope` matches.

**Gates**: five + 6–8. Phase-completion protocol with all three lenses.

**Estimated effort (R1)**: **12–18 days** (was 10–15; the hierarchy chunker and its pattern set add 2–3 days) — the pipeline is small but every component is new, and this is the stage where cross-block reads first bite (if the retrieve router needs event/registry context it must go through B1/B2 definer functions per BLOCK-ARCHITECTURE fitting rule 2).

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

**R1 additions**:
- **Exact search, no ANN index (R1-c).** The Phase-1 corpus is thousands of chunks. pgvector with no index scans every row and returns perfect recall, in milliseconds at this size. This is the baseline answer to guideline §2.5 item 6 ("vector index type and parameters"). It also removes the pgvector dimension limit (2,000 for `vector`, 4,000 for `halfvec`) from the embedding bake-off. `ivfflat` is excluded outright: its lists are trained with k-means inside pgvector, which cannot be replaced. If an index is ever needed, it is HNSW, and that is a material pipeline change (guideline line 1001).
- **Bake-off must include a multilingual candidate** and must score the Traditional Chinese stratum separately if P6 found Chinese content. Public leaderboards are mostly Simplified Chinese; no Traditional Chinese evidence was found for any model.
- **Candidate ceiling.** Retain the top 50–150 fused candidates so the Stage-7 reranker has room to work.

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

**R1 additions**:
- **PDF tables.** Keep each table as one chunk, stored as HTML with row and column spans, with its caption. Index a tag-stripped copy for lexical search. Hand-check every table in the Phase-1 corpus; the corpus is small enough.
- **PDF positions.** Carry page and bounding box from the parser through to `chunks.location`, so a citation can highlight the source region.
- **Excel.** One chunk per row as `column: value` pairs, with merged and multi-level headers inherited down to each row (ragflow `table` template pattern). This sits beside the formula/cached-value dual load, not in place of it.
- **Bake-off candidates (D4, ruled 2026-11-16).** Three: Docling, Unstructured, MinerU pipeline. The judge is our own files, not a public benchmark.

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

## Stage 7 — reranker evaluation (R1: expected, was optional)

**Goal**: decide whether a reranker is worth adding.

**R1**: plan for this stage to run. A cross-encoder reranker over fused candidates is the largest measured gain in current evidence (Anthropic 2024-09: retrieval failure 2.9% → 1.9% on top of contextual hybrid; ViDoRe V3, 2026-01: +13.2 nDCG@10). Skip it only if Stage 6 shows recall and false-pass rate already at target. Ruled 2026-11-16: this stage runs **before** Stage 6 (D2), and the reranker is hosted, for public regulator documents only (D3). Dependencies become: Stage 5, the gold set, and the vendor's Decisions Log entry.

**Deliverables**:
- ~~Only run if Stage 6 error analysis identifies a material retrieval problem a reranker could plausibly fix.~~ (replaced by the R1 note above)
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

## Clustering (e-means) — R1-e

**Rule**: the only clustering algorithm in this service is e-means (arXiv 2611.09501, Meta FAIR, 2026-11-06; `faiss.contrib.e_means`, shipped in `faiss-cpu` 1.16.0). k-means is never written into code, tests or plans. A one-line CI check greps `services/rag_api/` for `KMeans|kmeans` and fails on a hit.

**What e-means is, plainly**: it minimises the same objective as k-means, with EMA mini-batch updates. Its published gain is speed at large scale (the authors report Lloyd's 25-epoch loss reached in 1.4–2.6 epochs). It does not by itself raise retrieval accuracy. It needs `k` chosen in advance. It is a v1 preprint with no independent replication yet. On a few thousand chunks its speed gain is not measurable. So the choice of e-means is safe, and the choice of *whether to cluster at all* is the one that needs evidence.

**No clustering step is in Stages 1–9 by default.** A step enters only through one of three named roles, each with a trigger:

| Role | What it would do | Entry trigger | Evidence today |
|---|---|---|---|
| **C1. Corpus analysis (offline)** | Cluster chunk embeddings to (a) sample gold cases evenly across topics and (b) group near-identical passages across document versions for `version_comparison`. Never on the query path. | Stage 2 or 6, if the gold set is found to be lopsided, or Stage 6 if version-comparison cases miss paired passages. | Low risk: output is a worklist for a person. Most likely first use. |
| **C2. Summary tree (steering only)** | RAPTOR-style: cluster chunks, summarise each cluster, search summaries, then expand to member chunks. Summaries are stored in their own table, never in `chunks.text`, and are never returned as evidence. | Stage 6 error analysis shows a class of `checklist` / `comparison` questions that still fail on recall after hybrid + rerank. | Against, for exact lookup: RAPTOR scores below plain dense retrieval on NQ and MuSiQue (HippoRAG 2 paper, Table 2). RAPTOR's own ablation shows clustering beating contiguous grouping by 0.8 points. ragflow removed UMAP + GMM clustering and now cuts contiguous runs in document order. Also needs flagged decision D1, because summaries are machine text. |
| **C3. IVF centroid training** | Train the coarse centroids of a faiss IVF index. | Corpus above roughly 1 million vectors. | Not in this plan. Exact search covers Phase 1 (R1-c). |

**Admission rule for any role**: a written hypothesis, a run on the frozen validation set before and after, and acceptance only if the target metric improves without raising false-pass rate. A step that fails this is removed, not kept "for later".

**Implementation notes, for when a role is admitted**: `faiss-cpu` is pinned at 1.16.0 or later and added to `pyproject.toml` only then. Use `NumpyEmeans(d, k)` with `spherical=True` for cosine embeddings and a fixed `seed`. Choose `k` by a small sweep scored on the gold set, and record `k`, seed and faiss version on the artefact. Labels returned by `train()` come from the last pass; call `assign()` for final labels. Before first use, confirm the 1.16.0 wheel contains `faiss/contrib/e_means` (the release notes say so; the wheel itself was not opened).

## R1 flagged decisions (ruled 2026-11-16 — Ivan accepted all five recommendations)

**Rulings, as they now bind the stages:**
- **D1 — not now.** No LLM-written chunk context. The deterministic heading-chain header ships. Re-open only on Stage-6 evidence.
- **D2 — yes.** Run order after Stage 5 is **7 → 6 → 8 → 9**. Stage numbers keep their names. Stage 7 now depends on Stage 5 and the gold set, not on Stage 6; Stage 6 depends on Stage 7's outcome. This amends the guideline's §16 stage order.
- **D3 — hosted reranker, public regulator documents only.** The vendor still needs its own Decisions Log entry and register row before any call (guideline §6.7). Self-hosting stays excluded (§2.6 item 5) and is revisited when accreditation letters are in scope.
- **D4 — MinerU pipeline joins the PDF bake-off** beside Docling and Unstructured (Stage 5). This amends guideline §2.4 item 7. No vision-model parser; "OCR execution deferred" stands.
- **D5 — decide after P6.** No lexical-engine change until the corpus language count exists.

The two guideline amendments (D2, D4) are carried in the decision draft and applied to the guideline text as v0.5.3 in the same sweep as the Q-number correction (P2).

The table below is the record of what was asked and why. Recommendation first.

| # | Question | Recommendation | Why | Cost of the alternative |
|---|---|---|---|---|
| **D1** | May an LLM write a short context sentence per chunk, stored in a separate column and used only for embedding and lexical search? Guideline §7.8 says the header comes only from approved metadata. | **Not now.** Ship the deterministic heading-chain header (R1-a) first. Re-open only if Stage 6 shows recall misses that a context sentence would fix. | Measured gain is large (retrieval failure 5.7% → 3.7% with contextual embeddings, → 2.9% with contextual lexical; Anthropic, 2024-09). But much of that gain comes from restoring document and section context, which the heading chain already supplies deterministically. | Allowing it now: one LLM call per chunk at ingest (small), a new external processor entry, and machine text inside the retrieval path that must be proven never to leak into evidence. |
| **D2** | Run order: reranker evaluation (Stage 7) before gate calibration (Stage 6)? | **Yes: 5 → 7 → 6.** | Guideline §10.3 item 5 requires thresholds to be re-calibrated after a reranker change. Calibrating first means doing Stage 6 twice (7–10 days each). | Keeping 5 → 6 → 7: a second calibration pass if a reranker is adopted. |
| **D3** | Where does the reranker run? Guideline §2.6 item 5 excludes self-hosted models in Phase 1; a hosted one is a new external processor. | **Hosted, for public regulator documents only**, with its Decisions Log entry and register row. Revisit self-hosting when non-public content (accreditation letters) is in scope. | Phase-1 `body_rule_source` documents are public, so the data-boundary risk of a hosted call is low. Self-hosting adds a model server to a service that has no GPU host. | Self-hosted now: lifts §2.6 item 5, adds hosting cost and an ops surface. No reranker: gives up the largest measured gain. |
| **D4** | Widen the PDF bake-off beyond Docling and Unstructured? | **Add one layout-model candidate (MinerU pipeline)** and keep the bake-off on our own files as the judge. | Neither named candidate has a score on OmniDocBench v1.6. MinerU's pipeline scores 86.47 there; vision-model parsers score 92–97 but are self-reported. Regulator manuals are table-heavy. | Staying with two candidates: cheaper bake-off, risk of picking the better of two weak table parsers. Adding a vision-model parser as well: touches the "OCR execution deferred" line (§2.6 item 10) and the self-hosting exclusion. |
| **D5** | Lexical search for Traditional Chinese, if P6 finds Chinese content. | **Decide after P6.** If Chinese is under a few percent, keep `tsvector` and rely on the vector leg plus the EN ↔ 繁中 glossary. Otherwise evaluate PGroonga, which Supabase offers. | `tsvector` cannot segment Chinese. True-BM25 extensions with Chinese support exist (`pg_textsearch` with zhparser) but no evidence was found that hosted Supabase offers them. | PGroonga: a second lexical engine and a material pipeline change. Doing nothing with real Chinese content: the lexical leg is blind for those queries. |

## R1 — deliberately not adopted

- **Running ragflow** (whole, or as a parsing box). Version 1.0.0 is a Go service that needs Elasticsearch or Infinity, MySQL, MinIO, NATS and kvrocks. Tenancy, RLS and audit would live outside Supabase.
- **ragflow's retrieval scoring.** Its fusion weights are fixed (0.05 text / 0.95 vector at the store, then 0.7 token / 0.3 vector at re-scoring) and its token score is not BM25. RRF stays the baseline.
- **ragflow's automatic loosening on zero results** (`min_match` 0.3 → 0.1). It trades precision for an answer; this service prefers a clean gate failure.
- **Graph RAG, LightRAG, agentic retrieval, hypothetical-document expansion, visual-page retrieval.** Out of Phase 1 by guideline §2.6, and current evidence does not favour them for exact lookup on a small corpus.
- **LLM sufficiency judges and per-claim entailment checks.** These belong to a future generation phase. Published checkers reach about 75–77% balanced accuracy, too weak to be a sole gate. Phase 1 returns passages, not claims.

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

**R1 changes to this view**: Stage 3 is 12–18d. Stage 7 is planned at 5–10d, not 0. D2 is accepted, so the order after Stage 5 is 7 → 6 → 8 → 9 (the diagram below still shows the old order). Net effect on the ballpark below: about +1 to +2 weeks, less the second calibration pass that D2 avoids.

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

**R1**: one more tick before Stage 3 (not Stage 1): P6 corpus language count done, which settles D5. D1–D4 were ruled 2026-11-16.

## R1 evidence (2026-11-16)

Verified = the source page or file was read this session. Everything else is marked.

- **e-means**: arXiv 2611.09501 and the faiss `contrib/e_means` README (verified). In `faiss-cpu` 1.16.0 per release notes (verified); wheel contents not opened. No independent replication found.
- **ragflow**: Apache-2.0 (verified, LICENSE). Patterns read at tag v0.20.5 (Python: `rag/nlp/__init__.py`, `rag/app/laws.py`, `manual.py`, `table.py`, `rag/nlp/search.py`, `rag/raptor.py`, `deepdoc/parser/pdf_parser.py`) and v1.0.0 (Go: `internal/ingestion/component/knowledge_compiler/tree/`). Its only k-means is a 1-D column detector in the Go PDF layout code. Not read: `task_executor.py`, DeepDoc model licences, the Go evaluation entity.
- **Contextual retrieval and reranking**: Anthropic, 2024-09-19 (verified). ViDoRe V3, arXiv 2601.08620 (verified).
- **Structure methods**: HippoRAG 2, arXiv 2502.14802, Table 2 (verified). RAPTOR's own ablation figure is from a search snippet, not the paper.
- **Parsing**: OmniDocBench v1.6 table (verified; scores largely self-reported by model authors). Docling's ParseBench figure is a snippet from a vendor benchmark.
- **pgvector limits and exact search**: pgvector README (verified).
- **Not verified**: live embedding leaderboard order; Traditional Chinese quality of any embedder or reranker; which BM25 extensions hosted Supabase offers; evaluation gold-set size guidance (practitioner sources only).
