# RAG pipeline — architecture reference

**Date:** 2026-08-16
**Source:** mobile screenshot of a generic educational infographic, "RAG PIPELINE: HOW IT WORKS" (visible attribution: "ML Tut")
**Status:** Reference document only. Not a build spec, not scoped work. See "Relevance to Eventar" below — full RAG cluster build is explicitly **not funded** (vault Decisions Log Q37, 2026-08-14).

---

## What this captures

A generic, vendor-neutral 6-stage RAG (Retrieval-Augmented Generation) pipeline diagram. Transcribed here for architecture-vocabulary reference — useful if/when a retrieval layer is ever scoped for Eventar (e.g. the course-finder discovery layer's semantic search), so the terminology and stage boundaries are on hand rather than re-derived from scratch.

## The 6 stages

### 1. Data Ingestion
Collect data from various sources — documents, PDFs, web pages, APIs, databases, etc. Raw data is the foundation of RAG. → feeds Preprocessing.

### 2. Data Preprocessing
Clean and prepare data: remove noise, normalize formatting, prepare content for chunking. Split text into smaller chunks for better retrieval. → feeds Embedding Generation.

### 3. Embedding Generation
Convert text chunks into vector embeddings via an embedding model. Maps text chunks into dense vector embeddings that capture semantic meaning. Enables similarity search in vector space. → feeds Indexing.

### 4. Indexing (Vector Store)
Store embeddings and associated metadata in a vector database. Enables fast and efficient similarity search. Popular vector DBs named in the source: FAISS, Chroma, Pinecone, Weaviate, Qdrant. → feeds Retrieval.

### 5. Retrieval
User asks a question → convert query to embedding → similarity search against the vector store → optional reranker → top-k relevant chunks passed as context. → feeds Generation.

### 6. Generation
LLM (generator) receives retrieved context (top-k chunks) + the user query, and generates an answer grounded in that context. Reduces hallucinations; produces grounded, context-aware responses.

## Key takeaways (as stated in the source)

- Ingest → collect from multiple sources
- Preprocess → clean and chunk the data
- Embed & Index → generate embeddings and store in a vector DB
- Retrieve → find relevant context for the query
- Generate → LLM generates an answer using retrieved context

RAG enhances LLMs by combining information retrieval with natural-language generation: it improves accuracy, reduces hallucinations, and keeps answers grounded in the source data rather than the model's parametric memory alone.

## Relevance to Eventar

- Vault Decisions Log **Q37** (2026-08-14) scopes the current HKD 100,000 grant narrowly and explicitly lists "full RAG cluster build" under **not funded**, alongside BLE hardware, agent-portal build, and multi-country expansion. This note does not change that — it's reference material captured while the topic was in front of us, not a proposal to build a retrieval layer now.
- The one place a RAG-like retrieval layer has been discussed at all is the course-finder discovery layer (`docs/research/course-finder/`, vault "Course Finder — Discovery Layer" note): `docs/plans/handoff_26072026.md` notes a "retrieval-layer design" as a paused, unbuilt idea for semantic search over the public CPD-course directory. If that ever gets picked back up, this stage breakdown is the starting vocabulary.
