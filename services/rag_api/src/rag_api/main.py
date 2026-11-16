import logging
from contextlib import asynccontextmanager
from typing import Annotated
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse

from rag_api import __version__, settings
from rag_api.auth.membership import AuthUnavailable, NotAuthorised, Staff, resolve_staff
from rag_api.auth.tokens import verify_token

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
log = logging.getLogger("rag_api")


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    log.info(
        "start env=%s supabase_host=%s version=%s",
        settings.RAG_ENV, urlparse(settings.SUPABASE_URL).hostname, __version__,
    )
    yield


app = FastAPI(
    title="rag-api", version=__version__, lifespan=_lifespan,
    docs_url=None, redoc_url=None, openapi_url=None,
)


class ApiError(Exception):
    def __init__(self, status: int, code: str, headers: dict[str, str] | None = None):
        self.status, self.code, self.headers = status, code, headers


@app.exception_handler(ApiError)
def _api_error(_request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse({"error": exc.code}, status_code=exc.status, headers=exc.headers)


def _unavailable(exc: AuthUnavailable) -> ApiError:
    log.warning("auth unavailable code=%s", exc)
    return ApiError(503, "AUTH_UNAVAILABLE")


def current_staff(authorization: Annotated[str | None, Header()] = None) -> Staff:
    scheme, _, token = (authorization or "").partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or " " in token:
        raise ApiError(401, "AUTH_FAILED", {"WWW-Authenticate": "Bearer"})
    try:
        claims = verify_token(token)
    except AuthUnavailable as exc:
        raise _unavailable(exc) from None
    except NotAuthorised as exc:
        log.info("auth failed code=%s", exc)
        raise ApiError(401, "AUTH_FAILED", {"WWW-Authenticate": "Bearer"}) from None
    try:
        staff = resolve_staff(token, claims)
    except AuthUnavailable as exc:
        raise _unavailable(exc) from None
    except NotAuthorised as exc:
        log.info("not authorised sub=%s code=%s", claims.get("sub"), exc)
        raise ApiError(403, "NOT_AUTHORISED") from None
    log.info("staff=%s", staff.id)
    return staff


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": __version__}


@app.get("/whoami")
def whoami(staff: Annotated[Staff, Depends(current_staff)]) -> dict:
    return {
        "staff_id": str(staff.id),
        "role": staff.role,
        "organisation_id": str(staff.organisation_id),
    }
