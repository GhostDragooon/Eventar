# Project State — Eventar

_One screen. Each handoff REPLACES sections here; never append. Last updated 2026-11-14 from `handoff_20261114-mvp-close.md` and git `1f3d958` plus an uncommitted working tree. Full history to 2026-11-07: `archive/PROJECT_STATE-full-20261107.md` (~53k tokens: grep it, never read it whole). Code map: graphify graph._

## Now
- Stage 10 CLOSED 2026-11-05 (Ivan, Q48). Work follows the Q48 priority order; direction in `2026-11-05-spine-first-strategy.md` (not locked).
- **MVP spine CLOSED on the working tree (2026-11-14 live walk, run 3).** Spine = create, publish, register, check in, record. No BLOCKER, no new MAJOR. Evidence: `mvp/REVIEW-FINAL-summary-r3.md`. Three conditions stay open: M1 (consent copy names Terms and Privacy pages that 404; legal parked), nothing committed, no clean-worktree gate chain at a final HEAD.
- The MVP-close work is uncommitted on top of `origin/main` = HEAD = `1f3d958`. Last code commit: `b95a987` (Q51). Contents: security items S1 to S4, agenda and CSV and capacity rules S5 to S8 (details in the r3 summary and Decisions Log Q52).
- DB: Seoul (`ap-northeast-2`) is up to date with local through `20261107100000`. Five new migrations (`20261114100000` to `20261114140000`) are LOCAL ONLY.
- Deploy PAUSED: needs Ivan's explicit go. Prod Singapore (`ap-southeast-1`) is unprovisioned (Stage 8 precondition).
- **Email stub-vs-real branch is the explicit post-MVP TODO** (`origin/claude/distracted-haibt-18a25a`, unmerged).

## Waiting on Ivan (recommendation first)
1. **Commit go.** Then I run the clean-worktree gate chain at the final HEAD. Push needs its own go (pinned SHA, per session).
2. **F1: DB-level window gate on `speaker_checkins`?** Today only the Server Action refuses; a direct INSERT by any org member succeeds before the window. Recommend yes: one migration like the attendee gate.
3. **M1: consent copy.** Recommend wait for legal (your brief parked it). Reword the sentence only if you want zero open MAJORs.
4. **Seoul apply of the five migrations**, after the commit: `supabase db push --linked`. Your separate go.
5. **Frontend items** (need before/after shown): phone nav clips Settings at 375px (do first); `AuthBackdropCard` hex gradient and em-dash copy; UX-04 wording; bulk controls for read-only roles.
6. **CLAUDE.md wording:** Hard Rule 1 says "OTP/password+MFA"; code sends an emailed magic link only. Hard Rule 7 ("stubbed regardless of stage") turns false once the email branch merges.
7. Leave unless needed: staff of another org cannot edit event details through the API (pinned in `tests/rls/role_rights_q51.rls.test.ts`).
- **Legal parked** (`docs/DEFERRED.md` TODO row). Send `docs/legal/README.md` solicitor list. Consent strings `tos-0.1-draft`, `pp-0.2-draft` NOT bumped (a bump re-prompts every account).

## Locked decisions (full text: vault Decisions Log)
- **Q20 (2026-07-03):** pivot to CPD/CME/CE event + credit platform, HK launch.
- **Q32 (2026-08-09):** Frontend Design Standard is the authority on colour, wordmark, navigation.
- **Q47 (2026-10-30):** two audiences, two doors, never crossed. Attendee `/account/sign-in`; organiser `/login`.
- **Q48 (2026-11-05):** Stage 10 closed; spine-first priority order.
- **Q49:** audit/evidence hash functions pin `TimeZone=UTC`, `DateStyle=ISO`, `bytea_output=hex` (`20261106100000`).
- **Q50:** every `participation_evidence` delete writes an `evidence_deleted` audit row; chain verifiers are `service_role` only (`20261106110000`).
- **Q51:** admin any org event, member own, `body_admin` and `auditor` read-only, `eventar` all; mixed bulk refused whole (`20261107100000`).
- **Q52 (2026-11-14):** a staff identity needs a confirmed account (`app_private.auth_email()` checks `auth.users.email_confirmed_at` and `sub`; kernel K1 sign-off). Also: consent writes definer-only, agenda blocks inside the event window, capacity checked under an event-row lock. Tests that fake JWT claims must carry `sub`.
- **Append-only ledgers (Hard Rule 11):** `credit_ledger` and `audit_events` have direct writes revoked from every role including `service_role`. The only write path into `credit_ledger` is `record_credit_entry` (SECURITY DEFINER; `20260709270000`, redefined `20260709310000`). Guard test: `tests/rls/audited_table_writes.rls.test.ts`. `consent_records` joins the matrix: definer-only, `service_role` keeps DELETE.
- Sign-in is an emailed magic link (`signInWithOtp` + `/auth/callback`). Hosted Auth: confirm email ON, password signup OFF.

## Boundary rules (Q32/Q47: read before touching nav, redirect or CTA)
- `StaffShell` never links public `/events`; its events surface is `/dashboard`.
- Attendee shells (`SiteShell`, `PublicShell`, `LandingNav`) never point an auth CTA at `/login`. Exception: the landing pill's Organiser door.
- Known defect: `/auth/callback` path-prefix heuristic misroutes organiser sub-routes under `/events/<id>/...` (finding I4, `handoff_20260925-two-persona-review.md`).

## Queued for Claude (no ruling needed)
- After the commit go: clean-worktree gate chain at the final HEAD. The MVP-done declaration becomes final only when that chain passes and you rule on M1.
- Fix `scripts/walk-window.sh`: the S5 trigger blocks a plain `update events` on an event with agenda blocks.
- Fold `components/analytics/ExportAnalyticsCsv.tsx` `esc` and the `EventsHome` duplicate into `lib/csv.ts` when next touched. No exploit today.
- `eventar-static-gates` skill: its `PublishDraftButton` note is stale (the cause was a hard-coded date, not contention). The skills tree is peer-managed, so edit it only with that peer idle.
- Check at commit time: `pnpm-lock.yaml` also re-resolved a few transitives with the zod bump. 6 non-zod audit advisories (build-tool transitives) are untriaged.
- Local DB drift, not deleted: the org has 533 events and `public.users` has 240 rows with no auth row, both from earlier RLS-test runs. `credit_ledger` is 920 rows (it was 889; the gates and the walk wrote the rest; append-only, local only).
- Graph and vault note were refreshed 2026-11-15 on the working tree (repo graph built from `1f3d958f`; 22 changed docs wait in the next `--update`, listed in handoff §4). After the commit go, run `/graphify --update` once more so the freshness commit matches. Graph outputs stay uncommitted until your go.

## Pointers
Latest handoff: `handoff_20261114-mvp-close.md`. Walk evidence: `mvp/REVIEW-FINAL-summary-r3.md` plus four lens files. Stages: `STAGES.md`. DB: `supabase/migrations/` summary in `docs/db/SCHEMA_SUMMARY.md`. Deferred: `docs/DEFERRED.md`. DB cleanup map: `2026-11-05-db-cleanup-dependency-map.md`.
