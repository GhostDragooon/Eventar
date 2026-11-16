import base64
import hashlib
import hmac
import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from rag_api import settings
from rag_api.auth import tokens
from rag_api.auth.membership import AuthUnavailable, NotAuthorised

ISS = f"{settings.SUPABASE_URL}/auth/v1"


def make(key, **over):
    claims = {"sub": "u1", "aud": "authenticated", "iss": ISS, "exp": int(time.time()) + 600}
    claims.update(over)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm="ES256")


@pytest.fixture(autouse=True)
def patch_key(monkeypatch, es256_key):
    monkeypatch.setattr(tokens, "_signing_key", lambda _t: es256_key.public_key())


def test_valid_token_passes(es256_key):
    assert tokens.verify_token(make(es256_key, email="a@b.c"))["sub"] == "u1"


@pytest.mark.parametrize(
    "over",
    [
        {"exp": int(time.time()) - 10},
        {"iss": "http://evil.invalid/auth/v1"},
        {"aud": "anon"},
        {"sub": None},
        {"exp": None},
    ],
    ids=["expired", "wrong_issuer", "wrong_audience", "missing_sub", "missing_exp"],
)
def test_bad_claims_raise(es256_key, over):
    with pytest.raises(NotAuthorised):
        tokens.verify_token(make(es256_key, **over))


def test_tampered_signature_raises():
    other = ec.generate_private_key(ec.SECP256R1())
    with pytest.raises(NotAuthorised):
        tokens.verify_token(make(other))


def test_garbage_raises():
    with pytest.raises(NotAuthorised):
        tokens.verify_token("not-a-jwt")


def _b64(obj) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


def test_hs256_signed_with_public_key_pem_rejected(es256_key):
    pem = es256_key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    head = _b64({"alg": "HS256", "typ": "JWT"})
    body = _b64({"sub": "u1", "aud": "authenticated", "iss": ISS, "exp": int(time.time()) + 600})
    sig = hmac.new(pem, f"{head}.{body}".encode(), hashlib.sha256).digest()
    token = f"{head}.{body}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"
    with pytest.raises(NotAuthorised):
        tokens.verify_token(token)


def test_alg_none_rejected():
    claims = {"sub": "u1", "aud": "authenticated", "iss": ISS, "exp": int(time.time()) + 600}
    with pytest.raises(NotAuthorised):
        tokens.verify_token(jwt.encode(claims, None, algorithm="none"))


class _Jwks:
    def __init__(self, exc):
        self.exc = exc

    def get_signing_key_from_jwt(self, _t):
        raise self.exc


def test_jwks_fetch_failure_is_unavailable(monkeypatch):
    monkeypatch.undo()  # drop the autouse key patch so the real _signing_key runs
    monkeypatch.setattr(tokens, "_jwks", _Jwks(jwt.exceptions.PyJWKClientConnectionError("down")))
    with pytest.raises(AuthUnavailable):
        tokens.verify_token("a.b.c")


def test_no_matching_kid_is_not_authorised(monkeypatch):
    monkeypatch.undo()
    monkeypatch.setattr(tokens, "_jwks", _Jwks(jwt.exceptions.PyJWKClientError("no kid")))
    with pytest.raises(NotAuthorised):
        tokens.verify_token("a.b.c")
