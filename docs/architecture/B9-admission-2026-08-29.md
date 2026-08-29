# B9 (Rule Authoring / Source Evidence) — admission checklist

_Run 2026-08-29 by Ivan Au against `docs/architecture/BLOCK-ARCHITECTURE.md` "New-work admission checklist"._
_Governing spec at admission time: `rag_building_guideline_v0.5.1_eventar.txt` (published 2026-08-29; v0.5.2 supersedes with retention pinned)._
_Decisions Log entry: Q41 (2026-08-29, RAG adoption). Draft at `docs/plans/decisions-Q41-draft-rag-adoption.md` pending paste into vault `02 — Decisions Log.md`._

## Identity

- **Block**: B9 Rule Authoring / Source Evidence.
- **Note on numbering**: BLOCK-ARCHITECTURE.md previously reserved B9 for Commercial as a speculative future block. Commercial has zero code today and remains invoice-first for the foreseeable future; Commercial is re-tagged to B10 in this admission. RAG takes B9 as the next real block coming online.

## The six checklist items

1. **Which block owns it?**
   New block B9. It cannot be decomposed into an existing block because (a) it introduces a Python runtime with its own service boundary, (b) it owns its own tables (`documents` through `retrieval_traces`, plus the pack-pinning tables), and (c) its writes and reads are its own — it does not mutate any B1–B8 table. Consuming its outputs (e.g. by a future rule-pack authoring workbench) is a separate consumer's responsibility inside the consuming block.

2. **Does it write only via audited paths and read only via RLS?**
   Yes. Guideline §6.4 lists the seven audited-mutation tables — `processing_jobs`, `document_approvals`, `embedding_indexes` (status transitions), `retrieval_index_assignments` (pointer updates), `pack_versions`, `pack_sources`, `pack_source_passages` — each carrying the Hard Rule 11 grant matrix (`INSERT`/`UPDATE`/`DELETE` revoked from `public`, `anon`, `authenticated`, `service_role`) and paired negative-`42501` tests. All reads go through Postgres RLS under the forwarded user JWT (guideline §5.4). Import-boundary architecture test (guideline §13.4) fails CI if a retrieval router imports the privileged client.

3. **Does it respect the dependency direction (no kernel edits, no sideways table writes)?**
   Yes.
   - K1 (Identity & Access): read-only via RLS-scoped reads of `staff`, `organisations`, `auth.users`. No K1 schema change.
   - K2 (Integrity Substrate): reuses `audit_events` hash chain + `write_audit_event` + `pg_advisory_xact_lock` audit-insert-last invariant without modification. No K2 change.
   - K3 (Security Shell): the Next.js Server Action that fronts `/retrieve` uses `withSecurity()` (rate-limit, Zod, Q18 guard) matching every other staff mutation. FastAPI has its own JWT-verify + membership-resolve + role-authorise stack per guideline §6.2/§6.3; the two are independent controls, not a replacement of the K3 wrapper.
   - Sideways: no B9 code writes to any B1–B8 table. Cross-block reads (if a future consumer needs B1 events / B2 registry context) go through that owning block's definer functions per fitting rule 2; integration assertion at guideline §13.6.

4. **Does it have a kill/rollback story?**
   Yes, at four independent levels — no orphaned records at any level:
   - **Application surface**: disable the Next.js Server Action fronting `/retrieve`. Nothing calls FastAPI.
   - **Service**: stop the FastAPI + worker processes on the container host. Retrieval returns nothing; ingestion queue drains.
   - **Credentials**: revoke the container host's Supabase credentials. Service can start but cannot reach the database.
   - **Index rollback**: set `retrieval_index_assignments.active_embedding_index_id` to the previous approved index (pointer swap only, no re-embed) per guideline §10. Retired candidate indexes remain isolated for post-mortem.
   Tables and content stay queryable throughout; every rollback path is a data-preserving disable.

5. **If shipped partially, what is the re-entry criterion for the rest?**
   Stage 3 (one format end-to-end with FTS-only retrieval) is the minimum viable slice. If shipped after Stage 3 without Stages 4–9, the re-entry criteria are:
   - **Stage 4 (embeddings + hybrid)**: real regulator corpus available for the deferred families (guideline §2.2); embedding provider decided and data-boundary approved (guideline §2.5 + §3.2).
   - **Stage 5 (remaining formats)**: representative files per format; parser bake-off run for PDF; DOCX/Excel/HTML each earn their own slice after real files exist.
   - **Stage 6 (gate calibration)**: expanded case coverage per §12, real answerable + unanswerable cases.
   - **Stage 7 (reranker)**: error analysis demonstrates a material retrieval problem.
   - **Stage 8 (observability)**: internal traces stable + data-boundary approved.
   - **Stage 9 (production release)**: entire §3.5 gate.
   Each deferred stage has its own re-entry note in guideline §16.

6. **Is it on the current milestone's critical path?**
   No. Stage placement in v0.5.x is explicitly "after the current MVP, not in Stage 10/11, slots later alongside or after Q26 / doctrine D.1 work". B9 is admitted to the block map now so its architecture is locked and any future code has a home to fit into; no code lands until the current grant-MVP week (Stage 10.4/10.9) is closed and the Q26/D.1 fork is resolved.

## Verdict

**ADMITTED**. B9 is added to the block map. Guideline v0.5.2 becomes the governing Phase-1 build specification for B9 upon Q41 landing in the vault Decisions Log.

## Constitutional-amendment record

BLOCK-ARCHITECTURE.md's own change-control table classifies adding a new block as a kernel-adjacent change requiring Decisions Log entry + Ivan sign-off + full protocol. Q41 is the Decisions Log entry; this file is the admission-checklist record; Ivan's sign-off is his direct instruction dated 2026-08-29 in the chat that produced this file.
