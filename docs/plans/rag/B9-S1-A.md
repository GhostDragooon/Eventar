# B9-S1-A schema, grants, RLS and the grant tests (steps 4, 5, 6 + SCHEMA_SUMMARY)
STATUS: DONE (steps 4-6 and the summary section; steps 1-3 done by the orchestrator; step 7 full gates not run by this agent)
Changed: supabase/seed.sql (B9 block appended), docs/db/SCHEMA_SUMMARY.md (section appended), tests/rls/rag_audited_table_writes.rls.test.ts (new), tests/rls/rag_read_scope.rls.test.ts (new), docs/plans/rag/B9-S1-A.md
Tests added: write guard file: 7 audited tables x (service_role INSERT / UPDATE / DELETE 42501, anon + organiser INSERT 42501); five definer round trips (enqueue idempotent + one audit row; approval + review_status approved; index draft + emb_ name; status draft->active 22023 and draft->approved; assign twice -> one open row, index active); five eventar_staff rpc 42501; seed parity (15 tables anon/authenticated, 7 service_role). Read-scope file: eventar_staff sees X+Y, body_admin X only, organiser_admin / organiser_member / auditor none, anon 42501, for documents and chunks.
Mutation (step 6): `grant insert on public.processing_jobs to service_role` -> only "processing_jobs ... service_role INSERT is 42501" failed (1 failed / 60 passed) [X]; after revoke, has_table_privilege(service_role, insert) = f for all 7 audited tables [X].
Fail-first [X]: wrong expectations failed on exactly two assertions: processing_jobs service_role INSERT (got 42501), body_admin sees X only (saw 1 doc, expected 2). Then corrected: 2 files, 67 tests passed.
Gates: steps 1-3 done by the orchestrator; full gates not run by this agent. Ran: vitest on the two files (2 files / 67 passed / 0 failed); eslint on the two files: clean; `tsc --noEmit` once: no output (clean). Not run: eslint ., vitest run, next build, test:rls.
Evidence: all results above [X]; spec shapes [R].
Deviations: cleanup patterns narrowed per file (`rag/B9S1A/w-%`, `B9S1A-w-%` in the write file; `rag/B9S1A/r-%` in the read file) instead of the card's broad `rag/B9S1A/%`, because vitest runs the two files in parallel and the broad pattern would delete the other file's fixtures mid-run. Prefix B9S1A and the `rag/B9S1A/` start are kept. The write-guard fixture document has body_id null (no body needed there). The assign round trip uses scope global_authority and the file throws in beforeAll if an open global body_rule_source assignment already exists (it would close it).
Open questions for Ivan: none.
Fixtures created: orgs `b9s1a-r-*`, bodies `B9S1A-*`, staff + users `b9s1a-*@rls-test.invalid`, B9 rows; all removed in afterAll. After cleanup: 0 rows in the 15 B9 tables, 0 b9s1a orgs, 0 b9s1a staff. 24 permanent `rag_*` audit_events remain (expected; includes earlier runs).
Executor: Claude Sonnet 5.5 (Claude Code subagent)
Committed:
Suggested commit message: test(rag): B9-S1-A grant, read-scope and seed-parity tests, seed revokes, schema summary

## Review fixes (2026-11-16)

Tests only; no migration, spec or seed change.

- `tests/rls/rag_read_scope.rls.test.ts` rewritten so every clause of the read rule is load-bearing: organiser_admin, organiser_member and auditor sit in body X's own organisation (fails if `s.role = 'body_admin'` is removed); a suspended body_admin; a body-less global document; an organisation-private document naming body X (case A); a `supersedes` relationship X to Y (case B); document_versions, parse_runs, parsed_elements and chunks scoped to X's version; the seven eventar_staff-only tables return zero rows with no error for body_admin and organiser, and 42501 for anon; one `evaluation_cases` fixture (`dataset_version` `B9S1A-r`).
- `tests/rls/rag_audited_table_writes.rls.test.ts`: case C (same idempotency key for a different version is 22023) and case D (retiring an index with an open assignment is 22023, status stays `active`).
- Mutation proof (local DB objects weakened, then restored from the orchestrator script): removing the role clause, the scope clause (A), the status clause, the relationship target check (B), the key-owner raise (C) or the open-assignment check (D) each fails its named test.
