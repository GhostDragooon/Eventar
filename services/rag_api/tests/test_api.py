import logging

import pytest
from fastapi.testclient import TestClient

from rag_api import main
from rag_api.auth.membership import AuthUnavailable, NotAuthorised
from rag_api.main import app

client = TestClient(app)
TOKEN = "header.payload-secret.sig"


def auth(token=TOKEN):
    return {"Authorization": f"Bearer {token}"}


def raiser(exc):
    def _raise(*_a):
        raise exc

    return _raise


def test_missing_header_is_401_with_challenge():
    r = client.get("/whoami")
    assert r.status_code == 401 and r.json() == {"error": "AUTH_FAILED"}
    assert r.headers["www-authenticate"] == "Bearer"


def test_invalid_token_is_401_with_challenge():
    r = client.get("/whoami", headers=auth("garbage"))
    assert r.status_code == 401 and r.headers["www-authenticate"] == "Bearer"


def test_key_fetch_outage_is_503(monkeypatch, caplog):
    monkeypatch.setattr(main, "verify_token", raiser(AuthUnavailable("JWKS_UNAVAILABLE")))
    with caplog.at_level(logging.WARNING, logger="rag_api"):
        r = client.get("/whoami", headers=auth())
    assert r.status_code == 503 and r.json() == {"error": "AUTH_UNAVAILABLE"}
    assert any(rec.levelno == logging.WARNING for rec in caplog.records)


def test_staff_lookup_outage_is_503(monkeypatch):
    monkeypatch.setattr(main, "verify_token", lambda _t: {"sub": "u1", "email": "a@b.c"})
    monkeypatch.setattr(main, "resolve_staff", raiser(AuthUnavailable("STAFF_LOOKUP_500")))
    r = client.get("/whoami", headers=auth())
    assert r.status_code == 503 and r.json() == {"error": "AUTH_UNAVAILABLE"}


def test_not_staff_is_403(monkeypatch):
    monkeypatch.setattr(main, "verify_token", lambda _t: {"sub": "u1", "email": "a@b.c"})
    monkeypatch.setattr(main, "resolve_staff", raiser(NotAuthorised("NOT_ONE_STAFF_ROW")))
    r = client.get("/whoami", headers=auth())
    assert r.status_code == 403 and r.json() == {"error": "NOT_AUTHORISED"}


def test_docs_are_closed():
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_failed_whoami_logs_code_without_token_or_email(caplog):
    with caplog.at_level(logging.INFO, logger="rag_api"):
        client.get("/whoami", headers=auth(TOKEN))
    text = "\n".join(rec.getMessage() for rec in caplog.records)
    assert "TOKEN_INVALID" in text
    assert TOKEN not in text and "payload-secret" not in text and "@" not in text


def test_startup_logs_one_info_line_without_key(caplog):
    with caplog.at_level(logging.INFO, logger="rag_api"):
        with TestClient(app):
            pass
    lines = [rec.getMessage() for rec in caplog.records if "start" in rec.getMessage()]
    assert len(lines) == 1
    assert "127.0.0.1" in lines[0] and "unit-test-placeholder" not in lines[0] and "54321" not in lines[0]
