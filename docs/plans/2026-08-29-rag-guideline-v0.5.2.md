EVENTAR RAG BUILDING GUIDELINE
Version 0.5.2 | 2026-08-29
Status: GOVERNING build specification for Phase-1 post-MVP RAG work (block B9).
Governance: Decisions Log Q41 (2026-08-29) records adoption. Block admission recorded at docs/architecture/B9-admission-2026-08-29.md. Retention values pinned in §6.9 as of this version.
Supersedes: 2026-08-29 v0.5.1 (retention values in §6.9 pinned from skeleton to concrete numbers; §19 checklist rows for Decisions Log entry, B9 admission and retention flipped closed; status lifted from "not yet governing" to "governing"). No architectural change.
Predecessors: 2026-08-29 v0.5 (editorial fixes only, closed at v0.5.1); 2026-08-29 v0.4 second-pass (closed at v0.5.x).
File purpose: Architecture, data model, ingestion mechanics, security controls, evaluation, and implementation sequence for a narrow retrieval service supporting rule-pack authoring, source lookup and version comparison against real regulator documents.

IMPORTANT CONTROL
Checked against GhostDragooon/Eventar branch main as of 2026-08-29. Eventar-native vocabulary throughout (per CONTEXT.md glossary). No unresolved item silently converted into an implementation assumption.

=======================================================================
1. PURPOSE AND PERMANENT BOUNDARY
=======================================================================

1.1 Purpose
Retrieval service supporting the human work of:
1. Rule-pack authoring — retrieving the specific passages from a body's source documents that a rule under construction rests on.
2. Rule lookup — locating a body's stated requirement, criterion, or exclusion.
3. Source location — resolving where in a source document a passage lives (page, section, sheet, coordinate).
4. Rule-pack version comparison — surfacing what changed in a body's source material between two rule-pack versions.

Retrieval returns evidence passages plus a gate verdict. Generation is out of scope for this phase.

1.2 Permanent boundary
The service must not:
1. Invent attendance, participation or completion facts.
2. Compute or award points.
3. Decide whether an event is accredited by a body.
4. Decide whether a practitioner completed an activity.
5. Decide whether a body accepts a cycle return.
6. Become the live credit path.
7. Replace human approval of a rule pack.
8. Generate an answer when the retrieval gate fails.
9. Write into credit_ledger or any other B3 (Credit Engine) table.

The deterministic evaluator (Q26 / doctrine D.1) consumes only a human-approved, version-pinned rule pack. The RAG service produces evidence supporting that rule pack; it does not produce the rule pack.

1.3 Separate questions
The system keeps these questions separate:
1. Did a body approve this event as an FCAA?
2. Did a practitioner attend?
3. Did the receiving body accept the cycle return that included this activity?
Retrieval may support review of any of them. It must not collapse them into one trust decision.

1.4 Terminology
Terms follow CONTEXT.md. In particular:
- body = accrediting body (MCHK, HKCP, other Colleges under HKAM, etc.). Never "authority", "regulator", "institution".
- track = MCHK or HKAM; a property of the body, not the licence.
- cycle / cycle anchor = per CONTEXT.md.
- rule pack = versioned points-calculation artefact (external name: "Board Pack"). Not a document evidence set.
- FCAA, point, hour, activity category = per CONTEXT.md.
- organisation = Eventar's tenancy unit (organisations table). Never "tenant" in user-facing contracts; internal identifiers may say organisation_id.
- practitioner / licence / Fellow = per CONTEXT.md.

Document families the RAG service knows about carry Eventar-native names — see §4.

=======================================================================
2. CONFIRMED DIRECTION AND CLOSED DECISIONS
=======================================================================

2.1 Confirmed direction
1. Python FastAPI owns ingestion, parsing, chunking, embedding, indexing, retrieval, evaluation and gating.
2. Supabase Postgres, pgvector, full-text search, Storage, Auth and Row Level Security are the platform.
3. Next.js remains the user-facing application.
4. Heavy processing is asynchronous and job-based.
5. Online retrieval is separate from offline ingestion.
6. Retrieval quality is assessed before any generation.
7. Generation does not run when the retrieval gate fails.
8. Phase-1 API returns retrieval results and gate status only.
9. Embedding, reranking, parsing and observability vendors require evaluation before selection.
10. Original files and approved source versions remain traceable.
11. The authoritative evaluation set belongs to Eventar.
12. Cross-organisation leakage is prohibited.
13. No structured writes into credit_ledger or any other B3 table.

2.2 Post-verification decisions (2026-08-29)

Stage placement — After the current MVP. Not in Stage 10/11. Slots later, alongside or after Q26 / D.1 work.

Block placement — New block: B9 Rule Authoring / Source Evidence. Must pass the BLOCK-ARCHITECTURE.md new-work admission checklist before any code. B9 owns its own tables via its own definer functions; cross-block reads to B1/B2 (if a future consumer needs event or registry context) go through the owning block's definer functions per fitting rule 2.

Hosting —
- Next.js stays on Vercel (Stage 8 plan unchanged).
- Python FastAPI + worker on a separate container host (Railway, Fly.io or equivalent). Host account decision recorded when made.
- Same Docker image, separate API and worker entry commands.

Production approvers — Waived for pilot; Ivan Au is operational owner for development, activation and rollback. Three-role organisational gate revisited when the first external organisation is onboarded.

Retention — Concrete numerical values pinned from Eventar's existing PDPO / DPO guidance and recorded before the production-release gate. Section 6.9 gives the skeleton.

Representative corpus — Primary goal is the ingestion path that can digest real regulator manuals, including the HKCP manual once it is available. Provisional or public material may be used while the path is being built; a frozen validation set covering a corpus family stops being frozen the moment that family's first real regulator file arrives.

External processors — No vendor is pre-approved. Current register: {Supabase, Resend, Vercel (planned)}. Any addition (embedding, OCR, observability, reranker) requires a Decisions Log entry and a register update before any real organisation or non-public evaluation content leaves the environment. Phase 1 stays on internal retrieval_traces + redacted structured logs.

Terminology — Aligned with CONTEXT.md. See §1.4.

2.3 Repository verification facts (Section 3.1 gate closed)
| Item | Reality in main |
| --- | --- |
| Repo + branch | GhostDragooon/Eventar main, confirmed |
| Next.js | 16.2.12 (React 19.2.4). Staff gate = proxy.ts (renamed from middleware.ts in Next 16). |
| Supabase clients | lib/supabase/browser.ts · lib/supabase/server.ts (@supabase/ssr, cookie-bound, RLS as authenticated user) · lib/supabase/admin.ts (service role, server-only import). |
| Server pattern | Server Actions gated by withSecurity(). No Edge Functions. /api/* reserved for cron + external integration (Hard Rule 5). |
| Membership / RLS | staff.organisation_id + 5-role model, app_private.require_active_staff(variadic p_roles), requireStaff() at lib/auth.ts. RLS on every table. Hard Rule 11 grant matrix enforced by tests/rls/audited_table_writes.rls.test.ts. |
| Hosting | Vercel for Next; separate container host for Python (§2.2). |
| Python | Zero today. No services/, no pyproject.toml. New language + new deploy target + new CI. |
| pgvector | Not enabled. One-line extension migration. |
| Async infrastructure | processing_jobs-style table not present. Cron not wired (vercel.json reverted). Transactional claim + heartbeat + lease is greenfield. |

2.4 Baseline components
1. Python FastAPI (API + worker entry points).
2. Pydantic v2 for contracts and validation.
3. Supabase Postgres + pgvector + FTS + Storage.
4. openpyxl (Excel).
5. python-docx (DOCX baseline).
6. BeautifulSoup (static HTML baseline).
7. Docling and Unstructured (PDF parser candidates for bake-off).
8. pytest + pytest-asyncio for the Python side. TypeScript RLS tests continue via pnpm test:rls.
9. Eventar-owned evaluation records (§12) and test fixtures.

A baseline component is replaced only for a documented constraint (security, unsupported feature, failed QC, unacceptable cost, or measured performance limitation).

2.5 Evaluate before selection
1. Final PDF parser (after bake-off on representative files).
2. Embedding provider + model (after evaluation on same chunks + gold cases).
3. Reranker (only after hybrid baseline).
4. Observability platform (only after internal traces + data-boundary approval).
5. Container host account.
6. Vector index type and parameters.
7. Numerical QC thresholds.

2.6 Do not add in Phase 1
1. Langflow or any visual workflow as production runtime.
2. Dedicated vector database.
3. Graph RAG.
4. Agentic / multi-agent retrieval.
5. Self-hosted embedding or reranking models.
6. Automatic answer generation.
7. Any structured write into credit_ledger or any other B3 table.
8. participation_evidence as a RAG source family (personal data — outside Phase 1).
9. Live web crawling.
10. OCR execution (detection required, execution deferred).

=======================================================================
3. REQUIRED DECISION GATES
=======================================================================

3.1 Repository integration gate — CLOSED
Repository inspected. Call path, JWT forwarding, secret boundary, and client separation confirmed compatible. Remaining work is implementation verification of claim shapes and grant statements during Stage 1, not architectural redesign.

3.2 Data-boundary gate
Required before any external processor receives content:
1. Classification of activated families (body_rule_source generally public; accreditation_letter may be organisation-confidential).
2. Processing locations of selected services recorded.
3. External processor register entry + Decisions Log for any new vendor.
4. Retention values pinned from PDPO / DPO guidance (§6.9).
5. Redaction policy tested against a real corpus sample.
Default: no real organisation document text or queries leave the environment.

3.3 Document policy gate — Phase 1 policies

PDF
- Digital only.
- Scan detection required; thresholds calibrated on representative files.
- OCR execution deferred.
- Suspected scans → ocr_required or needs_review; empty or incomplete parses are never indexed.
- Preserve page, section path, table location, and multi-page table range.
- Docling vs Unstructured bake-off on the same approved files; the winner per file-profile is recorded on parse_runs (§7.7).

DOCX
- Supported: paragraphs, heading styles, ordinary tables, lists, hyperlink text + destination where reliable.
- Headers and footers extracted separately, excluded from searchable content by default unless classified substantive.
- Tracked changes → needs_review.
- Text boxes → warning unless reliable extraction confirmed.
- Fields retain displayed text + field information where accessible.
- Drawings not treated as textual evidence.
- Embedded objects inventoried, not recursively processed.
- Comments retained as metadata; excluded from authoritative evidence by default.
- Footnotes / endnotes extracted with references where supported.
- Any unsupported construct that may hold substantive evidence blocks an unqualified parser QC pass.

Excel
- Dual load: data_only=False (formulas) and data_only=True (cached values). Both stored.
- Store formula, cached value, data type, number format, coordinate and applicable headers separately.
- Do not manufacture a display value unless reliably reproducible from stored value + number format.
- Visible sheets / rows / columns eligible for ordinary retrieval.
- Hidden content retained in parsed record, excluded from ordinary retrieval by default, flagged for review.
- Very hidden sheets require explicit reviewer approval.
- Merged cells retain anchor + full range; header propagation only in the derived retrieval representation.
- Prefer Excel Tables and named ranges; otherwise proposed structure + warning.
- Macros never executed; VBA outside scope.
- External links recorded, never followed or refreshed.
- Headless recalculation not allowed by default.
- Missing / stale cached values → needs_review.

HTML
- Static files only.
- Live crawling deferred.
- Deterministic selectors where structure known; otherwise versioned extraction policy + warnings.
- Scripts, styles, navigation, cookie banners, repeated footers removed under recorded rules.
- Preserve headings, lists, tables, relevant link destinations.
- Script-rendered content unsupported and flagged incomplete.
- No automatic browser renderer.

3.4 External component evaluation gate
Required before selecting embedding provider, reranker, final parser, or observability platform. Same corpus, fixed dataset version, recorded candidate versions, defined metrics, recorded latency + cost, reviewer sign-off. Reproducible results.

3.5 Production release gate
1. Security tests passed.
2. RLS + grant tests passed (Hard Rule 11 grant matrix + negative 42501 tests for every audited-mutation table listed in §6.4).
3. Zero cross-organisation leakage.
4. Frozen validation set results approved.
5. Active index approved and pinned.
6. Rollback test passed.
7. Backup + restoration test passed.
8. Processing recovery test passed (worker kill mid-stage, lease expiry, safe requeue).
9. Application integration test passed against a real Next.js call path.
10. Data boundary approved.
11. Operational owner identified (Ivan Au for pilot).
12. Incident procedure documented (docs/runbooks/rag.md, see §14).
13. Decisions Log entry recorded for RAG adoption.
14. BLOCK-ARCHITECTURE.md admission checklist passed for B9.
15. credit_ledger and every other B3 table verified untouched by the RAG deploy (a database-level check, not just a code review).

=======================================================================
4. SCOPE MODEL
=======================================================================

4.1 Document families (Eventar-native)

Activated in Phase 1:
- body_rule_source — a document that is a body's own stated rules, criteria, procedures, categories, exclusions or recognition conditions. Example: HKCP CPD Manual, HKAM Guide to CPD, MCHK Continuing Medical Education Guidelines.
- accreditation_letter — a document recording that a specific event, provider, programme or application received an approval or accreditation outcome from an identified body. Example: an HKCP letter to an organiser confirming FCAA status for a named meeting.

Indexing an accreditation_letter does not mean Eventar independently confirms that the approval remains valid or that another body will recognise it.

Not activated in Phase 1 (schema placeholders permitted, no ingestion):
- participation_evidence — personal data; outside Phase 1.
- rule_pack_definition — handled as versioned code (SQL migrations + evaluator functions), not through RAG.
- rule_pack_supporting_source — replaced by pack_source_passages (§7.14); passages backing a rule pack are pinned there.

4.2 Retrieval use cases

Activated in Phase 1:
1. rule_lookup — "what does HKCP say about chairing an FCAA?"
2. source_location — "where in the manual is the 75-point passive-participation cap stated?"
3. version_comparison — "what changed in the HKAM Guide between 2024 and 2026 editions?"
4. pack_authoring_support — "return the passages that this proposed rule rests on."

Deferred:
- pack_maintenance_review — periodic re-sweep asking "are the source versions this pack rests on still current?"

4.3 Output consumers
1. Human rule-pack author (Ivan today; body_admin at a body-participating body in future). No editor UI is built or planned — rule packs are code. The RAG surface for this consumer is a lookup + citation-copy workbench, marked development-only until a real end-user role exists.
2. Internal reviewer (dev-lens phase-completion agent, or a human reviewer with eventar_staff role).
3. body_admin reviewing what a rule pack rests on before confirming credit posted under it (§6.3 role).
4. Organiser workflow — read-only, restricted to body_rule_source and to the bodies the organiser's organisation_id is authorised for (organisation_body_authorisations).
5. Administrative diagnostic interface — restricted to eventar_staff.

Each consumer has an explicit authorisation policy and response contract. §11.

4.4 First source formats
Digital PDF, DOCX, XLSX, static HTML. Scan detection required; OCR execution deferred.

=======================================================================
5. TARGET ARCHITECTURE
=======================================================================

5.1 Offline ingestion path
register source
→ validate file
→ store immutable original in Supabase Storage under a controlled path
→ create processing_jobs row
→ detect format + scan condition
→ parse (writes parse_runs + parsed_elements)
→ parser QC (writes back to parse_runs.status)
→ chunk (writes chunks referencing the approved parse_runs.id)
→ chunk QC
→ enrich with deterministic metadata (organisation/body/version/effective_from/section path)
→ embed against a candidate embedding_indexes row (writes to that index's own embedding table)
→ build lexical (FTS) and vector indexes
→ evaluate candidate index (writes evaluation_run rows + retrieval traces)
→ human approval (writes document_approvals + embedding_indexes.status='approved')
→ activate approved index (atomic pointer update in retrieval_index_assignments)

5.2 Online retrieval path
authenticate caller (forwarded Supabase JWT)
→ resolve organisation_id + role from staff under RLS
→ authorise the requested use case for that role
→ resolve approved retrieval scope (which bodies, which families, which effective date window)
→ retain original query (redacted-by-default in traces)
→ deterministic query transformation (whitespace, identifier, date/version, approved synonym expansion, use-case mapping, family mapping)
→ lexical retrieval within scope (Postgres FTS on chunks.text_for_embedding or chunks.text)
→ vector retrieval from the active embedding index for that scope
→ RRF fusion, dedupe by chunk identity, retain configured candidate set
→ reranker (only if selected + permitted + data boundary allows)
→ retrieval quality gate (§10)
→ return retrieval results + gate verdict + reason codes

No generation in Phase 1. A pass returns eligible passages. A fail returns controlled reason codes and a safe insufficiency message; no candidate detail escapes.

5.3 Process separation
- API process: health, document registration, job status, retrieval, authorised administration.
- Worker process: parsing, chunking, embedding, indexing, recovery.
- Database: state, access control, versioning, audit, index assignment.
- Storage: immutable originals + controlled derivatives.
Heavy work never runs inside the online retrieval request path.

5.4 Application call path (closed)
Browser → Next.js Server Action (gated by withSecurity(), matching every other staff-side mutation in this repo) → FastAPI, with the user's Supabase JWT forwarded as Authorization: Bearer <access_token>.
Browser never calls FastAPI directly.
No Edge Function.
FastAPI's user-scoped Supabase client uses the anon key + the forwarded token, so Postgres evaluates RLS in the authenticated user's context — matching supabaseAnonServer() at lib/supabase/server.ts:31.
Service role lives only in a services/rag_api/privileged/ module (or equivalent), never imported from any retrieval router. Architecture test at tests/rag/import_boundary_test.py fails the CI if a retrieval module imports the privileged client.

5.5 Membership resolution
FastAPI resolves membership by re-querying Supabase with the forwarded JWT (option A) rather than accepting a signed header from Next.js (option B). Rationale: option A is unforgeable and reuses the existing staff + RLS shape; option B saves one round-trip but introduces a Next → Python trust surface and a signing key. Cost of option A on Phase 1 traffic is negligible.

5.6 Hosting (closed)
- Next.js on Vercel (Stage 8 unchanged).
- Python FastAPI + worker on a separate container host (Railway, Fly.io or equivalent), account TBD.
- Cron for the worker tick uses Supabase pg_cron rather than the container host's scheduler — one scheduler for the repo, matching the intent of the existing (currently untriggered) /api/cron/dispatch route.

=======================================================================
6. SECURITY AND DATA BOUNDARY
=======================================================================

6.1 Principles
1. Deny by default.
2. Least privilege.
3. Organisation scope derived from authenticated membership, never from client input.
4. RLS on every exposed table.
5. Explicit database grants in addition to RLS (Hard Rule 11).
6. Service role kept server-side and isolated.
7. Separate privileged and user-scoped code paths.
8. No external data transfer before approval.
9. Redacted logs (Hard Rule 10 — no PII).
10. Immutable audit records for approval and activation; audit-insert-last invariant respected on any audited mutation.
11. Visible failure (Rules 12–14): surface skipped records, rolled-back transactions, constraint violations. Never report success when something was bypassed.

6.2 Authentication
FastAPI validates the Supabase access token per the inspected Supabase project configuration:
1. Signature verified (JWKS from the Supabase project's /auth/v1/keys).
2. Issuer verified.
3. Audience verified where configured.
4. Expiry verified.
5. Missing / malformed / expired / unverifiable tokens rejected.
6. User identity derived only from the verified token — never from a body, query string, or header.

User-scoped Postgres calls send the same verified token as Authorization: Bearer …. FastAPI validation and Postgres RLS are separate mandatory controls; passing one does not replace the other.

6.3 Organisation membership + role authorisation
A valid token proves identity, not membership. For every scope-bound request:
1. Resolve active membership from staff (organisation_id, role, status='active').
2. Confirm the requested use case is allowed for the role. The 5-role model maps:
   - organiser_admin, organiser_member → rule_lookup, source_location limited to bodies authorised for their org.
   - body_admin → all four active use cases, restricted to their own body's documents.
   - eventar_staff → all four, unrestricted within Eventar's global-scope corpus (documents.scope_type='global_authority').
   - auditor → rule_lookup, source_location, version_comparison.
3. Derive allowed scope server-side; reject client-supplied scope outside membership.
4. Record resolved scope in the retrieval trace.

6.4 Database access paths
- User-scoped: ordinary retrieval and any organisation-visible read. Executes under authenticated user context so RLS applies. Grants restricted to required operations.
- Privileged worker: parsing, chunking, embedding, indexing, activation, controlled administration. Uses service role or a purpose-built restricted role (preferred where feasible). Every privileged operation sets explicit organisation / document / job scope, writes an audit entry, and lives in the isolated privileged/ module.

Audited-mutation tables (Hard Rule 11 grant matrix + 42501 negative tests apply to each):
- processing_jobs
- document_approvals
- embedding_indexes (status transitions)
- retrieval_index_assignments (pointer updates)
- pack_versions
- pack_sources
- pack_source_passages

For each, table-level INSERT/UPDATE/DELETE are revoked from public, anon, authenticated, and service_role. Mutations go only through the block's SECURITY DEFINER functions. Row reads follow the standard RLS pattern for the caller's role.

6.5 Global-scope sources
documents.scope_type ∈ { global_authority, organisation_private }.
(global_authority is the scope_type literal; it does not resurrect the retired "authority" glossary term. "body" remains the term for accrediting bodies per §1.4.)
owner_organisation_id may be null only for approved global_authority records — public regulator material such as MCHK, HKAM and College manuals.
Global scope is never created by leaving an organisation field blank — a document_approvals row must record the classification.

6.6 Service role policy
1. Never in browser code.
2. Never returned in logs or errors.
3. Never the default for retrieval.
4. Stored in approved server-side secret management (per Eventar Credentials note).
5. Rotated under the agreed credential procedure.
6. Restricted to reviewed worker + administrative modules under services/rag_api/privileged/ (or equivalent). Architecture test forbids its import elsewhere.

6.7 External processor register
| Service | Purpose | Data | Approval |
| --- | --- | --- | --- |
| Supabase | DB, Auth, Storage | All | Existing |
| Resend | Email | Recipient + template | Existing |
| Vercel | Next.js hosting | HTTP metadata | Planned (Stage 8) |
| Container host (TBD) | FastAPI + worker | Metadata + backend traffic | Pending decision |
| Embedding provider (TBD) | Vector generation | Chunk text | Pending Decisions Log + data-boundary approval |
| Reranker (TBD, may be none) | Candidate reordering | Query + chunk text | Pending; only after hybrid baseline |
| Observability platform (TBD, may be none) | Traces + logs | Redacted traces only | Pending; only after internal traces stable |

Any addition requires a Decisions Log entry and a register update before real content is sent.

6.8 Logging and redaction
Default application logs contain no full file content, no full query, no full retrieved passages, no tokens or keys, no participant identifiers, and no service credentials. Use stable identifiers, error codes, hashes, stage names, and timing values. Diagnostic content access is separately authorised and audited via §11.4.

6.9 Retention and deletion (pinned 2026-08-29 — Q41)

Periods derived from PDPO "no longer than necessary" against the operational needs of a 3-year HKAM cycle (a Fellow's cycle return may reference activities from up to two completed cycles plus the current one), and calibrated so a cycle return can always be reconstructed. Categories 3–5 are shorter because they hold no compliance evidence; category 6 is permanent because Hard Rule 11 makes audit_events append-only.

1. Original source files (documents / document_versions / Storage originals): retained while any active or historically retained rule-pack version depends on them, plus 7 years after the last such rule-pack version is retired. Deletion is an audited administrative action.

2. parsed_elements, chunks, per-index embedding tables: co-terminous with their source document version. When the source is deleted per (1), all derivatives are cascade-deleted in the same audited action. No independent retention clock.

3. Retired candidate embedding indexes (embedding_indexes.status='retired' + their per-index table): retained for 12 months after retirement to preserve rollback + post-mortem, then dropped under a recorded retirement action. Their rows in retrieval_index_assignments (superseded assignments) are retained as history.

4. retrieval_traces — redacted rows (original_query IS NULL): 90 days, then deleted. Operational diagnostic only; carries no personal content.

5. retrieval_traces — full rows (original_query IS NOT NULL, stored only when the approved data policy permits and access is restricted): 30 days, then either purged or redacted in place (original_query set to NULL). Shorter than (4) because it carries user text. A data-subject erasure request per data_subject_requests overrides this window and compels immediate purge / redaction of any row identifying the requesting subject.

6. Evaluation records (evaluation_cases + evaluation-run traces): 7 years. They document pipeline behaviour at a point in time and back regression + change-control claims (§17).

7. Approval and activation audit rows (audit_events entries written by B9 mutations; document_approvals lifecycle rows): append-only and retained indefinitely per Hard Rule 11. Never deleted, never rewritten. A DSR erasure request does not touch these rows because they record metadata about system actions, not personal content.

8. Full document passages are never placed in ordinary application logs. Deletion under any category above cascades through derived records in a single audited action.

Erasure precedence: category 5 (and any personal identifier in category 4 if one ever slips in) yields to a data_subject_requests erasure request. Categories 1, 2, 6 and 7 do not — they hold rule/regulator content, derivatives of that content, or system-action metadata, none of which are the data subject's personal data even when the subject appears in the same system.

Review: retention numbers reviewed at the same cadence as consent_records / data_subject_requests policy. Adjustments recorded here + in the vault Decisions Log.

=======================================================================
7. DATA MODEL
=======================================================================

Logical minimum. Exact SQL types, constraints and indexes come from the Stage 1 migrations against the live schema; the shape here is what those migrations must produce.

7.1 documents
- id (uuid, pk)
- scope_type (global_authority | organisation_private)
- owner_organisation_id (uuid, nullable — non-null unless scope_type='global_authority', FK organisations)
- body_id (uuid, FK accrediting_bodies, nullable for cross-body sources)
- family (body_rule_source | accreditation_letter, extensible)
- source_filename (text)
- source_mime (text)
- source_sha256 (bytea; unique per (owner_organisation_id, body_id, family) when non-global)
- storage_path (text, immutable)
- created_by (uuid, FK staff.id or auth.users.id)
- created_at, updated_at

Original object never overwritten. A new upload creates a new document_versions row; a genuinely new source creates a new documents row.

7.2 document_versions
- id (uuid, pk)
- document_id (uuid, FK documents)
- declared_version (text, e.g., "HKCP CPD Manual 2024 rev 3")
- revision_label (text, nullable)
- source_published_at (date, nullable)
- effective_from, effective_to (date, nullable)
- parser_policy_version (text)
- processing_status (§8.1)
- review_status (§8.2)
- lifecycle_status (§8.3)
- ocr_status (§8.4)
- active_parse_run_id (uuid, nullable, FK parse_runs)
- active_chunk_set_id (uuid, nullable — references the approved chunk set)
- created_at, updated_at

Never use one free-text declared_version as both publisher version and effective date.

7.3 document_relationships
- id, source_document_version_id, target_document_version_id
- relationship_type (Phase 1: supersedes; later: partially_supersedes, amends, corrects, supports, implements, references)
- effective_from, notes, created_by, created_at

7.4 document_approvals
- id, document_version_id, approval_status, approved_by, approved_at, approval_basis, review_notes, withdrawn_by, withdrawn_at, created_at
Approval status is never inferred from processing status.

7.5 processing_jobs
- id, organisation_id (nullable when the source is global-scope, i.e. scope_type='global_authority'), document_version_id, idempotency_key
- job_type, processing_status, current_stage
- attempt_count, maximum_attempts, error_code, error_detail_redacted
- worker_version, parser_policy_version, chunk_version, embedding_index_id
- requested_by
- claimed_by, claimed_at, lease_expires_at — transactional claim (§9.2)
- cancel_requested_at — cooperative cancel (§9.3)
- started_at, heartbeat_at, completed_at, created_at

Any audit write triggered by a processing_jobs transition observes the audit-insert-last invariant (the audit INSERT is the last statement before COMMIT; pg_advisory_xact_lock released at commit).

7.6 parsed_elements
- id, document_version_id, parse_run_id (FK parse_runs), ordinal
- element_type (heading | paragraph | list_item | table | footnote | header | footer | text_box | field | comment)
- section_path (text array or ltree)
- page_start, page_end
- location (jsonb: {sheet, coordinate, range, url_anchor} etc.)
- text (raw text)
- structured_content (jsonb — table cells, list structure, etc.)
- content_sha256
- parser_name, parser_version (denormalised from parse_runs for query convenience)
- created_at

7.7 parse_runs
- id, document_version_id, processing_job_id
- parser_name, parser_version, parser_policy_version
- status (candidate | qc_passed | approved | rejected | superseded)
- warnings (jsonb array)
- quality_results (jsonb)
- created_at, approved_by, approved_at

Only one approved active_parse_run_id per active document version. Bake-off (Docling vs Unstructured) produces multiple candidate rows against the same document version; the winner is promoted to approved, losers move to superseded. This table is the schema slot the bake-off requires.

7.8 chunks
- id, document_version_id, parse_run_id, chunk_set_id, chunk_version
- parent_chunk_id (nullable — parent/child model)
- ordinal, section_path, page_start, page_end, location
- text (evidence text — never machine-augmented)
- text_for_embedding (evidence text prepended with a deterministic contextual header; header content comes only from approved metadata)
- content_sha256
- character_start, character_end, token_count, language, content_type
- parse_element_ids (uuid array)
- is_table (bool)
- created_at

Chunk logical identity (document_version_id, chunk_version, section_path, ordinal) is separate from content identity (content_sha256). A stable logical location does not prove unchanged content.

7.9 embedding_indexes
- id, name, provider, model, dimension, distance_metric
- embedding_version, chunk_version, normalisation_policy
- storage_table (text — name of the per-index embedding table; managed only by controlled migration code, never interpolated from user input)
- index_method, index_parameters (jsonb)
- status (draft | building | evaluating | approved | active | retired | failed)
- evaluation_run_id (nullable)
- activated_at, retired_at, created_at

7.10 Per-index embedding tables
Separate physical table per embedding_indexes.id, named by controlled convention (e.g., emb_<index_id_prefix>). Each carries:
- Fixed vector dimension.
- One model + version.
- One distance metric.
- One compatible vector index (ivfflat or hnsw; parameters chosen after measurement).
- Standard FKs (chunk_id, organisation_id where scope-bound).
- Standard grants + RLS (mirror the source chunks table's scope rules).
- Count + hash reconciliation checks against chunks.
- Retirement / deletion metadata.
- A generated retrieval function or controlled resolver keyed on embedding_indexes.id.

Number of simultaneous candidate indexes remains small and controlled in Phase 1.

7.11 retrieval_index_assignments
- id, scope_type, organisation_id (nullable), document_family
- active_embedding_index_id
- effective_from, effective_to, approved_by, created_at

Never select the active embedding index merely because it is the newest. Activation is a pointer write, atomic, audited.

7.12 pack_versions
- id, rule_pack_id, version
- review_status, lifecycle_status
- approved_by, approved_at
- effective_from, effective_to
- pack_hash (bytea — the canonicalised hash of every pinned source passage; matches or extends the pack-hash primitive referenced in PROJECT_STATE.md Task 10.4 notes)

A rule-pack version pins the exact source it rests on. It does not dynamically inherit the latest source after approval.

7.13 pack_sources
- id, pack_version_id, document_version_id
- chunk_version
- inclusion_basis (text)
- included_by, included_at

7.14 pack_source_passages
- id, pack_source_id, chunk_id
- source_location (denormalised from chunks.location)
- content_sha256 (denormalised from chunks.content_sha256)
- retrieval_query_id (nullable — links back to the retrieval_traces query that surfaced this passage during authoring)
- inclusion_review_status, inclusion_basis, included_by, included_at

A production rule-pack version identifies the specific approved passages supporting each mapped rule or statement, not merely the source document. This is the primitive doctrine D.1 relies on to make the versioned evaluator citable.

Implementation sequence:
1. Build and evaluate standalone retrieval.
2. Implement pack_versions + pack_sources + pack_source_passages pinning.
3. Connect the human authoring surface (dev-only) to the pinning.
4. Connect the deterministic evaluator to pack_versions (Q26 / Stage 13).

A prototype retrieval screen may operate without a pack_version but is marked development-only and must not write to or influence credit_ledger.

7.15 evaluation_cases
- id, question, use_case, expected_query_class
- expected_source_version_ids (uuid array)
- expected_passages (jsonb array of {chunk_id, source_location})
- acceptable_answer (text — for future generation phases)
- prohibited_claims (text array — for future generation phases)
- answerability (answerable | unanswerable)
- organisation_scope (uuid, nullable)
- dataset_partition (development | frozen_validation | security | regression)
- dataset_version, reviewer, review_status, created_at

7.16 retrieval_traces
- query_id, original_query (nullable — stored only under approved data policy), redacted_query
- caller_id, resolved_organisation_scope, use_case
- resolved_query_class, classification_source
- candidate_chunk_ids (uuid array)
- lexical_ranks, vector_ranks, fused_ranks, rerank_scores (jsonb)
- gate_status, gate_reasons
- pipeline_versions (jsonb — {parser_policy, chunker, embedding_index, retriever, reranker, gate})
- latency_by_stage (jsonb)
- created_at

Content retention distinction:
1. Structured application logs contain no original query and no full passage.
2. Production retrieval_traces store redacted_query by default.
3. original_query is nullable and may be stored only when the approved data policy permits, with restricted access and defined retention.
4. Evaluation traces may retain approved test queries and passages.
5. Security audit records store action metadata rather than document content.

=======================================================================
8. STATUS MODELS
=======================================================================

8.1 Processing status
uploaded | queued | parsing | parsed | chunking | chunked | embedding | indexed | processing_failed | qc_failed | cancelled

8.2 Review status
not_required | pending | in_review | changes_required | approved | rejected

8.3 Lifecycle status
draft | active | superseded | withdrawn | archived

8.4 OCR status
not_required | suspected | required | completed | failed

8.5 Control rule
Processing completion does not imply review approval. Review approval does not imply current applicability. Current applicability is derived from lifecycle, effective dates, document_relationships, scope, and the approved pack_version.

=======================================================================
9. ASYNCHRONOUS INGESTION AND INDEXING
=======================================================================

9.1 Registration
- POST /documents — authenticate + authorise, register metadata, calculate or verify source hash, store immutable original, create documents + document_versions, return identifiers.
- POST /documents/{document_version_id}/processing_jobs — accepted with HTTP 202, returns job_id, processing_status, status endpoint. HTTP request never held open for heavy work.
- GET /processing_jobs/{job_id} — returns only authorised, appropriately redacted information.
- POST /processing_jobs/{job_id}/retry — retriable vs non-retriable error codes, maximum attempts, exponential delay, no duplicate active job for the same processing identity, stage-safe restart.
- POST /processing_jobs/{job_id}/cancel — sets cancel_requested_at; worker cooperates per §9.3.

9.2 Transactional claiming
1. Select only queued jobs whose next_attempt_at is due.
2. Claim inside a database transaction with row locking (FOR UPDATE SKIP LOCKED).
3. Record claimed_by, claimed_at, lease_expires_at before commit.
4. Commit the claim before external parsing or embedding work begins.
5. Renew heartbeat + lease while the job is active.
6. Reclaim only after lease expiry, under recovery policy.
7. Every durable stage is idempotent.
8. A uniqueness constraint prevents duplicate active jobs for the same processing identity (source_sha256 + parser_policy_version + chunk_version + embedding_index_id).

9.3 Cooperative cancellation
1. Cancel request sets cancel_requested_at.
2. Worker checks between durable stages.
3. Database transactions and external calls are not interrupted mid-flight.
4. Job becomes cancelled only after the active stage stops safely.
5. Incomplete candidate artefacts are quarantined or removed by an audited cleanup step.
6. Cancellation never deletes the immutable original source.

9.4 Worker recovery
1. Heartbeat updated while active.
2. Abandoned-job detection (lease expiry).
3. Controlled requeue preserves attempt history + previous error.
4. Every stage restarts safely.
5. Transactional status transitions where possible.

9.5 Activation
Indexing completion does not activate a document or an embedding index. Activation requires:
1. Processing QC passed.
2. Document review_status='approved' where required.
3. Candidate index evaluation passed.
4. Activation approval recorded (document_approvals + embedding_indexes.status='approved').
5. retrieval_index_assignments pointer updated atomically.

=======================================================================
10. RETRIEVAL QUALITY GATE
=======================================================================

10.1 Gate stages (all must pass; failure short-circuits)
1. Identity + token valid.
2. Active staff.status='active' membership + use-case authorisation valid.
3. Database-enforced scope applied successfully.
4. Approved active retrieval index resolved for the requested family + scope.
5. At least one eligible current-or-historically-applicable source retrieved.
6. Required source_location present on every returned passage.
7. Query-class evidence requirement satisfied (§10.2).
8. Retrieval confidence rule satisfied (§10.3).
9. No prohibited condition detected (§10.4).

10.2 Query-class evidence requirements
- exact_value — structured cell/row/table/exact-passage match; source_location available; value interpretation does not depend on an unresolved formula or stale cached value.
- requirement — eligible body / approved source; supporting passage; applicable version + effective date resolved.
- checklist — evidence for every required item, or explicit insufficiency.
- comparison — evidence for every compared item; comparable scope + version basis; no silent omission of one side.
- superseded — current + previous versions identified where the use case requires comparison; relationship + effective basis recorded.

10.3 Score-based rules
No universal raw-similarity threshold. Any score-based rule is:
1. Model-specific.
2. Query-class-specific where justified.
3. Calibrated on answerable + unanswerable cases.
4. Versioned (embedding_index_id + query_class + gate_version).
5. Re-evaluated after parser, chunker, embedding, retrieval or reranker changes.

10.4 Hard-fail conditions
1. Authentication failure.
2. Authorisation failure.
3. Organisation scope unresolved.
4. Cross-organisation candidate detected.
5. No approved active index.
6. Mixed embedding indexes in one retrieval run.
7. Unapproved source included where approval is required.
8. Missing source_location on a passing evidence result.
9. Only inapplicable / superseded evidence retrieved when eligible evidence is required.
10. Required evidence missing for one part of a comparison or checklist.
11. Scan detected but OCR required and not completed.
12. External reranker prohibited by the data boundary.

10.5 Gate output
status ∈ { pass, fail }. gate_reasons use controlled reason codes. On fail: no generated answer, safe insufficiency copy suitable for the authorised consumer, diagnostic candidate detail kept in restricted retrieval_traces only.

=======================================================================
11. API CONTRACTS
=======================================================================

11.1 Production retrieval request
POST /retrieve
{
  "query": "...",
  "use_case": "rule_lookup",
  "document_families": ["body_rule_source"],
  "client_context": {
    "rule_pack_version_id": "uuid|null",
    "relevant_date": "date|null"
  }
}
Caller does not supply organisation scope or query class.

11.2 Production retrieval response
{
  "query_id": "uuid",
  "status": "pass|fail",
  "gate_reason_codes": [],
  "resolved_scope": {
    "use_case": "rule_lookup",
    "document_families": ["body_rule_source"],
    "temporal_basis": "string|null"
  },
  "results": [
    {
      "document_version_id": "uuid",
      "source_title": "string",
      "source_type": "string",
      "declared_version": "string|null",
      "effective_from": "date|null",
      "effective_to": "date|null",
      "chunk_id": "uuid",
      "source_location": {},
      "text": "authorised retrieved passage",
      "content_sha256": "string"
    }
  ],
  "pipeline_versions": {
    "parser_policy": "string",
    "chunker": "string",
    "embedding_index": "string",
    "retriever": "string",
    "reranker": "string|null",
    "gate": "string"
  }
}

11.3 Evaluation response
Includes lexical / vector / fusion / rerank ranks + expected-result comparison. Never exposed as the ordinary application response.

11.4 Administrative diagnostic response
Restricted to eventar_staff (and body_admin for their own body's documents). Access audited via audit_events. May include detailed stage outputs + redacted error information.

=======================================================================
12. EVALUATION DESIGN
=======================================================================

12.1 Dataset partitions
development (construction + diagnosis) · frozen_validation (not used for routine tuning) · security (organisation / role / prohibited-scope tests) · regression (added after confirmed defects).

12.2 Size
20–30 reviewed development cases for the first end-to-end path. Expand coverage before parser, embedding, reranker, or production selection.

12.3 Stratification
File type · document family · use case · query class · answerable/unanswerable · current/superseded source · historical effective date · single-source / multi-source · organisation_private / global_authority · exact structured value / narrative passage · scanned or low-text PDF detection · formula / cached-value edge cases.

12.4 Metric register (Phase 1 minimum)
Retrieval:
- Document Recall @ k.
- Passage Recall @ k.
- Passage Precision @ k.
- Reciprocal Rank of the first relevant passage.
- Source Location Accuracy.
- Applicable Version Accuracy.
- Abstention Sensitivity.
- Abstention Specificity.

Parser + provenance:
- Parse success by file type.
- Required element coverage.
- Table cell accuracy where applicable.
- Reading-order error rate.
- Chunk identity stability.

Security + operations:
- Cross-organisation leakage.
- Out-of-scope candidate reaching a reranker.
- Unauthorised diagnostic access.
- Service credential exposure.
- Index reconciliation.
- Retrieval latency by percentile.
- Cost per query.
- Worker retry / recovery success.

Every metric records: formula, unit of analysis, k, eligible cases, tie handling, blocking / advisory status, threshold owner. Numerical thresholds remain pending_baseline until representative runs exist.

12.5 Hard requirements
Zero cross-organisation leakage · zero out-of-scope candidate to a reranker · zero generation after gate failure · zero ordinary client access to service credentials · zero unapproved index serving production · zero missing source_location on a passing result · zero mixed embedding-index versions in one retrieval run.

12.6 Frozen-set policy
Any partition that becomes frozen_validation for a family unfreezes the moment that family's first real regulator file arrives (§2.2). Re-freeze after re-scoring against the real corpus.

12.7 Human review required initially for
Gold source + passage labelling · passage-support judgement · historical applicability · formula / displayed-value discrepancies · parser output where evidence constructs are unsupported · candidate release approval.

An LLM may assist later under a separately approved process; it never becomes the sole judge of its own retrieval quality.

12.8 Phase-completion protocol
Every phase runs the three-lens review from ~/.claude/CLAUDE.md (dev-lens + user-lens + backtest) before any "shipped" claim. Two separate agents for dev-lens and user-lens.

=======================================================================
13. TESTING
=======================================================================

13.1 Unit
JWT claim helpers · membership resolution · authorisation decisions · status transitions · idempotency-key calculation · hash calculation · parser adapters · chunk identity · content hashing · query transformation · query-class resolution · rank fusion · gate reason rules · response redaction.

13.2 Database + RLS
Two controlled organisations + distinct roles. Hard Rule 11 grant matrix for every audited-mutation table listed in §6.4 with 42501 negative tests. Positive round-trip for any retained grant.
- Organisation A cannot read Organisation B documents / chunks / embeddings / traces.
- Global-scope sources (scope_type='global_authority') visible only under approved policy.
- Revoked membership loses access.
- Missing membership loses access.
- Grants do not exceed required operations.
- Service role not used by ordinary retrieval.
- Filters apply inside the database query.

13.3 Integration
Upload to immutable Storage · document + version registration · job creation + status retrieval · worker processing · parser warnings + failure state · chunk + embedding count reconciliation · candidate index activation · retrieval through the Next.js → FastAPI path with a real Supabase JWT · gate pass + fail responses · rollback to previous approved index.

13.4 Security
Expired token · invalid signature · wrong issuer or audience where configured · modified organisation_id · role escalation attempt · direct access to diagnostic endpoints · malicious filename + path handling · unsupported file content · oversized upload · archive / compressed file policy where applicable · prompt or query injection contained in source text · log secret scanning · privileged-client import boundary (architecture test that fails CI if retrieval code imports the privileged/ module).

13.5 Regression
Every confirmed defect adds a reproducible regression case before closure.

13.6 Cross-block reads
Any code path that reads B1 (events), B2 (registry) or any other block goes through that block's definer functions per BLOCK-ARCHITECTURE.md fitting rule 2. An integration test asserts this at the module-graph level for the RAG service.

=======================================================================
14. TROUBLESHOOTING PLAYBOOK
=======================================================================

Every operational issue records: symptom · required logs · diagnostic query or test · probable causes · corrective action · verification test · escalation condition. Aligned with Eventar Rules 12–14 (visible failure · do not switch active task · investigate before escalate).

Scenarios (see the full playbook in docs/runbooks/rag.md):
- Authentication fails.
- Authenticated user sees no authorised organisation.
- Cross-organisation candidate detected.
- Ingestion remains queued.
- Worker stopped during processing.
- PDF produces little or no text.
- PDF table corrupted.
- DOCX evidence missing.
- Excel formula ↔ displayed-value conflict.
- Orphaned or duplicate records.
- Retrieval precision poor.
- Retrieval misses exact identifiers.
- Gate always passes.
- Gate always fails.
- Latency increases.
- Embedding mismatch.
- External service unavailable.

=======================================================================
15. DEPLOYMENT AND OPERATIONS
=======================================================================

15.1 Required artefacts
Dependency lock (Python uv.lock or equivalent) · Dockerfile · env template (no secrets) · database migrations (schema + RLS + grants) · RLS-policy migrations · worker entry point · API entry point · test configuration · evaluation fixtures · runbook (docs/runbooks/rag.md) · data-boundary register · index activation + rollback script · release-evidence directory (machine-readable test + evaluation outputs).

15.2 Environment separation
Development · test · production. Production organisation documents never used in development unless explicitly approved.

15.3 Secret management
No secrets in the repo · separate user-scoped and privileged credentials · separate credentials by environment · rotation procedure · access log where supported · least privilege.

15.4 File upload controls
Allowed MIME types · extension / content consistency · maximum size · malware scanning · archive / compressed files · macros · password-protected files · corrupt files · path sanitisation · duplicate handling.

15.5 Database migrations
Version-controlled · reviewed · applied through the approved deployment path (supabase db push --linked per CLAUDE.md) · reversible where practical · tested against representative data · include grants + RLS changes · deployment result recorded.

15.6 Backup and restoration
Before production: define backup scope · define restoration procedure · test restoration · verify Storage + database consistency · verify active index assignment after restoration · record recovery evidence.

15.7 Dependency security
Pin production dependencies · scan in CI · review criticals before release · record exceptions · retest parser output + retrieval after material upgrades.

=======================================================================
16. IMPLEMENTATION ORDER
=======================================================================

Stage 0 — verify repository integration + deployment inputs. CLOSED (§2.3).

Stage 1 — security + schema foundation
- Logical schema + migrations (§7).
- Grants + RLS policies (§6.4).
- Two-organisation security fixtures.
- Token validation (services/rag_api/auth/).
- Membership + use-case authorisation.
- Separate user-scoped and privileged clients.
- Architecture import-boundary test.
- Pass security tests before retrieval work.

Stage 2 — evaluation foundation
- Development / frozen_validation / security / regression partitions.
- Seed 20–30 reviewed development cases.
- Expected source versions + passages.
- Metric formula register.
- Pending-baseline thresholds recorded.

Stage 3 — one format end-to-end
- Select one representative approved file type based on supplied source files.
- Register immutable source → async job → parse → validate parser output → chunk → validate chunks + provenance → FTS baseline → retrieve within RLS scope → apply gate → return production contract.
- Pass integration + security tests.
- Do not implement every parser before proving one end-to-end path.

Stage 4 — embedding + hybrid retrieval
- Approval for candidate data transfer or use approved local test data.
- Create candidate embedding index.
- Embed one controlled corpus.
- Reconcile counts + dimensions.
- Add vector candidate retrieval.
- Add RRF baseline.
- Evaluate vs FTS-only baseline.
- Approve or reject candidate.

Stage 5 — remaining formats, one at a time
1. PDF with scan detection + parser bake-off.
2. DOCX under approved supported-element policy.
3. Excel with dual formula + cached-value views.
4. Static HTML with deterministic extraction policy.
Order may change based on the supplied representative corpus; record the reason.

Stage 6 — gate calibration
- Expand case coverage.
- Run answerable + unanswerable cases.
- Run temporal + supersession cases.
- Run exact-value + table cases.
- Establish baseline-derived thresholds.
- Freeze validation thresholds through approval.

Stage 7 — reranker evaluation
Only if error analysis shows a reranker may address a material retrieval problem.

Stage 8 — observability evaluation
- Confirm data boundary.
- Compare required trace functionality.
- Confirm redaction.
- Use approved test data.
- Select or reject external observability.

Stage 9 — production release
- Pass the production release gate (§3.5).
- Activate the approved embedding index.
- Record approval.
- Deploy the confirmed Next.js → FastAPI integration.
- Verify rollback.
- Verify incident ownership.

The primary goal is an ingestion + retrieval path that can digest real regulator manuals (HKCP manual, HKAM Guide to CPD, MCHK Continuing Medical Education Guidelines, and other College manuals as they become available). Provisional or public material may be used while the path is being built; real files are the intended input once the path exists.

=======================================================================
17. CHANGE CONTROL
=======================================================================

Material pipeline change = parser or parser version · parser policy · chunking rules · embedding provider/model/dimension/normalisation · vector index method or parameters · FTS configuration · rank-fusion method · reranker · query classification · gate logic or thresholds · organisation scope logic · approval or lifecycle logic.

Every material change requires: new pipeline version · development evaluation · frozen-validation evaluation · security regression where relevant · approval record · rollback plan.

=======================================================================
18. REMAINING TASKS
=======================================================================

CLOSED at v0.5.2 (2026-08-29):
- BLOCK-ARCHITECTURE.md admission checklist for B9 — docs/architecture/B9-admission-2026-08-29.md.
- Concrete retention periods — §6.9, values pinned.
- Decisions Log entry for RAG adoption — Q41 draft at docs/plans/decisions-Q41-draft-rag-adoption.md, awaiting paste into vault.

OPEN:
1. Vault paste of Q41 into 02 — Decisions Log.md (mechanical; blocked by session's EPERM on the vault path).
2. Exact claim shapes, grant statements and Server Action patterns implemented from the repository during Stage 1 (architectural compatibility already confirmed).
3. Container host account selection for the Python service (Railway / Fly.io / equivalent).
4. First real or provisional regulator files fed once ingestion path exists.
5. Numerical QC thresholds derived after first evaluation runs.
6. Embedding provider bake-off (future).
7. Incident procedure documented at docs/runbooks/rag.md before Stage 9.

=======================================================================
19. APPROVAL CHECKLIST
=======================================================================

Architecture decisions closed: [x]
Repository integration verified: [x]
Document policies (Phase 1): [x]
Async job model (incl. transactional claim + cooperative cancel): [x]
Embedding storage (separate table per index): [x]
Parse-run + chunk-set model: [x]
Rule-pack version pinning (pack_versions + pack_sources + pack_source_passages): [x]
Retention values pinned (§6.9): [x] (Q41, 2026-08-29)
BLOCK-ARCHITECTURE.md admission (B9): [x] (docs/architecture/B9-admission-2026-08-29.md, 2026-08-29)
Decisions Log entry (RAG adoption): [x] (Q41 draft at docs/plans/decisions-Q41-draft-rag-adoption.md, pending paste into vault 02 — Decisions Log.md)
Security model: [ ] — Stage 1
RLS + grants (Hard Rule 11 matrix): [ ] — Stage 1
Data boundary: [ ] — Stage 2 (per-processor as they are added)
Lifecycle + approval model: [ ] — Stage 1 migrations
Evaluation protocol: [ ] — Stage 2
Baseline thresholds: [ ] (pending runs — Stage 6)
Rollback tested: [ ] — Stage 4 (first embedding cutover)
Backup + restoration tested: [ ] — Stage 9
Production release: [ ] — Stage 9

=======================================================================
20. NOTES ON THIS REPRODUCTION
=======================================================================

Substantive changes from the 2026-08-29 v0.4 second-pass, called out so they are visible rather than smuggled:
1. Terminology aligned with CONTEXT.md throughout: body / cycle / rule pack / organisation / practitioner. "authority" and "tenant" no longer appear in normative text.
2. Document families renamed: authority_rule → body_rule_source; accreditation_evidence → accreditation_letter.
3. §7.7 parse_runs restored — the schema slot the PDF bake-off (§3.3, §5, Stage 5) needs to record which parser output is authoritative for each document version.
4. §7.14 pack_source_passages restored — the passage-level pinning primitive doctrine D.1 requires for the versioned evaluator to be citable at the rule level, not merely at the source-document level. pack_versions.pack_hash field added to match the pack-hash primitive already referenced in PROJECT_STATE.md Task 10.4 notes.
5. §6.4 lists the specific audited-mutation tables that must carry the Hard Rule 11 grant matrix + 42501 negative tests: processing_jobs, document_approvals, embedding_indexes (transitions), retrieval_index_assignments (transitions), pack_versions, pack_sources, pack_source_passages.
6. §5.5 explicitly resolves the membership-resolution ambiguity in favour of FastAPI re-querying Supabase with the forwarded JWT (unforgeable), not a signed header from Next.js.
7. §5.6 explicitly picks pg_cron for the worker tick, matching the Stage 8 intent of /api/cron/dispatch.
8. §12.6 adds an explicit unfreeze rule for frozen_validation partitions when the real regulator file for that family arrives.
9. §13.6 adds a cross-block-read test tied to BLOCK-ARCHITECTURE.md fitting rule 2.
10. §3.5 adds two release-gate items: credit_ledger-untouched verification (item 15) and Decisions Log entry (item 13).
11. §4.3 clarifies that no rule-pack editor UI exists or is planned — the authoring surface is a dev-only lookup + citation-copy workbench until a real end-user role exists.
12. Sections previously deferred to a v0.3 that was not attached ("content identical to v0.3") are now written out in full (Sections 10, 11, 14, 17), so the guide is self-contained.

Editorial in v0.5.1 (2026-08-29): four residual "tenant" uses in normative text corrected to "organisation"; §6.5 heading changed from "Global authority sources" to "Global-scope sources" and a one-line note added distinguishing the global_authority scope_type literal from the retired "authority" glossary term. No substantive change; every §X cross-reference audited and confirmed against the current outline.

Substantive in v0.5.2 (2026-08-29): three release-gate blockers closed.
- Retention values in §6.9 pinned from skeleton to concrete numbers (7 categories, calibrated against PDPO "no longer than necessary" and a 3-year HKAM cycle).
- BLOCK-ARCHITECTURE.md admission checklist for B9 (Rule Authoring / Source Evidence) run and recorded at docs/architecture/B9-admission-2026-08-29.md. B9 added to the tier-1 block map; the prior speculative reservation of B9 for Commercial re-tagged as B10 in the same edit (Commercial is invoice-first, zero code today).
- Decisions Log Q41 drafted at docs/plans/decisions-Q41-draft-rag-adoption.md, pending paste into vault 02 — Decisions Log.md (mechanical; blocked by this session's EPERM on the vault path).
- Status lifted from "Not yet the governing build specification" to "GOVERNING build specification for Phase-1 post-MVP RAG work (block B9)".
- §19 checklist rows re-ordered so closed items appear first; open items now say which Stage closes each.

Version 0.5.2 records these closures. Architectural, integration, terminology, retention, block-map and Decisions Log gates are all closed. Remaining work is Stage-by-Stage implementation per §16 and the mechanical vault paste of Q41.

=======================================================================
END OF GUIDELINE
=======================================================================
