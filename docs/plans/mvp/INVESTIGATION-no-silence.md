# INVESTIGATION: "nothing dies in silence", seven areas

**Date:** 2026-11-02 · **HEAD:** `4c04977` · **Lens:** investigator (CLAUDE.md rule 14) · **Tool calls:** about 53 of 70 (stop line 60)
**Scope:** read-only. Code, docs, RV-FINAL review files, local DB (read-only psql). Nothing edited, no server, no DB write, `.env.local` not read.
**Evidence tags:** [X] executed, [R] read in code or docs, [I] inferred.
**Not read in depth:** vault `Frontend Design Standard.md` (grepped for chip/label rules only, no hits that bind these areas) and the organiser IA spec (grepped for chip/sign-out, one hit, non-binding).

## Verdict at a glance

| # | Area | Valid today? | Type | Cost |
|---|---|---|---|---|
| 1 | One word for the attendance log | Yes (4 nouns in use: History, Record, "your record", "Eventar record") | MECHANICAL once Ivan picks the word and the scope (scope is DESIGN, 3 options) | M (about 12 source files, 9 test files) |
| 2 | Registrations row says when check-in opens | Yes (list mode prints "Registered"; the "opens at" string exists only on Check-in) | MECHANICAL (string exists), zone label is a small DESIGN (3 options) | S |
| 3 | Registrations vs Check-in one-line contract (organiser) | Partly (links exist, no sentence says which does what) | MECHANICAL (copy) | S |
| 4 | Incomplete account explains itself | Yes (6 silent redirects; lead sentence is misleading) | MECHANICAL (one sentence). Premise correction: "Done" opens Registrations, not History | S |
| 5 | Claim needed / pending | Yes (guest rows invisible in the portal; hint exists only on /account and the public menu) | DESIGN (4 options) | M |
| 6 | Staff account chip | Partly (a chip exists with name and email; it looks clickable and is not; no role; no sign-out) | DESIGN (3 options) | S to M |
| 7a | Event page leaves the portal | Yes | DESIGN (4 options) | S to L |
| 7b | Global Check-in vs per-event desk | Partly (picker works; its copy contradicts its own list) | DESIGN for the label, MECHANICAL for the copy fix | S |

Count: 4 MECHANICAL (2, 3, 4, and the 1 execution after a pick), 4 DESIGN (1 scope, 5, 6, 7a/7b label).

Two premises in the brief differ from the code; both are in the sections below (area 4: "finishing opens History"; area 6: "the staff shell shows no identity").

---

## 1. LABELS: one word for the attendee's attendance log

### Valid?
**Yes.** The same object is called four things [R]:
- **History**: the portal rail and phone tab (`components/shell/AccountShell.tsx:22`), page title (`app/account/record/page.tsx:22`), page H1 (`RecordClient.tsx:39`).
- **Record**: public Account menu item (`components/ui/AccountMenu.tsx:61`).
- **"my record" / "your record"**: door and in-product sentences (list below).
- **"Eventar record"**: the page's own empty state, the sign-up H1 and all marketing copy.

REVIEW-ivan-rulings-1101-user U-02 already flagged this ("pick one noun") and `IVAN-RULINGS-1101.md` open risk 2 left it open [R].

### Extent: every user-visible occurrence [R, grep of app/ components/ lib/; emails and `supabase/templates` have no hit]

**Tier A, navigation, chrome and door (the labels that name the place):**

| File:line | Current string | Tested by |
|---|---|---|
| `components/ui/AccountMenu.tsx:61` | menu item `Record` | `AccountMenu.test.tsx:28`, `:48` (`/^record$/i`) |
| `app/login/page.tsx:258` | link `Back to my record` (hasRecord) | `app/login/page.test.tsx:173,175,431,436,439,448,452` (`/^back to my record$/i`) |
| `app/account/AccountClient.tsx:486` | link `View your record` | none found |
| `components/auth/AuthBackdropCard.tsx:34` | `Attendee door — your registrations, check-in pass, and record.` | none found |
| `components/RegisterCard.tsx:199` | `This is now on your record.` | `RegisterCard.test.tsx:496,505,516,525,542` (505 exact text) |
| `app/account/sign-up/page.tsx:96` | H1 `Create your Eventar record` | `sign-up/page.test.tsx:47` (heading regex) |
| `app/account/sign-up/page.tsx:105` | `...so that registration can be added to your record.` | none found |

**Tier B, in-product body copy:**

| File:line | Current string | Tested by |
|---|---|---|
| `app/account/record/RecordClient.tsx:95` | `No points on your Eventar record yet.` | `RecordClient.test.tsx:53` |
| `app/account/AccountClient.tsx:281` | `Your Eventar record isn't a substitute for iCMECPD or your college...` | none found |
| `app/account/complete/CompleteClient.tsx:283` | `Your CPD/CME records aren't accessible until this is done.` (rewritten in area 4) | none found |
| `RecordClient.tsx:216,223` | credit chip `On record` / `Not yet on record`, aria `Credit: on record` | `RecordClient.test.tsx:86-99` |

The chip is a credit status (points posted or not), not the page name. Recommendation: leave it (see option 1c).

**Tier C, marketing (the product concept "Eventar record"):** `app/page.tsx:27,42,46,60`; `components/landing/HowItWorks.tsx:59,60,65,87`; `LandingHero.tsx:63`; `LedgerWindow.tsx:43` (h2 `Your Eventar record`). `LandingHero.tsx:40` defines it on purpose: "The record Eventar issues is an Eventar record, a running log". Tests: none matched in a grep of landing tests [R].

**Already History, no change:** rail and tab, page title and H1, `Past events are in History` (`registrations/page.tsx:24`, tested `attendeePages.test.tsx:55`), the organiser's History (`StaffShell.tsx:67`, `/analytics`). Note the organiser History means "what we ran", the attendee History means "what I attended"; Doctrine uses the one word for both (Q47 item 5 and 6) [R]. Not a conflict, but the word will mean two things.

### Proposal (History everywhere, Tier A and B)

| Where | Before | After |
|---|---|---|
| AccountMenu item | `Record` | `History` |
| Wrong-door link | `Back to my record` | see sub-choice below |
| AccountClient link | `View your record` | `View your History` |
| Auth backdrop | `...check-in pass, and record.` | `...check-in pass, and History.` |
| RegisterCard success | `This is now on your record.` | `You are registered. It is under Registrations.` (see note) |
| Sign-up H1 | `Create your Eventar record` | `Sign up` (matches eyebrow and the 2026-11-01 door-copy pick; REVIEW-DOORCOPY M3 asked for this) |
| Sign-up hint | `...added to your record.` | `...added to your Registrations.` |
| RecordClient empty points | `No points on your Eventar record yet.` | `No points in your History yet.` |
| AccountClient:281 | `Your Eventar record isn't a substitute...` | `Your History isn't a substitute for iCMECPD or your college; it's a running log of what you did through Eventar.` |

Two things the rename exposes (rule 12, fail visibly):
- **`This is now on your record.` is wrong under the new split.** History lists past events only (`bucketOf` returns `past` only after the end or a cancel, `myRegistrations.ts:13-19`). A fresh registration appears under Registrations, and the link next to the sentence already says "Registrations". Renaming to "History" would make it more wrong. The honest sentence names Registrations.
- **`Back to my record` points at History, but the attendee's home is Registrations** (default landing at all six sinks, `CX-06a.md:59`). Sub-choice: (a) `Back to History` keeping the href; (b) `Back to my registrations` with href `/account/registrations`; (c) `Go to my portal` to `/account/registrations`. (b) is my pick: the person wants "my stuff", and Registrations is the success home in Q47 item 1.

### Type
**MECHANICAL after one decision; the decision is DESIGN.** Options for the scope:
- **1a. Portal and chrome only (Tier A).** Cost S. Fixes every place a person navigates. Leaves "Eventar record" in marketing and on the History page body. Residual: the page called History says "your Eventar record" in its empty state unless Tier B goes too.
- **1b. Tier A and B (my pick).** Cost M. Every in-product sentence agrees. Marketing keeps "Eventar record" as the product's name for the thing (LandingHero.tsx:40), so the landing promise ("points land on your Eventar record") still lands on a page called History. Residual: that one-hop mismatch.
- **1c. All tiers, including marketing and the credit chip.** Cost L. Single vocabulary. Risk: "record" carries meaning for regulated professionals (the value pitch is an auditable log, `LandingHero.tsx:40`); "Your Eventar history" is weaker as a compliance promise, and the chip "On record" has no obvious History equivalent ("Credited" is a new claim, Q26 gate). Marketing copy is also outside the frontend-review rule's mechanical lane.

### Files and tests affected (1b)
Source: `AccountMenu.tsx`, `login/page.tsx`, `AccountClient.tsx`, `AuthBackdropCard.tsx`, `RegisterCard.tsx`, `sign-up/page.tsx`, `RecordClient.tsx`. Tests to edit: `AccountMenu.test.tsx`, `login/page.test.tsx` (7 sites), `RegisterCard.test.tsx` (5 sites), `sign-up/page.test.tsx:47`, `RecordClient.test.tsx:53`. Use skill `ui-label-rename-sweep` and put copy in its own commit.

### Closed-ruling history (these conflict with the request; Ivan decides)
- **Menu `Record`**: set in the 2026-11-01 sign-out ruling set (commit `4260d35`: "menu items Account, Profile, Record") [R]. `ATTENDEE-SURFACES.md:9` "Menu label 'Record' untouched (ruled)". `CX-06a.md:61` "Not changed on purpose: AccountMenu label 'Record' (public chrome), login 'Back to my record' (door copy)". Seq-13 handoff lines 71 and 173 list "public chrome labels" and "door copy" as closed. **U-02 asked for one noun and was never answered.** Handoff-12 item 4 recommended renaming the menu items to the doctrine labels [R].
- **Doctrine 2026-10-30 / Q47 item 5**: fixes the attendee nav as Check-in, Registrations, Events, History, Account. History is therefore the nav's name; "My record" was the superseded D0 label (`UX-02.md:3`).
- **Door copy picks (2026-11-01)**: words and button were picked; the sign-up H1 `Create your Eventar record` was flagged (REVIEW-DOORCOPY M3) but not changed.

### Risk
Low technically. The risk is vocabulary drift: if Tier A ships without B, the History page speaks of "your Eventar record" under a History heading.

---

## 2. REGISTRATIONS LIST: say when check-in opens

### Valid?
**Yes** [R]. `app/account/registrations/RegistrationRows.tsx`, `Row`: the status line is
`status ?? (mode === 'pass' ? `Check-in opens at ${opensAt}` : 'Registered')`.
`/account/registrations` renders `mode="list"`, so every not-yet-open row reads `Registered`. The "opens at" text exists only on `/account/check-in` (`mode="pass"`), and that page lists only rows opening within 24 hours (`opensWithinADay`, `CHECKIN_SOON_HOURS = 24`, `myRegistrations.ts:35-37`). A person with a pass for next month sees neither. The window is `CHECKIN_OPEN_MINUTES = 60` before the start until the end (`lib/lifecycle/eventLifecycle.ts:5`).

### Extent
Only the list-mode row. Also: the start line above it (`formatInTz(r.event_start, tz)`) prints no zone, so a reader cannot tell whose clock "08:00" is. `Row` already computes `opensAt` for every row [R], so the data is there. The Check-in page lead already says the rule in general terms ("opens 60 minutes before an event starts and closes when it ends").

### Proposal
| Where | Before | After |
|---|---|---|
| Registrations row, not open yet | `Registered` | `Check-in opens at 14 Dec 2026, 08:00 (GMT+8)` |
| Registrations row, start line | `14 Dec 2026, 09:00` | `14 Dec 2026, 09:00 (GMT+8)` |
| Check-in row (pass mode) | `Check-in opens at 14 Dec 2026, 08:00` | same plus ` (GMT+8)` |

Implementation: drop the `mode === 'pass'` condition on the opens string; add a small zone-label helper next to `formatInTz` in `lib/tz.ts` and use it on both lines. `Registered` is no longer shown for upcoming rows (it carried no information the section title "Upcoming" does not).

**Zone handling:** the event's own zone, not the viewer's. Reason [R]: the start time shown on the same row is already in the event zone (`tz = r.event_timezone ?? 'UTC'`), the window is defined against that instant, and the server cannot know an attendee's zone (the `eventar-tz` cookie is the organiser's location per skill `eventar-timezone-correctness`, and a cold request renders UTC) [I]. Mixing zones on one row would be worse than either.

Label choice (small DESIGN):
- **2a. `(GMT+8)`** from `Intl timeZoneName:'short'`, en-GB. Matches the public list (`app/(public)/events/page.tsx` uses it). [X] node output: Hong Kong `GMT+8`, New York `GMT-5`, London `GMT`, Sydney `GMT+11`, UTC `UTC`. Cost XS. My pick.
- **2b. IANA id `(Asia/Hong_Kong)`**, as the organiser Check-in header prints. Cost XS. Longer on a 320 px row, unfamiliar to attendees.
- **2c. Viewer zone plus event zone** ("08:00 your time, 08:00 HKT"). Needs a client component and a browser-zone read; cost M, and a hydration-mismatch risk on a force-dynamic server page. Not worth it for MVP.

### Type
**MECHANICAL** (the string and pattern exist), with the 2a/2b label as a one-line choice.

### Files and tests
`app/account/registrations/RegistrationRows.tsx`, `lib/tz.ts` (+ `tz.test.ts`). Tests: `app/account/attendeePages.test.tsx:106` asserts `/Check-in opens at/` exactly once on the Check-in page (still true; only one row there has it). No test asserts the string `Registered`. Add a Registrations-page test that an upcoming row shows `Check-in opens at`. Time-of-day fixtures must pin `Date` (skill `time-dependent-test-fixed-clock`); the existing tests use relative hour offsets.

### Closed-ruling history
Doctrine section 2 for Check-in: "Today's pass/QR/code; open/closed status" [R, `AccountShell`/check-in page comments]. Nothing closed on this row.

### Risk
Low. A start at 00:30 makes the opens time fall on the previous local date; the full `formatInTz` string (with date) handles it, a time-only string would not. Keep the date.

---

## 3. REGISTRATIONS vs CHECK-IN (organiser): one line each

### Valid?
**Partly.** Behaviour is already split (UX-04, `noRosterLabel.test.ts`, RV-FINAL step 5 PASS). What is missing is a sentence on the page [R]:

| Surface | Today |
|---|---|
| `/events/[id]/registrations` (`page.tsx:86-96`) | breadcrumb `Events > {event} > Registrations`; H1 `Registrations`; subtitle = the event title (duplicates the breadcrumb); link `Check-in →`. Client toolbar: search `Search name or email`, filters `All / Registered / Attended / Cancelled`, per-row `Edit`, role chips. |
| `/events/[id]/checkin` (`page.tsx:132-165`) | breadcrumb ends `Check-in`; eyebrow `Check-in`; H1 = event title; time and venue; link `Registrations →`. Desk toolbar: Scan, Enter code, `+ Walk-in`, per-row `Check in →`, search `Search name or code`, speakers card. |
| Details toolbar | buttons `Registrations` and `Check-in` (UX-04 hand-back) |

Neither page says what it is for. RV-FINAL organiser F42 and UX-04 held item 2 ("Check-in names two destinations") are the same gap [R].

### Proposal
| Page | Before | After |
|---|---|---|
| Registrations subtitle | `{event.title}` | `Everyone registered for this event. Edit contact details and roles here. To check people in, open Check-in.` |
| Check-in header, new line under time and venue | (none) | `Live capture only: scan, enter a code or add a walk-in. To edit a person's details or roles, open Registrations.` |
| Link texts | `Check-in →` / `Registrations →` | unchanged (the sentence names them; `Roster` stays banned by `noRosterLabel.test.ts`) |

The event title is already in the breadcrumb on Registrations, so replacing the subtitle loses nothing. On Check-in the H1 stays the event title.

### Type
**MECHANICAL** (copy on existing headers). Ivan should still see the exact lines; they are in the table.

### Files and tests
`app/events/[id]/registrations/page.tsx`, `app/events/[id]/checkin/page.tsx`. No test asserts either header text (`registrations/page.test.ts`, `checkin/page.test.ts` grep clean for these strings) [R]. `RosterClient.test.tsx` and `RegistrationsClient.test.tsx` test the clients, not the headers.

### Closed-ruling history
UX-01 pick b2 and UX-04 (the split); Q47 item 5 ("the event check-in entry stays inside each event"). UX-04 held item 2 ("Check-in names two destinations") is still open, and area 7b below is the other half of it.

### Risk
None. One edge: the Check-in line says "add a walk-in" and walk-in is available to the roles allowed to check in; a read-only role sees a disabled desk (F22 in RV-FINAL organiser). Wording "Live capture only" stays true.

---

## 4. INCOMPLETE ACCOUNT: say registrations are saved

### Valid?
**Yes** [R]. Every attendee page redirects an incomplete account to `/account/complete` with no reason and no message:
`loadMyRegistrations.ts:19` (serves Registrations and Check-in), `record/page.tsx:36-37`, `account/page.tsx:33-34`, `claim/page.tsx:27-28`, `profile/page.tsx:39`. The person who asked for Registrations lands on a form. What the form says (`CompleteClient.tsx:279-285`):
- eyebrow `Account · Complete your profile`, H1 `A few things before you start`,
- lead: `Your CPD/CME records aren't accessible until this is done. It takes about two minutes — after this, event registration only ever asks about the event.`

Problems: "records" is the old noun; it implies data is blocked or lost; it never says the registration the person just made is saved; and the onboarding shell has no portal nav (spec FR-007), so nothing on screen contradicts the fear. `AccountMenu` hides Record/Profile/Claim for incomplete accounts by Ivan's 2026-09-21 call (`AccountMenu.tsx:13-19`), so the public menu shows only Account and Sign out.

**Premise correction.** "Finishing opens History" is not what happens. `CompleteClient.tsx:43` defaults `next = '/account/registrations'` and `complete/page.tsx` redirects a complete account to `landing ?? '/account/registrations'` [R]. Finishing opens **Registrations**; History is a tab away. The sentence must say that, or the destination must change (not recommended: Q47 item 1 makes Registrations the attendee success home).

### Proposal
| Where | Before | After |
|---|---|---|
| Lead, `CompleteClient.tsx:283` | `Your CPD/CME records aren't accessible until this is done. It takes about two minutes — after this, event registration only ever asks about the event.` | `Your registrations are saved. Finish this and you will see them under Registrations, with your past events in History. It takes about two minutes, and after that registering for an event only asks about the event.` |

Optional (DESIGN, not needed for the fix): pass the origin (`?from=registrations`) from the five redirect sites so the page can open with "You were sent here to finish your profile". Cost M (five guards plus the `wizardLandingPath` gate, and `next` is already dropped at four of them: `CX-06a.md:28`). The lead sentence alone answers "what happened" and "what next" for every entry, so I do not recommend the param.

### Type
**MECHANICAL** (one string). The optional param is DESIGN.

### Files and tests
`app/account/complete/CompleteClient.tsx` only. No test asserts the lead or the H1 [R, grep]. `CompleteClient.test.tsx` (3 tests) covers `next`.

### Closed-ruling history
Spec FR-007 (no portal until the record exists); the 2026-09-21 doctrine reversal noted in `record/page.tsx:1-12`; CX-06a leftover D-04 (guards drop `next`). Nothing in PICKS.md touches the wizard copy.

### Risk
"Your registrations are saved" must stay true: it is true for guest rows (they exist by email) and for signed-in registrations. It does not promise they are linked; area 5 covers that. Out of scope but adjacent: RV-FINAL practitioner MINOR-3 (Done disabled with no explanation until a licence is declared).

---

## 5. CLAIM NEEDED: a guest registration is invisible until claimed

### Valid?
**Yes**, and this is the biggest silence of the seven [R, partly X].
- Claim is an explicit button by design (Stage C decision Q3, `claim/page.tsx:1-3`). No auto-link at sign-in [R: `sign-in/actions.ts`, callback].
- `listMyAttendanceRecords` reads `.eq('user_id', auth.userId)` (`actions.ts` ~line 493), so a guest registration under the person's email shows **nowhere** in Registrations, Check-in or History. A new account with one guest registration sees `You are not registered for any upcoming events. Past events are in History.` (`registrations/page.tsx:24`), which is false in spirit.
- Where the hint exists today: (1) `/account` only: readiness row `N past registrations to link` (`AccountClient.tsx:266-277`) and link `Link past registrations` (`:478`); (2) the **public** Account menu item `Claim past events` when `unlinkedCount > 0` (`AccountMenu.tsx:62`); (3) the sign-up route when it starts from the guest success card (`next=/account/claim`, hint at `sign-up/page.tsx:103-107`). **The portal shell has none**: no menu, no banner, no link on Registrations, Check-in or History (the UX-02 re-cut removed "Claim in nav" and the Doctrine puts claim under History, `DOCTRINE-two-persona-2026-10-30.md:72`, but no History claim entry was built).
- Live population [X]: the local DB has **132** registrations with `user_id IS NULL` whose email matches a confirmed `auth.users` email (read-only psql). That is the number of "invisible" rows in the fixtures, not a per-user figure.

### Cheap read
Exists: `getUnlinkedRegistrationCount()` (`actions.ts` ~236) returns `{count}`, is 0 for an unconfirmed email (so the banner never promises a claim the RPC would refuse), rate-limited 30/min with `abuseTier:false` so reloads do not trip the sign-out tier [R]. `getAccountMenuState()` already calls it on every public page for signed-in visitors [R]. Cost caveat [X]: the only email index on `registrations` is `(event_id, email)`, so the email-only `ilike` cannot use it. Fine at MVP volume; add a `lower(email)` index before putting it on every portal page render in production (Stage 8 note) [I].

### Proposal
Banner, shown when `count > 0`, on Registrations, Check-in and History (not on /account, which has its own row, and not on /account/claim):

> `We found N registrations made with your email as a guest. Link them to your account to see them here.`  [Link past registrations]

After linking (existing success copy in `AccountClient`/`ClaimClient`): unchanged. The condition is `getUnlinkedRegistrationCount().ok && count > 0`; data needed: the integer only (no row content crosses the boundary, as today).

Placement options (DESIGN):
- **5a. Server-rendered banner inside the three pages** via `loadMyRegistrations` returning `unlinkedCount` next to `items` (it already calls the account actions) and a shared `<ClaimBanner/>` above the content. Cost S to M. Reuses the pattern of the page-level `LoadFailed` alert; no shell change; History gets it by also calling the count. My pick.
- **5b. In `AccountShell`** (a prop fed by each page, or a new layout-level fetch), so every portal page shows it. Cost M; AccountShell is a client component with no data props today, and a layout fetch runs on every navigation.
- **5c. Replace the empty-state sentence only** (Registrations empty: "...If you registered as a guest, link those registrations first"), with no count read. Cost XS, no new query, but only helps people with an *empty* list, and not someone who has one linked and one guest row.
- **5d. Auto-claim at first sign-in** when the email is confirmed. Cost M plus a migration-level decision. **Reverses Stage C Q3** (explicit button), so it is Ivan's constitutional call; listed for completeness, not recommended.

### Type
**DESIGN** (placement and whether to read per render).

### Files and tests
5a: `app/account/loadMyRegistrations.ts`, the three pages (`registrations`, `check-in`, `record`), a new small banner component, tests for each page. `attendeePages.test.tsx` mocks `loadMyRegistrations` (`loaded` object) so it needs a new field; `portalShell.test.tsx` mocks actions and needs `getUnlinkedRegistrationCount`. The "no cross-persona leakage" test restricts hrefs to attendee routes; `/account/claim` is an attendee route and passes.

### Closed-ruling history
Stage C Q3 (explicit button, binding on 5d); Ivan 2026-09-21 second call (claim item only when `unlinkedCount > 0`); UX-02 re-cut (old set 5 "Claim in the nav" superseded, `PICKS.md`, `UX-02.md:19`); Doctrine line 72 (claim under History).

### Risk
Anti-enumeration: the count is the caller's own confirmed email only (same gate as the RPC) [R]. A banner must not appear before email confirmation. Count and claim stay in lockstep by construction.

---

## 6. STAFF ACCOUNT CHIP

### Valid?
**Partly.** The brief's premise ("shows no identity") is not quite right [R]. `components/shell/StaffShell.tsx:198-221` renders a chip at the bottom of the sidebar: initials circle, first name (or email local part) and the email. Ivan's own 2026-09-07 call put it there, and `StaffShell.test.tsx:170` pins "shows the staff email". What is wrong:
- **It looks clickable and is not.** The container carries `hover:bg-surface-container-high cursor-pointer` and has no handler, link or `role` [R]. RV-FINAL F40 said it was unverified whether it is a menu; it is not.
- **No role.** `staff.role` is a prop and is not printed. `ROLE_LABELS` exists (`app/settings/SettingsClient.tsx:42-48`, not exported).
- **No sign-out** except Settings, Session, bottom of a long page (F40, `SettingsClient.tsx:213-218`).
- On a phone the sidebar is a block above the content, so the chip sits between nav and page, not pinned [I from the classes; not rendered].

### Existing patterns to reuse [R]
- `components/ui/AccountMenu.tsx`: outside-click and Escape, `signOutAndLeave`, in-menu error `role="alert"`, keeps open on failure. **Not reusable as is**: items are hard-coded to the attendee set, the trigger is a filled "Account" pill, and the panel opens downward (`absolute right-0 mt-xs`); a bottom-left chip needs upward. Generalising it (items, trigger, placement props) touches four public consumers and its test file.
- `AccountShell.tsx` `useSignOut` + a quiet rail row (UX-02 pick 2a, attendee): same behaviour, no menu.
- `lib/signOut.ts` `signOutAndLeave('/login')` is the one sign-out (commit `4260d35`): leaves only after the server revoke succeeds; failure shows `Could not sign out. Try again.` and retries. Settings already uses it with `'/login'` [R].

### Options
- **6a. Make the chip a real menu.** Button with a popover opening upward: line 1 name, line 2 email, line 3 role label (`Organiser Admin`); items `Settings`, `Sign out`. New `StaffAccountMenu` reusing the AccountMenu idiom (copy the 60 lines, or extract a shared popover hook). Cost M. Gains: identity, role, sign-out one click from every staff page, honours "real menu". Risks: needs focus handling and Escape; new test file; the `ui-primitive-allow` annotations for menu rows (as AccountMenu does).
- **6b. Keep it static, make it honest, add a quiet Sign out row.** Remove `cursor-pointer` and the hover fill; add the role line; add a `Sign out` row under the nav, mirroring the attendee rail (UX-02 pick 2a) with `signOutAndLeave('/login')`. Cost S. Gains: same outcomes as 6a with less code and exact parity with the attendee shell. Costs: the chip is not a control, so "Settings" stays in the nav only.
- **6c. Minimum: drop the clickable look and print the role; leave sign-out in Settings.** Cost XS. Fixes the lie (looks clickable) and "who am I"; does not fix F40 (no obvious exit at a shared check-in desk). Not enough for "nothing dies in silence" on a shared device.

Recommendation: 6b if Ivan wants parity and speed, 6a if he wants the menu he asked for. They are not equivalent; I would not average them.

### Type
**DESIGN** (frontend review rule: show before and after, Ivan picks).

### Files and tests
`components/shell/StaffShell.tsx` (+ `StaffShell.test.tsx`, which asserts the nav's four links in order at line 100: a new link-like Sign out must be a `button`, not an `<a>`, so `getAllByRole('link')` assertions at lines 49 and 62 stay green). 6a adds `components/shell/StaffAccountMenu.tsx` + test. `ROLE_LABELS` would move to a shared module (touches `SettingsClient.tsx`). Sign-out has its own backtest skill (`eventar-sign-out-server-revoke`).

### Closed-ruling history
Ivan 2026-09-07 account chip bottom-left; sign-out ruling `4260d35` (2026-11-01) fixed the failure behaviour (leave only after the server revoke) and F40 states plainly that a chip menu "is not a re-opening of the closed sign-out behaviour ruling: behaviour (no confirm, lands on /login) is fine" [R]. UX-02 pick 2a (attendee quiet row) and Doctrine line 73 (attendee Account includes sign out). U-12: a staff session on the public pages has no Sign out at all (`StaffProgrammePill`); out of this card but the same family [R].

### Risk
Moderate only for 6a (new interactive component on every staff page). Backtest needed: sign out from the chip, then Back (U-01/F41 bfcache restore of a signed-in view is a separate open risk and is not fixed by any option here).

---

## 7. ATTENDEE CHROME and GLOBAL vs EVENT CHECK-IN

### 7a. Public event page vs the portal

**Valid?** **Yes** [R]. `/events` (list) switches to `AccountShell` for a signed-in complete attendee (`app/(public)/events/page.tsx` end, UX-02 pick 3b). `/events/[id]` always uses `PublicShell` (`app/(public)/events/[id]/page.tsx:217`): pill brand to `/events`, "Upcoming events", and the Account menu. No Registrations, Check-in, History or Account links, so the only way back to the portal is the menu or browser Back (RV-FINAL practitioner MINOR-4). Same for the pass page `/checkin/confirm` and `/survey`, which also use `PublicShell`; the pass page is reached from "Show my pass" in the portal, so it is the same exit [R: PublicShell importers are exactly these three pages].

**Options (DESIGN, at least 3):**
- **7a-1. Back strip.** A one-line strip above the content, only for a signed-in, complete, non-staff attendee: `← Back to my registrations` (links `/account/registrations`). Cost S: a tiny component, data already on the page (`signedInUser`, `isStaff`, `accountComplete`). Keeps the hero band intact and the public look for everyone else. Residual: it is a back link, not navigation; the pill still shows the public menu. My pick for MVP.
- **7a-2. Wrap in the portal shell** for signed-in complete attendees (same condition as `/events`). Cost M to L: `AccountShell` adds a 232 px rail and the page's full-width hero band and RegisterCard layout were designed for the pill shell; `page.test.tsx` finds `PublicShell` in the tree (`findElement(PublicShell)`, `page.test.tsx:96,101,126`) and would need a branch; the pass page and survey then need the same treatment or they remain exits. Gives true consistency; also Handoff-12 item 4 said "wrapping event detail in the shell later" [R].
- **7a-3. Portal links inside the pill** for signed-in attendees: replace the `Upcoming events` link with Registrations, Events, History in `PublicShell`. Cost M. Smaller than 7a-2, but the pill is already tight at 375 px (`PublicShell` comments on width), and it changes the closed public chrome.
- **7a-4. Leave it and rely on the Account menu.** Cost 0. The menu has Record/Profile/Account/Sign out but no Registrations; so "back" is not even in the menu. If Ivan chooses this, at least add `Registrations` as the first menu item (one line, one test).

**Files and tests:** 7a-1: a new component + `events/[id]/page.tsx` + a render test (page tests find `PublicShell` by element, unaffected). 7a-2: as above. **Closed-ruling history:** UX-02 re-cut pick 3 = b (/events in the shell), `db29673` (signed-in brand to `/events`), handoff-12 item 4 (event detail "later"). The seq-13 "public chrome labels" closure is about the labels, not the shell; this is not a re-opening of labels unless 7a-3/7a-4 changes menu items.

**Risk:** the event page is also what a signed-out visitor, a staff user previewing, and a guest see; every option must be conditional on the exact `signedIn && !isStaff && accountComplete` triple (an incomplete account's portal links all bounce to the wizard, area 4).

### 7b. Sidebar "Check-in" vs the per-event desk

**Valid?** **Partly.** What each does [R]:
- Sidebar `Check-in` → `/checkin` (`StaffShell.tsx:65`, `app/checkin/page.tsx`): eyebrow `Check-in`, H1 **`Pick an event to run the door`**, sub `N live now · M coming up`, then a list of the organisation's published events that are live, registering or upcoming, each with `attended / registered` and an arrow to `/events/[id]/checkin` (the desk). Empty state: `No open events. Check-in unlocks 60 minutes before an event starts.`
- Per-event `/events/[id]/checkin`: the desk itself (area 3).

Findings:
1. The empty-state sentence contradicts the list. The list includes events that are *not* open yet ("coming up", registering), so the page can show events and still call them "open", and it says "No open events" when only unpublished/far-future ones exist. The reason it is empty (nothing published and upcoming) is not stated.
2. "Check-in" names two destinations (UX-04 held item 2, still open) [R].
3. The H1 is a verb phrase ("run the door") where the rest of the product uses nouns; fine but unlike its sibling.

**Options:**
- **7b-1. Keep "Check-in"; fix the picker copy (my pick).** Cost S, MECHANICAL for the copy.
  - H1 `Pick an event to run the door` → `Check-in: choose an event` (or keep) with sub `Open the desk for an event that is live now or coming up. A desk opens 60 minutes before the start.`
  - Empty state `No open events. Check-in unlocks 60 minutes before an event starts.` → `No published events to check in. Publish an event and its check-in desk appears here.`
- **7b-2. Rename the sidebar item** to `Check-in desk` (or `Door`). Cost S in code (`StaffShell.tsx:65`, `StaffShell.test.tsx:33,73,100`, the `Check-in` breadcrumb and eyebrow stay), but **it amends Q47 item 5**, which locks the label "Check-in" for the organiser nav (and `CX-04R` pick). Ivan's call.
- **7b-3. Make the sidebar item go straight to the desk when exactly one event is live**, and show the picker otherwise. Cost M. Saves a click at a busy door; adds a redirect whose Back behaviour loops, and hides the picker's counts. Behavioural, not copy.

**Type:** copy fix MECHANICAL; label rename DESIGN (touches Q47). **Files and tests:** `app/checkin/page.tsx`; no test asserts the H1 or the empty sentence (`app/checkin/` has no test file, grep of `Pick an event to run the door` finds only the page) [R]. 7b-2 also: `StaffShell.tsx`, `StaffShell.test.tsx`. **Closed-ruling history:** Q47 item 5, Q19 (`/checkin` is owner-only, which the doctrine's open desk contradicts; recorded in Q47 consequences), UX-04 held item 2. **Risk:** low for 7b-1.

---

## Recommended order

1. **Area 4** (S, one string; fixes the most confusing first screen for a new attendee and corrects a wrong premise).
2. **Area 2** (S; mostly existing string, one label pick).
3. **Area 3** (S; two copy lines).
4. **Area 7b-1** (S; fix the picker copy; the rename stays a question).
5. **Area 1** after Ivan picks scope 1a/1b/1c and the `Back to my record` sub-choice; do it as its own sweep with `ui-label-rename-sweep`. Fix the `This is now on your record.` lie in the same commit as the rename.
6. **Area 6** after Ivan picks 6a/6b/6c.
7. **Area 5** (placement pick; add the `lower(email)` index note to the Stage 8 list).
8. **Area 7a** last: 7a-1 is cheap but 7a-2 is a real redesign.

Frontend rule: items 1 to 4 are copy edits under the MECHANICAL threshold, but each still needs its before and after shown to Ivan in the review (tables above). Items 5 to 8 need his pick first; do not apply any of them yet.

## Conflicts surfaced, not averaged

- **Area 1 vs closed rulings:** "public chrome labels" and "door copy" were listed closed in seq 13; this list reopens `Record` (public menu) and `Back to my record` (door). The 2026-11-01 ruling that fixed `Record` came inside a sign-out fix and U-02 asked for the noun to be picked, so the history supports reopening, but it is his call.
- **Area 4 premise:** "finishing opens History" does not match the code or Q47 (Registrations is the success home).
- **Area 6 premise:** a chip with name and email exists; the gaps are the clickable look, the role and the sign-out.
- **Area 1 vs area 5:** the Doctrine puts claim under History; the nav work moved it out and nothing replaced it. Whichever word wins in area 1, the banner in area 5 should link to the same place.
