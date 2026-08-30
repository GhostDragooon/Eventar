# Category 08 — Files, Evidence and Uploads: status

**Library-only. Not wired to any route. Do not wire until B6 ships.**

`docs/architecture/BLOCK-ARCHITECTURE.md` lists **B6 Audit & Evidence Access**
as `📋 planned → Stage 13`. Stage 13's own text names the "evidence locker"
explicitly; the current stage is well before that. Per the block-architecture
guardrail (repo CLAUDE.md, "Block architecture guardrail (2026-07-11)"), work
that doesn't fit a shipped block is a flagged decision, not code — these four
components are built as a library (so the port is complete and the pattern is
ready) but intentionally have no Server Action, no storage policy, and no
live import anywhere in `app/`.

Components: `UploadActionButton.tsx`, `MultiFileUpload.tsx`,
`FileSubmissionStatus.tsx`, `EvidenceFileList.tsx`.

When B6 is scoped, re-read the source manifest's `securityBoundaries` before
wiring: client-side type/size/count checks are UX only, the host Server
Action must independently validate type/size/count/content, must not trust
file name or browser MIME, must enforce `requireStaff()` + RLS for
staff-controlled files, must never log PII, and `EvidenceFileList`'s
`downloadHref` must be a signed, time-limited URL — never a raw storage path.
