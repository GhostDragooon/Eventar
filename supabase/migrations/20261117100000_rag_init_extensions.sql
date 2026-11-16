-- B9 RAG: enable pgvector (no vector column yet).
-- Spec: docs/plans/rag/B9-S1-A-schema-spec.sql
-- Rollback: drop the objects this file creates (new B9 tables, policies and functions only; no existing object is altered).

create extension if not exists vector with schema extensions;
