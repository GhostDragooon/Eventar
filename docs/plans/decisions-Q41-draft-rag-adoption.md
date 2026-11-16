# Q41 draft — RAG adoption (post-MVP, B9)

_Draft prepared 2026-08-29. Vault is EPERM-blocked to this session; paste this entry into `/Users/ivan/Desktop/Eventar/02 — Decisions Log.md` under the next free Q-slot. Q-number is best-effort against Q40 (HKSTP grant naming, highest I've seen referenced in-repo) — bump to Q42 if Q41 is already taken._

_**Number correction, 2026-11-16:** vault Q41 is taken (Core-UX design round, 2026-10-01). The vault's highest entry is Q52, so this entry pastes as **Q53**. Re-check on the day of the paste. The heading below and this file's name keep "Q41" until then, so existing links do not break._

---

## Q41. RAG service adopted as B9 (post-MVP). 2026-08-29.

**Decision**

Adopt the narrow retrieval service specified by `rag_building_guideline_v0.5.2_eventar.txt` (scratchpad; paste path TBD) as the governing Phase-1 build specification for rule-pack authoring / source lookup / version comparison against real regulator documents. Ships as new block **B9 Rule Authoring / Source Evidence** per `docs/architecture/BLOCK-ARCHITECTURE.md`. Admission checklist recorded at `docs/architecture/B9-admission-2026-08-29.md`.

**Scope**

Phase 1 activates two document families: `body_rule_source` (a body's own rules — HKCP CPD Manual, HKAM Guide to CPD, MCHK Continuing Medical Education Guidelines, etc.) and `accreditation_letter` (a body's approval letter for a specific event or organiser). Phase 1 activates four use cases: `rule_lookup`, `source_location`, `version_comparison`, `pack_authoring_support`. `participation_evidence` stays out of Phase 1 (personal data); `rule_pack_definition` remains versioned code, not a RAG family.

**Boundary (permanent)**

The RAG service does not write to `credit_ledger` or any other B3 table, does not compute or award points, does not decide accreditation / completion / recognition, does not become the live credit path, does not generate an answer when the retrieval gate fails, and does not replace human approval of a rule pack. Guideline §1.2 lists the full nine-item boundary.

**Architecture**

- Python FastAPI + worker on a separate container host (Railway / Fly.io / equivalent, account TBD).
- Next.js stays on Vercel; browser → Server Action (`withSecurity()`) → FastAPI with the user's Supabase JWT forwarded.
- FastAPI re-queries Supabase with the forwarded JWT to resolve `staff` membership (unforgeable; not a signed header from Next.js).
- pgvector for vector retrieval; Postgres FTS for lexical; RRF fusion baseline; no reranker in Phase 1.
- Separate embedding table per `embedding_indexes.id`; activation is an atomic pointer swap in `retrieval_index_assignments`, and rollback is the same pointer swap (no re-embed required).
- Worker tick uses Supabase pg_cron (one scheduler for the repo).
- Privileged service-role client lives in a `services/rag_api/privileged/` module; an architecture test forbids its import from any retrieval router.

**Terminology**

Aligned with `CONTEXT.md`. Document families are `body_rule_source` / `accreditation_letter` (not "authority_rule" / "accreditation_evidence"). Scope literal is `global_authority` (a scope_type value, distinct from the retired "authority" glossary term); prose says "global-scope". "Board Pack" retains its CONTEXT.md meaning (external name for the rule pack — the versioned points-calculation artefact); the RAG service produces evidence supporting a rule pack, it does not produce the rule pack itself.

**Security**

- Hard Rule 11 grant matrix + `42501` negative tests apply to seven audited-mutation tables: `processing_jobs`, `document_approvals`, `embedding_indexes` (transitions), `retrieval_index_assignments` (transitions), `pack_versions`, `pack_sources`, `pack_source_passages`.
- Cross-block reads (if a future consumer needs B1 events / B2 registry context) go through the owning block's definer functions per BLOCK-ARCHITECTURE fitting rule 2.
- No PII in logs (Hard Rule 10). Audit-insert-last invariant respected on any audited mutation.

**Stage placement**

Post-MVP. Not on the current grant-MVP week's critical path (Stage 10.4/10.9). Slots later, alongside or after Q26 / doctrine D.1 work.

**Approvers waiver**

Three-role production-approver gate waived for pilot; Ivan Au is operational owner for development, activation and rollback. Gate revisited when the first external organisation is onboarded.

**External processors**

No vendor pre-approved. Register today = {Supabase, Resend, Vercel (planned)}. Any addition (embedding provider, reranker, observability, container host) requires its own Decisions Log entry and register update before any real organisation or non-public evaluation content leaves the environment.

**Reverses / supersedes**

- Reverses BLOCK-ARCHITECTURE.md's prior reservation of B9 for Commercial (invoice-first, zero code today). Commercial is re-tagged to B10 in the same edit.
- Supersedes both files named `RAG_building_guideline_v0.4*` in `~/Downloads/` and their in-review v0.4 second-pass — collapses the v0.4 dual-file split at v0.5.x.

**Release-gate posture**

Guideline §3.5 lists the fifteen items. As of 2026-08-29:
- Repository integration verified: closed.
- Document policies (Phase 1): closed.
- Async job model + embedding storage + parse-run model + rule-pack pinning: closed.
- Retention values: pinned in guideline §6.9 as of v0.5.2.
- B9 admission: closed by `B9-admission-2026-08-29.md`.
- Decisions Log entry: this entry.
- Security / RLS / data-boundary / evaluation / rollback / backup / release: open — Stage-by-Stage per guideline §16.

**Revision R1 rulings (Ivan, 2026-11-16)** — detail in `docs/plans/2026-08-29-rag-execution-plan.md`, "R1 flagged decisions".

- Clustering: e-means only (arXiv 2611.09501, `faiss.contrib.e_means`), never k-means, and only where evaluation shows a gain. No clustering step is in the default stages.
- ragflow is a pattern source only. It is not run, whole or in part.
- D1: no LLM-written chunk context for now; the deterministic heading-chain header ships.
- D2: reranker evaluation runs before gate calibration (order 5 → 7 → 6 → 8 → 9). Amends guideline §16.
- D3: ~~reranker is hosted, for public regulator documents only~~ — reversed the same day by E1 below.
- D4: MinerU pipeline joins the PDF bake-off beside Docling and Unstructured. Amends guideline §2.4 item 7.
- D5: Traditional Chinese lexical search is decided after the corpus language count (pre-work P6).
- "No reranker in Phase 1" under Architecture above is superseded by D2 and D3: a reranker is expected, subject to its evaluation.

**Revision R2 rulings (Ivan, 2026-11-16)** — a cross-check found the guideline in conflict with ADR-0003 §5 and Q48. Detail in the execution plan, "Revision R2". Guideline amended as v0.5.3 (amendment block at its top).

- E1: models are local and open-weight (embedding and reranker). No hosted model provider. This supersedes "No vendor pre-approved … embedding provider, reranker" under External processors above: there is none.
- E2: only `eventar_staff` and `body_admin` (own body) may read B9 data or query it. No organiser or auditor access. No live retrieval on a product path.
- E3: the document digest (Q48) is a separate stage after gate calibration: a local LLM proposes rule statements, each with a code-verified verbatim quote; a person approves each one.
- E4: Stages 1 and 2 (schema, security, evaluation scaffold) may start now, in parallel with Stage 8, on public HKCP and MCHK documents. Stage 3 onward needs Ivan's go. This supersedes "Stage placement" above.
- Architecture corrections: the worker polls the database (no pg_cron); Stages 1 to 6 ship no Next.js code; the staff workbench is one late stage.

**Signed**

Ivan Au, 2026-08-29.
