---
name: rag-engine-planning
description: Use when drafting or revising the RAG engine or B9 plan.
category: documentation
---

# Eventar RAG (B9): revise the existing plan, cluster with e-means, never k-means

Revise the B9 plan set in place. Do not draft a parallel engine plan. Cluster with e-means, never k-means.

## Start from the existing B9 set

- Governing spec: `docs/plans/2026-08-29-rag-guideline-v0.5.2.md`. Stage plan: `docs/plans/2026-08-29-rag-execution-plan.md`. Block admission: `docs/architecture/B9-admission-2026-08-29.md`. Decision draft: `docs/plans/decisions-Q41-draft-rag-adoption.md`.
- Keep the B9 security design: Hard Rule 11 grant matrix with `42501` negative tests, forwarded Supabase JWT, service-role client confined to `services/rag_api/privileged/`.
- Name every changed section in the hand-back. Revisions mark what moved, not a rewrite.

## Clustering

- Use e-means (arXiv 2611.09501; `faiss` contrib `e_means`). Never write k-means into a plan, code or test.
- Clustering needs a named role: summary tree (RAPTOR-style), IVF centroid training above about 1 million vectors, or offline corpus analysis. Ivan chose "wherever needed": add a clustering step only where evaluation shows a gain.

## Evidence rules

- Evidence text is never machine-augmented. LLM chunk context and cluster summaries steer retrieval only. They never reach `chunks.text` or any returned evidence.

## Phase 1 boundary

- Read the governing ADR and the Decisions Log entry before recommending any model, vendor, parser or host. Cite the line that constrains the choice. Open every ADR the grep names and check for a later one: a newer ADR can overrule the governing one. On 2026-11-16 a hosted reranker was recommended before `docs/adr/0003-dual-package-security-and-closed-rag.md` was read, and the ruling had to be reopened.
- Models are local open-weight only (ruling E1, 2026-11-16). Hosted embedding or reranker providers are excluded.
- Stays out of Phase 1: Graph RAG, agentic retrieval, answer generation, OCR execution, a dedicated vector database, live crawling. Each one needs a flagged decision before it enters a plan.
- Every new vendor (embedding, reranker, parser, host) needs a Decisions Log entry and a register update first.

## ragflow

- ragflow 1.0.0 is a Go monolith. It needs Elasticsearch or Infinity, MySQL, MinIO, NATS and kvrocks, and 16 GB RAM. Use it as a pattern source only.
- Borrow: layout-aware parsing, chunk templates, hybrid recall with fused rerank, grounded citations. Running it whole breaks Hard Rules 5, 7 and 11.

## Before writing a decision

- Confirm the next free Q number first (`eventar-decision-doc-alignment`, step 3).

## Kick-off gate

- A phased plan document is the default output. Code and migrations wait until Ivan switches the active phase (Hard Rule 13).
- Ruling E4 (2026-11-16): Stages 1 and 2 may start now, in parallel with Stage 8. Stage 3 onward waits for Ivan's go. The execution plan's "Revision R2" section overrides older kick-off text.

## Plan cards must need no design choices

- Ivan's standing ask: the plan is detailed enough that the executing agent needs no extra reasoning. Every card fixes: file names, column types and nullability, RLS `using` clauses, function arguments, returns and audit payload, env var names, exit codes, metric formulas with one worked example, and every parameter.
- Before handing cards out, cold-read each one with read-only probe agents (`cold-start-knowledge-probe`). Each probe lists every point where it would have to choose, guess or design. Fix those points in the card, then probe again.
- Before a card cites a schema, prove the DDL. Apply the whole file to the local stack inside `BEGIN ... ROLLBACK`. Smoke-test it: table count, row-level security on every table, `42501` on each forbidden direct write, each function called. Then confirm the database is clean (no leftover tables or extensions). The card copies the proven file and does not redesign it. Never run `supabase db reset` for this.
- Show Ivan the decisions in the reply (`present-decisions-and-requested-content`): a table of open items with the recommendation first, plus every default you chose without asking, marked for veto.

Research numbers and sources: `references/rag-state-of-art-2026-11.md`.
