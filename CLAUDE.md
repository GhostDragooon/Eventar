# CLAUDE.md — Eventar repo

> **For Claude (any session, any subagent): READ THIS BEFORE TOUCHING ANY CODE.**
> **Also read `AGENTS.md`** (shipped by Next 16 scaffold) — it warns that Next 16 has breaking changes vs training data. ==Verify Next-specific APIs against `node_modules/next/dist/docs/` before writing any code that uses them.==

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
