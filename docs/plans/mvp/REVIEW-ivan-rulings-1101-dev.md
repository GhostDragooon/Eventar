# Dev-lens review: Ivan's 2026-11-01 rulings (sign-out, brand, wrong-door copy, backdrop token)

Reviewer: dev-lens agent, 2026-11-01. Read-only review. The only file written is this report.

Scope: `git diff 65fa5ff..c3172b9 -- . ':!docs' ':!specs'`, limited to 4260d35 (shared sign-out), db29673 (signed-in brand goes to /events), 0af07d7 (organiser wrong-door copy) and 6c733b8 (AuthBackdropCard token gradient). The email-switch commits 9054e6f, e3d0917 and 9f586f8 are excluded. Ivan's four rulings are taken as given and are not re-opened here.

Evidence tags: **[X]** verified by execution, **[R]** read in source, **[I]** inferred.

## Gates run [X]

- `pnpm exec tsc --noEmit`: exit 0.
- `pnpm check:ui-colours`: passed.
- `pnpm exec vitest run lib/signOut.test.ts components/shell components/ui/AccountMenu.test.tsx components/auth app/login app/account app/settings`: 27 files, 380 tests, all passed. jsdom printed one "Not implemented: navigation to another Document" warning, so some test sets `location` without a stub. It is harmless and was not traced.

## Mutation tests [X]

All mutations were restored with `git checkout -- <file>`. Afterwards `git status` showed only the pre-existing `.claude/skills` noise.

| # | Mutation | Result |
|---|---|---|
| M1 | Deleted `if (error) return SIGN_OUT_FAILED;` in `lib/signOut.ts` | **Caught.** 3 tests failed: `lib/signOut.test.ts`, `AccountShell.test.tsx` and `AccountMenu.test.tsx`. |
| M2 | Reverted `BrandMark href={signedIn && !isStaff ? '/events' : '/'}` to `<BrandMark />` in PublicShell and SiteShell | **Caught.** 2 tests failed, one in each shell test. |
| M3 | `components/auth/SignOutAction.tsx`: replaced `setError(await signOut())` with `await signOut()`, so the error is never shown | **Survived.** No sign-out test failed. One unrelated ProfileClient test timed out at 5.6 s and passed 17/17 when re-run on the clean tree, so it is flaky under load. |

## Probe test [X]

A temporary test file, `components/auth/zz-review-probe.test.tsx`, was run and then deleted. It showed:

1. SignOutAction works with an async function inside `useTransition`. A failure shows the `role="alert"` message and does not navigate. A retry navigates and clears the alert.
2. While the call is pending the button reads "Signing out…" and is disabled. A second click does not call `signOut` again.
3. In AccountMenu, an outside click during a pending sign-out closes the menu. If the call then fails, nothing is visible. Reopening the menu shows the stale error. The `role="alert"` paragraph is a DOM child of `role="menu"`.

## (a) auth-js 2.105.4 `_signOut` semantics [R]

Source: `node_modules/.pnpm/@supabase+auth-js@2.105.4/node_modules/@supabase/auth-js/src/GoTrueClient.ts:3791-3822`.

- If `admin.signOut` returns an error that is not a 401, 403, 404 or session-missing error, `_signOut` returns `{ error }` **before** `_removeSession()`. The local session stays in place. This matches the helper's assumption.
- On a 401, 403, 404 or `AuthSessionMissingError`, the error is ignored, the session is removed, and `{ error: null }` is returned. This also matches.
- A network failure arrives as `AuthRetryableFetchError` and is returned as `{ error }` with the session kept. The helper stays and shows the error, which is correct.
- A lock-acquire timeout throws. The helper's `catch` handles it.
- **Exception (F1):** `_useSession`, then `__loadSession`, then `_callRefreshToken` (lines 4660-4705). When the stored access token is inside the expiry margin and the refresh is rejected with a non-retryable error, `_callRefreshToken` **calls `_removeSession()` first** and then returns the error. `_signOut` returns that `sessionError` at line 3797. The caller gets `{ error }` while the local session is already gone.
- Conclusion: there is **no path that navigates away while still signed in**. There is **one path that stays and says "Could not sign out" while already signed out**. Pressing again succeeds: there is no session, so no server call is made, the session is removed, `{ error: null }` is returned and the page navigates. That path was traced in source and was not reproduced against the local stack [R/I].

## (b) Every remaining sign-out call site [R]

| Site | Checks `{error}` | Uses the helper | Judgement |
|---|---|---|---|
| `components/shell/AccountShell.tsx` (rail and onboarding bar) | yes, via helper | yes | Complies. |
| `components/ui/AccountMenu.tsx` | yes, via helper | yes | Complies, but see F2 and F3. |
| `app/account/AccountClient.tsx:601` (SignOutAction) | yes, via helper | yes | Complies. |
| `app/settings/SettingsClient.tsx:215` (staff equivalent, goes to /login) | yes, via helper | yes | Complies. |
| `app/login/page.tsx:226` PractitionerPanel ("Sign out and use another email") | yes, throws on error | no | Safe. On success it swaps state in place (no hard navigation) and has its own failure string. This is a switch-account flow inside the door, not a menu sign-out. |
| `app/invite/[token]/page.tsx:106` switchToAnotherEmail | yes | no | Safe. On success it calls `router.push(signInHref)`, a soft navigation, and has its own failure string. |
| `lib/doorSession.ts:27` `signOut({scope:'local'})` | no | no | Acceptable. It runs only after `getUser()` returned a 4xx, so the server already rejected the session. A failure here leaves only a dead cookie, and the door still works. |
| `proxy.ts:82` (server side, user has no email) | no | n/a | Not part of this diff. It fails closed because it redirects regardless. |

## Findings

| id | severity | file:line | what | evidence | proposed fix |
|---|---|---|---|---|---|
| F1 | MINOR | `lib/signOut.ts:6-10, 15` | The JSDoc claims supabase-js "removes the local session only after the server call succeeds … returns `{ error }` otherwise with the session still in place". That is false on the refresh-rejected path: the session is removed and `{error}` is still returned. The user sees "Could not sign out. Try again." on a page that still renders signed-in, although they are signed out. Retry recovers. This is a safety claim asserted from the consumer side only, the pattern CLAUDE.md rule 14 records. | [R] GoTrueClient.ts:3796-3797, 4690-4697; scenario [I] | Correct the comment. Optionally, on `error` check `(await sb.auth.getSession()).data.session`: if it is null, the local session is already gone, so navigate as signed-out. This is safe because the server rejected the refresh token. That is about 2 lines in the one helper. |
| F2 | MINOR | `components/ui/AccountMenu.tsx:44-50, 107-123` | If the user clicks outside or presses Escape while sign-out is pending, the menu closes. A later failure is then invisible: no navigation and no message, which breaks rule 12 (fail visibly). On reopen the stale error shows even though no new attempt was made. | [X] probe test 3 | Option a: do not close while `signingOut`, by guarding `setOpen(false)` in both listeners with `!signingOut`. Option b: render the alert outside the `{open && …}` block. Also clear `signOutError` when the menu opens. |
| F3 | MINOR | `components/ui/AccountMenu.tsx:120` | `<p role="alert">` is a child of `role="menu"`. A menu may only own menuitem, group or separator children, so some screen readers drop or misreport the node. | [X] probe (DOM containment), [R] ARIA rule | Move the alert to a sibling of the `role="menu"` div inside `rootRef`, positioned the same way. This also fixes F2 option b. |
| F4 | MAJOR | `components/auth/SignOutAction.tsx:7-31` (no test) | The new error state and alert in SignOutAction have no test. Mutation M3 removed the error display entirely and every test stayed green. SignOutAction is the **only** sign-out on a phone (UX-02 pick 2a puts it on the Account page) and the only one for staff (/settings). The code works (probe 1 and 2), but the security-critical failure path on these two surfaces is unguarded. | [X] M3 survived; [X] probe 1 and 2 pass | Add one test to `app/account/AccountClient.test.tsx` or a `components/auth/SignOutAction.test.tsx`: mock `{error}` first and `{error:null}` second, then assert the alert, no navigation, a retry that navigates and the alert cleared. Probe 1 is the template. |
| F5 | MINOR | `app/login/page.tsx:151, 194-195`; `components/auth/MagicLinkSignInForm.tsx:101` | The bland line is clean, but the same organiser-door screen still says "If yours isn't on the list, ask an admin to add you", "Contact an admin to be added" and "…whether an address is on the organizer list" (US spelling). None of these reveals the status of a given email, but they keep the "list/admin" framing the ruling removed from the failure line. The commit body says "Same words for every organiser log-in failure", which holds for the dictionary only. | [R] | Frontend copy, so per the standing rule show Ivan the before and after first. Candidate: drop the "list" sentences and reuse the bland framing, for example "Only organiser emails can log in." No code change before his pick. |
| F6 | MINOR | `app/login/page.tsx:226-232`; `app/invite/[token]/page.tsx:106-108, 112` | Both check `{error}`, so they comply with "never ignore error". Neither hard-navigates on success. PractitionerPanel swaps to the form in place and invite uses `router.push`. They also have their own string, "Couldn't sign you out. Try again.", against the helper's "Could not sign out. Try again.". The risk is low: the supabase-js singleton session is removed and Next 16 dynamic `staleTimes` default to 0. Still, they are two divergent sign-out paths. | [R]; risk [I] | Option a: accept, since these are door switch-account flows outside ruling 1's named set. Option b: import `SIGN_OUT_FAILED` so there is one string. Option c: widen the helper to `to: string` and route both through it. That changes PractitionerPanel's in-place swap to a reload of /login, so check the focus-heading UX first. Ivan picks. |
| F7 | NIT | `components/shell/BrandMark.tsx:49` | The accessible name is still "Eventar home" when the link now goes to /events for a signed-in attendee. | [R] | Optional: `aria-label={href === '/events' ? 'Eventar, your events' : 'Eventar home'}`. Or leave it, since "home" can read as the attendee home. This is copy, so it is Ivan's call. |
| F8 | NIT | `components/shell/AccountShell.tsx:30-39`, `components/ui/AccountMenu.tsx:39-40, 110-115`, `components/auth/SignOutAction.tsx` | The same pending/error state machine appears three times. `useSignOut` in AccountShell could serve AccountMenu as well. | [R] | Optional. Move `useSignOut` into a client module and use it in AccountMenu, which saves about 8 lines. Leaving it is defensible under rule 11. |
| F9 | NIT | `app/account/AccountClient.tsx:589-593`; `components/auth/auth-error-messages.ts:1-3`; `app/account/AccountClient.test.tsx:16-18` | Stale comments. They say "same client-side supabase.auth.signOut() pattern" when the code now uses a helper. They also cite `URL_ERROR_MESSAGES` in `app/login/page.tsx`, which no longer exists: /login calls `resolveAuthError`. | [R] grep | Update the comments when these files are next touched. |
| F10 | NIT | `components/shell/AccountShell.test.tsx:67` | `vi.unstubAllGlobals()` sits at the end of the test body, so a failing assertion leaks the `location` stub into later tests. AccountMenu.test uses `afterEach`. | [R] | Move it to `afterEach`, matching AccountMenu.test. |
| F11 | NIT | `AccountMenu.tsx:107`, `AccountShell.tsx:165, 213`, `SignOutAction.tsx:15` | Disabling the focused button while pending drops keyboard focus to `<body>`. On failure the alert is announced, but focus is not returned. SignOutAction already disabled its button before this diff. | [I] | Optional: use `aria-disabled` plus an early return instead of `disabled`, so focus stays for the retry. |
| F12 | MINOR (process) | `components/auth/AuthBackdropCard.tsx:51-53` | (i) The new gradient uses the named colour `black`. AGENTS.md porting rule 4 bans named colours in component files, but `check:ui-colours` does not catch it inside `color-mix`. The rule binds ports and this is a production component, so read it as a guideline. (ii) The backdrop now looks different: about #003E86 at the centre in light and about #466187 in dark, against the old #0E79EC in both. White-text contrast is about 11:1 in light and about 6.4:1 in dark, so AA holds (computed, not rendered). Under the 2026-10-14 frontend rule this needs a before and after shown to Ivan. | [X] check:ui-colours passes; [R] tokens at globals.css:312, 432, 513; contrast [I] by computation | The user-lens agent should take light and dark screenshot pairs. If a token is preferred over `black`, use `var(--inverse-surface)` or whatever the Frontend Design Standard names, but that is a design call for Ivan. |
| F13 | NIT (observation) | `lib/signOut.ts:14` | `signOut()` uses the default `scope: 'global'`, which revokes every device's session. This behaviour predates the diff and is unchanged. | [R] GoTrueClient.ts:3783 | None. Recorded so that "sign out" meaning "everywhere" is a known product fact. |

## (c) React state notes

- `useTransition` with an async function (React 19): it works. Updates after `await` apply, even though they are not marked as transitions [X probe 1].
- Double click: blocked by `disabled`. `signOut` was called once [X probe 2].
- Unmount after navigation: once `location.href` is set, the component calls `setSigningOut(false)`, so the label flips back to "Sign out" for a moment before unload, and a click in that window would re-run sign-out with no session. That re-run returns `{error:null}` and navigates again, so it is harmless [R/I].
- Onboarding variant: the error renders in its own bordered row under the bar, before the phone "Signed in as" line. That placement is fine. The rail variant puts the error under the button and is desktop only. Phone users sign out on /account, where SignOutAction carries the error (F4).

## (d) Wrong-door strings [R]

- Dictionary: `not_authorized` and `not_organiser` (organiser audience) both resolve to `ORGANISER_WRONG_DOOR`. Neither mentions a password, list, team or admin. The line points to "Attendee log in" and "Sign up", and both are real links on the page: AuthBackdropCard's other-door link and "Attendee sign up". `app/login/page.test.tsx:106` asserts the Attendee log in link.
- Signed-in non-organiser panel (`app/login/page.tsx:264-276`): "Organiser log in is for organiser emails only." The panel is shown only to the authenticated owner of the email, so it enumerates nothing. It mentions "admin", which is fine after authentication.
- Residual list/admin language elsewhere on the door: see F5.
- Tests: `auth-error-messages.test.ts` asserts that both codes resolve to the **same** string, a negative regex over every forbidden word, and positive pointers. Copy is the behaviour here, so these are meaningful. The login page test adds a negative `queryByText` for the old leak strings.
- Not checked (outside this diff): whether the organiser door's submit response differs for staff and non-staff emails. That would be enumeration by behaviour rather than by copy.

## (f) Project rules

- Hard rules 1-11: no server action, migration, RLS, email or logging change in these four commits. No PII is logged, because the helper discards the error object.
- Rule 12 (fail visibly): met everywhere except F2.
- Surgical scope: the menu label changes and the comment edits in AccountMenu are within ruling 2. No unrelated churn was found.
- Convention: the helper and the `role="alert"` error pattern match the existing PractitionerPanel and invite patterns.

## Verdict

No BLOCKER. One MAJOR: F4, a test gap on the phone and staff sign-out surface (the code itself works). Five MINOR: F1, F2, F3, F5 and F6, plus F12 (process). The rest are NITs. Merge-safe after F4. F1, F2 and F3 are small and worth doing in the same pass. F5, F6 option b or c, F7 and F12 are frontend or copy calls for Ivan.
