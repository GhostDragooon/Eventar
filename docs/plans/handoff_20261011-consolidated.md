# Consolidated handoff, 2026-10-11: where Eventar stands, what is open, and the build plan

**This is the entry point.** It replaces, as the place to start, the open-item sections of six handoffs: `handoff_20261001-core-ux.md` (§6, §7.8, §8.6), `handoff_20261009-session-end.md` (§0), `handoff_20261009-cross-org-scope.md` (§4–5), `handoff_20261010-dsr-org-scope.md` (§6), `handoff_20261010-cross-org-read-scope.md` (§6) and `handoff_20261011-truncate-trigger-revoke.md` (§6–7). Those files remain the evidence records. Every open item from them is either listed below or marked resolved. Handoffs dated 2026-09-25 and earlier are history: their open items were carried into the 2026-10-01 core-UX plan (`~/.claude/plans/pasted-content-id-c1b3-eventar-buzzing-pretzel.md`) and into `handoff_20261001-core-ux.md` [R].

Evidence tags: **[X]** executed this session, **[R]** read in code, a handoff or the catalog, **[I]** inferred.

## 0. If you read one thing

- **Everything finished is committed on `main` and pushed** (§1.1): P2a (with your B2 partial drop of the Codex pass) and four security changes (Q42, Q43, Q44 PROPOSED, plus the 10-09 staff-page scoping). Nothing of substance is uncommitted except your own stray files (§1.1).
- **Seoul is six migrations behind and unreadable** (`28P01`). Your steps, in order, are §4: fix the DB password, run the read-only `get_org_participants` exposure check (and its one-line revoke if exposed), the TRUNCATE pre-flight, then `supabase db push --linked`.
- **Decisions that unblock building:** the MVP execution plan's §9 (seven calls, recommendations given), then §3 A3 (rule text, locking Q44).
- **Next:** the MVP execution plan ([`2026-10-11-mvp-execution-plan.md`](2026-10-11-mvp-execution-plan.md)): three lanes (Claude-DB, Claude-UX, Codex) working task cards in parallel toward your 16 MVP requirements in 7–14 days. Paste its §7.0 prompt with a card ID to start an agent.

## 1. State

### 1.1 Git

Committed today on `main` (each on a temporary index because the index is shared; mixed files split by hunk; every stack verified in a clean worktree, §7):

| Commit | What |
|---|---|
| `9d734e5` | `--primary-ink` in the system-dark block + `app/globals.test.ts` parity test (a peer's fix, uncommitted since 2026-10-02) |
| `44c86de` | DSR/erasure authority (Q42) |
| `db4062b` | Cross-organisation reads (Q43) |
| `66c243d` | Erasure runbook, DEFERRED and role inventory for Q42/Q43 |
| `888b5be` | API-role TRUNCATE/TRIGGER (Q44) |
| `5f0ba5a` | Your `CLAUDE.md` trim |
| `190c455` | Ignore `.playwright-mcp/` |
| `06176a6` | Specs 001–003, spec-kit constitution and templates, G1 plan |
| `e80d4bb` | P2a, honest create → publish (B2) |
| `docs(state): consolidate …` (the commit that adds this file) | This handoff, PROJECT_STATE, superseded banners on the six handoffs |
| `chore(graph): …` (the next commit) | Knowledge graph refresh (§6) |

`main` was pushed to `origin` after these commits (Ivan, 2026-10-11). Nothing here pushes to any database.

**Left uncommitted on purpose (yours; Ivan, 2026-10-11):**
- the `AGENTS.md` stub ("Imported Claude Cowork project instructions: business development, feasibility, opex, business setup"), which looks unrelated to this repo;
- `.mcp.json` and `.codex/config.toml`, both adding a `supabase` MCP server whose URL is `https://supabase.com` (the website, not an MCP endpoint);
- `.codex/` and `.agents/` (Codex's copies of the speckit skills);
- `supabase/snippets/Untitled query 835.sql` (a dashboard snippet).

`.playwright-mcp/` is now ignored (`190c455`). Other worktrees exist (`/Users/ivan/Eventar-demo`, four under `.claude/worktrees/`). None was touched.

### 1.2 Databases

- **Local stack** (API 54321, DB 54322, Mailpit 54324) has every migration in the repo applied. That includes the six not yet on Seoul; no rollback was needed, because B2 kept `20261002010000` (§2).
- **Seoul** (`ap-northeast-2`, not the canonical prod) was in lockstep at 141 migrations through `20260924000000` on 2026-09-25 [R: `8912d96`]. **Six committed migrations are waiting** (§4). The Supabase MCP and CLI credentials for Seoul fail with `28P01` [R: three handoffs], so nobody has read Seoul since 2026-09-25. **Singapore (canonical prod) is still unprovisioned.**

### 1.3 Other sessions

The three sessions whose work was committed today are idle: "Fix cross-tenant DSR functions" [dea746], "Scope the is_manager() read policies" [27d751] and "Revoke TRUNCATE on append-only audit tables" [544fdb]. **Their handoffs' "nothing committed" lines are now stale**: if you return to one of them, tell it the work is in `44c86de` / `db4062b` / `66c243d` / `888b5be` so it does not commit again. `ivan-d3` [52c610] is waiting, scope unknown. The local stack and ports 3100/3200 are shared: run `ListAgents` before RLS suites or a dev server, and never `supabase db reset`.

## 2. What shipped since the Stage 10 close-out (2026-09-17)

| Dates | Work | Commits | Record |
|---|---|---|---|
| 09-19 | Practitioner Eventar record (`/account/record`); two status-contradiction BLOCKERs; three check-in failure modes; nav wrap; sign-in destination | `f9146e7` `9492fbd` `6966748` `428c23a` `dd1cf30` | `handoff_20260919-*.md` |
| 09-23 → 25 | Two-persona funnels and Q32 audience-boundary hardening; `?next=` through staff `/login`; hero CTA reversal. Seoul push of three migrations | `d8ac14b` `3a8c279` `e6c2dc0` `d66daa8` `8912d96` | `handoff_23092026.md`, `handoff_20260925-two-persona-review.md` |
| 10-01 | Core-UX validation baseline; design round D0 (direction C, off-white page, white cards: vault **Q41**) | `07cfead` | `handoff_20261001-core-ux.md` §1–6 |
| 10-02 | **Band 1, the two-portal wall** (door classifier, session-aware `/login`, invites through the organiser door, staff never attached to a registration, open-redirect fix at six sinks, PostgREST stale-token retry) | `89910b0` (pushed) | same, §7 |
| 10-09 | Cross-organisation staff pickers and per-event analytics/details gated; `get_org_participants` service-role-only | `ea5a6a7` `c8a0d77` | `handoff_20261009-cross-org-scope.md` |
| 10-02 → 09 | **P2a, honest create → publish** (Band 2, Lane B) | `e80d4bb` | `handoff_20261001-core-ux.md` §8 |
| 10-10 | Erasure platform-only; DSR handling scoped to the subject's organisation; DSR table read-only for app roles (vault **Q42**) | `44c86de` | `handoff_20261010-dsr-org-scope.md` |
| 10-10 | Cross-organisation reads closed on people's data, the audit log and staff; `is_manager()` dropped (vault **Q43**) | `db4062b`, docs `66c243d` | `handoff_20261010-cross-org-read-scope.md` |
| 10-11 | API roles hold no TRUNCATE or TRIGGER on any `public` table (vault **Q44, PROPOSED**) | `888b5be` | `handoff_20261011-truncate-trigger-revoke.md` |
| 10-11 | `--primary-ink` in the system-dark block (G1 was blocked on it); specs 001–003, spec-kit constitution, G1 plan; CLAUDE.md trim | `9d734e5` `06176a6` `5f0ba5a` | this file |

### 2.1 P2a and its second pass (decided 2026-10-11)

- **Who wrote the second pass.** Ivan's own Codex Desktop session on 2026-10-02 (`~/.codex/sessions/2026/10/02/rollout-2026-10-02T17-22-11-01a0fbeb-…jsonl`), told to carry out Claude's plan; the handoffs had called it unattributed. Two phases (17:49–18:57 and 23:10–23:51 HKT), 41 applied patches over 12 files, plus `supabase migration up --local`. Reconstructed byte-exactly against Claude's file history and today's tree [X].
- **Ivan's call, asked twice** (the first question understated the extent): **B2.** Kept: migration `20261002010000` (publish only an active draft), the accreditation gating by role, the 22023 message. Dropped (+101/−532 over 8 files): the unconfirmed-write heuristic, the `saved{}` contract, the result blocks and duplicate-create guard, the three-way 42501 split, Codex's error-page copy and logging. What that leaves open is C9.
- **Reviewed after the drop**, separate agents: **dev-lens** no blocker, no major (three test-honesty fixes applied, one mutation-checked); **user-lens** live on `:3100`, no blocker: MAJOR crash-page exit fixed at Ivan's call (Manage), MAJOR multi-body wizard gate scheduled as card CX-05 of the MVP plan (Ivan), MINORs in C10. Full dispositions: `handoff_20261001-core-ux.md` §8.7.

## 3. Decisions waiting for you (deduplicated; recommendation first)

**A. Needed before the next build step**

| # | Decision | Recommendation | Source |
|---|---|---|---|
| A1 | **The MVP execution plan's §9 (M1–M7):** lanes, P3 without P5, P6 as a stretch, security backlog after the MVP, commit rights, review cadence, Seoul timing. Your revised MVP definition already answers the old "pilot cut-line" question. | Approve as recommended there. | MVP plan §9 |
| A2 | **P5's day boundaries** (not needed for the MVP; P5 is deferred): (a) how a day's own start and end are defined; (b) which time zone organisers type times in. | (a) the event's time of day on every day (spec 003 default). (b) the event's zone (what the vault says); the shipped form uses the browser's zone, so the form changes. Decide before P5 starts. | session-end D10 |
| A3 | **Rule text** for repo `CLAUDE.md`: the TRUNCATE/TRIGGER bullet for Hard Rule 11 and the tenant-read rule ("a policy exposing tenant data must be row-aware; an organisation's access to person data or the audit log is a service_role-only, column-limited function"). Q44 is in the vault as PROPOSED. | Approve both texts as drafted (truncate handoff §10; cross-org-read handoff §6 item 5) and lock Q44 with its default scope (every `public` table). | truncate D1/D2, cross-org-read §6.5 |

**B. Security follow-ups** (all pre-existing; none reachable by a stranger today unless stated; all should close before real PII lands in Singapore)

| # | Item | Recommendation | Source |
|---|---|---|---|
| B1 | DSR processing is still keyed on a link an organisation can plant (guest-register a stranger's email, wait for their "Claim past events", then read their request notes and complete or reject non-erasure requests). | Make complete/reject platform-only for every request type now (one condition); fix registration provenance when the claim flow is redesigned. | DSR §6a |
| B2 | Veto check: only platform staff can complete or reject an erasure request (applied without a question). | Keep. | DSR §2.3 / §6c |
| B3 | A person with staff rows in two organisations cannot sign in (`maybeSingle()` → PGRST116 shown as an outage). | Log PGRST116 and say why now; choose later between enforcing one organisation and an organisation switcher (kernel K1). | cross-org-read §6.2 |
| B4 | A blank email on an active `staff` row would satisfy the email-keyed helpers. | Add `check (email <> '')` on `staff`. | cross-org-read §6.3 |
| B5 | Definer-grant hygiene: `compute_accreditation_credit`, `verify_evidence_chain` (no app callers), `bulk_update_event_status` (caller-supplied actor written to `audit_events`: audit forgery inside one's own organisation), `create_event_with_blocks` PUBLIC/anon EXECUTE. | One migration, after the MVP and before Stage 8 (MVP plan §6). | cross-org-scope §5, session-end D4 |
| B6 | Nine RPCs still gate on `created_by`; soft-deleted published events stay publicly readable; `walkInRegisterAndCheckIn` reveals lifecycle before its gate (collides with P3); `event_registration_eligibility` raises 42501 for any teammate who is not the creator (the roster then says "couldn't be checked just now"). | MVP plan DB-03 (teammates, soft-deleted events) and DB-02 (the walk-in gate). | session-end D18, cross-org-read §6.7 |
| B7 | Seed drift: after `supabase/seed.sql`, `invite_tokens`, `credit_disputes` and `professions` regain DML their migrations revoked, so local RLS runs see more than hosted. | MVP plan DB-01 (extend the seed's re-assert block; audit the other controlled lists). | truncate §9 |
| B8 | CI replay does not run `test:rls`, so a future `grant all` is caught only locally. | MVP plan DB-01 adds the TRUNCATE/TRIGGER assertion to `scripts/ci/replay-and-verify.sh`. Leave the owner-tier trigger, MAINTAIN/REFERENCES, the harness-in-repo and a third review at their defaults (not done). | truncate D5, D7, D8, D10, D11 |

**C. Frontend and product**

| # | Item | Recommendation | Source |
|---|---|---|---|
| C1 | `cn()` / tailwind-merge drops text colours next to `text-label-md`: 15 of 32 type-scaled buttons render dark text on blue (3.82:1). Root fix proven in node, not applied. | MVP plan CX-03 (`extendTailwindMerge` in `lib/utils.ts`); three spots outside P2a change size. | session-end D3 |
| C2 | Lane C design-round order. | MVP plan UX-01 covers publish and roster vs check-in; P10 (form, agenda modal, day timeline) and P9b (published-edit locks) after the MVP. | session-end D11 |
| C3 | What a signed-in organiser sees for someone else's event (attendee 404 with a "Sign in" pill). | A design round of its own (Q32 boundary). | session-end D13 |
| C4 | A read-only role handing a draft to an admin. | After the MVP; CX-04 puts drafts on Programme, which makes the link findable meanwhile. | session-end D5 |
| C5 | The crash page cannot keep the organiser sidebar. | Accept; the real fix is a layout above the pages (P7b). | session-end D7 |
| C6 | `peek_invite_token` (a dead invite is found only after sign-in). | After the MVP (MVP plan §6). | core-UX §7.8.4 |
| C7 | Guest-email widening of D3; the organiser/organizer spelling sweep. | After the MVP; the sweep when copy is next touched (D14: no em-dashes in new copy). | session-end D9 |
| C8 | Roster: literal "✓" in the checked-in cell, no live update (E4); Team page shows a member only themself with no hint; operator's Participants page is empty; an invited teammate's `full_name` is null. | MVP plan UX-04 (roster) and CX-04; the Team hint after the MVP. | cross-org-read §6.7, core-UX §6 |
| C9 | Consequences of dropping the unconfirmed-write machinery (B2, §2): a create whose reply is lost re-enables the buttons, so a duplicate (possibly live) event is one click away; a partial success leaves Save draft and Publish enabled; a 42501 from the insert or the organisation check reads as a role refusal when publishing, and a failed draft create shows the raw database message with nothing logged; comments say "the role changed after the page loaded" for refusals `requireStaff` already re-checks; the public crash copy says "Your data is safe" (unverifiable) and the client breadcrumb logs `error.message` when there is no digest. The organiser crash page exits to Manage ("Check drafts and events"), Ivan 2026-10-11, until P7a. | Fix duplicates deterministically, not with the dropped heuristic: a client-generated request id passed to `create_event_with_blocks` and unique per organisation, so a retry returns the first event. Build it with P2b (same flow). Fold the copy, the raw-message branch (generic copy plus `console.error` with the code only), the comments and the breadcrumb into the same package. Detail: `handoff_20261001-core-ux.md` §8.7. | core-UX §8.7, post-drop reviews |
| C10 | P2a user-lens MINORs: no confirmation after publish or save (P2b); a stale-page publish refusal leaves the DRAFT badge and button live (P2b); the one-way warning has no `aria-describedby` (P2b); the post-publish page tells an organiser_admin to "ask an admin" (P9b); phone tab order vs visual order on the action row, unlabelled inputs, one-at-a-time validation (P10). | Into the packages named; detail in `handoff_20261001-core-ux.md` §8.7. | core-UX §8.7 |

**D. Housekeeping**

| # | Item | Recommendation |
|---|---|---|
| D1 | Does `mattpocock-skills:*` follow the "new project only" scoping of `superpowers:*`? | Rule on it; until then sessions do not use it. |
| D2 | Your uncommitted files (§1.1). | Revert the AGENTS.md stub and the two `supabase` MCP entries, or say what they are for. |
| D3 | Three stale-fixture RLS files (`tests/audit/licence_mutations.test.ts`, `tests/rls/mark_attended.rls.test.ts`, `tests/rls/checkin_throughput.rls.test.ts`). | MVP plan CX-01 (fix the helper rather than hand-clearing fixtures). |
| D4 | `.github/workflows/cron-dispatch.yml` (added 2026-09-13) calls `$SITE_URL/api/cron/dispatch` every 5 minutes, but nothing is deployed: all 156 scheduled runs to 2026-10-10 failed [X: `gh run list`]. DEFERRED and BLOCK-ARCHITECTURE still said "no trigger"; both corrected today. | Disable it until Stage 8 (`gh workflow disable cron-dispatch.yml`; your GitHub setting, not done), then set `SITE_URL`/`CRON_SECRET` for the Stage 8 host and watch a green tick. |

**Resolved today:** keep/drop the P2a second pass (partly dropped: B2, §2), the organiser crash-page exit (Manage until P7a), when to gate the multi-body wizard (CX-05), the P2a commit plan, the owner of the `--primary-ink` fix (committed), the DSR cross-tenant functions (Q42), your `CLAUDE.md` edit (committed), graphify refresh (done, §6).

## 4. Actions only you can take, in order

1. **Fix the Seoul DB password** the CLI and MCP use (`28P01`), then `supabase migration list --linked`. Nobody can read Seoul until this works.
2. **Exposure check, read-only, now** (SQL editor): `select p.prosecdef, has_function_privilege('authenticated', p.oid, 'execute'), has_function_privilege('anon', p.oid, 'execute') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_org_participants';` If `authenticated` can execute, run `revoke execute on function public.get_org_participants(uuid) from anon, authenticated, public;` immediately (idempotent; a plain attendee account could read another organisation's registrants).
3. **Pre-flight** the TRUNCATE/TRIGGER migration: the three queries in `handoff_20261011-truncate-trigger-revoke.md` §7.3 must each return zero rows.
4. **`supabase db push --linked`.** Pending, in order: `20261002000000` (P2a), `20261002010000` (P2a, publish only an active draft), `20261009011823` (`get_org_participants`), `20261010000725` (Q42), `20261010083221` (Q43, needs the previous one), `20261010175112` (Q44). One push applies all of them in one transaction each; `20261010083221` drops `is_manager()` with no CASCADE, so a hosted-only dependent makes that one fail and stop the push (by design). Post-push checks: truncate handoff §7.3 (expect `0`) and cross-org-read handoff §8.
5. Read-only counts that size later work: occurrence staleness for P5 (`handoff_20261001-core-ux.md` §6) and Seoul's PostgREST version (below 14.18 decides whether `proxy.ts` gets the one-line stale-token retry).
6. `/review-animations` on the D0 specimens (artifact v6), reserved to you since 2026-10-01.

## 5. The plan to continue building

**The build plan is [`2026-10-11-mvp-execution-plan.md`](2026-10-11-mvp-execution-plan.md)** (PROPOSED; Ivan approves its §9 before Day 1). It turns Ivan's revised MVP definition (both portals pass the intuitive test; 16 requirements O1–O9 and A1–A7) into lanes and task cards for other agents: **Claude-DB** (all SQL, serial: DB-01 seed drift and CI → DB-02 P3 check-in window → DB-03 teammates → DB-04 P4 agenda saves → DB-05 P6 stretch), **Claude-UX** (Ivan's locked pipeline: UX-01 design round for publish, roster vs check-in and save confirmation → UX-03 P2b-lite → UX-02 P1b practitioner shell → UX-04 P8-lite), **Codex** (mechanical: CX-01 test harness and lint → CX-05 wizard role gate → CX-06a practitioner funnel → CX-03 `cn()` → CX-04 Programme drafts and links → CX-07 two-organisation sign-in → CX-06b chrome fixes), with reviews at milestones (Day 5, Days 10–11, final) and a scripted acceptance walk (its §8). Every agent follows its §4 contract. Target 7–14 working days.

**After the MVP, in this order:** the rest of the security backlog (§3 B1–B5, B8) before any real PII; the Stage 8 dress rehearsal (Singapore, replay from zero, hosting, Resend, Turnstile, privacy notice, the cron target in D4); the idempotency key against duplicate creates (C9); then the deferred packages (P5 multi-day, P9a/P9b published editing with email, P10 form rebuild, P7b one organiser home, G1 ground tokens, C6 invite peek), Stage 11 (signed records, mandatory staff TOTP) and the Stage 12 pilot.

## 6. Knowledge graph and vault

- **Knowledge graph** (`graphify-out/`, refreshed 2026-10-11 with `--update` over everything changed since 2026-09-11) [X]: **4,101 nodes, 6,441 edges, 441 communities.** 207 changed code files went through the AST pass (no tokens); 45 changed docs (this file and the MVP plan included) through three extraction agents, 624,983 tokens recorded (chunk 2's usage was lost when its agent hit the account usage limit after writing its file). Excluded on purpose: `.agents/`, `.codex/`, `supabase/snippets/`. Health check: no missing, dangling or collapsed edges; 9 self-loops. **Five docs edited after their extraction** (`docs/DEFERRED.md`, `docs/architecture/BLOCK-ARCHITECTURE.md`, `PROJECT_STATE.md`, this file, the MVP plan) were dropped from the manifest, so the next `--update` re-extracts them instead of treating the stale extraction as current. Most-connected nodes: `supabaseServer()` (114), `requireStaff()` (79), `PROJECT_STATE.md` (58). Ask it: `graphify query "<question>"`.
- **Vault** (`/Users/ivan/Desktop/Eventar`, 2026-10-11) [X]: `02 — Decisions Log.md` gains **Q44 (PROPOSED)**; new roadmap note `20 — Roadmap/Core UX + Tenant Isolation (2026-09-18 to 2026-10-11).md` (the first since 2026-09-17); `00 — Index.md` refreshed (`last_updated`, a current-focus callout, the roadmap link, the build-plan pointer). **Not updated, on purpose:** `10 — Architecture/Security + Robustness.md` still states Hard Rule 11 as INSERT/UPDATE/DELETE only (waits on your Q44 sign-off, A3); `10 — Architecture/Data Model.md` coverage still ends at Slice 0.9 (known since 2026-07).

## 7. Working here: environment and traps (consolidated)

- **`.env.local` points at Seoul.** Never run `pnpm test:rls` or `tests/cpd/` with it. Local env: `eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"; export NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY RLS_TESTS=1`. The helpers refuse a non-local URL when `RLS_TESTS` is set.
- **Live checks:** Browser pane `preview_start` with `eventar-noreview` (:3100, review mode off) or `eventar` (review mode on); never `pnpm dev` (Seoul). Review accounts `ux-admin@`, `ux-member@`, `ux-body@` `@eventar-review.invalid`; sign-in links via Mailpit `http://127.0.0.1:54324/api/v1/search?query=to:<email>&limit=1`.
- **Shared checkout, shared index.** Build commits on a temporary index (memory note `commit-around-peer-staged-files`). Verify in a clean worktree with `cp -Rc node_modules` and an empty `.env.local`.
- **Grants:** any table-level grant or revoke in a migration must be mirrored in `supabase/seed.sql` and verified by running the real seed in a rolled-back transaction. With RLS on, a policy denial is also 42501: assert the message too. Never `grant all`.
- **Mutation harnesses** must restore everything their mutant strips and compare ACLs as sorted sets (memory note `grant-guard-mutation-harness-recipe`).
- **Next 16:** `error.tsx` uses `unstable_retry`, and the real boundary remounts the fallback; native `disabled` drops keyboard focus (use `focusableWhenDisabled`); SWC drops a space after a closing tag in multi-line JSX text with an entity (`tests/jsxWhitespace.test.ts`).
- **zsh:** `=word` at the start of an argument is a command lookup (`echo =====` fails); `$PATH` is tied to `path`; a command stored in a variable is not word-split; the exit array is `pipestatus`.
- **Invariants at `e80d4bb` (P2a), clean worktree, run sequentially [X]:** `tsc` clean · `eslint` 1 error (`app/settings/page.tsx:84`, pre-existing) + 11 warnings · `vitest` 186 files, **1,487 passed**, 404 skipped · `next build` clean (39 routes at `06176a6`; P2a adds none) · RLS on the local stack, 10 files (publish, DSR, cross-org, audited-table guard, foundations, function grants): **143/143**. The full `pnpm test:rls` still has the three stale-fixture files (D3).

## 8. Record index

| File | What it holds |
|---|---|
| `docs/plans/STAGES.md` | The only roadmap vocabulary (Stage 1–13). |
| `docs/plans/PROJECT_STATE.md` | Running state; its top entry points here. |
| `~/.claude/plans/pasted-content-id-c1b3-eventar-buzzing-pretzel.md` | The core-UX plan: Bands 1–3, package specs, rules (§3–4), D0 decisions (§8), P2a deviations (§9). |
| `handoff_20261001-core-ux.md` | Validation baseline (§1–6), Band 1 record (§7), P2a record (§8). |
| `handoff_20261009-session-end.md` | P2a session's tree map and the unfinished helper investigation (§4). |
| `handoff_20261009-cross-org-scope.md` | Staff pickers, analytics/details gating, `get_org_participants`. |
| `handoff_20261010-dsr-org-scope.md` | Q42 evidence, mutants, traps. |
| `handoff_20261010-cross-org-read-scope.md` | Q43 evidence, Seoul verification SQL (§8). |
| `handoff_20261011-truncate-trigger-revoke.md` | Q44 evidence, Seoul pre-flight and post-push SQL (§7), drafted rule text (§10). |
| `docs/DEFERRED.md` | Every deferral with its re-entry criterion. |
| `docs/ops/erasure-and-dsr.md` | Interim erasure and DSR runbook. |
| `specs/001-003` | Spec-kit specs for the attendee portal, event workspace and event authoring. |
| vault `02 — Decisions Log.md` Q41–Q44; vault `20 — Roadmap/Core UX + Tenant Isolation (2026-09-18 to 2026-10-11).md` | Decisions and the vault's progress note. |
