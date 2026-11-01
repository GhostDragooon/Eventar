# REVIEW UX-02 (attendee portal shell): backtest

Backtest agent, 2026-11-01. Code under test: `components/shell/AccountShell.tsx` at HEAD `99403ca`, dev server :3100, local Supabase stack only. Two throwaway personas: new attendee (`zz-ux02bt-new@rls-test.invalid`, no profile) and complete attendee (`zz-ux02bt-cmp@rls-test.invalid`, identity, profile, declared licence, ToS and privacy consents at the current versions).

Legend: [X] executed and measured live. [R] derived from code or from a measurement. Overlay note: the dev "Review mode" pill and Next dev indicator were hidden with `display:none` in the measuring script, for measurements only.

## Summary

BLOCKER 0, MAJOR 1, MINOR 3, NIT 2. Partial: the cap and a browser problem (see "Not verified") stopped the real **Sign out click** checks. What was proven instead is the server side of sign-out and the redirect behaviour.

## Results

| # | Check | Expected | Observed | Result |
|---|---|---|---|---|
| 1a | 375 px, /account and /events: "Registrations" label on one line | `scrollWidth <= clientWidth`, height 17 (one line) | label 70/70 px, 70.3 x 17 in a 74.3 px tab, both pages | PASS [X] |
| 1b | 375 px: all five labels fit | scrollWidth <= clientWidth each | Check-in 47/47, Registrations 70/70, Events 36/36, History 38/38, Account 44/44 | PASS [X] |
| 1c | 375 px: bar height | stable, tappable | 62 px bar, tabs 53 px tall (44 px min met) | PASS [X] |
| 1d | 375 px: no horizontal scroll | `docSW == innerWidth` | /account 375/375, /events 375/375 | PASS [X] |
| 1e | 375 px: last content not behind the bar, scrolled to end | footer bottom <= bar top | /account footer 728 vs bar top 751 (23 px clear); /events 728 vs 751 | PASS [X] |
| 1f | 320 px (real 320 px frame, see note 1): label one line, no overflow | as 1a | label 70/70 in a 74.3 px tab, 12 px gaps between tabs, last tab ends at 316 | PASS [X] |
| 1g | 320 px: bar and tail | bar 62 px, footer clear | bar top 579, footer bottom 556 on both pages | PASS [X] |
| 1h | 320 px: no horizontal scroll | `docSW == 320` | /account 320/320. **/events 335 vs 320** | /account PASS, /events **FAIL** [X] (finding m1) |
| 1i | Unbuilt tabs print "Soon" and are not links | 3 tabs: SPAN, `aria-disabled="true"`, no href, "Soon" present | Check-in, Registrations, History: SPAN, `aria-disabled=true`, no href, "Soon" printed, `sr-only` "(coming soon)", `title` set. Events and Account are `A` with href | PASS [X] |
| 1j | Current tab: one rule and `aria-current="page"` | exactly 1 `[data-current-rule]`, 1 `aria-current` | /account: Account has the rule and `aria-current=page`, Events has neither. /events: the reverse. Rule count 1 on both, at 375 and 320 | PASS [X] |
| 2a | Dark phone: body background | `rgb(10,10,10)` | `rgb(10, 10, 10)`, docSW 375/375, tail clear (556 vs 579 in a 640 frame) | PASS [X] |
| 2b | Dark phone: "Soon" text contrast | >= 4.5:1 for 10 px text | **2.51:1** (`#565656` on `#141414`) | **FAIL** [X] (M1) |
| 2c | Dark phone: dimmed label contrast | disabled text, exempt from 1.4.3, record only | 2.51:1 | recorded [X] |
| 2d | Dark phone: current-tab rule and label | >= 3:1 (rule), >= 4.5:1 (label) | rule 8.26:1, Events 7.57:1, Account 8.26:1 | PASS [X] |
| 2e | Light phone: "Soon" text contrast | >= 4.5:1 | **2.10:1** (`#b3b3b3` on `#ffffff`), same as the dimmed label | **FAIL** [X] (M1) |
| 2f | Light phone: current rule | >= 3:1 | 9.89:1 | PASS [X] |
| 3a | Server side of sign-out: logout call | 204 | `POST /auth/v1/logout?scope=global` with the session token: 204 | PASS [X] |
| 3b | Old access token after logout | rejected | `GET /auth/v1/user` before: 200, after: 403 `session_not_found` | PASS [X] |
| 3c | Fresh GET with the revoked cookie | redirect to sign-in | `/account/complete` streams `NEXT_REDIRECT;replace;/account/sign-in?next=%2Faccount%2Fcomplete` | PASS [X] |
| 3d | Fresh GET with no cookie | redirect to sign-in | `/account` streams `NEXT_REDIRECT;replace;/account/sign-in` (HTTP status is 200 because the stream has begun; see the 2026-10 oracle note) | PASS [X] |
| 3e | Click Sign out in the desktop rail (1280) and on the Account page (375): lands on `/`, cookie gone | | **Not run.** The page never hydrated in my pane (see "Not verified"). Rail structure only: one Sign out button, `logout` icon, below the nav | NOT VERIFIED |
| 3f | Browser Back after sign-out, linger time | | **Not run** (needs 3e) | NOT VERIFIED |
| 4a | Onboarding 375 and 320: "Signed in as <email>" visible under the bar | visible, below the 56 px bar | `display:block`, top 56, 27 px tall, text "Signed in as zz-ux02bt-new@rls-test.invalid", both widths | PASS [X] |
| 4b | Truncates, does not overflow | `text-overflow: ellipsis`, no scroll | computed `text-overflow: ellipsis`, scrollWidth == clientWidth (the 42 character address fits, so the ellipsis itself was not triggered), docSW 375/375 and 320/320 | PASS [X] (ellipsis rule only, see note 2) |
| 4c | Header email hidden on phones | `display:none` under 640 px | `display:none` at 375 and 320 | PASS [X] |
| 4d | Sign out button in view | right edge <= viewport | 375: 274 to 359, 320: 219 to 304, 44 px tall | PASS [X] |
| 4e | Onboarding Sign out works | | Not run (hydration, as 3e) | NOT VERIFIED |
| 4f | 1280: email in the bar, extra line hidden | bar email block, line `display:none` | bar email block 190 px wide, extra line `display:none` (0 x 0) | PASS [X] |
| 4g | Onboarding has no portal nav, brand not a link | | no `nav[aria-label=Portal]`, no `<a>` in the header, at all three widths | PASS [X] |
| 5a | Rail 1280: "Soon" pill contrast, light | >= 4.5:1 | **7.03:1** (`#565656` on `#fafafa`) | PASS [X] |
| 5b | Rail 1280: "Soon" pill contrast, dark | >= 4.5:1 | **7.29:1** (`#a6a6a6` on `#181818`) | PASS [X] |
| 5c | Rail: three "Soon" rows are inert; current item | SPAN `aria-disabled`, one `aria-current` | 3 SPAN rows `aria-disabled=true`; Account the only `aria-current`; no overflow at 1280 | PASS [X] |

Notes:
1. The Browser pane clamps a 320 px emulation to a 335 px window (`innerWidth` read 335). The 320 results above come from a same-origin 320 px wide iframe of the real pages, where media queries see 320. At 335 the bar was also fine (Registrations 70/70).
2. The address is short enough to fit at 320 px, so truncation is proven by the computed style (`ellipsis`, `overflow:hidden` via the `truncate` class), not by seeing an ellipsis. A 60 character address was not tried.

## Findings

### MAJOR

#### M1. The phone "Soon" cue is nearly unreadable: 2.10:1 light, 2.51:1 dark [X]
- Steps: complete attendee, /account at 375, read the computed colour of the 10 px "Soon" under Check-in, Registrations and History, in light and dark.
- Saw: the cue inherits the dimmed colour of the whole unbuilt tab (`text-on-surface-variant/45`), so the "Soon" word has the same colour as the disabled label: `#b3b3b3` on white (2.10:1) and `#565656` on `#141414` (2.51:1). The rail pill, which is the same message, is 7.03:1 and 7.29:1, because it sets its own full-strength colour.
- Why it matters: the previous review's M1 asked for a cue because the three tabs look like a faint style choice. The fix adds the word but at the same faintness, 10 px, so a low-vision or sunlit-phone user still gets no explanation. Disabled controls are exempt from contrast rules, but the "Soon" word is the explanatory text, not the control.
- Fix (small): give the phone "Soon" span `text-on-surface-variant` (solid) the way the rail pill does, keeping the label dimmed: in `TabBar`, add `text-on-surface-variant` to the `aria-hidden` Soon span (the child colour overrides the parent's 45 percent colour). That yields about 7:1 in light, 7:1 in dark. Ivan should see the before and after on the bar.

### MINOR

#### m1. /events overflows by 15 px at 320 px (docSW 335 vs 320) [X]
- Steps: complete attendee, `/events` in a 320 px frame, read `document.documentElement.scrollWidth`.
- Saw: 335. The wide elements are the event card's action row (`View details` plus the `Registering` chip, right edge 327) and the category tab strip. The card here carries a long unbroken fixture title (`set_event_cpd_CREDITED fixture ... DELETE ME ...`, local test data), which sets the card's minimum width.
- Not caused by `AccountShell` (the shell column has `min-w-0`, and /account at 320 has docSW 320). Likely content-triggered by the fixture, but any real long single-token title would do the same. At 375 /events is clean.
- Fix: in the events card, allow the title to break (`break-words` or `min-w-0` on the card content) and confirm with a long title. Belongs to the events listing, not UX-02.

#### m2. Phone "Soon" text and dimmed labels are 2.1:1 in light, 2.5:1 in dark [X]
Same measurement as M1 for the dimmed tab labels. Disabled and exempt; listed so the decision is deliberate. Dimmed rail row labels are 2.08:1 light and 2.5:1 dark (unchanged from the previous review).

#### m3. The browser Sign out click was not exercised, so the landing and Back behaviour are unconfirmed [X, partial]
See "Not verified". Server side of sign-out and redirect behaviour are proven (rows 3a to 3d); the client handler `signOut()` (`supabaseBrowser().auth.signOut().then(() => window.location.href = '/')`) was not seen to run. Note it only navigates after the promise resolves: if the logout request fails or stalls, the user stays on the page with no message and no error. That is a code reading [R], not a measurement.

### NIT

- n1. `signOut()` has no failure branch ([R]): a rejected or never-resolving `signOut` leaves the button doing nothing, with no feedback (Hard Rule 12 flavour). Cheap fix: `.finally(() => { window.location.href = '/'; })` so the user always leaves, the server cookie being cleared by the call or by expiry.
- n2. Onboarding "Signed in as" line is at 12 px; fine, noted for completeness (contrast not measured).

## Not verified (and why)

- **Sign out via the real click** (rail at 1280, Account page at 375, onboarding bar), **landing on `/`**, **Back linger time**: in my Browser pane, `/account/complete` never hydrated. After 4 s and again after 12 s, 0 of 3 `button`/`a` elements carried React props, `document.readyState` was `complete`, 50 scripts present, `visibilityState` visible. A click at that point did nothing (checked: path and cookie unchanged after 5.8 s and 2 s, token still valid). Console showed no errors, but the buffer had dropped 6,567 earlier messages, so a hydration error may have been among them. I do not know if this is a pane artefact (hidden or throttled pane, my iframe reloads) or a real hydration problem on this route. Next step for whoever re-runs it: reload in a fresh tab, check `Object.keys(button).some(k => k.startsWith('__react'))`, then click. A click before hydration does nothing, which is also what a real phone user would see on a slow connection.
- Substituted: the same HTTP calls `signOut()` makes, issued by hand (rows 3a to 3d). They prove the session is revoked server side and that both `/account` and `/account/complete` redirect to sign-in afterwards. They do not prove the button works.
- Rail Sign out at 1280 and the Account page Sign out at 375 were checked for existence only.
- Screenshots: 2 taken (one to wake the hidden pane at 375, one at 320). Neither saved to the repo.
- The dev server runs review mode (`EVENTAR_REVIEW_MODE=true`). The attendee routes do not use the bypass: a signed-out GET of `/account` still redirects to sign-in (rows 3c and 3d), so these checks are valid on this server.

## Environment and cleanup
- Users created on the local stack only (127.0.0.1:54322 and :54321), sessions minted with the password grant and put in the browser cookie `sb-127-auth-token` through a local one-shot `127.0.0.1:8765` JSON server. Cookie values were never printed.
- Deleted: both auth users, their `public.users` rows, the complete user's profile, licence (`ZZBT-001`) and two consent rows. Leftover count query returned `0|0|0`. Audit rows that sign-in wrote may remain (permanent by design).
- The `127.0.0.1:8765` server was stopped (listener count 0) and the scratch files (`sessions.json`, setup script) removed.
- Browser: auth cookie revoked and cleared, `eventar-theme` and my scratch localStorage keys removed, viewport reset to desktop, colour scheme light. The 320 px measuring iframe was in a page that was then navigated away from.
- No code edits, no commits, no `.env.local`, no Supabase MCP, no `pnpm test:rls`, nothing run against :3000. The :3100 server was left running as found.
