# B9-S1-B Python service skeleton and auth
STATUS: DONE
Changed: services/rag_api/** (pyproject.toml, uv.lock, Dockerfile, README.md, src/rag_api/*, tests/*), .github/workflows/rag-api.yml, .gitignore (+4 lines), docs/plans/rag/B9-S1-B.md
Tests added or changed: tests/test_tokens.py, test_authorise.py, test_membership.py, test_import_boundary.py, test_no_kmeans.py, test_two_org_isolation.py (integration). No production-line mutation was run (Python card; not requested).
Gates: tsc not run (no TypeScript touched) · eslint not run · vitest not run · build not run · test:rls not run (not required by this card)
Python gates: pytest 38 passed / 0 failed / 0 skipped (full run); unit run (-m "not integration"): 37 passed, 1 skipped (integration module skips without SUPABASE_URL)
Live check: uvicorn on :8000, `curl 127.0.0.1:8000/health` -> {"status":"ok","version":"0.1.0"} [X]. Integration test against local stack: three roles resolve via /whoami, RLS isolation holds [X]. Python 3.13.14 under uv.
Fixture leak check: organisations 0, accrediting_bodies 0, staff 0, documents 0, auth.users 0 [X]. Permanent audit_events rows matching b9s1b: 2 (accrediting body inserts), left in place.
Evidence tags: [X] executed
Deviations from the card, and why: settings.py defaults SUPABASE_URL to http://127.0.0.1:54321 so unit tests import without env (production requires it explicitly). setup-uv tag v7 chosen from memory: no network allowed to read its README, so unverified.
Open questions for Ivan: confirm astral-sh/setup-uv major tag.
Needs from other cards: none
Executor: Sonnet 5.5, Claude Code
Committed:
Fixtures created: b9s1b-* organisations/bodies/staff/documents/users, all deleted by the test
Suggested commit message: feat(rag): B9-S1-B Python service skeleton and auth

## Review fixes (2026-11-16)

Applied from REVIEW-S1-user.md and REVIEW-S1-dev.md (Python and workflow findings).

- Outage is not "bad token": a JWKS fetch failure (`PyJWKClientConnectionError`) raises `AuthUnavailable`; any other invalid token stays `NotAuthorised`. `AuthUnavailable` is defined next to `NotAuthorised` in `auth/membership.py`.
- Staff lookup failure is not "not staff": HTTP error, non-200, non-JSON body or rows that do not validate raise `AuthUnavailable`. Only zero rows, two or more rows, or a missing email claim raise `NotAuthorised`. `/whoami` maps them to 503 `AUTH_UNAVAILABLE` (WARNING log) and 403 `NOT_AUTHORISED`.
- Strict settings: the three Supabase variables are required and non-empty, with fix-naming errors; 127.0.0.1 host rule; https required under `RAG_ENV=production`. `tests/conftest.py` sets placeholders; the integration test skips unless a real service-role key is exported.
- Logging configured once; one INFO start-up line (environment, host, version); no token, email or key is logged.
- `/docs`, `/redoc`, `/openapi.json` closed. 401 carries `WWW-Authenticate: Bearer`.
- `boundary.py`: `retriev*` routers, `retrievers/`, `user_scoped/`, `gate*.py`; relative imports, `importlib.import_module` and `__import__` with a string literal.
- Token tests: algorithm confusion (HS256 with public-key PEM), `alg: none`, missing `exp`, missing `sub`.
- README rewritten; Dockerfile runs as non-root with `UV_NO_DEV=1`; `.dockerignore` added; workflow has `permissions: contents: read`.
