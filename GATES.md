# GATES — MVP close (2026-11-14). Untracked working file; do not commit.

Local stack only (:54322 DB, :3100 app). Seoul untouched. Nothing pushed without Ivan's go.

- G1 S1 consent: authenticated/anon/public have no INSERT/UPDATE/DELETE on consent_records; service_role INSERT/UPDATE revoked, DELETE kept; self-write policies dropped; grant_consent/withdraw_consent still work.
  CHECK: RLS_TESTS=1 pnpm exec vitest run tests/rls/audited_table_writes.rls.test.ts tests/rls/consent_audited.rls.test.ts tests/rls/foundations.rls.test.ts  EXPECT: all pass; new consent_records cases fail on pre-migration DB first
- G2 S2 header: X-Frame-Options DENY on every route; no X-Powered-By.
  CHECK: curl -sI localhost:3100/login | grep -i x-frame-options  EXPECT: DENY
- G3 S3 zod >= 4.6.6.
  CHECK: pnpm audit --prod | grep -i zod  EXPECT: no row
- G4 S4 H1 SQL: unconfirmed email never matches staff in SQL; confirmed still does.
  CHECK: new tests/rls test  EXPECT: unconfirmed -> 0 rows / 42501; confirmed -> works
- G5 S5 agenda window: block outside event window refused in DB; legal event move still works.
- G6 S6 update_event_with_blocks returns block ids in input order; caller uses them.
- G7 S7 csvEscape neutralises = + - @ tab CR leading cells.
  CHECK: pnpm exec vitest run lib/csv  EXPECT: pass
- G8 S8 capacity: N parallel registers on capacity-1 event -> exactly 1 row.
- G9 Static gates: tsc 0; eslint 0 errors; vitest all (flakes named, each green alone); next build 0; test:rls both stages; check:ui-colours clean.
- G10 Phase protocol: dev-lens agent, separate user-lens agent, backtest on :3100/:54322.
- G11 Counted fixture cleanup (dry-run numbers shown to Ivan first).
- G12 Live acceptance walk, review mode OFF: O1-O9, A1-A7, ux-member, ux-body, plus S1-S8 spot checks. No BLOCKER, no MAJOR.
- G13 Docs: PROJECT_STATE, REVIEW-FINAL summary, DEFERRED (email = post-MVP TODO), Decisions Log entry for H1 kernel change, handoff with §0 and closing line.
- G14 Closing: repo graph, vault note, vault graph each actually run.
