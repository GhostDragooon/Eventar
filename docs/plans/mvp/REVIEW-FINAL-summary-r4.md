# MVP acceptance walk, run 4 (2026-11-21): summary

**Verdict: no BLOCKER, no new MAJOR. The spine passes on `1a7d2bf`. One MAJOR stays open: M1, known since r2 and parked with legal. By the skill's strict bar, "done" stays open until you rule on M1.**

Tree: clean for product paths (`git status` shows no change under `app/`, `components/`, `lib/`, `supabase/`, `tests/`). 191 changed paths under `.claude/skills/` are reported separately and were not touched. Walk server :3100 with review mode OFF (signed-out `/events/new` gave 307). Local stack only; Seoul untouched.
Lens files (untracked, not committed): `REVIEW-FINAL-organiser-r4.md`, `-practitioner-r4.md`, `-roles-r4.md`. Tags: [X] executed, [R] read in code, [I] inferred.

## Gates on the final HEAD (`1a7d2bf`, product tree clean)

| Gate | Result |
|---|---|
| `tsc --noEmit` | exit 0 [X] |
| `eslint .` | 0 errors, 11 warnings [X] |
| `check:ui-colours` | pass [X] |
| `check:ui-units` | pass, 152 px against baseline 156 [X] |
| `check:ui-primitives` | FAIL, 4 old hits, same lines as r3 and r2: `ProfileClient.tsx:510`, `OrgOnboardingClient.tsx:120` and `:142`, `MultiBodyAccreditationWizard.tsx:245`. None added since r3 [X] |
| `pnpm test:rls`, two stages | 52 files / 564 tests, then 5 files / 57 tests, all pass [X] |
| full `vitest run`, `RLS_TESTS=1` | 297 files / 2925 tests, exit 0 [X]. First clean full run since the MVP close; neither r3 flake appeared |
| `next build` | exit 0 [X] |

Gate note: my first `test:rls` run read `.env.local` (Seoul). The URL guard in `tests/helpers/clients.ts` refused all 52 files, so nothing reached Seoul. Two reruns then failed on an empty env export (BSD `sed`). The third run used the local env and passed.

## Checklist

| Row | Status | Evidence |
|---|---|---|
| O1 to O9 organiser | PASS [X] | organiser lens, real clicks; O9 now includes the live registrants CSV |
| S5, S6 | PASS [X] | window refusal in plain words; block ids stable across saves |
| S7 live CSV | PASS [X] | cell `=HYPERLINK(...)` reads back with a leading apostrophe |
| S8 capacity | PASS [X] | "This event is at capacity.", count unchanged (staff and public) |
| O4 non-creator publish | PASS [X] | roles lens: dialog, Keep editing, `published_at` set, `created_by` unchanged |
| ux-member | PASS [X] | own draft publishes; another's draft read-only; REST write 403 42501 `not_event_writer` |
| ux-body, auditor | PASS [X] | every write 42501; events readable |
| Enter-code check-in as non-creator member | PASS [X] (UI disabled; REST `not_recognised`, no write) | roles lens |
| Mixed bulk | PASS [X] | refused whole, dialog names the blocked event |
| A1 to A7 | PASS [X] | incl. cold start with no `next` |
| Wrong turns: unticked consent, invalid email, duplicate email, empty and whitespace name | PASS [X] as refusals; reason copy for greyed Register: see m3 | practitioner lens |
| A5 `/account/check-in`, `/account/record` | PARTIAL [X] | empty states only |
| Sign-out ends session | PASS [X] | old cookie rejected (organiser, practitioner) |
| 375px phone nav | PASS [X] | `scrollWidth` = `innerWidth` (practitioner, roles) |
| F1 `speaker_checkins` DB window gate | OPEN, MINOR | direct INSERT before the window still succeeds (simulated JWT, rolled back) |
| M1 consent copy | OPEN, MAJOR | `/terms`, `/privacy`, `/legal/terms`, `/legal/privacy` all 404 (re-run by me [X]) |
| Commit, PROJECT_STATE, vault, graph | NOT RUN | wait for your rulings |

## Findings that stay open (no BLOCKER)

| Sev | Finding |
|---|---|
| MAJOR, known | M1: consent says "By continuing you agree to the terms and privacy policy we will publish before launch." and "I agree to the Eventar terms and privacy policy once published." No links; all four candidate paths 404. Rests on practitioner lens plus my curl re-run |
| MINOR | F1 (above) |
| MINOR | m3: greyed Register gives no reason for an empty or whitespace name (r3, unfixed) |
| MINOR | Registrants CSV header says `Asia/Hong_Kong` but the times are UTC (r3, unfixed) |
| MINOR | Stale red "Name required" after a whitespace-only attempt, with a filled name; a fresh panel worked (unresolved, organiser lens) |
| MINOR | m5: signed-in user who already registered sees the empty form again. m2: at-capacity page has no next step |
| MINOR | Events home over 300 events: footer does not name the under-counted chip |
| MINOR | Draft `/edit` Save and controls lack `aria-describedby`; accreditation sentence shown twice for a non-creator |
| MINOR | `body_admin` and `auditor` see an enabled "New event" link (dead end), bulk Delete (wrong refusal reason), and an enabled "Edit event" link under a header saying they cannot change events |
| MINOR | 375px staff nav is a scrolling tab row; Settings clipped with no cue (known open item) |
| NIT | Landing hero shows "Sign up" while signed in; capacity chip says REGISTERING at capacity; two invalid-email messages; registrants CSV only on the event Edit page |

## Not run (gaps)

Phone bottom pill and dark theme (organiser lens, out of budget); check-in pass inside the 60-minute window for the practitioner; the member's real `/events/new` create form (drafts were SQL-seeded); a UI enter-code check-in (REST only); O3 blocks 2 and 3 were SQL-seeded; clean-worktree gate chain (HEAD is clean and gates ran on it, but not in a detached worktree).

## Honesty notes

- Screenshots exist as pane-saved `.jpg` files under the session tool-results folder, with tool-chosen names; none was copied into the repo.
- The organiser lens hit the 5-hour limit once and was resumed; its step count exceeded the brief. Unreached rows are listed above, not counted as passes.
- Every lens tore down its fixtures. I re-queried: `ZZ-R4` events 0, `zz-*r4*` auth users 0. Residue is `audit_events` only (3 organiser, roughly 11 roles, practitioner consent and sign-in rows), permanent by Hard Rule 11.
- :3100 is still running (started this walk under the `eventar-noreview` config); the lock `scratch-demo/locks/dev-3100.lock` names this session.
- No file was committed, staged or pushed.

## Update after the walk (2026-11-21, Ivan ruled "Reword now")

M1 reworded in `app/account/complete/CompleteClient.tsx` (paragraph and checkbox), test and the `lib/legalVersions.ts` comment updated. It no longer asks the user to accept documents they cannot open. Gates after the edit: `vitest run app/account/complete` 38 of 38, `tsc` 0, eslint clean on the touched files. Consent strings `tos-0.1-draft` and `pp-0.2-draft` NOT bumped. Before and after frames rendered on :3100 and sent. Uncommitted. The new wording still needs the solicitor's eye. M1 is closed by rewording, not by publishing the pages.

## Decide (recommendation first)

1. **M1 consent copy:** wait for legal (recommended; your brief parked it), or reword the one sentence now to reach zero open MAJORs.
2. **F1 `speaker_checkins` DB gate:** yes, one small migration plus one test, like the attendee gate.
3. **Accept the MINOR list as debt**, or queue the role-gated UI items (dead "New event" link, wrong bulk-Delete reason) as a frontend card with before/after renders.
