import httpx

from rag_api import settings


def user_client(token: str) -> httpx.Client:
    """Acts as the signed-in user: row-level security applies. Use as a context manager."""
    return httpx.Client(
        base_url=settings.SUPABASE_URL,
        headers={"apikey": settings.SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
        timeout=10.0,
    )
