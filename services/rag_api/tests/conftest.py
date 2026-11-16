import os

for _name in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
    os.environ.setdefault(_name, "http://127.0.0.1:54321" if _name == "SUPABASE_URL" else "unit-test-placeholder")

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric import ec


@pytest.fixture(scope="session")
def es256_key():
    return ec.generate_private_key(ec.SECP256R1())


def mock_client(handler) -> httpx.Client:
    return httpx.Client(base_url="http://127.0.0.1:54321", transport=httpx.MockTransport(handler))
