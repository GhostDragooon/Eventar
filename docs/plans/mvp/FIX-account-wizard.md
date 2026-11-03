# FIX: account wizard, sign-in/sign-up link, role-lock race (2026-11-03)

| finding | file:line | BEFORE | AFTER | test | failed-first |
|---|---|---|---|---|---|
| S2-5 Professional Continue disabled with no reason; required fields unmarked | `app/account/complete/CompleteClient.tsx:387,496,556,593,698,712` | Continue truly disabled while Department empty; labels carry no required mark; no message | Required labels get the event-form `*` (`aria-label="required"`); `ContinueWithHint` prints e.g. "Add your department to continue." / "Add your workplace and department to continue." beside Continue on Identity and Professional steps | `CompleteClient.test.tsx` "why Continue is disabled" (4 tests) | yes (all failed) |
| S2-5 same pattern, Licence step | same file, `:556`, `:593` | "Declare licence" and "Done" disabled silently | Hint beside each: "Choose an accrediting body and add your licence number to declare." and "Declare a licence to finish." (gate itself unchanged) | `CompleteClient.test.tsx` licence test | yes |
| S1-2 Sign up link on sign-in drops the event | `app/account/sign-in/page.tsx:69` | `href="/account/sign-up"` | `/account/sign-up?next=<encoded next>` using the existing `attendeeNextPath` value; hostile `next` yields the bare link | `sign-in/page.test.tsx` (valid + hostile) | yes (valid case failed; hostile passes before and after by design) |
| dev m1 role-lock race | `supabase/migrations/20261103100000_registration_roles_lock_checkin_race.sql` | `set_/remove_registration_role` read `status` unlocked; guard `status='attended'` only | read `for no key update of r`; refuse on `status='attended'` OR a `registration_checkins` row (22023 `role_locked_attended`); definer, search_path, grants, audit-last unchanged; self-assert; replay-safe | `tests/rls/multi_body_accreditation_crud.rls.test.ts` race-window case | yes (failed pre-migration with no refusal) |

Results: vitest `app/account/{sign-in,sign-up,complete}` 8 files / 111 tests pass. RLS file 16/16 pass after `supabase migration up --local` (15 pass + 1 new failed before). Grants on both functions verified after apply (postgres, authenticated, service_role EXECUTE, as before). `tsc --noEmit`: no errors in touched files.

## Not fixed

- **S2-1 Terms / Privacy links: no destination exists.** No `/terms`, `/privacy` or `/legal` route in `app/`, nothing in `public/`. Only unpublished drafts in `docs/legal/` (README: "None of these documents are ready to publish", awaiting solicitor review). Text left as plain words. Decision for Ivan: publish pages (needs solicitor-reviewed copy), or reword the wizard to stop implying documents the visitor can read. Do not link the drafts.
- **Event page "Log in or sign up first" goes to Log in only**: `components/RegisterCard.tsx:301` (`signInHref`), not in my scope. Sign-in now carries `next` to Sign up, so the one extra click no longer loses the event.
- Mandatory-licence gate on the wizard Done button: product decision, deferred to Ivan (only an explanation was added).
- DB rule that agenda blocks sit inside the event window: deferred (touches `update_event_with_blocks` and existing data).
- Residual on the lock: a check-in that inserts its `registration_checkins` row after this function's read and commit is not blocked by the row lock (the FK takes only KEY SHARE on registrations); the status update that follows is. This matches what `update_registration_contact` has.
