# CLAUDE.md — Eventar repo

> **For Claude (any session, any subagent): READ THIS BEFORE TOUCHING ANY CODE.**
> **Also read `AGENTS.md`** (shipped by Next 16 scaffold) — it warns that Next 16 has breaking changes vs training data. ==Verify Next-specific APIs against `node_modules/next/dist/docs/` before writing any code that uses them.==

---

# Coding Behavior Contract (12 Rules)

## Core
1. Think before coding. State your assumptions. Surface tradeoffs.
   Ask before guessing. Push back when a simpler approach exists.
2. Simplicity first. Minimum code that solves the problem. No
   speculative features. No abstractions for single-use code.
3. Surgical changes. Touch only what is asked. Do not "improve"
   adjacent code, comments, or formatting. Match existing style.
4. Goal-driven execution. Define success criteria. Loop until
   verified. Do not narrate steps; tell me what success looks like.
5. Do not make the model do non-language work. Retry policies,
   routing, escalation thresholds belong in deterministic code.
6. Hard token budgets, no exceptions. Stop and ask if a task is
   trending past its budget.
7. Surface conflicts, do not average them. If two parts of the
   codebase disagree, flag the disagreement and ask which to follow.
8. Read before you write. Understand adjacent code (the file and
   nearby siblings) before adding new code.
9. Tests are required but are not the goal. A passing test that
   tests nothing useful is a failure. Tests must check behavior.
10. Long-running operations require checkpoints. After every
    significant step, summarize what was done and confirm before
    proceeding.
11. Convention beats novelty. In an established codebase, match
    the existing pattern even if a "better" one exists.
12. Fail visibly, not silently. Surface every skipped record,
    every rolled-back transaction, every constraint violation.
    Never report success when something was bypassed.

## Project-specific rules below this line

---

## What this repo is

**Eventar** — internal workshop manager. **Next.js 16** (App Router) + Tailwind v4 + Supabase + Resend.
*Note: vault notes were written assuming Next 15; if you find a discrepancy between vault and Next 16 reality, the Next 16 docs win.*

The PRD calls for: registration → confirmation email → 60-min-before reminder with personal QR → on-site check-in → 10-min-after survey. Up to 200 attendees/event. No attendee accounts.

## Source of truth — read the Obsidian vault first

==The Obsidian vault at `/Users/ivan/Desktop/Eventar` is the source of truth for design, architecture, decisions, and cross-cutting concerns.==

Before implementing any feature, **read the relevant vault notes**:

| If your task touches… | Read first |
|---|---|
| Anything at all | `00 — Index.md` (orientation), `02 — Decisions Log.md` (locked choices) |
| Database schema or RLS | `10 — Architecture/Data Model.md` |
| Auth, middleware, `requireStaff()` | `10 — Architecture/Auth Flow.md` |
| Emails or cron | `10 — Architecture/Cron + Email.md` |
| Timezones / event date display | `10 — Architecture/Timezone Handling.md` |
| ==Any validation, idempotency, race conditions, PII, secrets, logging, file uploads== | `10 — Architecture/Security + Robustness.md` |
| Where files live, naming, route groups | `10 — Architecture/Repo Structure.md` |
| What we're building next | `20 — Roadmap/Phased Roadmap.md`, `20 — Roadmap/Phase N — *.md` |
| Library choices + alternatives considered | `30 — Reference/Stack.md` |
| Env vars, key rotation | `30 — Reference/Credentials.md` |
| "Can we just add X?" — check if it's deferred | `30 — Reference/Out of Scope.md` |

## Executable phase plans live in this repo

Bite-sized TDD plans (with full code and commands) live in `docs/plans/`:

- `docs/plans/2026-05-13-eventar-mvp-design.md` — high-level design (mirrors the vault)
- `docs/plans/2026-05-13-eventar-phase-1-foundation.md` — Phase 1 executable plan

When executing a phase, follow its plan task-by-task. Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

## Hard rules (never break)

These are mirrored from the vault but worth restating because breaking any of them creates large recovery cost:

1. **Staff identity keyed on email**, not `auth.users.id`. Lets us swap magic-link → MS SSO later as a Supabase Auth config flip with no app code change. See `10 — Architecture/Auth Flow.md`.
2. **Insert `email_log` row FIRST, send email SECOND.** Reverse order risks duplicate sends on retry. See `10 — Architecture/Cron + Email.md`.
3. **`requireStaff()` at the top of every staff Server Action.** No exceptions. See `10 — Architecture/Auth Flow.md`.
   - **Next 16 rename:** the staff-route gate file is `proxy.ts` at repo root (NOT `middleware.ts` — that name is deprecated). Exported function is `proxy`. Matcher syntax unchanged.
4. **Service-role key only in `lib/supabase/admin.ts`** with `'server-only'` import. Never expose to browser.
5. **RLS enabled on every table.** Public writes go through `/api/*` with service-role; RLS still on as defense in depth.
6. **Single `main` branch.** "Min number of branches" per user direction. Atomic commits per logical unit.
7. **Don't add external services prematurely.** Resend wired in phase 7; Vercel in phase 8; pg_cron in phase 9. All emails stubbed (console.log) until phase 7. See `20 — Roadmap/Phased Roadmap.md`.
8. **Three-layer validation** (form → Zod → DB constraint) for every mutation. See `10 — Architecture/Security + Robustness.md` §1.
9. **Three-layer auth** (middleware → `requireStaff` → RLS) for every staff action. Same note §4.
10. **No PII in logs.** UUIDs only. See `Security + Robustness.md` §12.

## Secrets

==Never in code, commits, vault notes, or chat.== They live in two places only:
- `.env.local` (this repo, gitignored)
- The provider dashboard (Supabase, Resend, Vercel)

If you suspect a key has leaked, rotate immediately per `30 — Reference/Credentials.md`.

## Don't confuse this with CENA

If a previous Claude session worked on **CENA** (`/Users/ivan/Desktop/cena`), that's a **different product**:
- Different repo, different stack (CENA = React Native + Expo for mobile + Next.js for web; Eventar = web-only Next.js)
- Different memory notes (cena_naming, cena_build_specs apply to CENA, NOT Eventar)
- The "no Lovable scaffold work" memory rule is CENA-specific

## When in doubt

1. Re-read the relevant vault note.
2. If still unclear, ask the user before guessing.
3. Don't introduce decisions that aren't in `02 — Decisions Log.md` without flagging them.

---

## Skill-library first

Before starting any task — including tasks dispatched to subagents — check the available skill library and use what applies. Skills carry hard-won project + tooling discipline (TDD red-then-green, brainstorming-before-code, subagent-driven-development, debugging, etc.) that re-deriving from scratch wastes budget and loses lessons. If multiple skills could apply, process skills (brainstorming, debugging) come before implementation skills (frontend-design, mcp-builder). This rule binds subagents too — when dispatching, brief the subagent to use the relevant skill (e.g. "use `superpowers:test-driven-development` for the pure helper").

## Phase completion protocol

**Every phase ends with three checks before presenting to the user. No exceptions.**

After all impl-plan tasks land + static gates pass (tsc/eslint/vitest/next build), but BEFORE writing the vault note or declaring the phase done:

1. **Dev-perspective review** — dispatch one agent (`superpowers:code-reviewer` or general-purpose) tasked with: code quality, security, race conditions, regressions, hidden state-management bugs (especially React closure-over-stale-state in `useEffect([])` patterns), CLAUDE.md rule compliance, and consistency with existing patterns. Reads the diff + the changed files; runs the gates independently.

2. **User-perspective review** — dispatch a SEPARATE agent (never the same one) tasked with the cold-start user journey: open the app fresh, attempt the new feature's happy path, attempt the obvious wrong-thing-to-do, read every error message in context. Looks for: misleading copy, missing feedback, dead ends, accessibility gaps, "I succeeded but did I do the right thing?" ambiguity. The two perspectives MUST be separate agents — a single agent doing both collapses the two lenses into one.

3. **Backtest** — exercise the code end-to-end against the real (or seeded) DB, not just unit tests. For mutation surfaces (Server Actions, migrations): execute the actual write, query the row back, assert the observable state. For read surfaces: hit the route, parse the response. Backtest catches what unit tests + lint cannot — drifted RLS policies, broken constraint names, integration regressions, "the test mocks the bug away" failures (rule 9).

A phase that hasn't completed all three is not done. Fix what they find, re-run any check that touched the affected surface, then present to the user.

The vault phase note and handoff doc are written AFTER these checks pass — not before.
