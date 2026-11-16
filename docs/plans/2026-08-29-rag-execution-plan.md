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

**Revision R2 — 2026-11-16, same day.** A cross-check against ADR-0003 and Decisions Log Q48 found four conflicts with the guideline. Ivan ruled on all four. R2 reverses D3, adds a digest stage, narrows who may query, and lets Stages 1 and 2 start now. **Where R2 and an older passage of this file disagree, R2 wins.** Rulings, fixed parameters and the agent cards are in "Revision R2" near the end of this file. Agents: start there.

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
  - **R1:** Q41 is taken (vault Q41 = Core-UX design round, 2026-10-01). The vault's highest entry on 2026-11-16 is Q52, so RAG adoption is **Q53**. **Done: pasted into the vault 2026-11-16.** In-repo references that still say "Q41" for RAG adoption: this file, the guideline (lines 4, 409, 1012–1074), `B9-admission-2026-08-29.md`, `BLOCK-ARCHITECTURE.md:50`. Each of those files now carries a note that "Q41" means Q53; the old text is left in place.
- **P3. Vault RAG note.** Paste [vault-updates-2026-08-29.md](vault-updates-2026-08-29.md) content into the vault (four notes touched).
- **P4. Supabase pg_cron availability check.** Confirm pg_cron is enabled on the target project. Local stack: `create extension if not exists pg_cron;` If enabling requires a Supabase-paid tier that Eventar isn't on yet, that's a purchase decision — flag before Stage 1.
- **P5. pgvector availability check.** Same as P4 but for pgvector. Should be trivially available on Supabase.

- **P6 (R1). Corpus language count.** Count Traditional Chinese content in the Phase-1 corpus (pages or characters per document). Postgres `tsvector` has no Chinese word parser, so any non-trivial share triggers flagged decision D5 before Stage 3. Half an hour once the first documents are in hand.

Estimated pre-work effort: **1 day of Ivan-time** (all decisions + a few CLI checks).

## Stage 1 — security + schema foundation

**Goal**: security controls and every audited-mutation table exist and pass their negative tests. Not a byte of retrieval logic yet.

**R2: the cards B9-S1-A and B9-S1-B in "Revision R2" replace the deliverables list below.** Three things in the list below are wrong today: the migration timestamps `20261101…` are older than the newest migration (`20261114140000`); `pg_cron` is no longer used; and the Next.js Server Action is removed from Stage 1.

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

**R2: cards B9-S2-A and B9-S2-B in "Revision R2" replace the deliverables, the "R1 additions" and the tests below.** In particular the runner's arguments, the case format and the definition of citation exact-match are the ones in R2.5.

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

**R2: "Revision R2 → R2.6, Stage 3" governs.** Superseded in the list below: the `pg_cron` job (the worker polls), the Next.js Server Action (none in Stage 3), and the backtest through Next.js (the backtest calls FastAPI directly with a real local token).

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
- **R2: both bake-off candidates are local, open-weight and multilingual** (fixed in "Revision R2 → Fixed parameters"). No hosted provider. The bake-off must score the Traditional Chinese stratum separately if P6 found Chinese content. Public leaderboards are mostly Simplified Chinese; no Traditional Chinese evidence was found for any model.
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

**R1**: plan for this stage to run. A cross-encoder reranker over fused candidates is the largest measured gain in current evidence (Anthropic 2024-09: retrieval failure 2.9% → 1.9% on top of contextual hybrid; ViDoRe V3, 2026-01: +13.2 nDCG@10). Skip it only if Stage 6 shows recall and false-pass rate already at target. Ruled 2026-11-16: this stage runs **before** Stage 6 (D2). The reranker is a **local open-weight model** (R2 ruling E1; D3 reversed). Dependencies become: Stage 5 and the gold set. Candidates and the adoption rule are fixed in "Revision R2 → Fixed parameters".

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
- **D3 — REVERSED by R2 ruling E1 (same day).** ~~Hosted reranker, public regulator documents only.~~ The recommendation was made without reading ADR-0003 §5, which requires local models. The reranker is local. See "Revision R2".
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

## Revision R2 — rulings, fixed parameters and agent cards (2026-11-16)

### R2.1 Rulings (Ivan, 2026-11-16)

| # | Conflict | Ruling | What it changes |
|---|---|---|---|
| **E1** | Models: ADR-0003 §5 (local, no external model input) vs guideline §2.6 item 5 (no self-hosted models) | **Local only.** | Embedding and reranker are open-weight models run inside our own worker and API. No vendor entry. D3 reversed. Guideline §2.6 item 5 reversed. |
| **E2** | Who may query: ADR-0003 (no live RAG on a product path) vs guideline §4.3 (organiser lookup) | **Staff workbench only.** | Only `eventar_staff` and `body_admin` (own body) may read B9 data or call `/retrieve`. `organiser_admin`, `organiser_member` and `auditor` get nothing. |
| **E3** | Digest: Q48 (B9 is an LLM document digest) vs guideline (no generation in Phase 1) | **Digest after gate calibration.** | New Stage D after Stage 6. Retrieval is built and measured first. |
| **E4** | Start: plan (after Stage 10.4/10.9 and Q26) vs Q48 (inside Stage 12, per partner) | **Foundation now.** | Stages 1 and 2 may start now, in parallel with Stage 8, on public HKCP and MCHK documents. Stage 3 onward waits for Ivan's go. |

**Precedence for any later conflict:** this R2 section → ADR-0003 and Q48 → guideline (now v0.5.3, amendment block at its top) → older text in this file. If two of these still disagree, stop and write `STATUS: BLOCKED`; do not pick one.

**ragflow:** Ivan chose "borrow patterns". ADR-0003 also permits running ragflow as a self-hosted offline batch box. That option is not taken. No ragflow code, container or dependency enters the repo.

### R2.2 Stage map and start conditions

| Stage | Content | May start when | Cards |
|---|---|---|---|
| Pre-work | P2, P6 (P1 moves to before Stage 9; P4 dropped; P5 closed) | now | B9-P |
| 1 | Schema, grants, RLS, Python skeleton, auth | now | B9-S1-A, B9-S1-B |
| 2 | Evaluation scaffold and seed cases | S1-A and S1-B are DONE | B9-S2-A, B9-S2-B |
| 3 | One format end to end, lexical only | Ivan's go, and S2 DONE | parameters fixed in R2.6; cards written at S2 hand-back |
| 4 | Local embedding, hybrid | Stage 3 DONE, and Ivan's go to download model weights | parameters fixed in R2.6 |
| 5 | PDF, Excel, HTML | Stage 4 DONE | parameters fixed in R2.6 |
| 7 | Reranker evaluation | Stage 5 DONE | parameters fixed in R2.6 |
| 6 | Gate calibration | Stage 7 DONE | targets in R2.6, Ivan approves the numbers |
| D | Document digest | Stage 6 DONE | outline in R2.7 |
| WB | Staff workbench page | Stage 6 DONE, and Ivan's rulings W1 and W2 (R2.8) | none yet (design card) |
| 8 | Observability | merged into Stage 9: internal traces only, no external platform (E1) | none |
| 9 | Release | Stages D and WB DONE, P1 done | none yet |

P4 (pg_cron) is dropped: the worker polls the database (R2.6). P5 is closed for the local stack: `vector` 0.8.2 is available on local Postgres 17.6 (checked 2026-11-16 by query). `pgroonga` 3.2.5 is also available locally, which matters only if P6 finds Chinese content.

### R2.3 Rules for every B9 agent

**Read first, in this order:** repo `CLAUDE.md`; `AGENTS.md`; `docs/plans/2026-10-11-mvp-execution-plan.md` §4 ("Rules for every agent": it binds here in full, including the Never list, the local environment, locks, tests-first and the hand-back format); this R2 section; your card; the guideline sections your card names. `superpowers:*` skills are not used: this is ongoing-project work.

**B9 additions to that contract:**
1. Hand-back file: `docs/plans/rag/<CARD-ID>.md`, same format. Add one line: `Python gates: pytest <passed/failed/skipped>`.
2. Never run `scripts/ci/replay-and-verify.sh` locally. It calls `supabase db reset`, which is forbidden on the shared stack. CI runs it. Locally, apply migrations with `supabase migration up --local` and follow the `eventar-migration-replay-rollback` skill.
3. Python never reads `.env.local`. Its environment comes only from `supabase status -o env` (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`).
4. Python talks to Supabase over HTTP only (`httpx` against `{API_URL}/rest/v1` and `{API_URL}/auth/v1`). No `supabase-py`, no direct Postgres connection.
5. No model, vendor API or network call to an outside service is added by any Stage 1 or Stage 2 card.
6. The words `kmeans`, `k-means` and `KMeans` never appear in `services/rag_api/` (test in B9-S1-B).
7. Skills to invoke by name: `eventar-migration-replay-rollback` and `eventar-grant-guard-proof` (B9-S1-A); `eventar-static-gates` (every card, before hand-back); `eventar-fixture-leak-cleanup` (any card that creates test users); `rag-engine-planning` (any edit to this plan).
8. Gate order for a B9 card: `uv run pytest -q` in `services/rag_api/` (Python cards) → `pnpm exec tsc --noEmit` → `pnpm exec eslint .` → `pnpm exec vitest run` → `pnpm exec next build` → `pnpm test:rls` under the lock (S1-A only). Sequential, never in parallel.

**Lanes:** SQL cards run one at a time (B9-S1-A first). B9-S1-B and B9-S2-A are self-contained Python and suit a Codex or Sonnet lane; B9-S2-A needs only B9-S1-B's `pyproject.toml`, so it can start as soon as that file exists. B9-S2-B needs Ivan's corpus files, then a person to review the cases.

### R2.4 Stage 1 cards

#### B9-S1-A — schema, grants, RLS and the grant tests (`sql`)

**The DDL is already written and proven.** `docs/plans/rag/B9-S1-A-schema-spec.sql` is the authoritative schema: 15 tables, 2 read helpers, 15 policies, 5 definer functions. On 2026-11-16 the whole file was applied to the local stack inside a rolled-back transaction and smoke-tested (15 tables, row-level security on all 15, `42501` on direct writes to the seven audited tables, all five functions exercised, database clean afterwards). You copy it. You do not design, add, drop, rename or retype anything. If a statement fails to apply, stop with `STATUS: BLOCKED`.

**Files you may create or edit:**
- the eight migration files (step 2);
- `supabase/seed.sql` (append the block in step 4 at the end of the file, nothing else);
- `tests/rls/rag_audited_table_writes.rls.test.ts` and `tests/rls/rag_read_scope.rls.test.ts` (new);
- `docs/db/SCHEMA_SUMMARY.md` (append a section `## B9 RAG (2026-11-17)` with one line per table: name and one-phrase purpose);
- `docs/plans/rag/B9-S1-A.md` (your hand-back).

**Steps, in order:**
1. Run `ls supabase/migrations | tail -1`. If the newest file is `20261117100000` or later, replace the date part `20261117` in all eight names with that file's date plus one day. Keep the `HHMMSS` parts.
2. The spec has eight sections, each starting `-- FILE: <name>`. Copy each section's statements, unchanged, into `supabase/migrations/<name>`. The two `do $$ … $$` self-check blocks are part of their sections; copy them too. Add a three-line header comment to each file: what it creates; `-- Spec: docs/plans/rag/B9-S1-A-schema-spec.sql`; and `-- Rollback: drop the objects this file creates (new B9 tables, policies and functions only; no existing object is altered).`
3. Take the `scratch-demo/locks/test-rls.lock` lock. Replay first (skill `eventar-migration-replay-rollback`). The files depend on each other, so replay all eight together, in name order, in one rolled-back transaction: `(echo "begin;"; cat supabase/migrations/20261117*_rag_*.sql; echo "rollback;") | /opt/homebrew/opt/libpq/bin/psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -q`. Silence means success; the self-check blocks prove the grants. Only then run `supabase migration up --local`. Never run `supabase db reset` or `scripts/ci/replay-and-verify.sh`.
4. Append to `supabase/seed.sql` (the seed file re-grants select, insert, update and delete on every table, so the revokes must be repeated after it):

```sql
-- B9 RAG. Mirror of 20261117160000_rag_grants_rls.sql: no API role writes a B9
-- table directly, except service_role on the eight non-audited tables.
revoke all on
  public.documents, public.document_versions, public.document_relationships, public.document_approvals,
  public.processing_jobs, public.parse_runs, public.parsed_elements, public.chunks,
  public.embedding_indexes, public.retrieval_index_assignments,
  public.pack_versions, public.pack_sources, public.pack_source_passages,
  public.evaluation_cases, public.retrieval_traces
  from anon;
revoke insert, update, delete on
  public.documents, public.document_versions, public.document_relationships, public.document_approvals,
  public.processing_jobs, public.parse_runs, public.parsed_elements, public.chunks,
  public.embedding_indexes, public.retrieval_index_assignments,
  public.pack_versions, public.pack_sources, public.pack_source_passages,
  public.evaluation_cases, public.retrieval_traces
  from authenticated;
revoke insert, update, delete on
  public.processing_jobs, public.document_approvals, public.embedding_indexes,
  public.retrieval_index_assignments, public.pack_versions, public.pack_sources,
  public.pack_source_passages
  from service_role;
```

5. Write the two test files (below). Fail-first: write the read-scope test with the `body_admin` expected to see both documents, and the write test with `service_role` INSERT on `processing_jobs` expected to succeed; run them; confirm they fail on those two assertions; then correct the expectations.
6. Mutation proof (skill `eventar-grant-guard-proof`): with `sqlSuperuser`, run `grant insert on public.processing_jobs to service_role`; run `rag_audited_table_writes.rls.test.ts`; confirm that exactly the `processing_jobs` service-role INSERT assertion fails; run `revoke insert on public.processing_jobs from service_role`; confirm `select has_table_privilege('service_role','public.processing_jobs','insert')` returns `f`.
7. Gates, sequentially: `pnpm exec tsc --noEmit` → `pnpm exec eslint .` → `pnpm exec vitest run` → `pnpm exec next build` → `pnpm test:rls` (under the lock). Release the lock.

**Fixtures (both test files).** Create fixtures with `sqlSuperuserQuery` (it returns rows, so `returning id` works) and remove them with `sqlSuperuser`, both from `tests/helpers/clients.ts`. Build each statement as a string with the ids interpolated; every id is a uuid your own test created. Give each document a different `<n>` (a unique index forbids a repeated hash). Mark fixtures with the prefix `B9S1A`: `storage_path` starts `rag/B9S1A/`, embedding index `name` starts `B9S1A-`, `idempotency_key` starts `B9S1A-`. For the organisation, accrediting body, staff rows and signed-in clients, copy the setup of `tests/cpd/organisation_body_authorisation.rls.test.ts`. In `afterAll`, run the cleanup SQL below with `sqlSuperuser`, then delete the staff rows, bodies, organisations and test users you created. Audit rows written by the definer functions are permanent; that is expected.

Minimal fixture SQL (the NOT NULL columns without defaults):
```sql
insert into public.documents (scope_type, body_id, family, source_filename, source_mime, source_sha256, storage_path)
values ('global_authority', '<body uuid>', 'body_rule_source', 'B9S1A.docx', 'application/octet-stream',
        sha256('B9S1A-<n>'::bytea), 'rag/B9S1A/<n>') returning id;
insert into public.document_versions (document_id, declared_version, parser_policy_version)
values ('<document id>', 'B9S1A v1', 'p1') returning id;
insert into public.parse_runs (document_version_id, parser_name, parser_version, parser_policy_version)
values ('<version id>', 'fixture', '0', 'p1') returning id;
insert into public.chunks (document_version_id, parse_run_id, chunk_set_id, chunk_version, ordinal, text, text_for_embedding, content_sha256, token_count)
values ('<version id>', '<parse run id>', gen_random_uuid(), 'fixture', 0, 'B9S1A text', 'B9S1A text', sha256('B9S1A text'::bytea), 2);
```

Cleanup SQL, in this order:
```sql
delete from public.retrieval_index_assignments where active_embedding_index_id in (select id from public.embedding_indexes where name like 'B9S1A-%');
delete from public.processing_jobs where idempotency_key like 'B9S1A-%';
delete from public.document_approvals where document_version_id in (select v.id from public.document_versions v join public.documents d on d.id = v.document_id where d.storage_path like 'rag/B9S1A/%');
delete from public.chunks where document_version_id in (select v.id from public.document_versions v join public.documents d on d.id = v.document_id where d.storage_path like 'rag/B9S1A/%');
delete from public.parse_runs where document_version_id in (select v.id from public.document_versions v join public.documents d on d.id = v.document_id where d.storage_path like 'rag/B9S1A/%');
delete from public.embedding_indexes where name like 'B9S1A-%';
delete from public.document_versions where document_id in (select id from public.documents where storage_path like 'rag/B9S1A/%');
delete from public.documents where storage_path like 'rag/B9S1A/%';
```

**`tests/rls/rag_audited_table_writes.rls.test.ts`.**
- For each of the seven audited tables (`processing_jobs`, `document_approvals`, `embedding_indexes`, `retrieval_index_assignments`, `pack_versions`, `pack_sources`, `pack_source_passages`), the same assertions as the "permanent append-only" block at `tests/rls/audited_table_writes.rls.test.ts:73-125`: with the `admin` (service-role) client, INSERT, UPDATE and DELETE each return error code `42501`; with an anon client and a signed-in organiser client, INSERT returns `42501`.
- One positive round trip per definer function, called with `admin.rpc(...)`: `rag_enqueue_processing_job` (call twice with one key: same id both times, exactly one `rag_job_enqueued` audit row for that id); `rag_record_document_approval` (row exists, the version's `review_status` is `approved`); `rag_create_embedding_index` (status `draft`, `storage_table` matches `^emb_[0-9a-f]{8}$`); `rag_set_embedding_index_status` (`draft→active` fails with code `22023`; `draft→building→evaluating→approved` succeeds); `rag_assign_retrieval_index` (called twice: exactly one row with `effective_to` null, index status `active`). For each, read the audit row back with `sqlSuperuserQuery` and assert its `event_type`.
- A signed-in `eventar_staff` client calling any of the five through `rpc` gets `42501` (same behaviour as `tests/rls/self_check_in_grant.rls.test.ts:33`).
- Seed parity: read `supabase/seed.sql` as text and assert that, after the line `-- B9 RAG.`, each of the 15 table names appears in the `from anon` statement and in the `from authenticated` statement, and each of the seven audited names appears in the `from service_role` statement. This is the only check that the seed block mirrors the migration, because the seed runs only on a reset.

**`tests/rls/rag_read_scope.rls.test.ts`.** Fixtures: body X and body Y (each owned by its own organisation), one document, version, parse run and chunk per body. Signed-in clients: `eventar_staff`; `body_admin` in body X's organisation; `organiser_admin`, `organiser_member` and `auditor` in a third organisation. Assert, for `documents` and for `chunks`, filtering to the `B9S1A` rows: `eventar_staff` sees both; the `body_admin` sees X only; the other three see zero rows; an anon client's select returns error code `42501`.

**Done when:** `supabase migration up --local` applies all eight files; both new test files pass; `pnpm test:rls` passes; the other gates pass; the hand-back contains the output of `select t, has_table_privilege('service_role','public.'||t,'insert') from unnest(array['processing_jobs','document_approvals','embedding_indexes','retrieval_index_assignments','pack_versions','pack_sources','pack_source_passages']) t` showing `f` seven times.

**Known and intended (not defects):** a document with `body_id` null is readable by `eventar_staff` only; actor columns have no foreign key; `pack_*` tables have no write function yet; the claim and heartbeat functions for `processing_jobs` are Stage 3; there is no vector column yet.

**Stop (`STATUS: BLOCKED`) if:** a spec statement does not apply; an existing test in `tests/rls` or `tests/audit` fails for a reason other than a name list; `seed.sql` has changed shape so the block cannot simply be appended.

#### B9-S1-B — Python service skeleton and auth (`python`; needs B9-S1-A applied locally for its integration test)

**Files you may create:** everything under `services/rag_api/`; `.github/workflows/rag-api.yml`; `docs/plans/rag/B9-S1-B.md` (hand-back). You may append these four lines to the repo `.gitignore`: `services/rag_api/.venv/`, `__pycache__/`, `.pytest_cache/`, `*.pyc`. You edit nothing else. No Next.js file.

```
services/rag_api/
  pyproject.toml
  uv.lock                   generated by `uv lock`; committed
  Dockerfile
  README.md                 how to run locally; 20 lines at most
  src/rag_api/
    __init__.py             __version__ = "0.1.0"
    main.py                 FastAPI app; GET /health; GET /whoami
    settings.py
    auth/__init__.py
    auth/tokens.py          verify_token(bearer: str) -> dict
    auth/membership.py      Staff, NotAuthorised, resolve_staff(token: str, claims: dict) -> Staff
    auth/authorise.py       authorise(role: str, use_case: str) -> bool
    user_scoped/__init__.py
    user_scoped/client.py   user_client(token: str) -> httpx.Client
    privileged/__init__.py
    privileged/client.py    privileged_client() -> httpx.Client
    boundary.py             find_boundary_violations(root: Path) -> list[str]
  tests/
    conftest.py
    test_tokens.py  test_membership.py  test_authorise.py
    test_two_org_isolation.py           marked `integration`
    test_import_boundary.py  test_no_kmeans.py
```

**`pyproject.toml`, exactly these settings:**
- `[project]`: `name = "rag-api"`, `version = "0.1.0"`, `requires-python = ">=3.12,<3.15"`, `dependencies = ["fastapi", "uvicorn", "pydantic>=2", "httpx", "pyjwt[crypto]"]`.
- `[dependency-groups]`: `dev = ["pytest"]`. No `pytest-asyncio`: everything in Stage 1 is synchronous (`def` endpoints, `httpx.Client`).
- `[tool.uv]`: `package = false`.
- `[tool.pytest.ini_options]`: `pythonpath = ["src", "."]`, `testpaths = ["tests"]`, `markers = ["integration: needs the local Supabase stack"]`.
- No other section. A sixth runtime dependency is a stop condition.

**Python version.** This machine has Python 3.13 and 3.14 under `uv`, and no 3.12. Let `uv` pick an installed one: do not download another interpreter. If `uv sync` fails because a dependency has no build for 3.14, stop with `STATUS: BLOCKED` and name the package (Ivan then decides whether `uv` may download 3.12). CI and the Dockerfile use 3.12.

**Environment.** `settings.py` reads exactly `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `RAG_ENV` (default `local`). Set them for a local run with this line (it never prints a value and never reads `.env.local`):

`_e="$(supabase status -o env)"; g(){ printf '%s\n' "$_e" | sed -n "s/^$1=\"\(.*\)\"\$/\1/p"; }; export SUPABASE_URL="$(g API_URL)" SUPABASE_ANON_KEY="$(g ANON_KEY)" SUPABASE_SERVICE_ROLE_KEY="$(g SERVICE_ROLE_KEY)"`

`settings.py` raises at import when the host of `SUPABASE_URL` is not `127.0.0.1`, unless `RAG_ENV=production`. Do not accept `localhost`: the token issuer is `http://127.0.0.1:54321/auth/v1` (read from the local auth container, 2026-11-16), so a `localhost` URL would fail the issuer check.

**Fixed behaviour:**
- `GET /health`: no auth. Returns `{"status":"ok","version":"0.1.0"}`.
- `GET /whoami`: reads `Authorization: Bearer <token>`. Missing or malformed header, or a token that fails verification → `401` with body `{"error":"AUTH_FAILED"}`. No single active staff row → `403` with `{"error":"NOT_AUTHORISED"}`. Success → `200` with `{"staff_id","role","organisation_id"}`. One FastAPI dependency (`current_staff`) does the whole sequence. Error bodies never contain the token, an email or a stack trace.
- `verify_token`: `jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json")`; `jwt.decode(..., algorithms=["ES256","RS256"], audience="authenticated", issuer=f"{SUPABASE_URL}/auth/v1", options={"require":["exp","sub"]})`. Any `jwt.PyJWTError` → `NotAuthorised` mapped to `401`.
- `Staff`: a frozen pydantic model with `id: UUID`, `role: str`, `organisation_id: UUID`.
- `resolve_staff`: with `user_client(token)`, `GET /rest/v1/staff` with params `select=id,role,organisation_id`, `status=eq.active`, `email=eq.<claims["email"].lower()>`. Exactly one row → `Staff`. Zero rows, two or more rows, a missing `email` claim, or a non-200 response → `NotAuthorised` (→ `403`). This mirrors `requireStaff` at `lib/auth.ts:162`: it also fails closed when one address is staff in two organisations, and row-level security (not this code) rejects an unconfirmed address. Both are intended.
- `authorise(role, use_case)`: `True` only when role is `eventar_staff` or `body_admin` and use case is one of `rule_lookup`, `source_location`, `version_comparison`, `pack_authoring_support`. Otherwise `False` (ruling E2). Stage 1 has no endpoint that calls it; it is tested on its own.
- `user_client(token)`: `httpx.Client(base_url=SUPABASE_URL, headers={"apikey": ANON, "Authorization": f"Bearer {token}"}, timeout=10.0)`.
- `privileged_client()`: `httpx.Client(base_url=SUPABASE_URL, headers={"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}"}, timeout=10.0)`.
- Both are used as context managers, one per request. No global client.
- Logging: the staff UUID and error codes only.
- `Dockerfile`: `FROM python:3.12-slim`; install `uv`; copy the project; `uv sync --frozen --no-dev`; `EXPOSE 8000`; `CMD ["uv","run","uvicorn","rag_api.main:app","--app-dir","src","--host","0.0.0.0","--port","8000"]`. You do not build or run the image in this card.
- Local run: `cd services/rag_api && uv sync && uv run uvicorn rag_api.main:app --app-dir src --port 8000`.
- `boundary.py`: `find_boundary_violations(root)` parses every `.py` file under `root` with `ast` and returns `"<relative path>: imports rag_api.privileged"` for each file that (a) is under `routers/` with a name starting `retrieve`, or under `retrievers/`, or under `user_scoped/`, or is named `gate*.py`, and (b) imports `rag_api.privileged` or anything below it (`import` or `from … import`, absolute or relative).

**Tests.**
- `test_tokens.py`: generate an ES256 key pair in the test. `tokens.py` exposes one module-level function `_signing_key(token: str)` that wraps `PyJWKClient.get_signing_key_from_jwt(token).key`; the test monkeypatches `rag_api.auth.tokens._signing_key` to return the test public key. A valid token passes. Expired, wrong issuer, wrong audience, tampered signature, missing `sub`, and a garbage string each raise.
- `test_authorise.py`: all 5 roles × 4 use cases (20 assertions), plus an unknown use case → `False`.
- `test_membership.py`: patch the HTTP call. Zero rows, two rows, a 500 response and a missing email claim each raise `NotAuthorised`; one row returns the `Staff`; the request's `email` filter is lower-cased.
- `test_import_boundary.py`: (1) `find_boundary_violations(<real src/rag_api>)` is empty. (2) In pytest's `tmp_path`, build `routers/retrieve.py` containing `from rag_api.privileged import client` and `privileged/client.py` importing nothing: the function returns exactly one violation. (3) A `worker.py` with the same import in `tmp_path` returns none.
- `test_no_kmeans.py`: no `.py`, `.toml`, `.md` or `.json` file under `services/rag_api/` matches the regex `(?i)k[-_ ]?means`. Skip `.venv/` and `test_no_kmeans.py` itself (build its pattern from two string parts so the file does not match itself).
- `test_two_org_isolation.py` (`@pytest.mark.integration`; skipped with a clear message when `SUPABASE_URL` is unset). All fixture work goes through `privileged_client()` over HTTP; no direct database connection. The service role may insert and delete on `organisations`, `accrediting_bodies`, `staff` and `documents` (checked 2026-11-16).
  1. Create three organisations: O1 and O2, each with one accrediting body (body X in O1, body Y in O2), and O3 with no body (`POST /rest/v1/organisations`, `/rest/v1/accrediting_bodies`, header `Prefer: return=representation`). Names and slugs start `b9s1b-`. Fill the NOT NULL columns: organisations `name`, `slug`; accrediting_bodies `organisation_id`, `short_name`, `full_name`, `cycle_config` (`{}`), `category_taxonomy` (`{}`). If the insert is rejected by a constraint, copy the values `tests/cpd/organisation_body_authorisation.rls.test.ts` uses.
  2. Create three users: `POST /auth/v1/admin/users` with `{"email","password","email_confirm":true}`. Emails: `b9s1b-<role>-<8 hex>@rls-test.invalid`, lower-case. Password: a random 24-character string generated in the test.
  3. Insert three staff rows (`POST /rest/v1/staff`, columns `email`, `full_name`, `role`, `organisation_id`, `status`): an `eventar_staff` in O3, an `organiser_admin` in O3, and a `body_admin` in O1. `status` is `active`. `full_name` is `B9S1B <role>`.
  4. Insert one document per body (`POST /rest/v1/documents`). JSON for body X: `{"scope_type":"global_authority","body_id":"<X id>","family":"body_rule_source","source_filename":"B9S1B-X.docx","source_mime":"application/octet-stream","source_sha256":"\\x<hex>","storage_path":"rag/B9S1B/<8 hex>-X"}`; the same for Y with `Y`. `<hex>` is `hashlib.sha256(f"B9S1B-{run id}-X".encode()).hexdigest()`, so the two hashes differ (a unique index forbids a repeated hash). In Python source the value is `"\\x" + hex`: the JSON carries one literal backslash.
  5. Sign each user in: `POST /auth/v1/token?grant_type=password` with the anon key as `apikey`; take `access_token`.
  6. Assert with `user_client(token)` on `GET /rest/v1/documents?storage_path=like.rag/B9S1B/*`: the `organiser_admin` gets `[]`; the `body_admin` gets only body X's document; the `eventar_staff` gets both.
  7. Assert `/whoami` through FastAPI's `TestClient` for each user (role and organisation id match), and `401` for a garbage token.
  8. In a `finally`: delete the documents, staff rows, bodies, organisations (`DELETE /rest/v1/<table>?id=eq.<id>`), then the users (`DELETE /auth/v1/admin/users/<id>`). Assert each delete's status code. Then follow the `eventar-fixture-leak-cleanup` skill to confirm nothing with `b9s1b` or `B9S1B` is left in the live tables (`organisations`, `accrediting_bodies`, `staff`, `documents`, `auth.users`). `audit_events` is excluded: inserting an accrediting body writes a permanent audit row by trigger, and that row is expected. Never delete from `audit_events`. Name the count of such rows in the hand-back.
- `.github/workflows/rag-api.yml`: triggers `push` and `pull_request` with `paths: ["services/rag_api/**"]`; one job on `ubuntu-latest`; steps: `actions/checkout@v4`; `astral-sh/setup-uv` at the major version its README currently recommends (record the tag in the hand-back) with `python-version: "3.12"`; `uv sync --frozen` then `uv run pytest -q -m "not integration"`, both with `working-directory: services/rag_api`.

**Gates:** `cd services/rag_api && uv run pytest -q` with the three variables exported (all tests, including integration) → then the repo gates `pnpm exec tsc --noEmit` and `pnpm exec eslint .` (they must be unchanged; this card touches no TypeScript).

**Done when:** every test passes, including the integration test against the local stack; `curl -s 127.0.0.1:8000/health` returns the JSON above; the fixture-leak check is clean.

**Stop (`STATUS: BLOCKED`) if:** `uv sync` fails on the installed Python; the JWKS document has no key; a real local token's `iss` is not `http://127.0.0.1:54321/auth/v1`; the staff query returns a row for an unconfirmed address; a fixture insert is refused for lack of privilege; a sixth runtime dependency seems necessary.

### R2.5 Stage 2 cards

#### B9-S2-A — evaluation scaffold, metric register, runner (`python`)

**Needs:** `services/rag_api/pyproject.toml` from B9-S1-B (it sets `pythonpath = ["src", "."]`, which makes `evaluation` importable from tests and from `python -m evaluation.runner` run in `services/rag_api/`). No database and no local stack.

**Files you may create:** everything under `services/rag_api/evaluation/`; `services/rag_api/tests/test_metrics.py`, `test_runner.py`, `test_case_schema.py`; `docs/plans/rag/B9-S2-A.md` (hand-back). You do not edit `pyproject.toml`: `pydantic` is already a dependency and nothing else is needed.

```
services/rag_api/evaluation/
  __init__.py
  schema.py              pydantic models: Case, Trace, Report
  metrics/registry.py    one function per metric + REGISTRY dict
  pipelines.py           Pipeline protocol + StubPipeline
  runner.py              CLI
  cases/development/  cases/frozen_validation/  cases/security/  cases/regression/   (each with a .gitkeep)
```

**Case file:** one JSON file per case, `cases/<partition>/<case_id>.json`:

```json
{
  "case_id": "dev-0001",
  "question": "…",
  "use_case": "rule_lookup",
  "expected_query_class": "requirement",
  "answerability": "answerable",
  "strata": ["table_lookup"],
  "expected_sources": [{"source_sha256": "<hex>"}],
  "expected_passages": [{"source_sha256": "<hex>", "quote": "<verbatim text, 20 to 400 characters>"}],
  "dataset_partition": "development",
  "dataset_version": "2026-11-v1",
  "reviewer": "<name or null>",
  "review_status": "pending"
}
```

**Validation rules (a violation is an error, exit code 1):**
- `case_id` matches `^(dev|frz|sec|reg)-\d{4}$`; the prefix matches the partition (`dev` = development, `frz` = frozen_validation, `sec` = security, `reg` = regression); the file is named `<case_id>.json`; `dataset_partition` equals the directory name.
- `use_case` ∈ `rule_lookup`, `source_location`, `version_comparison`, `pack_authoring_support`.
- `expected_query_class` ∈ `exact_value`, `requirement`, `checklist`, `comparison`, `superseded`.
- `answerability` ∈ `answerable`, `unanswerable`. `review_status` ∈ `pending`, `approved`, `rejected`. `reviewer` is a required key and may be `null`.
- `source_sha256` is 64 lower-case hex characters.
- An `answerable` case has at least one expected source and one expected passage, and does not carry the `unanswerable` stratum. An `unanswerable` case carries the `unanswerable` stratum, has both lists empty, and has an extra key `unanswerable_basis`: a list of 3 or more search terms that each return no hit in the corpus.
- All cases in one partition share one `dataset_version`.
- Unknown keys are rejected (pydantic `extra="forbid"`). `unanswerable_basis` is allowed only on an `unanswerable` case.
- Every `expected_passages[].source_sha256` also appears in `expected_sources`.

The `evaluation_cases` database table (guideline §7.15) stays empty in Stage 2. The JSON files are the source of truth. Stage 3 adds the loader that resolves each quote to a chunk id and fills the table.

`strata` values: `unanswerable`, `table_lookup`, `multi_section`, `zh_hant`, `superseded`, `exact_value`, `narrative`. A case identifies a passage by a verbatim quote, not by a chunk id, because chunk ids change whenever the chunker changes. A returned chunk "contains" an expected passage when its text contains the quote after both are whitespace-normalised (`" ".join(s.split())`).

**Trace** (what a pipeline returns per case): `{case_id, gate_status: "pass"|"fail", gate_reason_codes: [..], results: [{chunk_id, source_sha256, text, source_location, content_sha256}], stored_text_matches: [bool per result]}`. Results are in rank order, best first, up to 20 (the evaluation response returns 20; the production response returns 5). `text` is the child chunk's text. `source_sha256` is lower-case hex.

**Trace validation (a violation is an error, exit code 1):** `stored_text_matches` has the same length as `results`; a `fail` trace has no results; a `pass` trace has at least one result; every case in the partition has a trace. In Stage 2 the stub's `stored_text_matches` values are recorded in the traces file. From Stage 3 the pipeline fills them from the verbatim-evidence check.

**Metrics** (`k` defaults to 10; the runner also reports `k` = 5 and 20). Each returns a float in 0..1 or `None` when no case is eligible. Ties keep the pipeline's order. Definitions that apply to every row:
- "Top-k results" means the first `min(k, results returned)` results. A `fail` trace has none.
- An expected source is "found" when a top-k result has the same `source_sha256`.
- "Mean" is the mean of the per-case value over eligible cases. The two blocking metrics are pooled instead: total over all eligible cases ÷ total results.
- `reciprocal_rank` looks only at the top-k results; no hit there scores 0.
- `passage_precision_at_k` divides by `min(k, results returned)`; 0 when nothing was returned.
- `false_pass_rate` has no `k`: it looks at all returned results and is reported once.
- A result "contains" an expected passage only when its `source_sha256` equals the passage's and its text contains the quote.
- A `fail` trace contributes 0 to each per-case mean and contributes nothing to the two pooled metrics (only `pass` cases are eligible there).
- `source_location` is a JSON object; it is "non-empty" when it has at least one key.
- "Points" anywhere in this plan means absolute percentage points: 3 points = 0.03.

| Name | Eligible cases | Formula | Status |
|---|---|---|---|
| `document_recall_at_k` | answerable | mean over cases of: expected sources found among the top-k results ÷ expected sources | advisory |
| `passage_recall_at_k` | answerable | mean of: expected passages contained in some top-k result ÷ expected passages | advisory |
| `passage_precision_at_k` | answerable | mean of: top-k results that contain an expected passage ÷ results returned (max k); 0 if none returned | advisory |
| `reciprocal_rank` | answerable | mean of 1 ÷ rank of the first result containing an expected passage; 0 if none | advisory |
| `source_location_present` | cases with gate `pass` | results with a non-empty `source_location` ÷ results | blocking, must be 1.0 |
| `citation_exact_match` | cases with gate `pass` | `True` values in `stored_text_matches` ÷ results | blocking, must be 1.0 |
| `abstention_sensitivity` | unanswerable | cases with gate `fail` ÷ cases | advisory |
| `abstention_specificity` | answerable | cases with gate `pass` ÷ cases | advisory |
| `false_pass_rate` | all | (unanswerable cases with gate `pass` + answerable cases with gate `pass` whose results contain no expected passage) ÷ all cases | advisory until Stage 6, then blocking |

A case whose pipeline returned nothing counts as zero in every formula. It is never removed. Every numeric threshold other than the two blocking ones is the string `pending_baseline`.

**`pipelines.py`:** `class Pipeline(Protocol): def run(self, case: Case) -> Trace`. `StubPipeline(traces_path)` returns pre-recorded traces from a JSON file. The real pipeline arrives in Stage 3.

**`runner.py`:** run from `services/rag_api/`: `uv run python -m evaluation.runner --partition development --pipeline stub --traces <file> [--out <file>]`.
- `--partition`: one of the four directory names. `--pipeline`: `choices=["stub"]` in Stage 2. `--traces`: required with `stub`; the file is a JSON list of Trace objects. A duplicate `case_id`, or a trace for a case that is not in the partition, is an error.
- `--validate-only`: load and validate every case in the partition, print the count, exit `0` or `1`. Needs no `--traces` and writes no report.
- A partition with no case file is an error (exit `1`).
- `--out` default: `<repo root>/scratch-demo/rag-eval/<partition>-<UTC as YYYYMMDDTHHMMSSZ>.json`, where repo root is `Path(__file__).resolve().parents[3]`. That folder is gitignored.
- Steps: load and validate every case (an invalid case is an error, not a skip); run the pipeline; validate every trace; compute; write the report.
- Exit code `0` normally; `1` when a case or trace is invalid or a blocking metric is below 1.0. A blocking metric that is `None` (no eligible case) is not a failure.
- `Report` JSON, exactly these keys: `dataset_version`; `partition`; `pipeline_versions` (for the stub: `{"pipeline": "stub"}`); `case_count`; `cases_per_stratum` (object, stratum → count); `metrics` (object, metric name → `{"5": x, "10": y, "20": z}`, except `false_pass_rate`, `source_location_present`, `citation_exact_match`, `abstention_sensitivity`, `abstention_specificity`, which map to one number); `blocking_failures` (list of metric names); `per_case` (list of `{case_id, gate_status, passage_recall_at_10, reciprocal_rank_at_10}`, sorted by `passage_recall_at_10` ascending with `null` last, then `case_id`; both values are `null` for an unanswerable case).

**Tests.** `test_metrics.py`: one hand-built set of 4 cases and 4 traces with the expected value of every metric worked out in a comment; include a zero-result case and an unanswerable case that wrongly passes. `test_case_schema.py`: a missing field, an unknown stratum and an `unanswerable` case with passages each fail validation. `test_runner.py`: end to end with `StubPipeline` on a temp directory; assert exit codes `0` and `1`.

**Done when:** `uv run pytest -q` passes and the runner produces a report from the test fixtures.

#### B9-S2-B — corpus manifest and seed cases (`content`; needs Ivan's files, see R2.8 item 1)

**Files you may create or edit:** `docs/plans/rag/B9-S2-B.md` (hand-back), `services/rag_api/evaluation/tools/__init__.py`, `services/rag_api/evaluation/tools/build_manifest.py`, `services/rag_api/evaluation/tools/check_quotes.py`, `services/rag_api/evaluation/corpus_manifest.json`, the case files under `evaluation/cases/development/`, `docs/plans/rag-evaluation-cases-seed.md`, and `services/rag_api/pyproject.toml` plus `uv.lock` for one change only: a dependency group `corpus` containing `pypdf` and `python-docx`.

- The corpus files stay **outside git**, in `<repo root>/scratch-demo/rag-corpus/` (gitignored). The agent does not download anything. If the folder is empty, write `STATUS: BLOCKED`.
- Both tools compute the repo root as `Path(__file__).resolve().parents[4]` (they sit one level deeper than `runner.py`) and import `Case` from `evaluation.schema`. Run them from `services/rag_api/`: `uv run --group corpus python -m evaluation.tools.build_manifest` and `… -m evaluation.tools.check_quotes`. `evaluation/tools/` needs an `__init__.py`.
- Text extraction, the same in both tools: PDF → `pypdf`, `page.extract_text()` joined with newlines. DOCX → `python-docx`, every paragraph and every table cell in document order. Any other file type is listed in the hand-back and skipped.
- `build_manifest.py` writes `corpus_manifest.json`: a list of `{filename, source_sha256, file_type, page_count, char_count, zh_hant_share, body_short_name, family, declared_version, metadata_review}`.
  - `source_sha256`: lower-case hex of the file bytes. `page_count`: number of PDF pages; `null` for DOCX. `char_count`: non-whitespace characters of the extracted text.
  - `zh_hant_share` (this is P6): characters in U+4E00 to U+9FFF ÷ `char_count`, rounded to 3 decimals.
  - `body_short_name`, `family`, `declared_version`: the agent proposes them from the title page. `body_short_name` must equal a `short_name` in `public.accrediting_bodies` or be `null`. `family` is `body_rule_source` or `accreditation_letter`. `metadata_review` is `"pending"`; Ivan confirms it with the case review.
- P6 result: if any file has `zh_hant_share` above `0.05`, say so at the top of the hand-back. That triggers decision D5.
- Draft 24 development cases as JSON files: 12 `narrative`, 4 `table_lookup`, 4 `multi_section`, 4 `unanswerable`. Add 4 `zh_hant` cases if any file is above the 0.05 share. If the corpus has no table, write 0 `table_lookup` and 16 `narrative` and say so in the hand-back. Fewer than 3 documents is not a blocker; `multi_section` may use two sections of one document.
- Each `quote` is copied character for character from the extracted text. `check_quotes.py` asserts that every quote is a substring of the extracted text of the file with that hash (both whitespace-normalised) and that every `unanswerable_basis` term has zero case-insensitive hits in the whole corpus. It exits `1` on any failure. It must pass.
- Each case has `review_status: "pending"` and `reviewer: null`.
- Write `docs/plans/rag-evaluation-cases-seed.md`: a table of case id, question, stratum, source file, page.
- The cases stay `pending` until Ivan (or a reviewer he names) checks each quote against the source and sets `review_status: "approved"` (guideline §12.7: gold labels need human review). The agent never approves its own cases.

**Done when:** `build_manifest` has written the manifest; `uv run python -m evaluation.runner --partition development --validate-only` exits `0`; `check_quotes` exits `0`; the seed table is written.

### R2.6 Fixed parameters for Stages 3 to 7

These are settled so that the later cards need no design choices. A value changes only through a measured result recorded in a hand-back.

**Stage 3 — one format, lexical only**

| Item | Value |
|---|---|
| First format | DOCX, parsed with `python-docx` |
| Next.js piece | None. Staff query with `scripts/rag/query.sh` (curl with a local token). The workbench page is stage WB. |
| Chunker name and version | `hier-v1+hk-regulator-v1` |
| Token count | number of matches of `[A-Za-z0-9]+|[一-鿿]|[^\sA-Za-z0-9]` |
| Child chunk | one leaf under its heading chain; target 350 tokens, hard max 512 |
| Splitting a leaf over 512 | cut after the last sentence end before token 512. A sentence end is one of `. ! ? ; 。 ！ ？ ；` followed by whitespace or the end of text. If there is none, cut at the last whitespace before token 512. Repeat on the remainder. |
| Leaf under 64 tokens | merge it into the next sibling under the same parent; the last sibling merges into the previous one. Merge only if the result is 512 tokens or fewer; otherwise leave it small. An only child is left as it is. |
| Parent chunk | the lowest-level section as a whole. If it is over 2,000 tokens, cut it into consecutive parts of 2,000 tokens or fewer at child boundaries; each child points to its part with `parent_chunk_id`. |
| Overlap | none |
| Tables | one chunk per table, `is_table = true`, caption included, exempt from the 512 limit. A table over 2,000 tokens is cut between rows, the header row repeated in each part, with warning `{"code":"table_split"}`. |
| Heading source | Word styles `Heading 1` to `Heading 6` give levels 1 to 6. The regex table below applies only to unstyled paragraphs. A regex heading found under a styled heading gets level = that styled heading's level + the regex level. |
| Heading vs clause | a numbered line at regex level 1 to 7 is a heading when it has 12 words or fewer (for a line that is mostly Chinese: 30 characters or fewer) and does not end in `.`, `;`, `:`, `,`, `。`, `；`, `：` or `，`. Otherwise it is a clause: it becomes its own leaf and its number is appended to `section_path`. Levels 8 and 9 are always clauses. |
| `(i)` ambiguity | `(i)`, `(v)`, `(x)` are roman numerals unless the previous item under the same parent is `(h)`, `(u)` or `(w)` |
| Contents removal | after a paragraph matching `^(table of )?contents$|^目錄$` (case-insensitive), drop each following paragraph that matches `\.{3,}\s*\d+$` or `\t\d+$`. Stop at the first paragraph that matches neither, or after 200. Record `{"code":"toc_removed","count":n,"first_ordinal":a,"last_ordinal":b}` in `parse_runs.warnings`. |
| Header for `text_for_embedding` | `{body short name} | {source title} | {declared_version} | effective {effective_from or "n/a"}` newline `{section_path joined with " > "}` blank line `{text}` |
| Lexical index | generated column `fts tsvector` = `to_tsvector('english', text_for_embedding)`, GIN index (new migration in Stage 3) |
| Lexical query | `websearch_to_tsquery('english', q)`, ranked by `ts_rank_cd(fts, query, 32)`, top 100 child chunks, through a `security invoker` SQL function so RLS applies |
| Results returned | production response: top 5 child chunks, each with the child's own `text`. Evaluation response (guideline §11.3): top 20. |
| Known limit of Stage 3 | the interim confidence rule passes on any lexical match, so `false_pass_rate` is expected to be above 0 until Stage 6. Report it; do not tune it here. |
| Query class | every query is `requirement`, `classification_source = 'default'` |
| Interim confidence rule | pass needs at least one candidate with rank above 0. Gate version string: `gate-v0-uncalibrated`. |
| Worker | polling loop, every 5 s; lease 120 s; heartbeat every 30 s; 3 attempts; retry delay 60 s × 2^(attempt − 1). No `pg_cron`. |
| Gate reason codes | `AUTH_FAILED`, `NOT_AUTHORISED`, `SCOPE_UNRESOLVED`, `CROSS_ORG_CANDIDATE`, `NO_ACTIVE_INDEX`, `MIXED_INDEXES`, `UNAPPROVED_SOURCE`, `NO_ELIGIBLE_SOURCE`, `SUPERSEDED_ONLY`, `MISSING_SOURCE_LOCATION`, `EVIDENCE_REQUIREMENT_UNMET`, `LOW_CONFIDENCE`, `OCR_REQUIRED`, `EVIDENCE_TEXT_MISMATCH` |

Heading regex table (`hk-regulator-v1`), tried in this order; level 1 is the top:

| Level | Pattern |
|---|---|
| 1 | `^(PART|Part)\s+([IVXLC]+|\d+|[A-Z])\b` |
| 1 | `^(APPENDIX|Appendix|ANNEX|Annex|SCHEDULE|Schedule)\s+([A-Z]|\d+|[IVXLC]+)\b` |
| 1 | `^第[一二三四五六七八九十百\d]+(部分|部|章)` |
| 2 | `^(CHAPTER|Chapter|SECTION|Section)\s+\d+\b` |
| 2 | `^第[一二三四五六七八九十百\d]+節` |
| 2 + number of dotted parts | `^(\d+(?:\.\d+){0,4})\.?\s+\S` |
| 3 | `^第[一二三四五六七八九十百\d]+條` |
| 8 | `^\(([a-z])\)\s` and `^\((\d+)\)\s` |
| 9 | `^\(([ivxlc]+)\)\s` |

**Stage 4 — local embedding, hybrid**

| Item | Value |
|---|---|
| Candidates | `BAAI/bge-m3` and `Qwen/Qwen3-Embedding-0.6B`. Both 1,024 dimensions, multilingual, open-weight. Confirm each licence on its model card and pin the exact revision hash in the hand-back. |
| Runtime | `sentence-transformers` on CPU, inside the worker (documents) and the API (queries). Vectors L2-normalised. |
| Storage | per-index table with `vector(1024)`, cosine distance (`<=>`), **no index** (exact search) |
| Candidates per leg | 100 lexical, 100 vector |
| Fusion | reciprocal rank fusion, `score = Σ over legs of 1 / (60 + rank)`, rank starting at 1. A chunk missing from a leg gets 0 from that leg. Ties: lower chunk id first. Keep the top 100. |
| Winner | higher `passage_recall_at_k` (k = 10) on the development set. Within 1 point: `bge-m3`. |
| Before any download | Ivan's go (R2.8 item 4). Weights are fetched once, at build time, never at run time. |

**Stage 5 — more formats.** PDF bake-off: Docling, Unstructured, MinerU pipeline. Judge: 10 hand-labelled pages from our corpus, at least 4 with tables, labelled by Ivan or a reviewer he names (R2.8 item 8). A file profile is the triple (file type, has tables yes/no, text layer `digital` or `suspected_scan`). Winner per file profile: best table cell accuracy, then lowest reading-order error rate. Table cell accuracy = cells whose whitespace-normalised text equals the label at the same row and column ÷ labelled cells. Reading-order error rate = 1 − (length of the longest common subsequence between the parser's block order and the labelled block order ÷ labelled blocks). Digital PDFs only; a suspected scan is marked `ocr_required` and is not indexed.

**Stage 7 — reranker.** Candidates: `BAAI/bge-reranker-v2-m3` and `Qwen/Qwen3-Reranker-0.6B`, local, CPU. Input: the top 100 fused candidates. Output: top 5. Adopt the better one only if `passage_recall_at_k` (k = 5) rises by at least 3 points on the development set and `false_pass_rate` does not rise. Otherwise adopt none and record that.

**Stage 6 — gate calibration.** Provisional targets on the frozen set: `false_pass_rate` = 0; `passage_recall_at_k` (k = 5) ≥ 0.90; `abstention_specificity` ≥ 0.85. Frozen set size: 200 cases or more. Ivan approves the final numbers (R2.8 item 5).

### R2.7 Stage D — document digest (outline; cards written when Stage 6 closes)

- **Purpose:** for each approved document version, a local LLM proposes rule statements that a human author can accept or reject while writing a rule pack. It supports the pack. It never produces the pack and never awards anything (Q48, ADR-0003).
- **Runs** offline, in the worker, as a batch job per document version. Never inside `/retrieve`. Local model only.
- **Input:** one parent chunk at a time, with its heading chain.
- **Output per claim:** `{statement, quote, chunk_id}`. Code then checks that `quote` is a verbatim substring of that chunk's `text`, 240 characters or fewer. A claim that fails is discarded and counted in the job record. This is the ragflow v0.27 claim-evidence pattern.
- **Storage:** a new table `digest_claims` (status `proposed`, `approved`, `rejected`; approval through a definer function with an audit row). It is not evidence: `/retrieve` never returns it and nothing copies it into `chunks`.
- **Review:** a person approves or rejects every claim. Nothing unapproved is shown outside the review queue.
- **Open at that time:** which local LLM, and on what hardware (R2.8 item 7).

### R2.8 What Ivan still has to decide or do (recommendation first)

| # | Item | Needed before | Recommendation |
|---|---|---|---|
| 1 | **Supply the corpus.** Put the first source files in `scratch-demo/rag-corpus/`: at least one DOCX and the current HKCP and MCHK CPD/CME manuals. | B9-S2-B | 3 to 5 public documents is enough to start. |
| 2 | ~~**Vault paste.**~~ Done 2026-11-16: vault Decisions Log Q53, plus an Index callout. | — | — |
| 3 | **Review the 24 seed cases** (each quote against its source). | Stage 3 | About 2 hours, once. |
| 4 | **Go to download model weights** from Hugging Face (two embedding models, later two rerankers; about 2 GB each). | Stage 4 | Yes, with pinned revisions. |
| 5 | **Approve the gate targets** (R2.6, Stage 6). | Stage 6 | Keep `false_pass_rate` = 0 as the hard line. |
| 6 | **P1 container host.** Railway or Fly.io. The service needs 8 GB RAM or more for local models. | Stage 9 | Decide late; nothing before Stage 9 needs a host. |
| 8 | **Label 10 PDF pages** (table cells and reading order) for the parser bake-off. | Stage 5 | About 3 hours; an agent prepares the labelling sheet. |
| 7 | **Digest model and hardware.** A local LLM does not run well on an 8 GB machine. | Stage D | Decide at Stage 6 close, on measured need. |
| W1 | **Workbench page design.** A new staff page is a design decision and runs the locked frontend pipeline. | stage WB | Start it when Stage 6 closes. |
| W2 | **`withSecurity` first caller.** The workbench Server Action would be the wrapper's first live use (Q45, `docs/DEFERRED.md`). Wrapper or inline? | stage WB | Wrapper, as the documented standard. |
| D5 | **Chinese lexical search.** | after B9-S2-B reports P6 | Unchanged from R1. |

**Defaults chosen in R2. Ivan confirmed all six on 2026-11-16 ("no veto"):**
1. The worker polls the database; `pg_cron` is not used (amends guideline §5.6).
2. Corpus files stay outside git; only a manifest of hashes is committed.
3. Stage 1 and Stage 3 ship no Next.js code. The only Next.js surface is the workbench, late.
4. All B9 tables live in `public` under the guideline's names.
5. Python 3.12, `httpx`, no `supabase-py`.
6. Stage 8 (external observability) is folded into Stage 9, because E1 rules out an outside platform.

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

**R2: the checklist above is superseded.** Stages 1 and 2 may start now (ruling E4). Start conditions for every stage are in "Revision R2 → R2.2". Ivan's remaining items are in R2.8.

## R1 evidence (2026-11-16)

Verified = the source page or file was read this session. Everything else is marked.

- **e-means**: arXiv 2611.09501 and the faiss `contrib/e_means` README (verified). In `faiss-cpu` 1.16.0 per release notes (verified); wheel contents not opened. No independent replication found.
- **ragflow**: Apache-2.0 (verified, LICENSE). Patterns read at tag v0.20.5 (Python: `rag/nlp/__init__.py`, `rag/app/laws.py`, `manual.py`, `table.py`, `rag/nlp/search.py`, `rag/raptor.py`, `deepdoc/parser/pdf_parser.py`) and v1.0.0 (Go: `internal/ingestion/component/knowledge_compiler/tree/`). Its only k-means is a 1-D column detector in the Go PDF layout code. Not read: `task_executor.py`, DeepDoc model licences, the Go evaluation entity.
- **Contextual retrieval and reranking**: Anthropic, 2024-09-19 (verified). ViDoRe V3, arXiv 2601.08620 (verified).
- **Structure methods**: HippoRAG 2, arXiv 2502.14802, Table 2 (verified). RAPTOR's own ablation figure is from a search snippet, not the paper.
- **Parsing**: OmniDocBench v1.6 table (verified; scores largely self-reported by model authors). Docling's ParseBench figure is a snippet from a vendor benchmark.
- **pgvector limits and exact search**: pgvector README (verified).
- **Not verified**: live embedding leaderboard order; Traditional Chinese quality of any embedder or reranker; which BM25 extensions hosted Supabase offers; evaluation gold-set size guidance (practitioner sources only).
