# REVIEW-R3c: organiser portal, user lens, third pass

- Date: 2026-11-03 (local stack clock Mon 2 Nov 2026 19:1x UTC). Status: **PARTIAL**. ux-member and ux-body walked (read-only and role-gating steps complete; create/publish not). **ux-admin NOT walked** (tool cap).
- Method: built-in browser pane on :3100, review mode off. Sign-in via magic link read from Mailpit. For each persona I clicked the email field, typed, and read back `document.activeElement` (type `email`, full value present) BEFORE submitting. Tags: [X] observed live in the pane, [R] read from the served HTML of an authenticated `fetch()` run in the pane (no hydration, so disabled/aria state is the server-rendered one), [I] inferred.
- Fixtures: **none created.** Save draft never passed validation, so no `ZZ-R3c-...` row exists (checked: `select count(*) from events where title like 'ZZ-R3c%'` returned 0). Existing fixture used read-only: `ZZ-R3b open window` `2a132696-0d91-4bd2-b6cc-dada44f9da5c` (still live, 2 of 3 checked in).
- Sign out: **verified for both personas.** ux-member: real click on sidebar Sign out, page went to `/login`, next navigation to `/dashboard` landed on `/login?next=%2Fdashboard`. ux-body: same. The browser is signed out now.

## Findings

### BLOCKER
None.

### MAJOR
None.

### MINOR

**R3c-1. Body admin's read-only check-in desk shows a "couldn't be checked" error banner that contradicts the page.** [R] On the fixture `/checkin` as ux-body (body_admin), under the Speakers card: "CPD eligibility couldn't be checked just now, so this roster isn't showing which attendees will earn a credit. Check-in still works normally and credits post as usual - only the warnings are missing." This is the same page whose header says the desk is read-only for this role and whose Check in buttons are disabled. The ux-member view of the same event has no such banner. Reads as a transient fault plus a promise ("Check-in still works normally") that is false for this user. Likely a permission-denied fallback treated as an outage [I; the cause was not traced]. Fix: when the role cannot check people in, do not render the eligibility fallback, or word it as "Credit warnings are not shown for your role."

**R3c-2. Timezone copy on /events/new is unchanged for the third pass running (R3-3, R3b-6).** [X] as ux-member, [R] as ux-body, verbatim, under Start/End: "Times are in your local timezone. The event page will display them in the venue's local time." Before a venue is chosen there is no other zone line. A first-timer cannot tell whether 09:00 means their browser's zone or the venue's, and the two sentences imply a conversion the second one never defines. I did NOT pick a venue this pass, so I cannot re-quote the live "Timezone follows the venue" line or judge it. Fix as before: one line, "Times are in <venue zone>.", shown once a venue is set; before that, "Pick a venue first: times are in its timezone."

**R3c-3. Team page leaks a raw role enum and shows invite wording to roles that cannot invite.** [R] `/settings/team` as ux-body shows Role "body_admin" (the chip says "Body Admin"). As ux-member it shows "Member" while the sidebar chip and Settings say "Organiser". Intro for both: "Members of your organisation and invite links." but neither sees any invite control or any other member (only their own row). Settings also offers a "Manage team" button to both. Nothing fails, but the button leads to a page where they can do nothing, and the role vocabulary differs on three surfaces (Organiser / Member / Organiser Admin / body_admin).

**R3c-4. /checkin chooser invites body admins to open a desk they cannot use.** [R] ux-body sees "Open the desk for an event that is live now or coming up" and nine enabled rows with arrows. Each lands on a read-only desk. The chooser has no role note, so the first signal is the read-only header after the click. Low harm, but it is an invitation that ends in "you can't".

**R3c-5. Dashboard footer still contradicts the list.** [X] as ux-member: "15 events." in the header, nine rows shown, footer "Showing the 300 events with the latest dates." (carried from R3-5; not changed).

### NIT

- **R3c-6.** Draft validation reveals one problem at a time. [X] With an empty form: "Add the event basics (name) to continue." After typing a name: "Pick a venue from the dropdown to continue." Clear wording and a warning icon, but a first-timer fixes name, retries, then venue, then (presumably) date and times. I did not see the date/time messages. Consider listing everything missing in one message.
- **R3c-7.** Disabled controls on the body-admin desk give the reason in two forms: the per-row "Check in →" has a `title` tooltip ("Your role cannot check people in. Ask an organiser admin or member."), and the page carries the same sentence once in the Attendance card. The three big tiles (Scan badge, Enter code, Walk-in) are disabled with no per-control reason. The page sentence covers it for sighted users; tooltip-only reasons do not reach keyboard or touch users. Not checked: whether the tiles have `aria-describedby`.
- **R3c-8.** Member and body admin both get the "Email delivery: development stub (no inbox)." line on the dashboard. Environment only.
- **R3c-9 (tooling, not product).** `form_input` set the name field but React did not register it: Save draft still said "Add the event basics (name) to continue." Real typing worked. Do not file as a bug. Also my first coordinate click on "Next" for ux-body sent no email and showed no message; a second click by ref worked. Cause not established (missed click vs a silent no-op); noted so a later pass can watch for it.

## Verified as requested [X]/[R]

- ux-member non-creator on fixture, `/events/<id>/checkin` header: "Live capture only: scan, enter a code or add a walk-in. To edit a person's details, open Registrations." Matches the expected text, no "or roles". [R]
- ux-member Registrations subtitle: "Everyone registered for this event. Edit contact details here. To check people in, open Check-in." Matches. Edit buttons present on all three rows. No role chips on any row (so nothing locked-then-failing for a non-creator). [R]
- ux-body check-in header: "Live capture only: this desk is read-only for your role. To see everyone registered, open Registrations." Matches. Scan badge, Enter code, Walk-in, speaker "Checked in" and row "Check in →" all disabled. [R]
- ux-body Registrations subtitle: "Everyone registered for this event. You can view contact details; an organiser admin or member can edit them." Matches. No Edit buttons at all; search and status filters present. [R]
- ux-body `/events/new` opens (200). Intro: "A name, date, times and venue are enough to save a draft. Use Save draft to keep working on it." (no Publish sentence, so Publish is not offered). ux-member sees the Publish sentence and "Your role can't set accreditation. You can still create the event without it and ask an organiser admin to add it later." [X][R]
- `/settings` as ux-member: chip "ux-member / email / Organiser"; two Sign out buttons (sidebar, Settings > Session); Change email has the right warning ("the change only applies once you click that link"). [X][R]

## Four-question table

| Step | (1) Where am I | (2) Main thing | (3) Progress | (4) Back | Observation |
|---|---|---|---|---|---|
| member: sign-in | Log in, "Organizer access only" | Email | "Next", then link in mail | Back to home | Copy honest ("does not reveal whether an address is on the list"). Expiry stated. |
| member: /dashboard | "Events", 15 events, 1 needing attention | See events / New event | Row Details, Edit, Check-in | Sidebar | R3c-5 footer. |
| member: /events/new, Save draft (empty) | "Create event", 7 numbered sections | Fill name, date, times, venue | Save draft | Cancel | One error at a time (R3c-6); timezone lines (R3c-2). Publish not tried (form incomplete; pickers exceeded budget). |
| member: fixture check-in | Breadcrumb Events > event > Check-in, "Live", "Started 2h 1m ago", 2/3 | Scan / Enter code / Walk-in | Tiles, row Check in | "Registrations →", breadcrumb | Header exact. All controls enabled for an editor. |
| member: fixture Registrations | "Registrations", counts All 3 / Registered 1 / Attended 2 | Edit contact details | Edit per row | "Check-in →", breadcrumb | Subtitle exact; no role chips. |
| member: /settings | Settings, Account, Team, Session | Appearance / email | Change email, Manage team, Sign out | Sidebar | R3c-3. |
| member: Sign out | Sidebar button | Sign out | Real click lands on /login | n/a | Next /dashboard goes to /login?next=%2Fdashboard. Verified. |
| body: sign-in | as above | Email | as above | as above | First click on Next did nothing visible (R3c-9). |
| body: /checkin | "Check-in: choose an event", 1 live, 8 coming | Pick an event | Row arrow | Sidebar | R3c-4. |
| body: fixture check-in | Same breadcrumb, "Live", 2/3 | Read the roster | Search, filters, "Registrations →" | Breadcrumb | Read-only header exact; reason shown; R3c-1 banner contradicts; R3c-7. |
| body: fixture Registrations | "Registrations" | View contact details | Filters, search, "Check-in →" | Breadcrumb | Subtitle exact; no edit controls. Nothing invites a failing action here. |
| body: /events/new | "Create event" | Draft an event | Save draft (no Publish) | Cancel | Opens; whether Save draft succeeds for body_admin NOT tested. |
| body: /settings/team | "Team" | See members | none | Sidebar | R3c-3. |
| body: Sign out | Sidebar button | Sign out | Real click lands on /login | n/a | Next /dashboard goes to /login?next=%2Fdashboard. Verified. |

## Coverage gaps

- **ux-admin persona: not walked at all.** Owed: agenda blocks out of order (14:00 before 09:00), Save draft, reopen the saved event's edit page, confirm start order and that "Blocks are ordered by start time." shows (static copy is present on /events/new, [X] "4 · Agenda ... Blocks are ordered by start time."); empty-start block error "Every agenda block needs a start time."; venue pick and the live timezone line (quote verbatim, judge first-timer clarity); publish a draft through the confirm dialog and read the result.
- **ux-member Save draft success and Publish confirm dialog: not done.** The custom venue, calendar and time pickers needed more calls than were left. The only draft attempt hit the validation messages above. The expected static copy near the Publish button (as member): "Publish event makes the registration page live. Details cannot be edited after publishing yet, so check them first."
- **ux-body Save draft on /events/new:** not tried; I do not know whether a body admin can actually create a draft or whether it fails after the click. This is the main open "invites an action that then fails" question for that role.
- Server-rendered state only for the role-gated pages (fetch of HTML, no hydration): client-side changes to disabled/aria state after hydration are unchecked. aria-describedby on disabled tiles unchecked.
- Dashboard as ux-body not read. Mobile width and keyboard-only: not done.
- Venue timezone line, agenda-order persistence (display_order as sorted position), and the lock-after-publish sentence with an empty agenda (R3b-1 follow-up): still not re-checked.

## Tally

BLOCKER 0, MAJOR 0, MINOR 5 (R3c-1 to R3c-5), NIT 4 (R3c-6 to R3c-9). Tool calls used: 56 of 60 (including this file and the hand-back).
