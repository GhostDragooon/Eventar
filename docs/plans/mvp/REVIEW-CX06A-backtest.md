# REVIEW CX-06a backtest lens (live, :3100, curl + psql + Mailpit, no browser)
Date 2026-10-24. Reviewer: Claude Sonnet 5.5 (backtest agent). Local stack only; :3100 dev server (review mode off) reused, nothing started or stopped. Fixture prefix `cx06bt`.
Evidence tags: [X] executed, [R] read, [I] inferred.

Result: **0 BLOCKER, 0 MAJOR, 2 MINOR, 2 NIT.** No hostile value reached a redirect target, a hidden field, a magic-link `redirect_to`, or the wizard's post-wizard destination [X].

## Findings

| ID | Sev | Route / function | What I saw | Ev | Suggested fix |
|---|---|---|---|---|---|
| BT-1 | MINOR | `/account/claim`, `/account/record`, `/account` guards -> `/account/complete` | A freshly signed-in practitioner with an incomplete account who lands on `/account/claim` (signed in via the SIGN-IN door, `next=/account/claim`) is streamed to `/account/complete` with no `next`; the wizard's "Done" then goes to `/account/record`. Observed: GET `/account/claim` and `/account/record` with that session each embed `NEXT_REDIRECT ... /account/complete`. Only the sign-UP hop carries `next` (verified end to end below). Doors that still lose it for an incomplete account: `/account/sign-in?next=/events/<id>` (event page), `/checkin/confirm` link `/account/sign-in?next=/account/claim`. The registration success card's own CTA (`/account/sign-up?next=/account/claim`) is NOT affected. Same as the card's Open Q2 / Deviation 2. | X | Card for the four guard redirects to pass `?next=<own path>` (files outside CX-06a). |
| BT-2 | MINOR | `/auth/callback` `errorBase` (lib/authDoor.ts `classifyPath` on the raw string) | `/auth/callback?next=/account/../dashboard` (no code) -> 307 `/account/sign-in?error=missing_code&next=%2Faccount%2F..%2Fdashboard`: an organiser-bound next is sent to the ATTENDEE door. Same with `code=bogus` (`exchange_failed`). It is harmless here because the sign-in page then drops that `next` (resolved `/dashboard` is organiser) and the next is only echoed, never followed. A valid code with that `next` would `redirect(new URL('/account/../dashboard', url))` = `/dashboard`, same origin (not executed, no hand-edited link; the action never emits such a link) [I]. Card Open Q1. | X (error hop), I (valid-code hop) | Resolve before classifying in `classifyPath` / `safeNextPath` (move the resolve step from `attendeeNext.ts` into `lib/authDoor.ts`). |
| BT-3 | NIT | `attendeeNextPath` (gate) | The gate accepts a nested destination on the wizard path. A hand-posted `sendAttendeeMagicLink` with `next=/account/complete?next=//evil.example` (and `...=/dashboard`, `...=/account/../dashboard`) is honoured and goes into `redirect_to` as `/auth/callback?next=/account/complete?next=...`. The wizard is the second gate: `/account/complete?next=<any of these>` embeds `$undefined` (default /account/record) and the signed-out redirect rebuilds `here` with no next. Nothing reaches a redirect. | X | Optional: in `attendeeNextPath`, when the path is `/account/complete`, run the inner `next` through `wizardLandingPath` or drop it, so one gate suffices. |
| BT-4 | NIT | `attendeeNextPath('/events')` | `next=/events` (the listing) is NOT honoured: dropped to `/account/record` at the pages (no hidden input), the action (`next=/account/record`) and the wizard (`$undefined`). `/events/<uuid>` is kept. `classifyPath('/events')` is null by design (neutral). `rg` finds no producer of `next=/events` in app/components/lib, so no live regression; the brief expected `/events` to survive, so say so in the hand-back. Before CX-06a (safeNextPath only) `/events` was honoured. | X, R | None needed; note it in the card's behaviour list. |

## Verified OK (hostile input -> observed output at each sink)

Sinks: **P-in** = `/account/sign-in?next=` hidden `next` input; **P-up** = `/account/sign-up?next=` hidden input (the value the emailed link would carry); **Act** = `redirect_to`'s `next` in the Mailpit magic link from `sendAttendeeMagicLink`; **Wiz** = `next` prop embedded in `/account/complete?next=` (signed in, incomplete account; `$undefined` = default /account/record); **CB** = `/auth/callback?next=` with no code.
Method note: the two pages decide client-side after a session check, so a plain curl of `?next=` returns the shell with no form. Their SSR carries the form (and hidden input) only when `?error=` is present, so P-in/P-up were read with `&error=x` added; the `next` is computed by the same function either way [X for the `error` form, I for the post-session-check form]. `-` below = no hidden input rendered / no `next` in the link.

| Input (`next`) | P-in | P-up | Act (link `next`) | Wiz | CB (no code) |
|---|---|---|---|---|---|
| `/account/claim` | kept | `/account/complete?next=%2Faccount%2Fclaim` | `/account/claim` | `/account/claim` | `/account/sign-in?error=missing_code&next=/account/claim` |
| `/account/record` | kept | wrapped (same shape) | `/account/record` | `/account/record` | n/t |
| `/events/<uuid>` | kept | wrapped | `/events/<uuid>` | `/events/<uuid>` | sign-in door, next kept |
| `/account/claim?x=1&y=2` | kept | wrapped, query encoded | kept | kept (`x=1&y=2` in payload) | n/t |
| `/checkin/confirm?t=abc`, `/survey` | kept | wrapped | n/t | `/checkin/confirm?t=abc` | n/t |
| `/account/complete` (wizard itself) | kept | NOT wrapped (`/account/complete`) | `/account/complete` | `$undefined` | n/t |
| `/events` | - | - | `/account/record` | `$undefined` | n/t (see BT-4) |
| `//evil.example` | - | - | `/account/record` | `$undefined` | `/login?error=missing_code` (next dropped) |
| `/\evil.example` | - | - | `/account/record` | `$undefined` | `/login?error=missing_code` |
| `/\/evil.example`, `/<TAB>/evil.example`, `%2F%2Fevil.example` (literal) | - | - | n/t | `$undefined` (literal one) | n/t |
| `https://evil.example` | - | - | `/account/record` | `$undefined` | `/login?error=missing_code` |
| `javascript:alert(1)` | - | - | `/account/record` | `$undefined` | `/login?error=missing_code` |
| `/dashboard` | - | - | `/account/record` | `$undefined` | `/login?error=missing_code&next=/dashboard` (organiser door, as before) |
| `/login`, `/settings` | - | - | `/account/record` (both) | `$undefined` | `/login?...&next=/login`, `...next=/settings` |
| `/events/new`, `/events/<uuid>/edit`, `/invite/abc` | - | - | `/account/record` (events/new) | `$undefined` | `/login?...&next=...` (organiser door) |
| `/account/../dashboard` | - | - | `/account/record` | `$undefined` | sign-in door (BT-2), page then drops it |
| `/account/%2e%2e/dashboard` | - | - | `/account/record` | `$undefined` | sign-in door, next double-encoded `%252e`, page drops it |
| `/account/%2e%2e/%2e%2e/login`, `/account/.%2e/settings`, `/account/..\dashboard`, `/account/..//evil.example` | - | - | n/t | n/t | n/t (pages: all `-`) |
| `/account/../invite/abc` | - | - | n/t | `$undefined` | n/t |
| empty | - | - | `/account/record` | `$undefined` | `/login?error=missing_code` |
| no `next` field posted | - | - | `/account/record` | `$undefined` | n/t |
| `/account/https://evil.example`, `/account?next=/dashboard` (same-origin paths under /account; harmless) | kept | wrapped | n/t | n/t | n/t |
| nested `/account/complete?next=//evil.example` / `=/dashboard` / `=/account/../dashboard` | n/t | n/t | kept in link (BT-3) | `$undefined` | n/t |

Sign-up wrap: every kept destination except the wizard itself is emailed as `/account/complete?next=<encoded dest>`; no destination -> link `next=/account/record` (not wrapped) [X: `su-none`, `su-hostile-raw`].
Signed-out `/account/complete?next=`: good -> redirect `/account/sign-in?next=%2Faccount%2Fcomplete%3Fnext%3D%252Faccount%252Fclaim`; `//evil.example`, `/dashboard`, `/account/../dashboard`, none -> `/account/sign-in?next=%2Faccount%2Fcomplete` [X].

### Real magic-link hops (fresh users; the PKCE `code-verifier` cookie carried in a cookie jar)
- Sign-in, `next=/account/claim`: `auth/v1/verify` 303 -> `/auth/callback?code=...&next=%2Faccount%2Fclaim` -> 307 `/account/claim`; cookies `sb-127-auth-token-code-verifier` and `sb-127-auth-token` set. Ends on the attendee destination [X]. (Then BT-1 for an incomplete account.)
- Sign-up, `next=/account/claim`: verify 303 -> callback `next=%2Faccount%2Fcomplete%3Fnext%3D%252Faccount%252Fclaim` -> 307 `/account/complete?next=%2Faccount%2Fclaim` -> wizard embeds `/account/claim` [X].
- Harness note, not a bug: opening a link without the requesting jar's verifier cookie gives 307 `/account/sign-in?error=exchange_failed&next=...` (matches the page's own "open the link in the same browser" help).
- `code=bogus` with `//evil.example` -> `/login?error=exchange_failed`; with `/dashboard` -> `/login?error=exchange_failed&next=%2Fdashboard`; with `/account/claim` -> sign-in door [X].

### Registration success card (event `CX06BT event`, published, default org, +3 days)
`registerForEvent` (id `40813032...` from the dev manifest, `Next-Action` POST). The card renders client-side after the action, so the event page HTML has no success card (`Create your Eventar record` absent from SSR [X]). I report the action payload, the SSR props the card renders from, and the DB read-back. The prompt is derived from `components/RegisterCard.tsx:184-200` [R], not seen rendered.

| Case | Session props in page (SSR payload) | Action payload | `registrations.user_id` | Prompt per code [R] |
|---|---|---|---|---|
| (a) signed out, `cx06bt-guest@` | `signedIn:false, isStaff:false, defaultEmail:$undefined` | `{"ok":true,"emailDelivery":"queued_dev"}` (captured on a twin guest2 call; first call buried in the re-render stream) | null | "Create your Eventar record" -> `/account/sign-up?next=/account/claim` |
| (b) practitioner, own email `cx06bt-prac@` | `signedIn:true, isStaff:false, defaultEmail:"cx06bt-prac@cx06bt.invalid"` | ok (row exists) | **set** = the practitioner's auth id (matches `auth.users`) | "This is now on your record." + "My record" -> `/account/record` |
| (c) same practitioner, different email `cx06bt-other@` | same as (b) | ok (row exists) | null | none (emails differ) |
| (d) ACTIVE staff (organiser_admin, default org), own email `cx06bt-staff@` | `signedIn:true, isStaff:true, defaultEmail:$undefined` | ok (twin staff2 call: `{"ok":true,"emailDelivery":"queued_dev"}`) | null | none |
| (e) practitioner, own email in upper case | same as (b) | `{"error":"That email is already registered for this event."}` | n/a | n/a (server lowercases; client lowercases `state.email` too) |

`user_id` is set only in (b) [X]. `emailDelivery: queued_dev` = Resend stubbed, so no real mail was sent.

## Not reached
- Browser-only behaviour: the sign-in/sign-up `router.replace(next ?? '/account/record')` for an already-signed-in visitor, the wizard's "Done" `router.push`, and the actual rendered success card. Covered by unit tests per the card, not by me.
- `/account/complete?next=<dest>` for an ALREADY-COMPLETE account (redirect to `landing ?? /account/record`): needs consent, identity, profile and licence rows (consent and licence rows are permanent-ish); not built. The gate in front of it (`wizardLandingPath`) was exercised [X].
- Valid-code callback with a hand-edited dot-segment `next` (BT-2 valid-code hop); `isStaffSession` fail-open (card Open Q3); hosted/staging environment.
- A first `Next-Action` attempt with a `1_email` FormData encoding returned "Please enter a valid email address." (my encoding, not the app); the plain multipart post with `$ACTION_ID_<id>` worked and is what the table uses.

## Fixtures and cleanup
Created: 30 auth users (`cx06bt-*@cx06bt.invalid`: 2 password users prac/staff, the rest magic-link signups), 1 staff row, 1 event `CX06BT event`, 6 registrations (+6 `email_log` rows for them), 28 Mailpit messages, scratch secrets (env, password, cookie jars, links).
Cleanup order: email_log -> registrations -> event -> staff -> auth users (admin API DELETE, 0 failures) -> Mailpit (DELETE by id) -> scratch files.
Counts after: **events=0 staff=0 auth=0 registrations=0**; Mailpit left 0; orphan `users` rows 0; `audit_events` rows mentioning `cx06bt`: 0. The six `email_log` rows were deleted by me with the registrations (transaction, committed); the `rate_limits` table could not be read with my query (column name), so any per-IP `registerForEvent` counter row is unmeasured residue and expires on its own.
`git status --porcelain` before vs after my probes: identical except `docs/plans/mvp/REVIEW-CX06A-dev.md` and `REVIEW-CX06A-user.md`, written by the other two reviewers during my run. I changed no repo file other than this one.
