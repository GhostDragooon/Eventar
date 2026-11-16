# rag-api

Staff-only retrieval service (B9). Stage 1 has only `/health` and `/whoami`. Synchronous, HTTP-only to Supabase.

## Prerequisites

- `uv` and the Supabase CLI. Python 3.12 to 3.14: uv uses an installed one.
- The local stack running: `supabase start` from the repo root.

## Run

    cd services/rag_api && uv sync
    _e="$(supabase status -o env)"; g(){ printf '%s\n' "$_e" | sed -n "s/^$1=\"\(.*\)\"\$/\1/p"; }
    export SUPABASE_URL="$(g API_URL)" SUPABASE_ANON_KEY="$(g ANON_KEY)" SUPABASE_SERVICE_ROLE_KEY="$(g SERVICE_ROLE_KEY)"
    : "${SUPABASE_URL:?local stack not running}" "${SUPABASE_ANON_KEY:?local stack not running}" "${SUPABASE_SERVICE_ROLE_KEY:?local stack not running}"
    uv run uvicorn rag_api.main:app --app-dir src --port 8000

The service never reads `.env.local`. All three variables are required and the service refuses to start without them.

- `SUPABASE_URL`: must be `http://127.0.0.1:54321` (not `localhost`). Any other host needs `RAG_ENV=production` and https.
- `SUPABASE_ANON_KEY`: acts as the signed-in user (row-level security applies).
- `SUPABASE_SERVICE_ROLE_KEY`: bypasses row-level security. Only the worker-side client uses it.

## Tests

- Unit only: `uv run pytest -q -m "not integration"`.
- Full run: export the three variables as above, then `uv run pytest -q`. The integration test needs the stack, writes `b9s1b-*` fixtures and deletes them.

## Endpoints

| Call | Status | Body | Meaning and action |
|---|---|---|---|
| `GET /health` | 200 | `{"status":"ok","version":...}` | The process is alive. |
| `GET /whoami` | 200 | `staff_id`, `role`, `organisation_id` | Valid token, one active staff row. |
| `GET /whoami` | 401 | `{"error":"AUTH_FAILED"}` | Header missing or token invalid. Sign in again. Carries `WWW-Authenticate: Bearer`. |
| `GET /whoami` | 403 | `{"error":"NOT_AUTHORISED"}` | Token is valid but the address is not staff in exactly one organisation. Ask an admin. |
| `GET /whoami` | 503 | `{"error":"AUTH_UNAVAILABLE"}` | Signing keys or staff lookup could not be reached. Check the Supabase stack, then retry. |

`/health` reports liveness only, not whether Supabase is reachable. `/docs`, `/redoc` and `/openapi.json` are off on purpose (404).
