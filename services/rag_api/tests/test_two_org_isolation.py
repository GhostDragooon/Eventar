import hashlib
import os
import secrets
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

from rag_api import settings
from rag_api.main import app
from rag_api.privileged.client import privileged_client
from rag_api.user_scoped.client import user_client

pytestmark = pytest.mark.integration
if os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "unit-test-placeholder") == "unit-test-placeholder":
    pytest.skip(
        "SUPABASE_SERVICE_ROLE_KEY is unset or a unit-test placeholder: needs the local Supabase stack "
        "(export the three variables, see README.md)",
        allow_module_level=True,
    )

REP = {"Prefer": "return=representation"}


def test_two_org_isolation():
    run = uuid.uuid4().hex[:8]
    ids = {"documents": [], "staff": [], "accrediting_bodies": [], "organisations": []}
    users = []
    try:
        with privileged_client() as c:
            def insert(table, row):
                r = c.post(f"/rest/v1/{table}", json=row, headers=REP)
                assert r.status_code == 201, (table, r.status_code, r.text)
                ids[table].append(r.json()[0]["id"])
                return r.json()[0]["id"]

            org = {n: insert("organisations", {"name": f"b9s1b-{run}-{n}", "slug": f"b9s1b-{run}-{n}"})
                   for n in ("o1", "o2", "o3")}
            body = {k: insert("accrediting_bodies", {
                "organisation_id": org[o], "short_name": f"b9s1b-{run}-{k}",
                "full_name": f"b9s1b {run} {k}", "cycle_config": {}, "category_taxonomy": {}})
                for k, o in (("x", "o1"), ("y", "o2"))}

            password = secrets.token_urlsafe(18)[:24]
            who = {"eventar_staff": "o3", "organiser_admin": "o3", "body_admin": "o1"}
            tokens = {}
            for role, o in who.items():
                email = f"b9s1b-{role}-{secrets.token_hex(4)}@rls-test.invalid"
                r = c.post("/auth/v1/admin/users",
                           json={"email": email, "password": password, "email_confirm": True})
                assert r.status_code == 200, r.status_code
                users.append(r.json()["id"])
                insert("staff", {"email": email, "full_name": f"B9S1B {role}", "role": role,
                                 "organisation_id": org[o], "status": "active"})
                tokens[role] = (email, org[o])
            for k in ("x", "y"):
                digest = hashlib.sha256(f"B9S1B-{run}-{k.upper()}".encode()).hexdigest()
                insert("documents", {
                    "scope_type": "global_authority", "body_id": body[k], "family": "body_rule_source",
                    "source_filename": f"B9S1B-{k.upper()}.docx", "source_mime": "application/octet-stream",
                    "source_sha256": "\\x" + digest, "storage_path": f"rag/B9S1B/{run}-{k.upper()}"})

        for role, (email, _o) in list(tokens.items()):
            r = httpx.post(f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
                           headers={"apikey": settings.SUPABASE_ANON_KEY},
                           json={"email": email, "password": password})
            assert r.status_code == 200, r.status_code
            tokens[role] = (r.json()["access_token"], tokens[role][1])

        def visible(role):
            with user_client(tokens[role][0]) as uc:
                r = uc.get("/rest/v1/documents", params={
                    "select": "body_id", "storage_path": "like.rag/B9S1B/*"})
            assert r.status_code == 200
            return sorted(row["body_id"] for row in r.json())

        assert visible("organiser_admin") == []
        assert visible("body_admin") == [body["x"]]
        assert visible("eventar_staff") == sorted(body.values())

        tc = TestClient(app)
        for role, (tok, o) in tokens.items():
            r = tc.get("/whoami", headers={"Authorization": f"Bearer {tok}"})
            assert r.status_code == 200 and r.json()["role"] == role
            assert r.json()["organisation_id"] == o
        r = tc.get("/whoami", headers={"Authorization": "Bearer garbage"})
        assert r.status_code == 401 and r.json() == {"error": "AUTH_FAILED"}
    finally:
        with privileged_client() as c:
            for table in ("documents", "staff", "accrediting_bodies", "organisations"):
                for i in ids[table]:
                    r = c.delete(f"/rest/v1/{table}", params={"id": f"eq.{i}"})
                    assert r.status_code in (200, 204), (table, r.status_code)
            for u in users:
                r = c.delete(f"/auth/v1/admin/users/{u}")
                assert r.status_code in (200, 204), r.status_code
