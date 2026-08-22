#!/usr/bin/env python3
"""Validate an Eventar evidence claim against the schema.

Usage: python scripts/validate_claim.py claim.json
Exit 0 = valid. Non zero = invalid, with reasons printed.
"""
import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator
except ImportError:
    print("jsonschema not installed. Run: pip install jsonschema")
    sys.exit(3)

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema" / "evidence-claim.schema.json"

FOUR_FIELDS = [
    "observation",
    "depends_on",
    "how_would_we_know_this_failed",
    "leading_indicator",
]

def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/validate_claim.py claim.json")
        return 2
    schema = json.loads(SCHEMA_PATH.read_text())
    claim = json.loads(Path(sys.argv[1]).read_text())
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(claim), key=lambda e: e.path)
    if errors:
        print("INVALID claim:")
        for e in errors:
            loc = "/".join(str(p) for p in e.path) or "(root)"
            print(f"  - {loc}: {e.message}")
        return 1
    for f in FOUR_FIELDS:
        if not claim.get(f):
            print(f"INVALID claim: falsifiability field '{f}' is empty")
            return 1
    if claim.get("claim_type") == "submission" and claim.get("status") == "accepted":
        if not claim.get("evidence_refs"):
            print("INVALID claim: Q3 accepted with no confirmation artefact in evidence_refs")
            return 1
    print("VALID claim")
    return 0

if __name__ == "__main__":
    sys.exit(main())
