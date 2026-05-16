# Eventar — Handoff Summary

**Date:** 2026-05-16
**Project root:** `/Users/ivan/Eventar` · **Vault:** `/Users/ivan/Desktop/Eventar`
**Status:** Phase 1.5 in progress, mid-execution; paused after Tasks 1–4 due to a rate-limit on the next subagent dispatch

---

## Where we are

### Eventar repo state
- Branch: `main` (working tree clean)
- **6 commits ahead of origin/main** — Phase 1.5 work not yet pushed
- All 11 tests green; `tsc --noEmit` clean

### Last 8 commits
```
4d1adc1  feat(phase-1.5): create_event_with_blocks RPC          ← Task 4 ✅
55bd38f  feat(phase-1.5): reshape events (drop legacy + venue)  ← Task 3 ✅
235e6d9  feat(phase-1.5): agenda_blocks table + RLS             ← Task 2 ✅
7df7f62  chore(phase-1.5): add mapbox + tz-lookup deps          ← Task 1 ✅
6d0f120  docs(phase-1.5): implementation plan (11 tasks)
dfe7df2  docs(phase-1.5): design doc
09aca03  docs(CLAUDE.md): 12-rule Coding Behavior Contract       ← last pushed
1907a87  docs(CLAUDE.md): Next-16 proxy rename
```

### Phase 1.5 progress (11 implementation tasks + manual smoke)

| # | Task | Status |
|---|---|---|
| 1 | Install `@mapbox/search-js-react` + `tz-lookup` | ✅ |
| 2 | Migration `agenda_blocks` + RLS | ✅ |
| 3 | Migration: reshape `events` table | ✅ |
| 4 | Migration: `create_event_with_blocks` RPC | ✅ |
| **5** | **`tzFromCoords` helper (TDD)** | ⏸️ **NEXT** |
| **6** | **`findParallelBlockIds` helper (TDD)** | ⏸️ next |
| **7** | **Rewrite `createEvent` Server Action + Zod** | ⏸️ next |
| 8 | `VenueSearchBox` + form rewrite | ⏸️ |
| 9 | Edit page renders new fields | ⏸️ |
| 10 | Public info page renders venue + agenda | ⏸️ |
| 11 | `tsc` / `test` / `build` verification | ⏸️ |
| 12 | **User manual smoke test** (Mapbox + form flow) | ⏸️ user-facing |

### Why we paused
Rate-limited mid-dispatch on Tasks 5–7 subagent. **Subagent did nothing — clean retry from scratch when ready.** Prompt template for the dispatch lives in the conversation history; can be reconstructed from the executable plan doc.

---

## Key reference paths

### Plans + docs (in repo)
- Design: `docs/plans/2026-05-16-eventar-phase-1.5-design.md`
- **Executable plan**: `docs/plans/2026-05-16-eventar-phase-1.5-create-event-redesign.md` — has full Task 5–11 code blocks
- Phase 1 plan (for historical context): `docs/plans/2026-05-13-eventar-phase-1-foundation.md`

### Vault (Obsidian) — auto-loaded source of truth
- Index: `/Users/ivan/Desktop/Eventar/00 — Index.md`
- Decisions log (locked choices): `/Users/ivan/Desktop/Eventar/02 — Decisions Log.md`
- Data Model: `/Users/ivan/Desktop/Eventar/10 — Architecture/Data Model.md`
- **Security + Robustness** (cross-cutting): `/Users/ivan/Desktop/Eventar/10 — Architecture/Security + Robustness.md`
- Auth Flow: `/Users/ivan/Desktop/Eventar/10 — Architecture/Auth Flow.md`

### CLAUDE.md (auto-loaded when working in repo)
- `/Users/ivan/Eventar/CLAUDE.md` — 12-rule Coding Behavior Contract + 10 Eventar hard rules
- `/Users/ivan/Eventar/AGENTS.md` — Next 16 breaking-changes warning

### User memory (auto-loaded across sessions)
- `~/.claude/projects/-Users-ivan-Desktop-cena/memory/coding_behavior_contract.md`
- `~/.claude/projects/-Users-ivan-Desktop-cena/memory/eventar_vault.md`

---

## Live infrastructure

| Service | What | Where |
|---|---|---|
| Supabase project | `muieupgkpbxpqsrjjwol` | https://supabase.com/dashboard/project/muieupgkpbxpqsrjjwol |
| GitHub | `GhostDragooon/Eventar` | https://github.com/GhostDragooon/Eventar |
| Mapbox account | handle `iv999` | https://account.mapbox.com |

### Remote DB state
- 5 migrations applied (init_staff, init_events, init_agenda_blocks, reshape_events_venue, rpc_create_event_with_blocks)
- 1 staff row: `ahf.ivan@gmail.com` (role: manager)
- 0 events
- 0 agenda_blocks
- RLS enabled on all tables; helpers `auth_email()`, `is_manager()`, `current_staff_id()` live

### `.env.local` (gitignored, 5 vars)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_PASSWORD
NEXT_PUBLIC_MAPBOX_TOKEN
```
**Never echo, cat, or paste any line of `.env.local`** in commit messages, plan docs, or subagent prompts.

---

## How to resume

### Option A — Subagent-driven (same / new session)
Re-dispatch Tasks 5–7 with vault context + the plan doc's Task 5–7 sections. Then Tasks 8 (Mapbox + form), 9–10 (edit + public pages), 11 (verification).

### Option B — Parallel session
1. Open a new Claude Code session in `/Users/ivan/Eventar`
2. Type: `/executing-plans docs/plans/2026-05-16-eventar-phase-1.5-create-event-redesign.md`
3. Tell it: "Start at Task 5 — Tasks 1-4 are complete (commits 7df7f62..4d1adc1)"

### Option C — Manual (user driving)
Tasks 5–6 are tight (~50 lines of code each, TDD with 3-4 tests each). The plan doc has full code blocks. Task 8 (form rewrite) is the heaviest (~250 lines).

---

## Outstanding decisions / risks

1. **Mapbox SearchBox prop shape** — `@mapbox/search-js-react` API has changed across versions; Task 8 implementer must verify against installed version (`node_modules/@mapbox/search-js-react/dist/*.d.ts`) before writing code. Same Next-16 verification pattern that paid off in Phase 1.
2. **Phase 1 Task 13 manual auth smoke** — never run by user. Phase 1.5 supersedes the old form, so the OLD form's smoke is moot. Task 12 (smoke of Phase 1.5 form) replaces it.
3. **Push to origin** — 6 commits ahead. Push when ready.
4. **CENA repo `.claude/` directory** — still untracked; deferred decision (gitignore vs commit `launch.json` only).
5. **Vault notes** — Data Model + Decisions Log haven't been updated for Phase 1.5 yet (planned post-merge task).

---

## Hard rules for anyone resuming

1. **Read the vault first** — the Index + Decisions Log + Security + Robustness notes
2. **Use vault paths in subagent prompts** — never let an implementer subagent guess the schema
3. **Single `main` branch** — no feature branches
4. **`requireStaff()` at the top of every staff Server Action** — no exceptions
5. **Insert `email_log` row FIRST, send email SECOND** (when we hit phase 7 / 9)
6. **Three-layer validation** — form → Zod → DB constraint
7. **Verify Next 16 APIs against `node_modules/next/dist/docs/`** before using any Next-specific code
8. **Never paste secrets into commits, plan docs, vault notes, or subagent prompts**

---

## Next concrete action

**For Tasks 5–7**, dispatch an implementer subagent with the following inputs:
- Working dir: `/Users/ivan/Eventar`
- READ FIRST: `CLAUDE.md`, `AGENTS.md`, vault Auth Flow + Security & Robustness notes, the executable plan (Tasks 5–7 sections)
- Hard rule: strict TDD; tests fail before implementation; one commit per task; never log `.env.local`
- Expected outputs: 3 new commits (tzFromCoords, findParallelBlockIds, createEvent rewrite); all tests pass; `tsc --noEmit` clean

Code blocks for each task already live in:
`docs/plans/2026-05-16-eventar-phase-1.5-create-event-redesign.md` (Tasks 5, 6, 7).
