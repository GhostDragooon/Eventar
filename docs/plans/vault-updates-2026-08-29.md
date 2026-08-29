# Vault updates — 2026-08-29 (RAG adoption, B9)

_This session's sandbox is EPERM-blocked on `/Users/ivan/Desktop/Eventar/`, so vault updates could not be written directly. Everything below is pastable text — copy the fenced blocks into the named vault notes to bring the vault into alignment with the repo._

## 1. `02 — Decisions Log.md` — add Q41

Full text lives at [decisions-Q41-draft-rag-adoption.md](decisions-Q41-draft-rag-adoption.md). Paste the whole `## Q41.` block under the next free Q-slot in the log. If Q41 is taken, bump to the next free number and update the two other places that reference "Q41":

- Guideline §6.9 header ("pinned 2026-08-29 — Q41")
- `docs/architecture/B9-admission-2026-08-29.md` (three references)
- `docs/architecture/BLOCK-ARCHITECTURE.md` — the RAG line in "Where known future items slot" and the B9 tier-1 row

A single find-replace across those four files is enough.

## 2. `00 — Index.md` — add orientation entry

Under whichever section lists live architectural blocks (or as its own line if there isn't one), paste:

```markdown
- **B9 Rule Authoring / Source Evidence** (admitted 2026-08-29, Q41) — Python FastAPI + worker on a separate container host, supports rule-pack authoring / source lookup / version comparison against real regulator documents. Post-MVP. Governing spec: `docs/plans/2026-08-29-rag-guideline-v0.5.2.md`. Admission: `docs/architecture/B9-admission-2026-08-29.md`. Execution plan: `docs/plans/2026-08-29-rag-execution-plan.md`.
```

## 3. `10 — Architecture/` — new note `10 — Architecture/RAG — B9.md`

Create the note with this content:

```markdown
# RAG — B9 (Rule Authoring / Source Evidence)

_Locked 2026-08-29 by Decisions Log Q41. Governing spec is in the repo, not the vault: `docs/plans/2026-08-29-rag-guideline-v0.5.2.md`. This note is orientation; the guideline is authority._

## What it is

A narrow retrieval service supporting the human work of rule-pack authoring. It retrieves passages from a body's source documents (HKCP CPD Manual, HKAM Guide, MCHK CME Guidelines, etc.), locates them in the source, and compares what changed between versions. It does not generate final answers in Phase 1.

## Permanent boundary

The RAG service does not:
1. Compute or award points.
2. Decide accreditation, completion or recognition.
3. Write into `credit_ledger` or any other B3 table.
4. Become the live credit path.
5. Replace human approval of a rule pack.
6. Generate an answer when the retrieval gate fails.

The deterministic evaluator (Q26 / doctrine D.1) consumes only a human-approved, version-pinned rule pack. RAG produces the evidence that a rule pack rests on; it does not produce the rule pack itself.

## Architecture (one-line each)

- Python FastAPI + worker on a separate container host (Next.js stays on Vercel).
- Browser → Next.js Server Action (`withSecurity()`) → FastAPI with the user's Supabase JWT forwarded.
- FastAPI validates the JWT and re-queries Supabase for `staff` membership (unforgeable).
- Postgres FTS + pgvector for retrieval, RRF fusion baseline, no reranker in Phase 1.
- Separate embedding table per `embedding_indexes.id`; activation is an atomic pointer swap.
- Worker tick uses Supabase pg_cron.
- Privileged service-role client lives in an isolated module; an architecture test forbids its import from any retrieval router.

## Terminology

Fully aligned with `CONTEXT.md`. Document families are `body_rule_source` and `accreditation_letter` (never "authority_rule" / "accreditation_evidence"). "Board Pack" retains its `CONTEXT.md` meaning — the external name for the rule pack (versioned points-calculation artefact). RAG produces evidence supporting a rule pack; it does not produce the rule pack.

## Where things live

- **Governing spec**: `docs/plans/2026-08-29-rag-guideline-v0.5.2.md`
- **Execution plan**: `docs/plans/2026-08-29-rag-execution-plan.md`
- **Block admission**: `docs/architecture/B9-admission-2026-08-29.md`
- **Block map**: `docs/architecture/BLOCK-ARCHITECTURE.md` (B9 row)
- **Decisions Log**: this vault, Q41
- **Code (future)**: `services/rag_api/` (does not exist yet)
- **Runbook (future)**: `docs/runbooks/rag.md` (before Stage 9)

## Stage placement

Post-MVP. Not on the current grant-MVP week's critical path. Slots later, alongside or after Q26 / doctrine D.1 work. Nine execution stages per the execution plan.

## Retention (pinned)

Per Q41 and guideline §6.9:
- Original source files: life of dependent rule-pack version + 7 years.
- Parsed elements / chunks / embeddings: co-terminous with source.
- Retired candidate indexes: 12 months post-retirement.
- retrieval_traces (redacted): 90 days.
- retrieval_traces (with original_query): 30 days; DSR overrides.
- Evaluation records: 7 years.
- Audit rows: append-only, indefinite (Hard Rule 11).
```

## 4. `20 — Roadmap/` — new note `20 — Roadmap/RAG — B9 post-MVP.md`

Create the note with this content:

```markdown
# RAG — B9 post-MVP roadmap

_Locked 2026-08-29 by Decisions Log Q41._

## Stage placement

After the current MVP. Not in Stage 10/11. Slots later, alongside or after Q26 / doctrine D.1 work. Nine execution stages.

## Nine stages

1. Security + schema foundation (7–10d)
2. Evaluation foundation (3–5d + case-authoring separately)
3. One format end-to-end — DOCX (10–15d)
4. Embedding + hybrid retrieval (5–7d + embedding provider bake-off 1–2wk)
5. Remaining formats — PDF (bake-off), Excel, HTML (5–8d each)
6. Gate calibration (7–10d)
7. Reranker evaluation (optional, 0 or 5–10d)
8. Observability evaluation (optional, 0 or 3–7d)
9. Production release (3–5d)

Wall-clock ballpark: ~10–14 weeks for a real Stage-9 release.

Minimum viable slice: Stages 1–3 (DOCX-only retrieval with FTS, gated, RLS-scoped).

## Kickoff readiness (six ticks)

- [ ] Q41 pasted into `02 — Decisions Log.md`
- [ ] This note + `10 — Architecture/RAG — B9.md` + `00 — Index.md` updated
- [ ] Container host account provisioned (Railway / Fly.io / equivalent)
- [ ] pg_cron + pgvector confirmed on target Supabase project
- [ ] Grant-MVP week (Stage 10.4/10.9) closed
- [ ] Q26 / doctrine D.1 fork resolved OR explicit go-ahead to proceed in parallel

## Full execution plan

`docs/plans/2026-08-29-rag-execution-plan.md` (in repo, not vault).
```

## 5. `30 — Reference/Stack.md` — extend the stack list

Add these entries under whichever section lists per-language / per-service tooling:

```markdown
### Python (RAG service, B9, post-MVP)

- **FastAPI** — API + worker entry points.
- **Pydantic v2** — contracts and validation.
- **openpyxl** — Excel parsing.
- **python-docx** — DOCX baseline.
- **BeautifulSoup** — static HTML.
- **Docling and Unstructured** — PDF parser candidates for bake-off.
- **pytest + pytest-asyncio** — test framework.
- **Supabase pgvector extension** — vector retrieval.
- **Supabase pg_cron extension** — worker tick.

### Container host (post-MVP)

- **Railway or Fly.io** (TBD) — Python FastAPI + worker deployment target. Next.js stays on Vercel.

_Every new external service requires a Decisions Log entry per Q41 + guideline §6.7. Current register: {Supabase, Resend, Vercel (planned)}._
```

## Summary — five vault touches

1. `02 — Decisions Log.md` → paste Q41.
2. `00 — Index.md` → add B9 orientation line.
3. `10 — Architecture/RAG — B9.md` → create.
4. `20 — Roadmap/RAG — B9 post-MVP.md` → create.
5. `30 — Reference/Stack.md` → extend with Python + container host.

Estimated time: **15–20 minutes**, mechanical.
