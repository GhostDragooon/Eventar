# Agent brief — grant-MVP week, Steps 2 and 3 (Task 10.4 split into enforcement + data)

> **REVISED 2026-08-22.** This brief was originally written against a stale local `main`
> that was 15 commits behind `origin/main`. Those 15 commits are now merged (`1183928`,
> see the dated `PROJECT_STATE.md` entry) and already did **half of Step 2** (the staff
> check-in path) and **part of Step 3** (an unsourced placeholder pack, explicitly labelled
> provisional by its own migration header). Sections 3 and 4 below are rewritten to match
> what actually exists. **§2's environment traps still apply in full** — the concurrent
> UI-port session is still live in this tree, doing different work now (Decisions 8/9,
> already committed) than the file list originally named; the file-boundary discipline
> matters regardless of which files are currently in play.

> **REVISED 2026-08-26.** Adds §4 — `role_award_rule` enforcement inside
> `award_attendance_credit`, the code-only half of Task 10.4. It corresponds to item **A2**
> in the 2026-08-26 spec-review plan (`Eventar_Engine_Spec_Review_Summary.txt`), which
> Ivan accepted as this-week scope with an explicit off-ramp: **drop §4 if its self-check
> assertions cannot be made green quickly, and it becomes the first item of Phase B.**
> The A1 shape enrichment (`source_refs`, `pack_version_seq`, `primitive_catalogue_version`,
> `effective_from`) folds into §5's own migration — see the "A1 shape enrichment" note
> added inside §5. A3 (RFC 8785 taxonomy hash for evidence export) is NOT in this
> dispatch — it lives in Step 6, which is post-checkpoint.
>
> **Base commit for this dispatch: `1183928`** (the divergence merge). Local `main` is
> currently `ahead 4` (C5 finishes committed before the merge, `97e81b6` and predecessors)
> and carries ~78 uncommitted UI-port paths held on Ivan's hold — **do not touch any of
> them.** Work stays inside the file boundaries §2 already draws.

**Dispatch this file's contents as the subagent's prompt.** It is written to be
self-contained: an agent that reads only this file and the sources it names has
everything it needs. Do not assume the agent shares this session's context.

---

## 0. Regime, and which skills apply

**This is ongoing work in an established codebase, not new-project planning.**
Per `~/.claude/CLAUDE.md`'s skill-scoping rule, **`superpowers:*` does NOT apply** —
not `superpowers:test-driven-development`, not `executing-plans`, not
`subagent-driven-development`, not `brainstorming`. Follow this repo's own conventions
and its `CLAUDE.md` instead. Invoking a `superpowers:*` process skill here is a
misread of the regime, not diligence.

**`ponytail` is active** (session-wide). The ladder applies: does this need to exist,
is it already in the codebase, does the stdlib/platform/DB do it, can it be one line.
Its root-cause rule is load-bearing in Step 2 below — grep every caller before editing.

**Frontend classification for Step 2: MECHANICAL, not a design decision.** Surfacing a
per-body award outcome in the existing check-in roster has existing patterns to match
(`components/lifecycle/StatusPill.tsx`, the roster's existing result rendering). Match
the surrounding convention. **Do not run the five-stage frontend pipeline** — that is
for new surfaces and layouts that do not exist yet. Flag any styling judgement call in
the report instead of inventing a new visual language for it.

**Do check `ls ~/.claude/skills/` for implementation/reference skills that apply** — the
skill-library-first rule still binds. `design-system-libraries` is the relevant one if a
token question comes up; it almost certainly will not for this work.

## 1. Read before touching anything (pre-work protocol, in this order)

1. `/Users/ivan/Eventar/CLAUDE.md` — the 14-rule contract and the Hard Rules. **Rules 3
   (surgical changes), 7 (surface conflicts, do not average), 11 (convention beats
   novelty) and 12 (fail visibly, not silently) are the ones this task lives inside.**
2. `AGENTS.md` — Next 16 has breaking changes vs training data; verify Next APIs against
   `node_modules/next/dist/docs/` rather than recalling them.
3. `docs/plans/PROJECT_STATE.md` — read the top banner only (the file is ~480 lines;
   the banner is the current state, the rest is dated retrospective).
4. `docs/plans/2026-08-21-grant-mvp-work-plan.md` — the plan this brief executes. Read
   the seven decisions; they are settled and are not to be re-litigated.
5. `docs/adr/0002-multi-body-accreditation.md` — specifically the section headed
   **"R1, resolved"**. It is the authority for role→category resolution.
6. `docs/DEFERRED.md` — rows R1 (line ~80) and 74. Do not close either.
7. `docs/doctrine.md` — D.1, so you understand why no pack hash goes near the ledger.

**Vault** (`/Users/ivan/Desktop/Eventar/`) is the source of truth for design and
decisions: read `30 — Reference/Agent Working Method.md` for the review/conflict
protocol and `10 — Architecture/Security + Robustness.md` before touching validation
or logging. **You have read access only — Decision 7 forbids writing to the vault.**

## 2. Environment — the traps in this repo, all previously recorded

- **`.env.local` points at the Seoul PRODUCTION project, not a local stack.** Anything in
  `tests/cpd/` writes real, permanently-undeletable `credit_ledger` rows to production.
  **Use the local stack**: `scripts/demo/dev-local.sh` (port 3100) derives local env vars
  live from `supabase status`. Never run `pnpm test:rls` or `tests/cpd/*` against Seoul.
- **Do not assume a dev server is on port 3000.** Check first:
  `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200) '`. Next 16 allows one server
  per directory — do not start a second in the same checkout.
- **`scripts/ci/replay-and-verify.sh` permanently poisons the local database.** Its
  tamper-detection probe leaves a tampered `ci_probe` audit row with no cleanup, breaking
  the audit hash chain for good on a persistent local stack. Recorded 2026-08-21. If you
  need a clean replay, reset the stack afterwards.
- **Read the LIVE function definition from the database, never from migration text.**
  `award_attendance_credit` is redefined by at least five migrations
  (`20260724170650`, `20260725144725`, `20260815030000`, `20260815040000`,
  `20260816080000`). Use `pg_get_functiondef` against the local stack to see what
  actually runs. This repo has been burned repeatedly by reasoning from the earliest
  migration that mentions a thing.
- **Verify grants with `has_table_privilege`, never by reading the migration.** Revoking a
  named role is a no-op if `public` or the default ACL still holds the grant (Hard Rule 11).
- **Another Claude session may be live in this same working tree** doing UI-port work.
  Two agents `CREATE OR REPLACE`-ing the same SQL function destroy each other silently,
  and every static gate stays green. If you see unexpected edits to files you did not
  touch, stop and report rather than merging over them.
- New React component tests must call `afterEach(cleanup)` explicitly — this repo's
  vitest config has no `globals: true`, so RTL cleanup is not automatic.
- Prefer `supabase db push --linked` over MCP `apply_migration` (which assigns its own
  version from server time and forces a local rename). **But do not push to Seoul at all
  in this task** — see §6.

## 3. Step 2 — make silent award skips visible on the PUBLIC self-confirm path

> **Scope narrowed 2026-08-22.** The staff check-in path is already fixed on
> `origin/main` — `7ab2cfd`, `3a19b07`, `00cfc77`. Verified by reading those commits: they
> thread `awardAttendanceCredit`'s return through `app/events/[id]/checkin/actions.ts` and
> render it on the roster toast via `res.credit?.lines` / `res.credit?.allSkipped`. **Do
> not touch that path or its tests.** The remaining gap is narrower than originally
> scoped: one call site, one audience.

### The defect, already verified — do not re-derive it, but do confirm it still holds

`Task 10.8`'s C5 wizard ships a free-text category field
(`components/details/MultiBodyAccreditationWizard.tsx:80`) that sets
`event_accreditation_groups.category_code`. When that column is **not null**, the award
engine maps the registration's roles through
`accrediting_bodies.category_taxonomy #>> array['role_mappings', <role_code>]` and, on no
match, returns `skipped:no_role_match` and posts nothing. HKCP and MCHK now have a
`role_mappings` entry (`20260820090000_seed_hkcp_mchk_role_mappings.sql`, itself
explicitly provisional — see Step 3), so this is no longer universal, but every other
active body still has none.

`lib/cpd/awardAttendanceCredit.ts` returns a typed `{ bodyId, status, reason }[]`. One of
its three callers still discards that return value:

| Call site | Status, confirmed by reading `origin/main`'s merged commits |
|---|---|
| `app/events/[id]/checkin/actions.ts:70` (staff scan / manual) | **Fixed already.** Leave alone. |
| `app/(public)/checkin/confirm/actions.ts:40` (public self-confirm) | **Still discards it.** Grepped this file across all 15 merged commits — zero hits. This is the one to fix. |
| `scripts/cpd/reconcile-event.ts:121` | captures `outcomes` correctly — leave alone |

So on the public self-confirm path the outcome still reaches only the server console. That
is a **rule 12** violation ("fail visibly, not silently").

### What to build

Surface the per-body outcome to the attendee who just self-confirmed. Read
`app/events/[id]/checkin/actions.ts`'s already-merged fix first — it is the reference
pattern for what "surfacing the outcome" looks like in this codebase; match its shape
rather than inventing a new one, per rule 11 (convention beats novelty).

Non-negotiable constraints:

- **Attendance stays authoritative.** A credit skip, failure, or thrown error must never
  fail an already-committed check-in. The existing `try`/`catch` around the award call
  exists precisely for this; do not widen what it can break.
- **No PII in logs** (Hard Rule 10) — ids and enums only, never the email or the
  registration code (which is a capability token).
- **This audience is not staff.** The staff-side fix names the body and the reason
  (`skipped:no_role_match`, readable). An attendee does not need or want the engine's
  internal skip reason, or any other attendee's data — but silently telling them "checked
  in" when no credit posted is the same defect in a different costume. Decide the
  attendee-appropriate wording and **say in your report what you decided and why.**

### Tests

Behaviour, not shape (rule 9). At minimum: a category-coded group with no `role_mappings`
match produces a visible skip on the self-confirm page; the check-in itself still succeeds
in that case; a successful award still reports as issued. Assert the user-visible outcome,
not that a function was called.

## 4. Step 3a — enforce `role_award_rule` at award time (A2, Task 10.4 enforcement half)

> **New 2026-08-26.** This is the code-only half of Task 10.4/10.9. Do it BEFORE §5's
> data seed, so the pack lands into a live enforcement path rather than into a still-unused
> config key.
>
> **Off-ramp, in the brief itself.** If §4.4's self-check assertions cannot be made green
> quickly — the enforcement change to `award_attendance_credit` breaks a shipped test in
> a way that is not clearly a stale-expectation bug — **stop, drop §4, and report why.**
> A2 becomes the first item of the next dispatch. Do not weaken the assertions to force
> green (Hard Rule 9: a passing test that tests nothing useful is a failure).

### The defect — the same rule 12 shape as §3's, one layer deeper

`20260820090000_seed_hkcp_mchk_role_mappings.sql` writes
`role_award_rule: 'highest_only'` for HKCP and MCHK (lines 36 and 50). Grep across
`supabase/migrations/`, `lib/`, and `app/` — **zero read sites** outside the seed
itself (and its own rollback comment). Value written, consumed nowhere. Same rule 12
shape as §3 one layer down: policy declared, never enforced.

The seed hides the gap by construction — every role maps to a single flat category
(`'A'` for HKCP, `'passive'` for MCHK), so the tie case in ADR-0002 R1 is unreachable for
these two bodies today. It stays unreachable until a body publishes a mapping where chair
→ one category and attendee → another. §5 keeps HKCP single-role this week specifically
so the gap stays hidden. **Closing enforcement now, before that second mapping ever
ships, is what stops the next round of Task 10.4 (or the second body's onboarding) from
walking straight into an unenforced field.**

### What to build

Inside `award_attendance_credit` — read the **live** function definition via
`pg_get_functiondef` per §2, this function has been redefined by five+ migrations —
where role→category mapping resolves per body:

1. Read `role_award_rule` from `category_taxonomy` for the acting body.
2. Compute the set of satisfied `event_accreditation_groups` for the mapped categories
   (existing logic, do not change its shape).
3. Apply the rule to that set:
   - **`highest_only`** — ADR-0002 R1: "must not assume presenter outranks chair, or
     that the numerically larger credit value wins" — requires the taxonomy to publish
     its own priority. If no priority key is published and >1 category is satisfied,
     **fail closed**: `raise sqlstate 'PT002' using message = 'role_award_ambiguous'`.
     Priority published + single winner → award that group only.
   - **`cumulative`** — post one ledger row per satisfied category's winning group.
     Verify `credit_ledger_attendance_uniq`'s live shape via `pg_indexes` — grouping
     scope must not collide.
   - **`manual_selection`** — no UI exists this week. Fail closed:
     `raise sqlstate 'PT002' using message = 'role_award_requires_manual_selection'`.
4. **Missing or unrecognised `role_award_rule` value** — do not silently pick a
   policy. If exactly one category satisfied, allow (behaviour identical to today,
   so no shipped test breaks). If >1, fail closed:
   `raise sqlstate 'PT002' using message = 'role_award_rule_missing'`. Matches
   ADR-0002's "unresolved ties fail closed" posture.

Error codes: match the existing PT-series pattern in this repo — grep `raise sqlstate`
inside definer functions for surrounding style; match, do not invent.

### Migration self-check — these four are the gate

The migration ends with a rolled-back self-check transaction (same pattern as
`20260821020000`) that proves the enforcement lands, by executing the RPC and
asserting outcomes:

1. **Existing single-category body (HKCP with today's flat mapping) → still awards.**
   Assertion: `credit_ledger` row posted; no raise. Confirms A2 does not break the
   shipped path. **If this assertion fails, stop and report — that is the off-ramp
   trigger.**
2. **Fixture body with two categories mapped from different roles + no
   `role_award_rule` + registration with both roles → raises `role_award_rule_missing`.**
   Assertion: SQLSTATE `PT002`, message matches, no `credit_ledger` row.
3. **Same fixture with `role_award_rule='highest_only'` + no published priority →
   raises `role_award_ambiguous`.** Assertion: SQLSTATE `PT002`, message matches, no
   `credit_ledger` row.
4. **Same fixture with `role_award_rule='cumulative'` → posts two ledger rows.**
   Assertion: exactly two rows, one per category, both audited via the existing chain.

The self-check runs against the live function definition inside a rolled-back
transaction; no `credit_ledger` residue remains after. Follow the raw-`psql -f`
warning in Hard Rule 8: this repo's own `db push --linked` wraps the migration in a
transaction, so a trailing assertion failure rolls the whole thing back cleanly.

### Vitest coverage

Extend or add a vitest suite hitting the same four cases via the real Server Action
→ real RPC → real database. Match convention (grep `award_attendance_credit` in
`tests/` for the pattern; do not create a duplicate suite if one already exists).
Behaviour, not shape (Hard Rule 9): assert the observable ledger state or raise
code, not that a function was called.

### Boundaries specific to §4

- **No changes to `credit_ledger`'s schema, hash envelope, or grants.** Doctrine
  D.1 stays open. This work is entirely inside the award function's body.
- **No changes to `event_accreditation_groups`.** A2 is behavioural, not structural.
- **Do not invent a `priority` shape** inside `category_taxonomy`. If `highest_only`
  needs a published priority and none is present today, **fail closed** is the
  correct answer this week. Priority-publish is a taxonomy shape decision that
  belongs to ADR-0003 (spec-review Phase B, Ivan-owned outline); do not front-run
  it.
- **Do not populate `role_award_rule` for any body that does not already have it.**
  §5 keeps HKCP/MCHK's existing `'highest_only'` value in the new sourced pack; it
  does not add the field elsewhere.

### Done when

The four self-check cases pass on a clean local stack; vitest covers the same four
via the live Server Action; report the observed SQLSTATE / message / row count per
case, not just "passed".

## 5. Step 3b — replace the unsourced HKCP pack with a sourced one (Task 10.4/10.9 data half)

> **Scope changed 2026-08-22 — this is no longer a from-nothing seed.**
> `20260820090000_seed_hkcp_mchk_role_mappings.sql` (merged from `origin/main`) already
> wrote `role_mappings` for HKCP and MCHK — every role (attendee/chair/presenter) mapped to
> a single flat category (`'A'` for HKCP, `'passive'` for MCHK), plus a
> `role_award_rule: 'highest_only'` value that **nothing in the award engine reads** (grep
> confirmed zero consumption outside that migration). **Read that migration's full header
> comment before writing anything** — it says, in its own words, *"Provisional data
> only — not Task 10.4's full rule packs… safe to overwrite later when sourced packs
> land."* You are the session it is waiting for. This step **supersedes** that migration's
> data with sourced values; it does not layer on top of it.

### Sourcing — this is the part most likely to go wrong

HKCP's `cycle_config` is still a literal placeholder:
`{"_note": "provisional — per-College rule pack lands in Task 4"}`
(`supabase/migrations/20260813000000_seed_hkam_colleges_and_mchk.sql:37`). Its
`category_taxonomy` now carries the flat placeholder mapping above instead of the original
`_note` — check the *live* value in the database, not this file, before writing your
migration; a second placeholder-over-placeholder write is a wasted step.

The HKCP manual is **not in the repo** — `PROJECT_STATE.md` records that sourcing item as
open. Per Decision 1 you may seed from **what HKCP publishes openly on the web**, under
these conditions, which are not negotiable:

- **Fetch it. Do not recall it.** Every number must trace to a document you actually
  retrieved this session. This repo's precedent (the 15 HKAM Colleges, Task 10.1) is that
  rule content comes from a fetched primary source and nothing else. A plausible-looking
  point table from memory is the single worst outcome of this task.
- **Every value carries `source_url` and `fetched_at`.** Task 10.4's own spec already
  requires a citation field — this is that field, not a new invention.
- **The object carries `provisional: true`.** Task 10.4: "Packs are provisional until a
  body signs off."
- **If you cannot retrieve a defensible source for a given number, omit it and say so in
  the report.** A pack with three cited values and a named gap is worth more than one with
  eight values of unknown provenance. Do not fill gaps with inference.

### Preferred source list (Ivan, 2026-08-26)

Use these as the primary sources — do not go hunting for alternatives when these carry
the value you need:

- **Principles & Guidelines** (authoritative text — prefer for cycle rules, categories,
  overall structure):
  `https://www.hkcp.org/docs/FellowsArea/GUIDELINES%20ON%20CME%20CPD%202026-2028.pdf`
- **Operational Guidelines** (authoritative text — prefer for point tables, caps,
  activity-specific rules):
  `https://www.hkcp.org/docs/FellowsArea/CME%20Operational%20guidelines%202026-2028.pdf`
- **Landing / index** (navigation + "updated in Jan 2026" confirmation ONLY, not
  primary text — do not cite a value from here):
  `https://www.hkcp.org/hkcp/fellows/cme.html`

These are the current 2026–2028 documents — the same cycle that `cycle_config` carries.

Any additional page you pull must still satisfy this section's fetch discipline in
full: `source_url` + `fetched_at` + `source_quote` inside `source_refs[]`, with the
`covers` list naming the seeded value's jsonb path (§5 A1 enrichment). **Do not swap a
PDF citation for a landing-page paraphrase** — the landing page is a navigation
surface, not authoritative text.

### Shape

`role_mappings` must be keyed exactly as the live engine reads it —
`category_taxonomy -> 'role_mappings' ->> <role_code>` — confirmed against the live
function definition, not against this brief. Registrations with no `registration_roles`
rows default to the role `attendee` (ADR-0001's stated default), so `attendee` is the key
that matters this week.

**Attendee role only.** ADR-0002 R1 requires a per-body `role_award_rule`
(`highest_only` / `cumulative` / `manual_selection`) with unresolved ties failing closed.
**Corrected 2026-08-22 — the value now exists as data (the merged seed writes
`role_award_rule: 'highest_only'`), but nothing reads it; enforcement is still unbuilt.**
That seed avoids exposing the gap by mapping every role to the same flat category, so no
tie is ever reachable for HKCP/MCHK today. **Do not repeat that avoidance as if it were a
fix.** Mapping a second role to a genuinely different category this week would walk
straight into the same unenforced gap. Leave it, and name it in the report as the reason
multi-role stays out — the field being present now makes this easier to miss, not harder.

`cycle_config` gets HKCP's real cycle where you can source it, in the same shape its
sibling bodies already use (see `20260709240000_seed_accrediting_bodies.sql` — `PT_BOARD`
is the closest well-formed example, with `main_categories` and `sub_categories`).

### A1 shape enrichment — new required keys (2026-08-26 addition)

> Corresponds to item **A1** in the spec-review plan
> (`Eventar_Engine_Spec_Review_Summary.txt`). Same `category_taxonomy` jsonb column,
> richer shape, no new table. These values are cheap to capture now while the sources
> are open on your screen; captured later they require a re-fetch or become
> irretrievable. **They do not require the primitives catalogue migration** (that lives
> in Phase C of the spec-review plan, post-pilot).

The seeded object gains four top-level keys alongside `role_mappings`/`role_award_rule`/
`cycle_config`:

- **`pack_version_seq`** — integer starting at `1`. Increments monotonically per body
  each time a new sourced pack lands. `20260820090000`'s existing placeholder is `0`
  (implicit). This one is `1`.
- **`primitive_catalogue_version`** — integer, `0` this week (no primitives catalogue
  exists yet in the repo; recording `0` names the version explicitly so the future
  catalogue-v1 migration can identify pre-catalogue packs unambiguously).
- **`effective_from`** — ISO-8601 date. The date the sourced pack's *content* takes
  effect per the source document, **not** today's date, **not** `now()`. If the source
  document does not name an effective date, use the source document's own publication
  date and mark it in the report. This is doctrine's bitemporal separation applied
  at seed time (`docs/doctrine.md` — `valid_domain_time` vs `system_transaction_time`).
- **`source_refs`** — array of objects, one per sourced value or value cluster. Each
  carries the fields spec-review §5 names:
  ```
  {
    "source_url": "https://…",
    "fetched_at": "2026-08-26T…Z",
    "source_quote": "…",
    "source_support": "COMPLETE" | "PARTIAL" | "CONFLICTING" | "NOT_FOUND",
    "ambiguity": "NONE" | "DEFINED_TERM_MISSING" | "EXCEPTION_MAY_APPLY" |
                 "CROSS_REFERENCE_UNRESOLVED" | "TABLE_CONTEXT_INCOMPLETE" |
                 "VERSION_CONFLICT",
    "covers": ["role_mappings.attendee", "cycle_config.total_points", …]
  }
  ```
  Every seeded numeric value must be covered by at least one `source_refs` entry whose
  `covers` list names its jsonb path. **A number without a `covers` entry pointing at
  it is the same defect this brief was written to prevent** — surface it in the report,
  do not fill the gap.

`source_hash` (spec-review §5 also names this) is **deferred** — computing a stable
document-slice hash requires a canonicalisation choice that belongs to A3 / D.1, not
this dispatch. Leave the field out entirely rather than write a placeholder.

`provisional: true` (already required by Decision 1) sits alongside these, unchanged.

Migration self-check for the enrichment: after the seed lands, assert that every
`role_mappings` role and every non-null numeric in `cycle_config` is named in at least
one `source_refs[].covers` entry — a `jsonb`-path presence assertion, not a data
comparison. Fail the migration if any is unreferenced. Rolled-back self-check pattern,
same as §4's.

### Migration rules

- Self-verifying: end with assertions that **prove the seed landed by querying it back**,
  raising on mismatch. Never read the result back from the migration's own text. Every
  recent migration in this repo does this — copy the pattern from
  `20260813000000_seed_hkam_colleges_and_mchk.sql`.
- Include the commented rollback block, same as its siblings.
- **Do not disturb existing invariants.** `20260813000000_seed_hkam_colleges_and_mchk.sql`
  asserts exactly **22 `organisation_body_authorisations` rows** against active bodies. If
  your change moves that number, you have done something wrong.
- **Write a new migration, timestamped after `20260821020000`** (the latest existing one)
  — do not edit `20260820090000` in place. This repo's migrations are applied history;
  superseding a value means a new migration that overwrites it, with its own self-check,
  not a rewrite of an already-merged file.
- No new table. Rule packs live in the existing `category_taxonomy` jsonb (ADR-0002 R1:
  "No versioned `accreditation_packs` table for MVP"), and **nothing config-referencing
  goes into `credit_ledger`** (doctrine D.1, Decision 2).
- If any audited table is touched, the audit insert is the **last statement before
  commit** (the chain trigger holds `pg_advisory_xact_lock` until commit).

### Done when

A check-in at an HKCP-accredited event whose group carries a category code resolves
through a **sourced** mapping (not the flat `'A'`/`'highest_only'` placeholder) and posts a
real `credit_ledger` row — proven by executing the check-in and querying the row back, not
by a unit test alone. Every seeded value has a `source_url` and `fetched_at` you can point
to; anything you could not source is named as a gap, not filled in.

## 6. Gates and backtest

Run all four, on the **local** stack:

```
pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build
```

plus `pnpm test:rls` (local stack only — see §2).

**Record the actual numbers you observe; do not assume the baseline.** For reference, the
2026-08-22 divergence-merge session ran all five gates against the just-verified local
stack (checked via `docker ps`, not just `supabase status` text) immediately after
resolving the merge, before any Step 2/3 work: tsc clean · eslint 0 errors / 10
pre-existing warnings · `test:rls` 201/201 across 26 files · vitest 761 passed / 238
skipped across 170 files · `next build` clean, 26 routes. The UI-port session is still
live with its own uncommitted work in this tree, so treat those numbers as orientation for
what a clean run looks like, not a target to force your output to match exactly.

**Backtest, not just tests.** For the mutation surface: execute the real check-in Server
Action against the local stack and query `credit_ledger` back. A passing unit test that
mocks the award away proves nothing about this change.

## 7. Hard boundaries — do not cross these

- **Commit nothing.** Work is held pending Ivan's go-ahead. (C5 and the `origin/main`
  merge are both already committed, independently of this dispatch — that is settled
  history you build on top of, not something you need to handle.)
- **Do not push to Seoul.** No `supabase db push --linked`, no MCP `apply_migration`
  against the remote. Apply locally, report, stop.
- **Do not write to the vault** (`/Users/ivan/Desktop/Eventar/`) and **do not create
  `docs/adr/0003-*`** — Decision 7. Read-only on canonical decision records.
- **Do not renumber anything.** Dwell stays inside Task 10.5/10.9 (Decision 6). Stage 10's
  denominator stays `/10.9`.
- **Do not adopt `P0`–`P3` or `Layer 0–4` vocabulary** from the archived source documents.
  Repo terms only: Stage, Task `<stage>.<item>`.
- **Do not close DEFERRED 74 or R1.** Both stay open by decision.
- **Do not proceed to Steps 4–7** (provisional badge, α gate, evidence export, pilot
  infra). Stop at the checkpoint.
- **Do not self-review as a substitute for the phase-completion protocol.** Your own
  review of your own work is not one of the three checks.

## 8. Report back

Written report, and in it:

- **Separate what you verified by execution from what rests on docs or inference.** Mark
  each claim. This repo has a recorded instance of three safety claims asserted from
  reading only the code that *consumed* a value, never the code that *produced* it — one
  reached Ivan as a guarantee and was false.
- Every number you seeded, with its source URL and fetch date, and every number you could
  **not** source.
- The exact gate output you observed.
- What the backtest did and what it returned.
- Anything you found that is out of scope — name it, do not fix it.
- Any conflict between two parts of the codebase or two documents: **surface it, do not
  average it** (rule 7). Bring the investigated case, not the raw finding (rule 14).

---

## After the checkpoint (not part of this dispatch)

Steps 2, 3a (§4) and 3b (§5) land as a unit Ivan will read. When they are presented as done, the
phase-completion protocol runs — and its three checks are **separate agents**, never the
implementing one:

1. **Dev-lens review** — a second agent: correctness, security, race conditions,
   project-rule compliance, consistency with existing patterns. Reads the diff and the
   changed files in full, runs the gates independently.
2. **User-lens review** — a **third** agent, never the same one: cold-start journey
   through the real UI against the local stack. Does an organiser who fills in the
   category box now understand what happened? Does an attendee?
3. **Backtest** — end to end against the real local database, not mocks.

The two review lenses must stay separate agents. The defect Step 2 fixes is exactly the
kind that lives on the boundary between them: the dev lens sees a function returning a
correct value, the user lens sees a screen that says nothing.
