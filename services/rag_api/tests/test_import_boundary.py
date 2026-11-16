from pathlib import Path

import pytest

from rag_api.boundary import find_boundary_violations

SRC = Path(__file__).resolve().parents[1] / "src" / "rag_api"
IMPORT = "from rag_api.privileged import client\n"


def test_real_source_is_clean():
    assert find_boundary_violations(SRC) == []


def test_router_importing_privileged_is_flagged(tmp_path):
    (tmp_path / "routers").mkdir()
    (tmp_path / "routers" / "retrieve.py").write_text(IMPORT)
    (tmp_path / "privileged").mkdir()
    (tmp_path / "privileged" / "client.py").write_text("")
    assert find_boundary_violations(tmp_path) == ["routers/retrieve.py: imports rag_api.privileged"]


def test_worker_may_import_privileged(tmp_path):
    (tmp_path / "worker.py").write_text(IMPORT)
    assert find_boundary_violations(tmp_path) == []


FORMS = {
    "routers/retrieve.py": "import rag_api.privileged.client\n",
    "routers/retrieval.py": "from rag_api.privileged import client\n",
    "retrievers/a.py": "from rag_api import privileged\n",
    "user_scoped/b.py": "from ..privileged import client\n",
    "gates/gate_x.py": "from .. import privileged\n",
    "routers/retrieve_two.py": 'import importlib\nimportlib.import_module("rag_api.privileged.client")\n',
    "routers/retriever.py": '__import__("rag_api.privileged")\n',
}


@pytest.mark.parametrize("rel", FORMS)
def test_each_import_form_is_flagged(tmp_path, rel):
    path = tmp_path / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(FORMS[rel])
    assert find_boundary_violations(tmp_path) == [f"{rel}: imports rag_api.privileged"]
