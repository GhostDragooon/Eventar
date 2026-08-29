# Q41 draft — RAG adoption (post-MVP, B9)

_Draft prepared 2026-08-29. Vault is EPERM-blocked to this session; paste this entry into `/Users/ivan/Desktop/Eventar/02 — Decisions Log.md` under the next free Q-slot. Q-number is best-effort against Q40 (HKSTP grant naming, highest I've seen referenced in-repo) — bump to Q42 if Q41 is already taken._

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

**Signed**

Ivan Au, 2026-08-29.
