# Handoff, 2026-11-14: MVP spine closed on the working tree (security S1 to S4, rules S5 to S8, live walk r3)

**Date:** 2026-11-14
**Status:** COMPLETE for this session's scope. Everything is UNCOMMITTED, UNPUSHED and LOCAL ONLY. Seoul has none of the five new migrations.
**Chain:** MVP execution. Parent: `handoff_20261107-mvp-rewalk-q51-role-rights.md` §0.
Evidence tags: [X] executed this session, [R] read in code or docs, [I] inferred.

---

## 0. Ivan's action list

**Decide** (recommendation first)
1. **Commit go.** Recommend five commits, so each reads as one card: (a) S1 consent definer-only, S2 headers, S3 zod; (b) S4 confirmed-email kernel change; (c) S5 and S6 agenda rules with the `updateAction` fix; (d) S7 CSV and S8 capacity; (e) test fixture repairs and docs. Also decide whether the four r3 lens files and the r3 summary go in. Recommend yes: the r2 summary is tracked. I stage only my own paths, never the peer files listed below.
2. **F1: DB-level window gate on `speaker_checkins`.** A direct INSERT by any member of the organisation succeeds before the window opens [X]. The Server Action and the UI refuse correctly. Recommend yes: one migration modelled on the attendee gate, plus one test. Not a regression of this phase.
3. **M1: consent copy.** The consent step says Terms and Privacy "will be published before launch", and `/terms`, `/privacy`, `/legal/terms`, `/legal/privacy` all return 404 [X]. It is a MAJOR that predates this phase. Recommend wait: your brief parked legal. If you want the walk to show zero MAJORs, rewording the sentence is the smaller fix. A reword must not bump the consent strings `tos-0.1-draft` and `pp-0.2-draft` (a bump re-prompts every account).
4. **Seoul apply of the five migrations.** `supabase db push --linked`, after the commit. Your separate go.

**Execute** (only Ivan)
- Say "commit" to start decision 1. Say "push" separately: push goes do not carry across sessions, and I push a pinned SHA.
- Nothing else needs your hands.

**Queued for Claude** (no ruling needed)
- After the commit go: the clean-worktree gate chain at the final HEAD (`eventar-static-gates`). The MVP-done declaration becomes final only when it passes and you rule on M1.
- Before any Seoul apply: a read-only existing-rows check on Seoul for agenda blocks outside their event window (`supabase db query --linked -f`). The S5 trigger does not rewrite old rows. Three such rows exist on the local stack [X].
- F2 in the browser pane: re-walk the desk (Enter-code check-in, then read the roster without reloading). The database side is proven (see §2). Only the pane is unproven.
- Fix `scripts/walk-window.sh`: the S5 trigger refuses a plain `update events` on an event with agenda blocks. The guard works. The helper must delete and re-insert the blocks.
- Fold `components/analytics/ExportAnalyticsCsv.tsx` (`esc`, no formula guard) and the `EventsHome` `csvEscape` duplicate into `lib/csv.ts` when next touched.
- Review the `pnpm-lock.yaml` diff at commit time (see §3).
- Peer-managed skills tree, edit only with that peer idle: `eventar-static-gates` has a stale `PublishDraftButton` note (the cause was a hard-coded date, not contention), and the `eventar-live-verify-worktree` cleanup order omits `participation_evidence`, which blocks deleting a registration after any check-in (two lenses and my own probe hit it).

**Other sessions:** one peer, `ivan-b8` [034b14], idle (checked with `ListAgents`). `git status` also shows peer changes I did not make and will not stage: `.claude/skills/*` (for example deleted `eventar-commit-card-groups` and `eventar-rate-limit-abuse-tier`; run `git status` for the full list), `graphify-out/*`, `AGENTS.md`, `docs/plans/.claude/`.

---

## 1. What changed [X]

| Id | Change | Where |
|---|---|---|
| S1 | `consent_records` is writable only through `grant_consent` and `withdraw_consent`. Self-write policies dropped. `service_role` keeps DELETE (lifecycle table) | `20261114100000_consent_records_definer_only.sql`, `supabase/seed.sql`, `tests/rls/audited_table_writes.rls.test.ts` |
| S2 | `X-Frame-Options: DENY`; `poweredByHeader: false` | `next.config.ts`, `tests/nextConfigHeaders.test.ts` |
| S3 | zod 4.4.3 to 4.6.7 | `package.json`, `pnpm-lock.yaml` |
| S4 | `app_private.auth_email()` returns the JWT email only when `sub` matches a confirmed `auth.users` row with that email. Kernel K1 change, signed off by you 2026-11-07, Decisions Log Q52 | `20261114110000_auth_email_requires_confirmed_account.sql`, `tests/rls/auth_email_confirmed.rls.test.ts` |
| S5 | An agenda block must sit inside its event window. Deferred constraint trigger, VOLATILE | `20261114120000_agenda_block_inside_event_window.sql`, `tests/rls/agenda_block_window.rls.test.ts`, `updateAction.ts` |
| S6 | `update_event_with_blocks` returns `{event_id, block_ids[]}`; the form keeps block ids across saves | `20261114130000_update_event_with_blocks_returns_block_ids.sql`, `updateAction.ts` |
| S7 | `csvEscape` prefixes `'` to cells starting `= + - @ tab CR`; signed plain numbers stay numbers | `lib/csv.ts`, `lib/csv.test.ts`, `exportEvidenceActions.ts` |
| S8 | Capacity checked under an event-row `for no key update` lock. Walk-ins stay exempt, as before | `20261114140000_registration_capacity_guard.sql`, `tests/rls/registration_capacity.rls.test.ts`, public and check-in actions |
| Fix | After the RPC commits, `updateEvent` refreshes the pages before it inspects the reply. A window refusal reads in plain words | `app/events/[id]/edit/updateAction.ts` |
| Fix | `PublishDraftButton.test.tsx` pins its clock (a hard-coded date had passed) | `PublishDraftButton.test.tsx` |
| Docs | `SCHEMA_SUMMARY.md` regenerated (170 migrations, 35 tables, 87 functions); 9 new rows in `DEFERRED.md` (plus the `PublishDraftButton` row rewritten); Decisions Log Q52 | repo and vault |

Your four rulings of 2026-11-07 are all done: H1 SQL layer, both agenda items, M4 plus M7, counted fixture cleanup (2 `ZZ-` events, 6 registrations and 1 `final.invalid` user deleted; `credit_ledger` untouched at that point).

## 2. Evidence

**Gates** (last full chain `gate3.out`; only docs changed after it) [X]: tsc exit 0. eslint 0 errors, 11 warnings. `check:ui-colours` clean. `check:ui-primitives` FAILS with 4 hits, none in a file I touched (`ProfileClient.tsx:510`, `OrgOnboardingClient.tsx:120` and `:142`, `MultiBodyAccreditationWizard.tsx:245`), same four as r2. Plain vitest 2832 of 2833: the one failure is a DDL deadlock in `registrations_link_immutability`, which passes alone (5 files, 87 tests, re-run today). `pnpm test:rls` two stages: 50 files / 483 tests, then 5 files / 57 tests. `next build` exit 0. Not run: the chain on a clean worktree at a final HEAD.

**Phase protocol** [X]: a dev-lens `code-reviewer` and a separate user-lens agent ran before the fix wave; their findings are fixed test-first. The backtest is the live walk with DB read-backs.

**Live walk r3** [X]: four lenses on :3100, review mode off, local stack. No BLOCKER. No new MAJOR. Rows, findings and gaps: `mvp/REVIEW-FINAL-summary-r3.md`.

**F2 ruling** [X]: the gap-fill lens saw the check-in roster stay stale after an Enter-code check-in. I asked whether S4 broke Realtime for staff. It did not. A throwaway probe signed in as a confirmed `organiser_admin`, subscribed to `registrations` for one event exactly as `RosterClient` does, then called `mark_attended` through the real RPC. The UPDATE event arrived, the row read `attended`, and `credit_ledger` stayed at 920. The probe's fixture was removed with a counted dry run, then a commit: 0 ZZ events, 0 probe staff, 0 probe users, 0 orphan evidence.

## 3. Findings worth keeping

- **A STABLE trigger function cannot see rows its own statement wrote** when a deferred constraint is forced with `set constraints ... immediate`. The window trigger function is VOLATILE for that reason. A test pins it.
- **After S4, a test that fakes JWT claims must carry `sub`.** Seven fixtures failed, and one (`event_soft_delete_privacy`) kept passing for the wrong reason: its caller no longer resolved as staff.
- **`tests/cpd/` is outside `test:rls`.** `event_freeze_trigger` had been broken by Q51 since 2026-11-07 and nothing caught it. The fixture role is now `organiser_admin`.
- **A hard-coded date is a clock.** `PublishDraftButton.test.tsx` failed once the date passed. The `DEFERRED.md` guess ("contention") was wrong for that case.
- **`pnpm update zod` re-resolved extra transitives:** lightningcss 1.33.0, postcss 8.5.33, tinyglobby 0.2.17, tslib 2.9.1, `@napi-rs/wasm-runtime`, rolldown `pluginutils`. Every gate passes on it. I did not narrow the lockfile, because node_modules would then differ from the lockfile the gates ran on.
- **`pnpm audit --prod`** lists 6 advisories (browserslist, source-map-js, `@babel/core`, `baseline-browser-mapping`, deepmerge). None is zod. All sit under next or `@react-email`. Untriaged.
- **`credit_ledger` is 920 rows locally** (889 before the gates and the walk). It is append-only by Hard Rule 11. Local only.
- **Still open from the walk, none blocking:** Events home counts under-count past 300 events; a member on another's draft sees mixed reasons; an organiser-door error-styled page for a practitioner; three public-registration copy MINORs. All are in the r3 summary.

## 4. Closing refresh: what ran and what to know [X]

**Repo graph** (`graphify-out/`, 2026-11-15): 6,347 nodes, 11,246 edges, 585 communities, health OK. Before: 6,220 nodes, 9,657 edges. Five docs were extracted: `SCHEMA_SUMMARY.md`, `DEFERRED.md`, `PROJECT_STATE.md`, this handoff and the r3 summary. Code ran as a full-corpus AST (866 files).
- **A first merge used a partial AST and lost 135 cross-file import and call edges.** I redid it with the full AST. On every future `--update`, run the full AST, as a script file with a `__main__` guard (Python 3.14 multiprocessing breaks on stdin).
- **The full AST also added about 1,300 import and call edges the old graph never had.** A 12-edge sample matched the source text. God-node counts rose for that reason (`cn()` 92 to 138), not because of new code.
- **10 old edges are gone:** 3 helper nodes of the edited `updateAction.test.ts`; 2 `PROJECT_STATE` references to the previous handoff; 5 heuristic call edges from `scripts/demo` (`admin`, `iso`) that the full AST resolves differently.
- **Scripted fixes to the semantic chunks, made before the merge and never to `graph.json`:** a `docs_plans_stages` id collision removed, a dangling stub handoff node re-homed, a stale "8 new rows" rationale corrected to 9.
- **22 changed docs are NOT in the manifest, so the next refresh extracts them:** 16 peer `.claude/skills/*` files, `GATES.md`, `handoff_20261114-graph-state-cleanup.md`, the four r3 lens files. This handoff changed after the manifest was saved, so it is extracted again too.
- **`cost.json` undercounts:** it holds the tokens of chunks 1 and 2 only; chunk 3 reported none.
- **`graph.html` is stale.** The graph is over the 5,000-node viewer limit, and graphify deleted the tracked file. I restored the HEAD copy with `git checkout`. Untracked and not mine to commit: `graphify-out/2026-11-15/`, `cache/ast/v0.9.5/`, `.extra_graphs`, `.extract_prompt.md`, `.run_state.md`, `.claude/`, `.graphify_labels.json.sig`.
- **Nothing in `graphify-out/` is staged or committed.** That waits on your commit go.

**Vault note:** `/Users/ivan/Desktop/Eventar/20 — Roadmap/MVP Close — Security, Agenda, Capacity Rules + Live Walk r3 (2026-11-14).md`. Decisions Log Q52 was already appended.

**Vault graph** (2026-11-15): 875 nodes, 1,537 edges, 54 communities, health OK. The Decisions Log was not extracted whole: I carried its 166 nodes, 337 edges and 3 hyperedges over verbatim and added the Q52 nodes. The vault note was extracted in-session. `.obsidian/workspace.json` (Obsidian UI state) was marked seen without extraction. The vault is not a git repo, so its report has no Graph Freshness section.

Closing: repo graph done (2026-11-15) · vault note done (20 — Roadmap/MVP Close — Security, Agenda, Capacity Rules + Live Walk r3 (2026-11-14).md) · vault graph done (2026-11-15)
