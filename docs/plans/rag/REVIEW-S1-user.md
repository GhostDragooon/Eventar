# B9 Stage 1 user-perspective review (cold developer/operator)

Legend: [X] executed, [R] read, [I] inferred.

## Findings

### MAJOR
1. [X] Outage looks like bad token. SUPABASE_URL=http://127.0.0.1:59999 (nothing listening), `curl /whoami -H "Authorization: Bearer <forged ES256 with kid>"` -> `401 {"error":"AUTH_FAILED"}` in 10 ms; log has only the uvicorn access line. PyJWKClientConnectionError is a PyJWTError, so tokens.py turns it into TOKEN_INVALID. A caller refreshes its token forever; operator sees nothing. Fix: catch jwt.PyJWKClientConnectionError separately, return 503 `{"error":"AUTH_UNAVAILABLE"}`, log at WARNING.
2. [X] Auth-failure reasons never logged. main.py calls `log.info("auth failed code=%s")` but no logging config exists, so INFO from `rag_api` is dropped (root = WARNING). 12 failing /whoami calls produced only access lines. Operator cannot tell TOKEN_INVALID / NO_EMAIL_CLAIM / NOT_ONE_STAFF_ROW / STAFF_LOOKUP_xxx apart. Also the 403 NOT_AUTHORISED body gives the caller no reason. Fix: `logging.basicConfig(level=INFO)` at startup (codes + UUIDs only, as intended).
3. [X] Empty anon key is silent. Start with all three vars unset (default URL): server starts, /health 200, /whoami 401. No start-up error that SUPABASE_ANON_KEY is empty; a valid token would then reach PostgREST with `apikey: ""` and surface as 403 NOT_AUTHORISED (STAFF_LOOKUP_401, [I]) - a wrong belief ("you are not staff"). Fix: refuse start (or /health `ready:false`) when anon key empty; map STAFF_LOOKUP_* non-200 to 502/503, not 403.
4. [R] README missing facts: which Python (pyproject requires? 3.13 local vs 3.12), that uv and the Supabase CLI must be installed, that `supabase start` must already be running ("local stack up" is one clause), that the snippet silently yields empty vars if the stack is down (sed prints nothing; no check), what the three variables mean, and that service-role key is exported but unused by /whoami. No example of getting a real token or calling /whoami successfully. README says `--port 8000`; no mention of 8010 conflict (fine).
5. [X] /docs loads Swagger from cdn.jsdelivr.net (README doesn't say; offline = blank page). /openapi.json and /docs are exposed unauthenticated (fine locally; README says nothing for production).

### MINOR
6. [X] OpenAPI is inaccurate for /whoami: `authorization` header "required": false, no 401/403 responses documented, only "422 Validation Error" which this route can never return (missing header returns 401). 200 body typed as free-form object. Fix: add `responses={401:..,403:..}` and a Security scheme (HTTPBearer(auto_error=False)).
7. [X] Error body shapes inconsistent: app errors `{"error":"AUTH_FAILED"}`, FastAPI 404/405 `{"detail":"Not Found"}` / `{"detail":"Method Not Allowed"}`. 405 has no Allow-header check done. Pick one shape.
8. [X] 401 gives no `WWW-Authenticate: Bearer` header and no hint. Every wrong input (no header, `Basic abc`, `Bearer` alone, `Bearer a b`, garbage, forged unsigned JWT, expired) returns identical `{"error":"AUTH_FAILED"}`: no leak (good for secrets) but also no "send Authorization: Bearer <Supabase access token>" guidance. 401 vs 403 split is correct and distinguishable ([R] 403 only after token verified and staff lookup fails; [X] 403 path not reachable without a real user, not executed).
9. [X] Start-up refusal is a raw traceback ending `RuntimeError: SUPABASE_URL host must be 127.0.0.1 unless RAG_ENV=production`. Message is clear on why but not on what to do; `localhost` case (SUPABASE_URL=http://localhost:54321) is not explained (comment in settings.py says why, user never sees it). Production-missing-URL: `RuntimeError: SUPABASE_URL is required when RAG_ENV=production` clear. Fix: include the offending host and "use 127.0.0.1 not localhost, or set RAG_ENV=production".
10. [X] /health reports only status+version. No URL host, RAG_ENV, or "ready" signal; start-up logs print no bound-environment line (log shows only uvicorn lines). Operator can't confirm which Supabase / env the service is bound to. Fix: one startup log line `rag_api env=local supabase_host=127.0.0.1:54321 anon_key=set service_key=set` (booleans only).
11. [X] /health is shallow: returns 200 when Supabase is down (verified with :59999). Fine as liveness; README doesn't say so.
12. [I] `/whoami?x=1` ignored; `staff=%s` log is UUID only; no PII seen in log. Privacy: access log records paths only, no tokens/emails. When INFO is enabled (fix 2) `not authorised sub=%s` logs the token subject UUID: acceptable under "UUIDs only".
13. [X] No stack trace, path, token, or email in any HTTP response or runtime log observed.

## Steps
1 [X] uv sync + README commands worked as written (stack was up; port adapted to 8010). 2 [X]. 3 [X] (403 path not reachable). 4 [X] all four. 5 [X].
Server on 8010 stopped; `lsof -nP -iTCP:8010 -sTCP:LISTEN` empty.
