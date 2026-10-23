# Review round 1b: CX-07 disposition (2026-10-23)

Run as queue item 1 of `handoff_20261023-mvp-execution.md`. Three separate lenses: `REVIEW-CX07-dev.md`, `REVIEW-CX07-backtest.md` (curl, psql, real sessions on :3100), `REVIEW-CX07-user.md` (browser, magic-link sign-in). No BLOCKER. Evidence: [X] executed, [R] read.

| File | Lens | B / M / m / n |
|---|---|---|
| REVIEW-CX07-dev.md | dev | 0 / 2 / 6 / 8 |
| REVIEW-CX07-backtest.md | backtest | 0 / 2 / 2 / 4 |
| REVIEW-CX07-user.md | user | 0 / 4 / 3 / 3 |

The redirect itself works: 12 gated routes answer 307 to `/login?error=multiple_organisations` with the session kept, a refreshed token is carried, only two ACTIVE rows trigger it, the one-org and no-staff controls behave as before, and the write layer fails closed [X, backtest]. The new sentence reads well and has no "try again" [X, user].

## The one finding that matters: the fix covers one door [X]

All three lenses found the same thing independently. `getStaffSessionState` still returns `'unknown'` for the two-organisation person, and `'unknown'` means "outage" to its consumers:

- `/login` with no `?error=` shows the old "We could not check your organizer access just now ... try again in a moment" (user U1, backtest F1, dev DEV-01).
- The public "Start an Event" button (`components/landing/LandingHero.tsx:72`, `LandingNav.tsx:98`) goes to `/login?next=/events/new`, so the most natural organiser click shows the old text, not the new one (user U2) [X, R].
- `isStaffSession` is false for them, so `/account` redirects to the practitioner onboarding (`/account/complete`), the `/events` shell shows the practitioner Account menu (backtest F2, user U7). Pressing Continue returns `db_error` and writes nothing [X].

I traced all six consumers of the state [R]: `requirePractitionerSelf`, `acceptRequiredConsents` and `registerForEvent` use `'staff'` only to refuse; `getAccountMenuState`, the `/account` layout and the public event page use it only to frame. Nothing grants anything on `'staff'`.

### Decision for Ivan (it changes the tri-state contract, so not a drive-by)

| Option | What changes | Fixes | Cost |
|---|---|---|---|
| **A (recommended)** map PGRST116 to `'staff'` in `getStaffSessionState` | One branch in `lib/auth.ts` (a card file), 2 test lines | U1, U2, F1, F2, U7: `/login` and `/account` send the person to `/dashboard`, the proxy shows the CX-07 text, shells show organiser chrome, practitioner writes answer `not_authorized` | Redefines "staff" as "has at least one active row". One extra redirect hop from `/login`. Organiser links in the chrome then bounce to the message. |
| B add a 4th state `'multiple_organisations'` | New union member; every consumer updated | Same as A | Dangerous: `requirePractitionerSelf` returns "allowed" for any value it does not name, so a missed consumer fails open. Widest diff, outside the card's files. Dev lens advised against. |
| C keep the tri-state, add a reason only for `/login` and the account menu | `getAccountMenuState` and `app/login/page.tsx` | U1, U2, F1 | Does not fix F2/U7 (practitioner onboarding, practitioner chrome). Touches files outside the card, and `/login` is front-end (show-and-decide). |
| D accept as shipped, record the limit in `docs/DEFERRED.md` | Docs only | Nothing | Most two-organisation people meet the false message (U2). Rule 12: a message we know is false stays on screen. |

Option A, verified as a trial and then reverted: with the branch changed, the three CX-07 test files pass (50 tests); returning to `'unknown'` fails exactly the new test; the `requireStaff` guard mutation also fails one test [X]. The exact hunk:

```diff
   if (staffErr) {
-    // One email in two organisations (PGRST116): still 'unknown' for the fail-open contract, but say why (CX-07).
-    if (staffErr.code === 'PGRST116') logMultipleStaffRows(userRes?.user?.id, staffErr.code);
+    // One email in two organisations (PGRST116): two active rows prove the person is staff, so say 'staff' and
+    // say why in the log. Every consumer uses 'staff' only to deny or to frame (CX-07).
+    if (staffErr.code === 'PGRST116') {
+      logMultipleStaffRows(userRes?.user?.id, staffErr.code);
+      return 'staff';
+    }
     return 'unknown';
   }
```

### Option A applied and live-checked (Ivan's word, 2026-10-23)

Applied in `lib/auth.ts` with the test updated (vitest 195 files / 1641 passed, tsc and eslint clean, the "back to 'unknown'" mutation fails exactly the staff test) [X]. Live, as a two-organisation person signed in through a real magic link on :3100 (fixture `cx07a-*`, removed):

| Door | Before A | After A |
|---|---|---|
| magic link | message | message |
| `/account` | `/account/complete` (practitioner onboarding) | `/dashboard`, then the message [X] |
| `/events` header | practitioner Account menu | organiser chrome, "Programme" link [X] |
| `/login` bare | "try again" outage text | **stuck on "Loading…"** [X] |
| `/login?next=/events/new` ("Start an Event") | "try again" outage text | **stuck on "Loading…"** [X] |

Cause of the two stuck rows [X observed, R mechanism]: `app/login/page.tsx` finds the browser session, asks `getAccountMenuState`, now gets `isStaff: true` and calls `router.replace('/dashboard')`. `proxy.ts` bounces that to `/login?error=multiple_organisations`. The page is the same mounted component, so its `view` state (initialised from the URL only once, at mount) stays `checking` and renders "Loading…" for good. The URL is already right; a hard load of it shows the form and the message. This is worse than the old text for those two doors (no message at all), so A should not ship without the fix below.

Fix, applied after Ivan allowed the file (2026-10-23) and live-checked: bare `/login`, `/login?next=/events/new` and `/account` as a two-organisation person all end on the form with the message, no "Loading…" [X]. Two tests (with and without `?next=`) fail when either guard is reverted [X]. The diff as applied:

```diff
-  const [view, setView] = useState<View>(() =>
-    urlErrorCode && urlErrorCode !== 'not_organiser' ? { kind: 'form' } : { kind: 'checking' },
-  );
+  const skipsCheck = Boolean(urlErrorCode && urlErrorCode !== 'not_organiser');
+  const [view, setView] = useState<View>(() => (skipsCheck ? { kind: 'form' } : { kind: 'checking' }));
 ...
-    if (view.kind !== 'checking') return;
+    if (view.kind !== 'checking' || skipsCheck) return;
 ...
-  }, [view.kind, router, next, isInvite]);
+  }, [view.kind, skipsCheck, router, next, isInvite]);
 ...
-  if (view.kind === 'checking') return <LoginShell />;
+  if (view.kind === 'checking' && !skipsCheck) return <LoginShell />;
 ...
-        initialError={view.checkFailed ? resolveAuthError('unavailable') : signedOutHere ? null : urlErr}
+        initialError={view.kind === 'form' && view.checkFailed ? resolveAuthError('unavailable') : signedOutHere ? null : urlErr}
```

`skipsCheck` is the page's existing rule ("an error on the URL other than `not_organiser` means an upstream check already failed once"), applied to the live URL instead of only the first render; the `skipsCheck` guard in the effect also stops a second check and bounce when `next` changes. Test to add in `app/login/page.test.tsx` (also closes DEV-03): signed-in staff on bare `/login`, then the search params change to `?error=multiple_organisations`: expect the form and the alert, and `router.replace` called once. First live check after allowing it: bare `/login` and `/login?next=/events/new` as the two-organisation person, expect the message with no "Loading…".

## Fixed in this round (inside CX-07's own files, each with a test that fails without it)

- **DEV-04:** the `requireStaff` guard had no negative test; an unconditional log passed everything. Added "requireStaff does not log other failures as this case, and re-throws them unchanged". Mutation (log unconditionally) fails it [X].
- **DEV-06:** nothing pinned that the real client produces `PGRST116`. Added a test that runs `createClient` with a stub `fetch` returning two rows and asserts `error.code === 'PGRST116'` [X, passes against postgrest-js 2.105.4].
- **DEV-10:** a failed assertion left the `console.error` spy installed and failed later tests. `afterEach(() => vi.restoreAllMocks())` added to that describe; I saw the cascade before the fix (4 failures from 1) and one failure after [X].
- **DEV-05:** the loosened regex in `NewEventForm.test.tsx` could not tell the wrong sentence from the right one. The clock is pinned to 06:00 local (`vi.useFakeTimers({ toFake: ['Date'] })`) and the exact regex is back. Mutation (pin 10:00) fails it [X]. The file belongs to UX-03, so commit it separately from CX-07.

Gates after the fixes: tsc clean; eslint clean on the touched files; vitest 195 files / 1641 passed (405 skipped) [X]. Not re-run: `next build` and `test:rls` (no route or database change).

## Needs Ivan (outside this card's files, or a decision)

1. **The A/B/C/D choice above.**
2. **No support channel exists** (user U3, dev DEV-13) [X, R]: no `mailto:`, address or page anywhere in `app`, `components`, `lib`. "Ask Eventar support" has no destination. The copy is Ivan's own sentence from the card. Options: name a real contact, or say what the person can do instead (ask an admin of one organisation to remove their email from the other).
3. **The `/login` error state is a front-end design call** (show-and-decide): it looks signed-out ("Welcome back", email box, header "Sign in") with no Sign out (U5); resubmitting clears the alert and says "Check your inbox", which reads as success and loops (U4); three competing next steps (U6); focus stays on BODY, alert may not be announced (U8); "organizer" and "organisation" on one screen (U9). Proposal for a specimen round: in this state show "Signed in as <email>", the explanation, Sign out and the contact, and hide the send-link form.
4. **`accept_invite_token` creates the state** (dev DEV-02) [R]: it only refuses membership of the invited organisation, so an admin of A who accepts an invite to B gets a second active row and loses access to both. `provisionOrganisation` can do the same. It fits the SEC card or its own `sql` card; touches hosted.
5. **Public draft event page returns an error boundary** for a two-organisation organiser (backtest F3, dev DEV-07) [X]: `app/(public)/events/[id]/page.tsx:73-80` rethrows the raw PGRST116 object. Under option A it is unchanged; fix is `notFound()` for that code, in a file outside the card.
6. **`app/login/page.test.tsx:277`** does not list the new code, so nothing pins that `/login?error=multiple_organisations` shows its text and skips the re-check (dev DEV-03). A one-word addition to an `it.each`; a file outside the card's list.
7. **`docs/DEFERRED.md:101`** still says the app "logs nothing" and shows "try again" (DEV-08). Update after the decision in item 1.

## Not applied, low value

DEV-09 (the `code` parameter of `logMultipleStaffRows` is always `'PGRST116'`), DEV-11 (duplicate test), DEV-12 / backtest F4 (the redirect drops `?next=`, same as the sibling `unavailable` redirect; `loginUrl('multiple_organisations')` would keep it), DEV-14 (`current_staff_org_id()` picks the oldest row while the app fails closed; record in the K1 decision), DEV-15 / F5 (one error log per request), F7 (dev log prints object args as `{}`), F8 (matcher entries are exact-only), U10 (generic magic-link email).

## Residue and process

- Permanent: 2 `audit_events` rows of type `consent_granted` from the backtest's no-staff control; sign-in audit rows from the user lens. Fixtures removed (`events=0 staff=0 orgs=0 auth=0` in both lenses). 2 local Mailpit messages remain.
- The user-lens reviewer overran its 50-call budget (about 75) and did not walk the one-org control, so "normal" for `/account/complete` is inferred; the backtest did execute the control (`/account` goes to `/dashboard`).
- A new project skill appeared mid-run (`eventar-staff-email-multi-org`) saying the same thing as this note: do not change the contract until Ivan rules. I held to that and reverted the trial.
