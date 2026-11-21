# RAG state of the art, as of 2026-11-16 (research hand-back, condensed)

Tags: [V] = source page read. [S] = search snippet only. [M] = from memory, unchecked. Re-verify before citing in a decision.

- Contextual retrieval (Anthropic, 2024-09-19) [V]: retrieval failure (1 - recall@20) 5.7% baseline; contextual embeddings 3.7%; plus contextual BM25 2.9%; plus reranking (150 to 20) 1.9%. Source: https://www.anthropic.com/news/contextual-retrieval
- Late chunking (Jina) [S]: +2.7% to +3.6% relative nDCG@10 over naive chunking on BeIR (arXiv 2409.04701). A head-to-head (arXiv 2504.19754) is confounded by a reranker.
- Parent/child: no measured recall gain found [M]. It is a context-assembly tactic.
- Parsing: OmniDocBench v1.6 overall scores are mostly self-reported. Docling and Unstructured have no entries [V]. ParseBench (LlamaIndex, Apr 2026) is vendor-authored [V]. Skip ColPali-style visual retrieval; passage citation needs text.
- ViDoRe V3 (Jan 2026) nDCG@10 [V]: best text pipeline Jina-v4 plus zerank-2 reranker 63.6; best visual retriever 59.8; a visual reranker added +0.2.
- Embeddings [V]: Qwen3-Embedding (Apache-2.0, self-hostable): 0.6B 64.33, 4B 69.45, 8B 70.58 MTEB multilingual. gemini-embedding-001 68.32 [S]. BGE-M3 1024-dim, MIT [M]. No Traditional Chinese evidence found.
- pgvector 0.8.7 [V]: HNSW and IVFFlat index limit 2,000 dims for `vector`, 4,000 for `halfvec`. Without an index, search is exact.
- e-means: ships in faiss-cpu 1.16.0 [S]. No independent replication found as of 2026-11-16.
- RAPTOR, GraphRAG, LightRAG: below plain dense retrieval on QA benchmarks in the HippoRAG 2 paper, Table 2 [S].
