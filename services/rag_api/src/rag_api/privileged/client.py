import httpx

from rag_api import settings


def privileged_client() -> httpx.Client:
    """Service role: bypasses row-level security. Use as a context manager."""
    key = settings.SUPABASE_SERVICE_ROLE_KEY
    return httpx.Client(
        base_url=settings.SUPABASE_URL,
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=10.0,
    )
