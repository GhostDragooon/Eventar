"""Environment, read once at import. Never reads .env.local."""

import os
from urllib.parse import urlparse


def _require(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise RuntimeError(
            f"{name} is not set. Export it from `supabase status -o env` (see services/rag_api/README.md)"
        )
    return value


RAG_ENV = os.environ.get("RAG_ENV", "local")
SUPABASE_URL = _require("SUPABASE_URL").rstrip("/")
SUPABASE_ANON_KEY = _require("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = _require("SUPABASE_SERVICE_ROLE_KEY")

_url = urlparse(SUPABASE_URL)
if RAG_ENV == "production":
    if _url.scheme != "https":
        raise RuntimeError("SUPABASE_URL must use https when RAG_ENV=production")
elif _url.hostname != "127.0.0.1":
    # The local token issuer is http://127.0.0.1:54321/auth/v1, so "localhost" fails the issuer check.
    raise RuntimeError(
        "SUPABASE_URL host must be 127.0.0.1 (not localhost: the token issuer is "
        "http://127.0.0.1:54321/auth/v1). Set RAG_ENV=production for any other host."
    )
