#!/usr/bin/env python3
# Merge one new vault note into the curated Eventar vault graph.
# Run with the graphify interpreter, from /Users/ivan/Desktop/Eventar:
#   /Users/ivan/.local/share/uv/tools/graphifyy/bin/python merge-vault-note.py NODE_ID "SOURCE_FILE" "LABEL" TARGET_ID [TARGET_ID ...]
# Then run: graphify cluster-only .
import sys
from pathlib import Path

from graphify.build import build_merge
from graphify.export import to_json

node_id, source_file, label, *targets = sys.argv[1:]

edges = [
    {
        "source": node_id,
        "target": t,
        "relation": "references",
        "confidence": "EXTRACTED",
        "confidence_score": 1.0,
        "source_file": source_file,
        "source_location": None,
        "weight": 1.0,
    }
    for t in targets
]
chunk = {
    "nodes": [
        {
            "id": node_id,
            "label": label,
            "file_type": "document",
            "source_file": source_file,
            "source_location": None,
        }
    ],
    "edges": edges,
    "hyperedges": [],
    "input_tokens": 0,
    "output_tokens": 0,
}

G = build_merge([chunk], graph_path=Path("graphify-out/graph.json"), root=Path("."))

communities = {}
for node, data in G.nodes(data=True):
    communities.setdefault(int(data.get("community", 0) or 0), []).append(node)

# build_merge does not persist; this write does.
to_json(G, communities, "graphify-out/graph.json", force=True)
print(G.number_of_nodes(), G.number_of_edges())
