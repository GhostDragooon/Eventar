# B9 Stage 1 dev-perspective review

Evidence tags: [X] queried or ran, [R] read, [I] inferred. No BLOCKER found.
Verified clean [X]: all 15 tables have RLS on and exactly one SELECT policy for `authenticated`; anon has no grant; service_role has no INSERT/UPDATE/DELETE/TRUNCATE on the 7 audited tables; the 5 write functions are SECURITY DEFINER, `search_path=public, pg_temp`, ACL = postgres + service_role only; helpers executable by authenticated + service_role only; local JWKS is ES256 (matches `algorithms`); no B9S1A/B9S1B fixture leaks in local DB; audit insert is the last statement in all 5 functions [R].
`pytest -q -m "not integration"`: 37 passed, 1 skipped.

## MAJOR

### M1. Read-scope tests do not fail if the role/status/NULL-body guards are removed
`tests/rls/rag_read_scope.rls.test.ts:108-112`, `tests/rls/rag_read_scope.rls.test.ts:149-155`; same shape in `services/rag_api/tests/test_two_org_isolation.py:42`.
Scenario: the organiser_admin, organiser_member and auditor fixtures all sit in orgZ, which owns no body. Delete `and s.role = 'body_admin'` (migration 160000 line 20) and those three roles still see nothing, because orgZ has no body. The suite stays green while organiser_admin of a body-owning organisation could read every rule source (ruling E2 broken). Nothing tests `s.status = 'active'` (line 21, suspended body_admin) or the `join ... b.id = d.body_id` (line 16, body_id NULL document vs body_admin). Nothing reads the other 13 tables as body_admin/organiser, so a wrong policy on `processing_jobs`, `parse_runs`, `parsed_elements`, `document_approvals`, `document_relationships` or the staff-only tables is also undetected.
Verified: [R].
Fix: put organiser_admin, organiser_member and auditor fixtures in orgX (the body-owning org). Add a suspended body_admin in orgX and a `body_id NULL` document (expect eventar_staff only). Add a loop asserting each of the 15 tables for body_admin and organiser (rows visible or empty).

### M2. A foreign body_admin can read an organisation's PRIVATE documents that carry their body_id
`supabase/migrations/20261117160000_rag_grants_rls.sql:10-21`.
Scenario: `documents` row with `scope_type='organisation_private'`, `owner_organisation_id=X`, `body_id=A` (nothing in the schema forbids it). `rag_can_read_document` matches on `b.organisation_id` only, so a body_admin of organisation A reads organisation X's private document and its versions, chunks and approvals. The helper never looks at `scope_type` or `owner_organisation_id`. For global docs the answer is correct: body_admin of A cannot read body B's global docs.
Verified: [R] (policy logic). Not executed, because it needs a write.
Needs a ruling: is an accreditation letter private to organisation X meant to be visible to the issuing body's admin? If not, add `d.scope_type = 'global_authority'` to the exists-branch. If yes, record it in the spec and add a test.

## MINOR

1. `20261117160000_rag_grants_rls.sql:69-70`: `document_relationships_read` checks only the source version. A body_admin of A reads a relationship whose target version belongs to body B, so the target id and `notes` leak. Require `rag_can_read_version(target_document_version_id)` too. [R]
2. `20261117170000_rag_definer_functions.sql:135-151`: two concurrent `rag_assign_retrieval_index` calls for the same scope with different indexes. The row lock is on the embedding index, not the scope. The second call's UPDATE re-checks the closed row, matches nothing, then INSERTs. The partial unique index stops it with a raw 23505. No two open rows result, so the state stays consistent and the failure is loud, but the caller gets an unclassified error. Take `pg_advisory_xact_lock(hashtextextended(scope key, 0))` first, or map 23505 to a clear error. [I, reasoned from READ COMMITTED semantics, not run]
3. Same function: reassigning leaves the previous index at status `active`. `rag_set_embedding_index_status` allows `active -> retired` while an open assignment still points at it. `approved -> active` is allowed without any assignment. Retired-but-assigned is reachable. Block retire when an open assignment exists. [R]
4. `rag_enqueue_processing_job` (lines 28-36): a reused idempotency key with a different `p_document_version_id` or `p_job_type` silently returns the other job, so the caller thinks version B is queued. Compare and raise on mismatch. [R]
5. `rag_record_document_approval` (lines 52-71): no transition guard. A "withdrawn" row on a never-approved version resets `review_status` to `pending`. A version can be approved while `processing_status='uploaded'`. Reject withdraw unless an approved row exists. [R]
6. `20261117120000_rag_schema_processing.sql`: nothing ties `chunks.parse_run_id` or `parsed_elements.parse_run_id` to the same `document_version_id`, and `document_versions.active_parse_run_id` can point to another version's run. service_role writes these tables directly (item 6 of the brief), so an inconsistent row is possible. RLS reads follow `document_version_id`, so there is no leak. Add composite FKs `(id, document_version_id)` or a trigger. [R]
7. `services/rag_api/src/rag_api/auth/membership.py:44-47`: `res.json()` on a non-JSON 200, or `Staff(**row)` raising ValidationError, escapes as an unhandled 500. Catch `ValueError` and `pydantic.ValidationError` and raise `NotAuthorised`. [R]
8. `settings.py:15-16`: with `RAG_ENV=production` an `http://` URL is accepted, so the service-role key would travel in clear text. Require scheme `https`. [R]
9. `boundary.py`:
   - It checks direct imports only. `retrievers/x.py` importing `rag_api.helpers`, which imports `privileged`, passes.
   - `import rag_api` followed by attribute access `rag_api.privileged...` and `importlib.import_module` also pass.
   - `name.startswith("retrieve")` misses `routers/retrieval.py`.
   Document the limit, or add a transitive walk and `retriev` prefix. [R]
10. `services/rag_api/Dockerfile`: no `.dockerignore`, so `COPY . .` copies the host `.venv` (macOS, py3.13), `.pytest_cache` and tests. `CMD uv run` re-syncs dev dependencies at start, undoing `--no-dev`, and needs network. The container runs as root. Use `.venv/bin/uvicorn`, a `.dockerignore`, and a non-root user. Not built (known item 13). [I]
11. `.github/workflows/rag-api.yml`: no `permissions: contents: read`. Tags `actions/checkout@v7.0.1` and `astral-sh/setup-uv@v10.3.3` differ from the repo convention (`@v4`/`@v1`); I could not verify they exist, and a wrong tag fails the first CI run. The `paths` filter omits the workflow file itself. [R/I]
12. `tests/test_tokens.py`: no test for algorithm confusion (HS256 token signed with the public key) or for a token with no `exp`. `make()` drops None claims, but `exp` is never made None. Removing `options={"require": ["exp"]}` or adding "HS256" to `algorithms` (`tokens.py:18-21`) would not fail the suite. Add both cases. [R]
13. `tests/test_two_org_isolation.py:85-93`: asserts inside `finally` can mask the original failure, and a failed cleanup stops the rest of the cleanup. Collect the errors, then assert once. [R]

## Not found (explicitly checked)
- Token verification: algorithms are pinned, the key comes from JWKS only, `aud`, `iss`, `exp` and `sub` are enforced. Error bodies and logs carry codes and UUIDs only.
- Idempotency race in `rag_enqueue_processing_job`: `ON CONFLICT DO NOTHING` plus re-select is safe under concurrency.
- Definer search_path, argument grants and the audit-last ordering: all clean [X/R].
