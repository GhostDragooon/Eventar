from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict

from rag_api.user_scoped.client import user_client


class NotAuthorised(Exception):
    """Carries a short error code only: never a token, email or stack detail."""


class AuthUnavailable(Exception):
    """Key fetch or staff lookup failed: an outage, not a verdict on the caller."""


class Staff(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    role: str
    organisation_id: UUID


def resolve_staff(token: str, claims: dict) -> Staff:
    """Exactly one active staff row for the token's email, else NotAuthorised.

    Mirrors requireStaff (lib/auth.ts): fails closed when one address is staff in
    two organisations. Row-level security rejects an unconfirmed address.
    """
    email = claims.get("email")
    if not isinstance(email, str) or not email:
        raise NotAuthorised("NO_EMAIL_CLAIM")
    try:
        with user_client(token) as client:
            res = client.get(
                "/rest/v1/staff",
                params={
                    "select": "id,role,organisation_id",
                    "status": "eq.active",
                    "email": f"eq.{email.lower()}",
                },
            )
    except httpx.HTTPError as exc:
        raise AuthUnavailable("STAFF_LOOKUP_FAILED") from exc
    if res.status_code != 200:
        raise AuthUnavailable(f"STAFF_LOOKUP_{res.status_code}")
    try:
        rows = res.json()
        if not isinstance(rows, list):
            raise ValueError("not a list")
        if len(rows) != 1:
            raise NotAuthorised("NOT_ONE_STAFF_ROW")
        return Staff(**rows[0])
    except NotAuthorised:
        raise
    except (ValueError, TypeError) as exc:  # bad JSON or rows that do not validate (ValidationError is a ValueError)
        raise AuthUnavailable("STAFF_LOOKUP_BAD_BODY") from exc
