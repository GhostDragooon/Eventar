import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERN = re.compile("(?i)k" + "[-_ ]?" + "means")


def test_no_kmeans_anywhere():
    hits = [
        str(p.relative_to(ROOT))
        for p in ROOT.rglob("*")
        if p.is_file()
        and p.suffix in {".py", ".toml", ".md", ".json"}
        and ".venv" not in p.parts
        and p.name != "test_no_kmeans.py"
        and PATTERN.search(p.read_text(errors="ignore"))
    ]
    assert hits == []
