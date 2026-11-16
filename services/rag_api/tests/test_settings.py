import importlib

import pytest

from rag_api import settings

VARS = ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RAG_ENV")
GOOD = {"SUPABASE_URL": "http://127.0.0.1:54321", "SUPABASE_ANON_KEY": "a", "SUPABASE_SERVICE_ROLE_KEY": "s"}


@pytest.fixture
def load(monkeypatch):
    def _load(**env):
        for name in VARS:
            monkeypatch.delenv(name, raising=False)
        for name, value in env.items():
            monkeypatch.setenv(name, value)
        return importlib.reload(settings)

    yield _load
    monkeypatch.undo()
    importlib.reload(settings)


@pytest.mark.parametrize("missing", ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"])
def test_missing_variable_names_it_and_the_fix(load, missing):
    with pytest.raises(RuntimeError, match=f"{missing} is not set.*supabase status -o env.*README"):
        load(**{k: v for k, v in GOOD.items() if k != missing})


def test_empty_value_counts_as_missing(load):
    with pytest.raises(RuntimeError, match="SUPABASE_ANON_KEY is not set"):
        load(**{**GOOD, "SUPABASE_ANON_KEY": ""})


def test_localhost_host_rejected(load):
    with pytest.raises(RuntimeError, match="must be 127.0.0.1 .*not localhost.*RAG_ENV=production"):
        load(**{**GOOD, "SUPABASE_URL": "http://localhost:54321"})


def test_http_rejected_in_production(load):
    with pytest.raises(RuntimeError, match="https"):
        load(**{**GOOD, "SUPABASE_URL": "http://db.example.com", "RAG_ENV": "production"})


def test_https_allowed_in_production(load):
    s = load(**{**GOOD, "SUPABASE_URL": "https://db.example.com/", "RAG_ENV": "production"})
    assert s.SUPABASE_URL == "https://db.example.com"


def test_valid_local(load):
    assert load(**GOOD).SUPABASE_URL == "http://127.0.0.1:54321"
