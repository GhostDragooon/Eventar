import httpx
import pytest

from rag_api.auth import membership
from rag_api.auth.membership import AuthUnavailable, NotAuthorised, Staff, resolve_staff
from tests.conftest import mock_client

ROW = {"id": "11111111-1111-1111-1111-111111111111", "role": "body_admin",
       "organisation_id": "22222222-2222-2222-2222-222222222222"}
CLAIMS = {"email": "Mixed.Case@Example.com"}


def use(monkeypatch, handler):
    seen = []

    def wrapped(request):
        seen.append(request)
        return handler(request)

    monkeypatch.setattr(membership, "user_client", lambda _t: mock_client(wrapped))
    return seen


def test_one_row_returns_staff_and_lowercases_email(monkeypatch):
    seen = use(monkeypatch, lambda r: httpx.Response(200, json=[ROW]))
    staff = resolve_staff("tok", CLAIMS)
    assert isinstance(staff, Staff) and staff.role == "body_admin"
    assert seen[0].url.params["email"] == "eq.mixed.case@example.com"
    assert seen[0].url.params["status"] == "eq.active"


@pytest.mark.parametrize(
    "response",
    [httpx.Response(200, json=[]), httpx.Response(200, json=[ROW, ROW])],
    ids=["zero_rows", "two_rows"],
)
def test_not_one_row_raises(monkeypatch, response):
    use(monkeypatch, lambda r: response)
    with pytest.raises(NotAuthorised):
        resolve_staff("tok", CLAIMS)


def test_missing_email_claim_raises(monkeypatch):
    seen = use(monkeypatch, lambda r: httpx.Response(200, json=[ROW]))
    with pytest.raises(NotAuthorised):
        resolve_staff("tok", {})
    assert seen == []


def _boom(request):
    raise httpx.ConnectError("down")


@pytest.mark.parametrize(
    "handler",
    [
        _boom,
        lambda r: httpx.Response(500, json={}),
        lambda r: httpx.Response(401, json={}),
        lambda r: httpx.Response(200, content=b"<html>not json"),
        lambda r: httpx.Response(200, json=[{"id": "x"}]),
        lambda r: httpx.Response(200, json={"not": "a list"}),
    ],
    ids=["connect_error", "http_500", "http_401", "not_json", "bad_row", "not_list"],
)
def test_lookup_failure_is_unavailable_not_forbidden(monkeypatch, handler):
    use(monkeypatch, handler)
    with pytest.raises(AuthUnavailable):
        resolve_staff("tok", CLAIMS)
