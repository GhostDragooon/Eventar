# CLAUDE.md — Eventar repo

> **For Claude (any session, any subagent): READ THIS BEFORE TOUCHING ANY CODE.**
> **Also read `AGENTS.md`** (shipped by Next 16 scaffold) — it warns that Next 16 has breaking changes vs training data. ==Verify Next-specific APIs against `node_modules/next/dist/docs/` before writing any code that uses them.==

---

# Coding Behavior Contract (13 Rules)

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
13. Default to expanding the mental model, not redirecting the
    action. When the user mentions work outside the active phase,
    treat it as a forward-looking constraint to hold in mind on
    the current build — NOT as consent to switch what you are
    building. Confirm explicitly before changing the active task.
    Active phase + carried-forward considerations live in
    `docs/plans/PROJECT_STATE.md`. Read it first.

## Project-specific rules below this line

---

## What this repo is

> ⚠️ **PIVOT — 2026-07-03.** Eventar pivoted from internal workshop manager to a **CPD/CME/CE event + credit platform** for regulated professions (HK launch, HKCP first accrediting body). Canonical record + frozen design baseline: vault `20 — Roadmap/Pivot — CPD Platform (2026-07-03).md` + Decisions Log **Q20**. Active plan: vault `20 — Roadmap/CPD Roadmap — Backend First.md` — **backend first, frontend FROZEN** (no new surfaces, no restyles) until the Milestone-M2 review. Current phase: `docs/plans/PROJECT_STATE.md`. Pre-pivot vault notes are historical unless they say otherwise.

**Eventar** — CPD platform (post-pivot). **Next.js 16** (App Router) + Tailwind v4 + Supabase + Resend.
*Note: vault notes were written assuming Next 15; if you find a discrepancy between vault and Next 16 reality, the Next 16 docs win.*

The shipped workshop loop (registration → confirmation email → 60-min-before reminder with personal QR → on-site check-in → 10-min-after survey) carries forward as the CPD platform's event/attendance backbone.

**Pivot-era hard rules** (extend the "Hard rules" list below; details in the pivot record):

- **Audit insert last.** Any transaction writing `audit_events` emits the audit event as the LAST statement before commit (the chain trigger holds `pg_advisory_xact_lock` until commit).
- **Measurement vs inference.** Automation acts only on deterministic measurements (rate limits, Turnstile, OTP failure counts). Inference signals (behavioural classification) produce flags for humans — never automatic action. No IP-level enforcement on authenticated routes, ever.
- **Multi-tenancy.** Every new domain table carries `organisation_id` + RLS (Q20 reversed old decision 6.3 single-org).
- ~~**Frontend freeze.**~~ **LIFTED for S-Organiser, 2026-08-01** (Ivan's M2 unfreeze scope call — the roadmap's "M2 unfreeze scope call" Ivan-critical item). Plan + admission checklist + staging: `docs/plans/2026-08-01-m2-frontend-unfreeze.md`. **Still off-limits, each for its OWN reason and not because of the freeze:** practitioner compliance math (Q26 + Milestone C gated — the evaluator half of M2 is untouched), the practitioner app / S-Attendee (post-M4), evidence locker + share-and-verify (B6, planned S5), multi-track scheduling (needs a deliberate data-model decision, rule 13). Adopting a design token's *value* without its *role* is how the first live pass broke WCAG AA on every CTA — read the plan's Stage 1 findings before touching the palette.
- **Block architecture guardrail (2026-07-11).** Every new feature/table/module must slot into the block map in `docs/architecture/BLOCK-ARCHITECTURE.md` (kernel K1–K3 / domain blocks B1–B8 / surfaces) and pass its new-work admission checklist before any code. Work that doesn't fit a block is a flagged decision first, not code. Kernel changes are constitutional (Decisions Log + Ivan sign-off).

## Source of truth — read the Obsidian vault first

==The Obsidian vault at `/Users/ivan/Desktop/Eventar` is the source of truth for design, architecture, decisions, and cross-cutting concerns.==

Before implementing any feature, **read the relevant vault notes**:

| If your task touches… | Read first |
|---|---|
| Anything at all | `00 — Index.md` (orientation), `02 — Decisions Log.md` (locked choices) |
| How to work — review process, decision-making, conflict resolution, risk, debugging logic | `30 — Reference/Agent Working Method.md` (vault; mirrors `~/.claude/DECISION_PROTOCOL.md` with Eventar worked examples) |
| Database schema or RLS | `10 — Architecture/Data Model.md` |
| Auth, middleware, `requireStaff()` | `10 — Architecture/Auth Flow.md` |
| Emails or cron | `10 — Architecture/Cron + Email.md` |
| Timezones / event date display | `10 — Architecture/Timezone Handling.md` |
| ==Any validation, idempotency, race conditions, PII, secrets, logging, file uploads== | `10 — Architecture/Security + Robustness.md` |
| Where files live, naming, route groups | `10 — Architecture/Repo Structure.md` |
| What we're building next | `20 — Roadmap/Phased Roadmap.md`, `20 — Roadmap/Phase N — *.md` |
| Library choices + alternatives considered | `30 — Reference/Stack.md` |
| Frontend component/token work resumes (currently FROZEN — see pivot banner above) — need real design tokens, component reference, motion/animation (GSAP), or a design-review/polish pass | `design-system-libraries` skill for tokens (global, `~/.claude/skills/design-system-libraries/SKILL.md`); also see `gsap-*`, `emil-design-eng`, `emilkowalski-motion`, `web-design-guidelines`, `impeccable-design-polish`, `redesign-existing-projects`, `minimalist-ui`, `industrial-brutalist-ui` — all global skills under `~/.claude/skills/` |
| Env vars, key rotation | `30 — Reference/Credentials.md` |
| "Can we just add X?" — check if it's deferred | `30 — Reference/Out of Scope.md` |

## Executable phase plans live in this repo

Bite-sized TDD plans (with full code and commands) live in `docs/plans/`:

- `docs/plans/2026-05-13-eventar-mvp-design.md` — high-level design (mirrors the vault)
- `docs/plans/2026-05-13-eventar-phase-1-foundation.md` — Phase 1 executable plan

When executing a phase, follow its plan task-by-task. Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

## Pre-deploy gates — ALL CLOSED (kept for the record)

The four pre-public-deploy gates are resolved; retained so they aren't re-litigated:

1. ✅ `/checkin/confirm` PII enumeration oracle — name dropped + rate-limited (`7c5bcbd`, `20ac68f`).
2. ✅ CSPRNG registration codes — `crypto.randomInt()`, widened to 6 chars (`659eee0`).
3. ✅ Host-header spoofing on QR origin — `NEXT_PUBLIC_SITE_URL` via `lib/origin.ts` (`561d2cb`).
4. ✅ Migration history drift — reconciled 26/26 local↔remote (`8c8e7d9`, 2026-07-04).

Deploy status post-pivot: old Phase 8 (workshop-MVP deploy) is **PAUSED** — needs an explicit user go decision; never deploy by momentum. The CPD deploy path is Milestone M4 of the backend-first roadmap. Live Supabase project is Seoul (`ap-northeast-2`); canonical prod will be a fresh **Singapore (`ap-southeast-1`)** project provisioned at Sprint 1 start.

---

## Hard rules (never break)

These are mirrored from the vault but worth restating because breaking any of them creates large recovery cost:

1. **Staff/user identity keyed on UUID (`auth.users.id`)**, not email. Email is a unique-indexed *mutable attribute*, not the key — people change email (marriage, employer, personal preference), and ledger integrity requires a stable FK that doesn't move when that happens. Supabase Auth uses UUIDs natively; keying on UUID avoids a constant translation layer between auth and application data. Email-change history is captured via `email_changed` audit events, not schema. **Supersedes the pre-CPD-pivot rule** (which existed to ease a future magic-link→MS SSO migration — moot now that auth is native Supabase OTP/password+MFA, not magic link). Locked 2026-07-08, see `02 — Decisions Log.md` Q23 item 1. See `10 — Architecture/Auth Flow.md` and `10 — Architecture/Data Model.md`.
2. **Insert `email_log` row FIRST, send email SECOND.** Reverse order risks duplicate sends on retry. See `10 — Architecture/Cron + Email.md`.
3. **`requireStaff()` at the top of every staff Server Action.** No exceptions. See `10 — Architecture/Auth Flow.md`.
   - **Next 16 rename:** the staff-route gate file is `proxy.ts` at repo root (NOT `middleware.ts` — that name is deprecated). Exported function is `proxy`. Matcher syntax unchanged.
4. **Service-role key only in `lib/supabase/admin.ts`** with `'server-only'` import. Never expose to browser.
5. **RLS enabled on every table.** Public writes use **Server Actions** with the service-role client *inside* the action; `/api/*` reserved for Phase 9 cron callbacks + external integration. Anon RLS policies remain enabled as defense in depth. See `02 — Decisions Log#Q11`.
6. **Single `main` branch.** "Min number of branches" per user direction. Atomic commits per logical unit.
7. **Don't add external services prematurely.** Resend wired in phase 7; Vercel in phase 8; pg_cron in phase 9. All emails stubbed (console.log) until phase 7. See `20 — Roadmap/Phased Roadmap.md`.
8. **Three-layer validation** (form → Zod → DB constraint) for every mutation. See `10 — Architecture/Security + Robustness.md` §1.
9. **Three-layer auth** (middleware → `requireStaff` → RLS) for every staff action. Same note §4.
10. **No PII in logs.** UUIDs only. See `Security + Robustness.md` §12.
11. **Audited-mutation tables revoke direct writes at the *grant* level, not just via RLS — `service_role` included.** For every table whose sole write path is a SECURITY DEFINER function, RLS is *not* sufficient: `service_role` has `BYPASSRLS`, so only a table-level `REVOKE` blocks it. The restriction differs by table lifecycle:
    - **Permanent append-only** (`credit_ledger`, `audit_events`): `revoke insert, update, delete … from public, anon, authenticated, service_role`. Nothing edits or deletes a permanent record; corrections are new entries.
    - **Lifecycle, definer-only** (`practitioner_licences`): `revoke insert, update … from public, anon, authenticated, service_role`, but **may retain `service_role` DELETE** for cleanup/erasure (DSR, test teardown) where the table is not a permanent ledger.
    The definer functions are unaffected — `SECURITY DEFINER` runs as the table owner, which keeps its rights. Proven by a **negative test asserting SQLSTATE `42501`** on each forbidden direct write (not a bare "an error occurred" — a partial INSERT fails on a NOT NULL column too, so only the specific `42501` distinguishes grant-denial from constraint-rejection), plus a positive round-trip for any retained grant. This class of hole was caught four times across Sprints 2/3 (D1, the anon gap, `credit_ledger` C3, `practitioner_licences`); the standing guard is `tests/rls/audited_table_writes.rls.test.ts`. Every future audited table ships with its row in that matrix. Revoking a named role is a no-op if `public`/the default ACL still holds the grant — verify with `has_table_privilege`, never by reading the migration.

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

## Project-specific notes on the user-global rules

The user-global rules in `~/.claude/CLAUDE.md` (skill-library-first, phase-completion-protocol) apply here. Eventar-specific concretions:

- **Static gates** for the phase-completion-protocol means: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build`. The vitest count + next.js route count are the running invariants; check the latest phase note for the current expected numbers.
- **Backtest** for mutation surfaces means executing the Server Action and querying the row back. **CLI `supabase db push --linked` works** — corrected 2026-08-04, after this file had claimed for a month that it was "blocked by migration history drift". The drift was reconciled in July; six migrations were pushed cleanly that day. Prefer it over MCP `apply_migration`, which assigns its own version from server time and forces a local rename afterwards, and which does NOT wrap a migration in a transaction the way `db push` does (a raw `psql -f` leaves a half-applied migration behind when a trailing assertion fails).
- **Do not assume a dev server is on port 3000.** This file previously asserted one always is; on 2026-08-04 nothing was listening there and the running server was on **:3200**, which sent a review agent chasing a phantom outage. Check with `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200) '` before using a port, and still never start a second server in the same project directory — Next 16 allows one per directory.
- **Vault note and handoff doc** are the "summary docs" the protocol says must come AFTER the three checks. Vault notes go to `/Users/ivan/Desktop/Eventar/20 — Roadmap/Phase X — *.md`; handoffs go to `docs/plans/handoff_DDMMYYYY.md`.
