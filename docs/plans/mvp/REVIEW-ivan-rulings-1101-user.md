# USER-lens review: sign-out, wrong door, public chrome (2026-11-01)

Scope: /account, /events, /events/<id> (public), /login, organiser /settings; roles attendee and organiser only.
Method: real browser (headless Chrome via playwright-core, own temp profile), app on http://localhost:3100, local stack only. Read-only on source.
Evidence tags: [X] executed, with what I saw. [I] inferred, not executed.

## How I signed in (works, reuse it)

Real app flow, no cookie handling: open `/account/sign-in` (attendee) or `/login` (organiser), type the email, press Next, wait for the "Check your inbox" text, read the newest message to that address from local Mailpit (`http://127.0.0.1:54324/api/v1/messages`, then `/message/<id>`), open the `auth/v1/verify` link it contains. Lands on `/account/record` (attendee) or `/dashboard` (staff).
Do not use admin `generate_link`: it issues an implicit-flow link and the callback needs a PKCE `?code=` (see the comment in `app/auth/callback/route.ts`, `lib/supabase/server.ts`).
Harness trap: if you navigate away straight after pressing Next, the PKCE verifier cookie is lost and the callback returns `?error=exchange_failed`. A real user cannot trigger this that fast.
The Playwright MCP browser was held by another `playwright-mcp` process (pid 76017, started 10:18), so I did not use it and did not kill it.

Test data: three auth users `zz-userlens-1101-{1,2,3}@example.test` (1 = complete attendee, 2 = organiser_admin in org "ZZ-userlens-1101 Org", 3 = incomplete attendee). All deleted at the end, with their profile, licence, consent, staff and organisation rows; counts verified 0.

## Verdict

Sign-out is solid: success lands signed out in all places, failure keeps the user in place with a clear alert and a retry that works, and the wrong door has an exit. Findings are polish: a back-button privacy leak, vocabulary drift (Record / History / Account), US/UK spelling mix on /login, and weak affordances on the wrong-door message.

## Findings

| id | severity | where | what the user sees / does | evidence | proposed fix |
|---|---|---|---|---|---|
| U-01 | MINOR | `/account` (any authed page), browser Back after Sign out | After Sign out lands on `/`, pressing Back restores `/account` with the user's email and name fields visible (navigation type `back_forward`, page text contains the email). Reload then redirects to `/account/sign-in`, so only the cached copy shows. Response header is `cache-control: no-cache, must-revalidate`, which still allows bfcache. Matters on shared devices (event-venue laptops). | [X] headless Chrome: back showed the account page; a second Sign out click on the stale page went to `/` with no error | `Cache-Control: no-store` on authed pages (also disables bfcache), or a `pageshow` handler that re-checks the session when `event.persisted`. Other browsers [I]. |
| U-02 | MINOR | Public-page Account menu vs AccountShell rail vs `/account/record` | Menu reads Record / Profile / Account / Sign out (this order, not Account / Profile / Record). Rail reads Check-in (Soon), Registrations (Soon), Events, History (Soon), Account. "Record" has no rail item. On `/account/record` and `/account/profile` the rail highlights "Account". The page is "Your Eventar record", the Account page links "View your record", the wrong-door panel says "Back to my record". "History" (Soon) is probably the same concept under a third name. | [X] menu text, rail links and `aria-current` read from the DOM | Pick one noun. Either rename the rail's future "History" to "Record", or the menu's "Record" to "History". Highlight the matching rail item (or a sub-item) on `/account/record`. Ivan's call (naming). |
| U-03 | MINOR | `/login?error=not_organiser&next=...` while signed in as a non-staff attendee | Copy: "Attending events? Go to your account." The primary button is "Back to my record" and goes to `/account/record`, not `/account`. Words and target differ. | [X] panel text and link href `/account/record` | Make the sentence and button agree ("Go to my record", or point the button to `/account`). |
| U-04 | MINOR | `/login` and `/login?error=...` | Same page mixes spellings: "ORGANISER · LOG IN", "Organiser door", but "Organizer access only", "authorised organizer records", "organizer list". | [X] page text | One spelling; the product uses "organiser" elsewhere. Fix the three "organizer" strings. |
| U-05 | MINOR | `/login?error=not_authorized` (and `not_organiser`), signed out | The message says "use Attendee log in or Sign up instead" but those words are plain text. The real links are "Attendee sign up" (small, top, 113x18 px) and "Attendee log in" in the footer. At 375 px the footer links sit at y=957 on a page about 960 px tall, so a phone user scrolls to find the way out; targets are 17 px high. No password mention, no hint whether the email is on the staff list (good, bland). | [X] link rects at 1280 and 375; alert text | Make "Attendee log in" and "Sign up" links inside the message, or add two buttons under it. |
| U-06 | MINOR | Every Sign out control (Session card, rail, menu, /account/complete) on failure | After the failure the page says "Could not sign out. Try again." and the button works again, but keyboard focus is on `<body>`. The button is disabled while pending, and a disabled element drops focus. In the Account menu the menu stays open with the alert inside and `aria-expanded=true` (good), but focus is still on body; Escape still closes it. | [X] `document.activeElement` was `BODY` in all places after failure | Use `aria-disabled` instead of `disabled` while pending, or refocus the button after a failure. |
| U-07 | NIT | `/account` with a failed sign-out | Two Sign out buttons on this page (rail and Session card), each with its own alert. After pressing both, two identical alerts show. The rail alert wraps inside the narrow rail ("Could not sign out. Try / again."). | [X] two `[role=alert]` with the same text; screenshot | Acceptable. If wanted, clear the other control's alert when one is pressed. |
| U-08 | NIT | Wrong-door signed-in panel Sign out (`/login?error=not_organiser`) | Its failure copy is "Couldn't sign you out. Try again." Everywhere else: "Could not sign out. Try again." After a successful sign out here the URL keeps `?error=not_organiser&next=%2Fdashboard`. | [X] alert text from the panel; URL after success | Reuse `SIGN_OUT_FAILED`. Optionally drop the query after sign-out. |
| U-09 | NIT | After a successful Sign out | The attendee lands on the marketing `/` and the organiser on `/login`, with no "You have been signed out" line. The user must infer success from the nav showing "Log in". | [X] landing texts | Optional one-line confirmation (`/?signed_out=1`). |
| U-10 | NIT | `/events/<id>` at 375 px, long unbroken title | The page scrolls sideways (`scrollWidth > innerWidth`) and the title is clipped ("set_event_cpd_co..."). The title is a fixture with underscores and 13 digits, so real titles may be fine, but an organiser can type a long code or URL. | [X] `hscroll=true`, screenshot | `overflow-wrap: anywhere` on the event title. |
| U-11 | NIT (observation) | Phone, `/events` | No Sign out on the phone `/events`: the bottom tab bar has Check-in, Registrations, Events, History, Account only. Sign out is Account tab, then Session card at the bottom of `/account`. That works and shows the failure alert there. | [X] 0 sign-out buttons on `/events` at 375; 1 on `/account` | None needed; only note the two-tap path. |
| U-12 | NIT (observation) | Staff email signed in at the attendee door | Lands on `/dashboard`, and `/account` redirects to `/dashboard`. On public pages the staff user sees "You're viewing the public page" and Home, with no Account menu and no Sign out. A staff user who also wants an attendee record cannot reach it with that email. Likely by design (rule: staff identity is separate); say so if it is. | [X] URLs and page text for user 2 | None unless intended otherwise. |

## What passed (executed)

| Journey | Result |
|---|---|
| A1 Session card Sign out on `/account` | Lands on `/` signed out. Back shows the cached page (U-01). Reload of `/account` goes to `/account/sign-in`. |
| A2 Rail Sign out on `/events` (complete account) | Lands on `/`; `/account` then goes to `/account/sign-in`. |
| A3 Account menu Sign out on `/events/<id>` | Lands on `/`; `/account` then goes to `/account/sign-in`. |
| B failure, abort and 500, in 5 places (Session card, rail on `/account`, rail on `/events`, public menu, `/account/complete`) | URL unchanged; `role=alert` "Could not sign out. Try again."; button back to "Sign out", enabled; `/account` still loads (still signed in); nothing says signed out. One logout call per press. With the route removed, the next press succeeds and lands on `/`. At 375 px the alert shows in the Session card, the menu and `/account/complete`. |
| C Organiser Settings, Session, Sign out | Failure shows the alert, button stays usable; retry lands on `/login`. (Back then shows the cached `/settings`; see caveat on review mode.) |
| D wrong door | Signed out, `?error=not_authorized` and `?error=not_organiser` show the same line: "We couldn't log you in as an organiser. If you attend events, use Attendee log in or Sign up instead." No staff-list status, no password. Signed in as non-staff via the organiser door: `/dashboard`, `/settings`, `/events/new` all go to `/login?error=not_organiser&next=...` with the panel "You're signed in as ..., Back to my record, Sign out and use another email". No limbo: both buttons visible and 44 px high at 375; Sign out works, and fails with an alert. `/account` stays signed in. |
| E public chrome | Signed in: brand links to `/events`. Signed out: brand links to `/`. Complete account menu: Record, Profile, Account, Sign out. Incomplete account menu: Account, Sign out only (as the code comment says). Public event page shows "Registering as <name> · <email> — not you?" when signed in. |

## Could NOT check

- Review mode is on for this server (`EVENTAR_REVIEW_MODE=true`, banner on every page). A signed-out request to a staff route is treated as a synthetic staff user, so I cannot tell whether a signed-out visit to `/settings` or `/dashboard` is blocked, nor whether staff Back-after-sign-out is safe. Also the banner and Next dev overlay ("1 Issue", "Compiling...") sit on every screenshot. Re-run C and U-01 on a server started with `EVENTAR_REVIEW_MODE=false`.
- Dev server only; no production build behaviour.
- Safari, Firefox and a real phone; bfcache behaviour there [I].
- Keyboard-only and screen-reader runs (focus findings come from `document.activeElement`).
- "Claim past events" menu item (needs unlinked registrations).
- Roles other than organiser_admin (organiser_member, body_admin, auditor); expired-session (401) sign-out; sign-out in a second tab.
- Staff `/settings` at 375 px; the organiser phone layout.
- Leftovers: sign-ins wrote `audit_events` rows (append-only, cannot be deleted by design) and Mailpit messages to the `zz-userlens-1101-*` addresses on the local stack.
