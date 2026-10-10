<!--
SYNC IMPACT REPORT
Version change: (blank template) -> 1.0.0-draft
Status: DRAFT for Ivan's review. Not ratified; not committed.

Provenance: distilled ONLY from CLAUDE.md (14 rules, Hard Rules, pivot-era rules, source-of-truth
and project notes), AGENTS.md (Next 16 caveat, UI porting contract), docs/architecture/
BLOCK-ARCHITECTURE.md (admission checklist) and the vault Frontend Design Standard (Q32).
The audience-identity sentence in Principle I is cited to docs/plans/PROJECT_STATE.md, which
CLAUDE.md names as the carrier of active-phase constraints. Nothing here is new policy.

Modified principles: none (template had placeholders only).
Added: Core Principles I-X; Additional Constraints; Development Workflow & Quality Gates; Governance.
Removed: template example comments.

Templates:
  - .specify/templates/plan-template.md  -> updated (Constitution Check now states the pass format)
  - .specify/templates/tasks-template.md -> updated (constitution-driven task types listed)
  - .specify/templates/spec-template.md  -> no change needed (no constitution coupling)
  - .claude/skills/speckit-*/SKILL.md    -> read for stale references: generic, no change

Deferred / follow-up:
  - TODO(RATIFICATION_DATE): set when Ivan signs off; version then becomes 1.0.0.
  - docs/doctrine.md (doctrine D.1) was outside the named sources and is not distilled here.
-->

# Eventar Constitution

> **Authority.** `CLAUDE.md` is the authority for this repository. This constitution distils its
> gates so that spec-kit's specify / plan / tasks / analyze steps check the right things. Where the
> two ever disagree, `CLAUDE.md` wins and this file is amended in the same change.
> Each principle names its source and ends with the question a plan review must be able to answer.

## Core Principles

### I. Two Audiences, Never Crossed

Every surface, route, navigation item, redirect and call to action belongs to exactly one
audience: organiser/staff or attendee/practitioner. A navigation item or redirect MUST NOT cross
that boundary. Each audience has its own door, its own home, and its own shell. Organisers have no
attendee identity: a staff session MUST NOT accumulate practitioner data under a staff UUID.
The two events lists (public directory, organiser list) are not interchangeable.

*Why:* crossing the boundary produced a whole class of past bugs (a staff sidebar link that ejected
the user into the public shell; a signed-in organiser funnelled into the practitioner wizard).
*Authority:* Frontend Design Standard §3 (Q32); PROJECT_STATE audience table.
**Plan-review check:** for every new route or link, which audience, which shell, which door, and
does any link or redirect leave that audience?

### II. Block Architecture Admission

Every new feature, table, or module MUST slot into the block map (kernel K1-K3, domain blocks,
surfaces) and pass the six-question admission checklist before any code is written: owning block;
audited writes and RLS reads only; dependency direction respected; kill/rollback story;
re-entry criterion for any partial ship; on the current milestone's critical path. Work that does
not fit a block is a flagged decision first, never code. Kernel changes are constitutional
(Decisions Log entry plus Ivan's sign-off). External services are not added prematurely.

*Authority:* CLAUDE.md pivot-era rule "Block architecture guardrail" and Hard Rule 7;
`docs/architecture/BLOCK-ARCHITECTURE.md`.
**Plan-review check:** which block owns this, and are all six admission answers written down?

### III. The Database Is the Authority

Row Level Security MUST be enabled on every table. Every new domain table MUST carry
`organisation_id` plus RLS. Tables whose sole write path is a SECURITY DEFINER function MUST
revoke direct writes at the GRANT level for every role including `service_role` (RLS alone does
not bind `BYPASSRLS` roles); permanent append-only tables allow no edits at all, lifecycle
definer-only tables may retain `service_role` DELETE for cleanup. Each such table ships a
negative test asserting SQLSTATE `42501` and a row in the audited-writes matrix, and its grant
posture is verified with `has_table_privilege`, never by reading the migration. Any transaction
that writes `audit_events` emits the audit event as the LAST statement before commit. Staff and
user identity is keyed on the auth UUID, never on email.

*Authority:* Hard Rules 1, 5, 11; pivot-era rules "Audit insert last" and "Multi-tenancy".
**Plan-review check:** for each table or function touched: RLS policies, grant posture, the 42501
test, and where the audit insert sits in the transaction.

### IV. Server-Side Trust Boundaries

`requireStaff()` MUST be the first call of every staff Server Action; the staff-route gate is
`proxy.ts` (not `middleware.ts`). Every mutation validates in three layers (form, Zod, database
constraint) and authorises in three layers (proxy, `requireStaff`, RLS). The service-role key
lives only in `lib/supabase/admin.ts` behind `'server-only'`. Public writes are Server Actions
using the service-role client inside the action; `/api/*` is reserved for cron callbacks and
external integration. The `email_log` row is inserted BEFORE the email is sent. Logs carry UUIDs,
never PII. Secrets never appear in code, commits, vault notes, or chat.

*Authority:* Hard Rules 2, 3, 4, 5, 8, 9, 10; Secrets section.
**Plan-review check:** name the three validation layers and three auth layers of each mutation;
confirm no new service-role import outside `lib/supabase/admin.ts`.

### V. Measurement, Not Inference, Drives Automation

Automation MUST act only on deterministic measurements (rate limits, Turnstile, OTP failure
counts). Inference signals (behavioural classification) produce flags for humans and never trigger
automatic action. There is no IP-level enforcement on authenticated routes. Retry policies,
routing, and escalation thresholds belong in deterministic code, not in a model.

*Authority:* pivot-era rule "Measurement vs inference"; Coding Behavior Contract rule 5.
**Plan-review check:** for each automated action, which measurement triggers it?

### VI. Fail Visibly

Every skipped record, rolled-back transaction, and constraint violation MUST be surfaced. The
system MUST NOT report success when something was bypassed. Service-dependent success MUST come
from a real result contract, never an arbitrary timer.

*Authority:* Coding Behavior Contract rule 12; AGENTS.md UI contract rule 12.
**Plan-review check:** for each failure path, what does the user or operator see?

### VII. Surgical, Convention-First Change

Write the minimum code that solves the problem: no speculative features, no abstraction for a
single use. Touch only what is asked, and read the adjacent code first. In an established
codebase, match the existing pattern even when a "better" one exists, and reuse production
primitives before creating a shared component. Conflicts between parts of the codebase are
surfaced and decided, never averaged. Work lands on the single `main` branch in atomic commits,
one logical unit each.

*Authority:* Coding Behavior Contract rules 2, 3, 7, 8, 11; Hard Rule 6; AGENTS.md rule 11.
**Plan-review check:** which files does the plan touch, why is each necessary, and is any new
abstraction justified in Complexity Tracking?

### VIII. Colour and Meaning Come From Tokens

The colour source of truth is `app/globals.css`. Components MUST NOT contain hexadecimal, RGB,
HSL or named colours, and MUST NOT introduce new colour custom properties. A brand colour is
either a FILL or an INK, never both: `bg-primary text-on-primary` for fills, `text-primary-ink`
for small primary text. One colour, one meaning: green is live, verified, or good standing, and
primary blue MUST NOT mean verified, approved, complete, or successful. Dark mode works through
existing tokens only. Contrast is computed against the actual ground in both themes, never
quoted. Run `pnpm check:ui-colours` and `pnpm check:ui-primitives` and report no new violations.

*Authority:* AGENTS.md UI porting contract (rules 2-9, 13); Frontend Design Standard §1, §2, §5.
**Plan-review check:** which tokens does each new element use, and does any state colour reuse a
meaning that belongs to another state?

### IX. Shell Chrome Is Shared and Honest

The wordmark comes from one definition (`components/shell/BrandMark.tsx`), never hand-copied.
Staff navigation is a left sidebar; areas that are not built yet render visible but inert with a
`Soon` chip using `aria-disabled`, not a disabled `<button>`.

*Authority:* Frontend Design Standard §4.
**Plan-review check:** does any new shell or navigation reuse the shared definitions and the
inert-`Soon` convention?

### X. Verify Framework APIs Against the Installed Docs

This repository runs a Next.js whose APIs and conventions differ from common training data.
Before writing Next-specific code (proxy, redirects, cookies, Server Actions, route handlers,
caching), read the relevant guide under `node_modules/next/dist/docs/` and heed deprecation
notices. Where vault notes assumed an older Next version, the installed version's docs win.

*Authority:* AGENTS.md; CLAUDE.md ("What this repo is" and Hard Rule 3).
**Plan-review check:** which installed doc was consulted for each framework API the plan uses?

## Additional Constraints

- **Stack:** Next.js 16 (App Router), Tailwind v4, Supabase (Postgres, Auth, RLS), Resend. Email is
  stubbed unless `RESEND_API_KEY` is set; that switch is not a phase gate.
- **Environments:** `.env.local` points at the Seoul PRODUCTION project. `pnpm test:rls` and
  everything under `tests/cpd/` write to it (and post permanently undeletable ledger rows) unless
  pointed at the local stack. Use the local stack, or `scripts/demo/dev-local.sh` (port 3100).
  Prefer `supabase db push --linked` over MCP `apply_migration` for migrations. Never deploy by
  momentum: a deploy needs an explicit go decision.
- **Source of truth:** the Obsidian vault holds design, architecture and decisions. Read the
  relevant vault notes before implementing, and flag any decision not in the Decisions Log.
- **Vocabulary:** roadmap vocabulary is Stage 1-13 only (`docs/plans/STAGES.md`).

## Development Workflow & Quality Gates

- **Static gates**, in this order: `pnpm exec tsc --noEmit`, `pnpm exec eslint .`,
  `pnpm exec vitest run`, `pnpm exec next build`, plus the two UI checks in Principle VIII.
- **Tests** are required and must check behaviour; a passing test that tests nothing is a failure.
  Mutation surfaces are backtested by executing the write and reading the state back.
- **Phase completion** follows the user-global protocol: dev-lens review, then a separate
  user-lens review, then a backtest against real systems. Summary docs (vault note, handoff) are
  written after those checks pass, never before.
- **Working agreements:** state assumptions and ask before guessing; hard token budgets (stop and
  ask when trending past); checkpoint after every significant step of long work; treat work
  outside the active phase as a forward-looking constraint, not consent to switch tasks; when a
  bug or finding surfaces, investigate its validity, extent and fix before escalating, and mark
  what was verified by execution versus inferred.

## Governance

- **Supremacy.** `CLAUDE.md` outranks this constitution (see the Authority note). Changes to a
  source document that alter a principle MUST be mirrored here in the same change.
- **Amendment.** Changing the substance of a principle requires Ivan's sign-off and a Decisions
  Log entry. Wording clarifications do not.
- **Versioning.** MAJOR: a principle removed or redefined incompatibly. MINOR: a principle or
  section added or materially expanded. PATCH: clarification only.
- **Compliance.** Every plan carries a Constitution Check: each principle's plan-review check is
  answered with evidence. A violation is allowed only with an entry in Complexity Tracking that
  names the simpler alternative and why it was rejected. The phase-completion dev-lens review
  re-verifies compliance against the diff.

**Version**: 1.0.0-draft | **Ratified**: TODO(RATIFICATION_DATE): pending Ivan's sign-off | **Last Amended**: 2026-10-01
