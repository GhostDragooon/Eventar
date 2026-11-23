# Handoff 2026-11-24: UX-R7/R8 door rights, details header fit, spacing discipline

Prior handoffs: `handoff_20261122-door-separation-nav.md`, `handoff_20261121-mvp-walk-r4.md`. Evidence: `docs/plans/mvp/CARD-UX-R8.md` (dev lens, user lens, backtest, auditor audit), `docs/plans/mvp/CARD-UX-R9.md` (opened, not started), `docs/plans/mvp/REVIEW-FINAL-gaps.md`. Vault: `20 — Roadmap/MVP Close Pass UX-R7 to R8 + Details Header Fit (2026-11-22 to 2026-11-23).md`, Decisions Log Q54.

Note on convention: the global `handoff` skill writes `plans/handoffs/HANDOFF_*.md`. This repo's rule (`CLAUDE.md`) is `docs/plans/handoff_YYYYMMDD-<slug>.md` with a §0 action list and a closing line. The repo rule won; the global skill's mining discipline was applied.

## §0 Ivan's action list

**STATUS 2026-11-24:** everything below is committed and on `origin/main` (tip before this handoff: `b9b3d90`). The hosted project (Seoul) has NOT received the two R8 migrations.

**Decide (recommendation first)**
1. **Auditor and their own account.** You ruled "auditor is view only at all times, no editing of any kind." Does that include the auditor's own profile, licence, email change, consent and self check-in? Recommend: no. Organisation data stays read-only; the auditor keeps control of their own account, otherwise they cannot sign in cleanly or withdraw consent. Needs your word before any change.
2. **Walk-in actor.** Today only the audit event records who added a walk-in. Recommend: keep it. Say if the registration row should carry the staff id.
3. **Seoul apply of `20261122100000_door_rights_ux_r8.sql` and `20261122110000_door_rights_ux_r8_hardening.sql`.** Stage 8 work, needs your explicit go and `supabase db push --linked`. Recommend: bundle with the next planned Seoul push; no rush, local and CI replay both pass.
4. **`CLAUDE.md` names an archived skill.** Project `CLAUDE.md` (Two paths, one separator) cites `eventar-phone-nav-bottom-bar` as an authority. The skill now sits in `.claude/skills/.archive/` (`b9b3d90`) and no longer loads. Recommend: restore it, unless the retirement was deliberate; then edit the text. Your call.
5. **Touch targets under 44px** in page content at 375px (auditor view, measured): breadcrumbs 25px, dashboard History link 17px, row checkbox 18px, Soonest 32px, desk filter chips and Walk-in 32px, details toolbar buttons 30 to 34px, Save and Export 32px, inputs 38 to 40px. Recommend: one batch with an interactive artifact first (frontend decision rule). None of it came from R8.
6. **Deploy** stays PAUSED (needs your explicit go).

**Execute (only you):** nothing blocks Claude. The Seoul apply (Decide 3) is the only step that needs you.

**Queued for Claude**
1. Card UX-R9: roster and counter stay stale after a check-in or walk-in (`RosterClient.tsx` lines 139 to 164 rely on realtime only); check local realtime `subscription_errors`; `+ Walk-in` 32px to 44px. Needs dev lens, user lens, backtest, and an artifact before any visual edit.
2. Optional hardening: app-side role checks in `updateRegistrationContact`, `setRegistrationRole`, `removeRegistrationRole` (the database already refuses; this only makes the message role-true).
3. Make `writable` a required prop on the details components (leftover from R8).
4. 42501 console noise: the eligibility RPC refusal for body admin and auditor is logged nowhere now, but the other 42501 paths still log; review when touched.
5. `EDIT_DETAILS` unused variable warning in `app/events/[id]/checkin/page.test.tsx` (old).
6. Add the "mock lists come from the app's tokens and markup" rule to global `~/.claude/CLAUDE.md` next to the spacing paragraph (it is only in memory `frontend-measure-spacing-before-sending.md` now).

**Other sessions:** none seen mid-work. Peer and autoharness edits under `.claude/skills/` were committed in `c442d16`, `e2450d1`, `b9b3d90`. The tree was clean after the last push.

---

## What happened

- **UX-R7** (read-only roles at the check-in desk): dashboard says "View desk" instead of a blue Check-in for an event the account cannot check in; row buttons wrap to two columns below 24rem so "View desk" stays inside its pill. Commits `d440abf`, `2a7a496`, `0ce19bd`, `83ad719`.
- **UX-R8 door rights** (Q54, commits `8e35cb5`, `c3ba766`, `e45e45f`, `492bade`, `2f3f477`): on the day, organiser admin, organiser member, body admin of the event's organisation and `eventar_staff` check in, tick speakers and add walk-ins on ANY organisation event. Auditor stays view only. The Registrations list keeps Q51 (creator or admin) for everyone.
  - Migration `20261122100000`: `app_private.can_run_door`, `mark_attended` adds body admin and sets a transaction-local `app.door_registration`, `enforce_event_writer` exempts door writes.
  - Migration `20261122110000` (hardening after the dev lens): speaker insert/update policies admit `eventar_staff`; the guard pins `updated_by` to the caller's staff id and `checked_in_at` to within 300 seconds of now (or null). Known ceiling: the GUC lasts to the end of the transaction, set only inside `mark_attended`.
  - Your five rulings applied: 1c (no false eligibility banner for body admin, no migration: `eventAdmin 42501` is not an outage), 2c (read-only desk line names all three roles: `CHECKIN_ROLE_MESSAGE` in `lib/lifecycle/eventLifecycle.ts`), 3b (dashboard live banner says "view desk" for roles that cannot check in), 4b (one read-only Registrations sentence, reuses `NOT_EVENT_WRITER`), 5 (anyone in the org can help at the gate), 6 (UX-R9 opened).
  - Auditor audit: no database write is open to an auditor. One UI gap closed: details page showed "Send reminders now" and survey controls to a role the server refuses; now hidden for read-only roles (`details/page.test.ts` `hasEmailControls`, verified failing on the old code).
- **Details header overflow** (`cee91b5`, `app/events/[id]/details/page.tsx` lines 376 and 631): option D picked from the artifact. Header is a row from `lg`, toolbar may wrap. Measured on the real page as an auditor: 768px before +182px sideways overflow and a 0px title column, after 0px overflow and 472px; 1024px before a 50px title column, after 245px; 375, 640, 900, 960, 1100, 1280, 1440px all 0px overflow. `shrink-0` had been there since `cc02681`, not from R8.
- **Spacing discipline:** your complaint "alice row is much higher than bob" was my artifact mock (hand-made row CSS, invented `ZRAB23` code column: 105px vs 90px). Rebuilt on the app's scale (spacing xs .25, sm .5, md 1rem; body 14px / 1.6; label 12px; radius .625rem) and the real `RegistrationItem` markup: both rows 83.2px at 375, 768 and 1100px. Rule added to `~/.claude/CLAUDE.md` ("Measure spacing before any link or frame goes out") and to memory.
- **Row dividers:** the check-in desk and details lists measure 61 vs 60px and 60.2 vs 59.2px. The extra pixel is the divider under every row but the last (`border-b last:border-0`). Content boxes are equal. Not changed.
- **Phone roster:** the desk roster scrolls sideways inside its own box at 375px (293px visible, 406px content). Not changed.

## Gates (tip `c442d16`, local stack)

`tsc --noEmit` 0. `eslint .` 0 errors, 11 warnings. Full `vitest run`: 238 files and 2313 tests passed, 63 files and 670 tests skipped (the RLS files need `RLS_TESTS=1`). `next build` clean. Details dir: 8 files, 117 tests. The R8 RLS matrices (`door_rights_ux_r8.rls.test.ts`, `role_rights_q51.rls.test.ts`) passed on the local stack when the migrations landed; the full `test:rls` was NOT re-run at the final tip. CI: the push triggers `replay-verify` (local Supabase on the runner, no hosted apply).

## Artifacts (private, claude.ai)

- Applied changes with role switches: https://claude.ai/artifact/XVy8eVvFHZq6VZFXy44j4a (Version 3, rows on app tokens).
- Header fit options with a nine-width matrix: https://claude.ai/artifact/KisSS56bJzNQTuijMyenbS (Version 1). Source files `scratch-demo/ux-r8-applied-changes.html` and `scratch-demo/details-header-overflow.html` are gitignored.

## Gotchas (each cost time)

- The Browser pane ignores a 375px request (it read 980). Measure in a target-width iframe and report that it came from the iframe.
- The app sends `X-Frame-Options: DENY`, so real pages cannot be framed. Fetch the HTML in the pane, drop `<script src>` tags (keep inline ones: they carry streamed content), add `<base href="http://localhost:3100/">`, load into an iframe `srcdoc`. This gives server-rendered layout at any width, no client-only states. An iframe border shrinks the content width: use `border:0` or a 768px request reads 766 and flips the breakpoint.
- Session cookie for local roles: `sb-127-auth-token`, set by `document.cookie` on `http://localhost:3100` (cookies are per host, not port). Mint with `scratchpad/mint2.cjs` (admin API create user, `signInWithPassword` through `@supabase/ssr`); the staff row email must equal the auth email. The script lives under `/private/tmp/claude-501/-Users-ivan--claude-spares-spare-o6HFqc/.../scratchpad/mint2.cjs`.
- Fixture recipe: org `zz-<tag>-org`, staff rows `zz-<tag>-<role>@example.test`, a live event title `ZZ-<TAG> gate`, registrations; clean with `BEGIN`, deletes, `ROLLBACK` dry run, then `COMMIT`, then recount. No permanent rows unless a check-in happens.
- Bash classifier "no verdict": the RTK hook rewrites commands to `rtk ...`; reissue the identical input once. A second kind, "another call in this response was changed", means never put two Bash calls in one response when either is a commit, push or gate run.
- macOS `sed -i` needs an empty suffix (use python for edits). zsh does not word-split a variable of psql args: use a shell function.
- A local file server (`python3 -m http.server`) was refused by the classifier; use `preview_start` and `file://` navigation instead.
- Pushing: `git fetch`, then `git push origin <sha>:main`, one push per go. Staging: name folders, never `git add -- .claude/skills`; a skill move is one unit (deletion and archive copy together).

## Where we're going

Next: ask Ivan Decide 1 (auditor own account) and 4 (archived skill in `CLAUDE.md`), then start UX-R9 with an artifact.


Closing: repo graph done (2026-11-24) · vault note done (/Users/ivan/Desktop/Eventar/20 — Roadmap/MVP Close Pass UX-R7 to R8 + Details Header Fit (2026-11-22 to 2026-11-23).md) · vault graph done (2026-11-24)
