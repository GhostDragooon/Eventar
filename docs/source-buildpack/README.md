# Slice 0.x build pack — source documents (as drafted)

Six .docx files, preserved verbatim from `~/Downloads/drive-download-20260703T110200Z-3-001/` on 2026-07-04. They are the CPD-pivot design pack **as originally drafted** — they predate the four review rounds of 2026-07-03 and contain decisions that changed and defects that were fixed.

> ⚠️ **Do not implement from these files directly.**
> Read them through [`docs/architecture/BASELINE-DELTAS.md`](../architecture/BASELINE-DELTAS.md), which is the authoritative amendment list. Where a slice doc and the deltas file disagree, the deltas file wins. The canonical decision record is the vault: `20 — Roadmap/Pivot — CPD Platform (2026-07-03).md` + Decisions Log Q20.

| File | Covers | Fully-reconciled home (written during the sprint that builds it) |
|---|---|---|
| Slice 0.1 — SAD + C4 | arc42 SAD, context/container diagrams, quality scenarios | `docs/architecture/sad.md` (Sprint 1+) |
| Slice 0.2 — Retrospective ADRs | ADR 0001–0015 | `docs/architecture/decisions/` (Sprint 0/1; several rewritten per deltas §1–2) |
| Slice 0.3 — Data Model Foundations | Foundations ERD, tenancy model, DDL, migration policy | Real migrations in `supabase/migrations/` + `docs/data/` (Sprint 1) |
| Slice 0.4 (1) — Auth + RLS | Auth model, RLS policy map | `docs/security/` (Sprint 2; custom-auth sections superseded — Supabase native) |
| Slice 0.4 (2) — KMS, Audit, Middleware | KMS setup, audit-log design, security middleware | `docs/security/` (Sprints 1, 2, 4) |
| Slice 0.5.1 — Behavioural, AI cost, Prompt injection | Abuse controls, AI containment | `docs/security/` (Sprints 2, 5; enforcement design replaced per deltas §4) |
