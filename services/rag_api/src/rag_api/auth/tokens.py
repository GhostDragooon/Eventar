import jwt
from jwt.exceptions import PyJWKClientConnectionError

from rag_api import settings
from rag_api.auth.membership import AuthUnavailable, NotAuthorised

_jwks = jwt.PyJWKClient(f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json")


def _signing_key(token: str):
    return _jwks.get_signing_key_from_jwt(token).key


def verify_token(bearer: str) -> dict:
    try:
        return jwt.decode(
            bearer,
            _signing_key(bearer),
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=f"{settings.SUPABASE_URL}/auth/v1",
            options={"require": ["exp", "sub"]},
        )
    except PyJWKClientConnectionError as exc:
        raise AuthUnavailable("JWKS_UNAVAILABLE") from exc
    except jwt.PyJWTError as exc:
        raise NotAuthorised("TOKEN_INVALID") from exc
