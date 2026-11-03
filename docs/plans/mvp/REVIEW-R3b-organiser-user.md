# REVIEW-R3b: organiser portal, user lens, second pass

- Date: 2026-11-03. Status: **PARTIAL**. ux-admin walked (steps 1, 2 part, 3, 6 part). **ux-member and ux-body NOT walked** (tool cap; a rate limit also interrupted the run).
- Method: built-in browser pane on :3100, review mode off, magic link from Mailpit. Tags: [X] observed live, [R] read from served HTML/source, [I] inferred.
- Fixtures left (not deleted): event `ZZ-R3b open window` id `2a132696-0d91-4bd2-b6cc-dada44f9da5c` (SQL fixture: published, creator ux-admin, started 10 min before I began, one agenda block with host "Dr ZZ Speaker"). Registrations: ZZ R3b Alpha (`ZZA2K3`, now attended), ZZ R3b Bravo (`ZZB4K5`, still registered, email edited to zz-r3b-b2@eventar-review.invalid), ZZ R3b Walkin (walk-in, auto code, attended). Speaker Dr ZZ Speaker checked in.
- Fixture caveat: my first codes (`ZZA111`, `ZZB222`) used characters the real alphabet excludes (no 0,O,1,I,L), so I renamed them by SQL. Not a product bug; it exposed R3b-2.
- Sign out (ux-admin): **verified.** I clicked the sidebar Sign out button with a real click. The next navigation to `/dashboard` landed on `/login?next=%2Fdashboard`. The browser is signed out now. (The first navigation attempt right after the click failed once with "denied or failed"; the retry worked.)

## Findings

### BLOCKER
None found.

### MAJOR
None confirmed. The prior pass's MAJOR (literal tick text) is fixed: [X] the checked-in rows now show a real "✓" next to the time ("03 Nov 2026, 01:25"), and the Speakers card shows "✓ Checked in".

### MINOR

**R3b-1. Lock sentence: present, but the prior "not found" claim should be re-checked, and its wording points at a page a user cannot name.** [X][R] On `/events/<published>/edit` for my published event the page (between the Agenda block and "Public page") contains: "Details are locked after publishing: nobody can change the title, date, venue or agenda yet. You can still change the CPD accreditation above (organiser admins only, until credit has been issued) and, while registration is open, the registration close date on the Event Manager page. To stop this event, cancel it from the Events page; to change anything else, create a new event there." Next steps are given, which is good. Two problems: (a) "Event Manager page" is not a label anywhere in the nav (the sidebar says Events, Check-in, History, Settings; the card on this page is "Operations") so a first-time organiser cannot tell where that is; (b) the sentence sits at the bottom of the agenda block, after the long CPD/venue/agenda read-only summary, so it is easy to miss. The prior pass saw an almost empty page on `UX03B pub admin`; that event probably has no agenda, so the sentence may render differently or not at all there. I did not recheck that event (no calls left). Treat as: verify the sentence also renders when the agenda is empty.

**R3b-2. A typed code with an excluded character gives no feedback.** [X] In "Enter code" the helper says "6 characters (no 0, O, 1, I, or L). Legacy WK- codes also accepted." I typed `ZZA111` (six characters, contains 1s). The field accepted the text, nothing happened, no error, no live-region message. A person who reads a printed `I` as `1` is left staring at a full field. Fix: say "That code has a character that is not used in codes (1). Check it and try again."

**R3b-3. Wrong-code and duplicate messages are terse.** [X] Wrong code: "Code not recognised." (role alert; good) with no next step (check spelling, try Scan, or Walk-in). Duplicate: "Already attended at 03 Nov 2026, 01:25." It does not say who, so at a busy desk the volunteer cannot tell if it is the right person returning or a shared/forwarded code. Fix: "ZZ R3b Alpha is already checked in (03 Nov 2026, 01:25)."

**R3b-4. Check-in method reads "Manual" for a typed code and for a walk-in.** [X] Roster Method column shows "Manual" for both. Acceptable, but staff cannot separate "typed a code" from "walk-in" in the roster; the Registrations list does not show method at all. NIT-level if the distinction does not matter to organisers.

**R3b-5. Speakers toggle announces nothing.** [X] Pressing Check in on Dr ZZ Speaker changed the card to "1 / 1 · Checked in at 03 Nov 2026, 01:27 · ✓ Checked in" (visible, good), but the only live region still read "Check-in is open." Screen-reader users get no result. Also I could not see an undo control in the card text after toggling (not tested).

**R3b-6. Timezone copy on /events/new still contradicts itself (prior R3-3, unchanged).** [R] Served HTML of `/events/new`, right under the Start/End pickers: "Times are in your local timezone. The event page will display them in the venue's local time." I did not pick a venue this pass, so I could not re-read the live line the prior pass quoted ("Timezone follows the venue - Asia/Hong_Kong."). On the check-in page itself the time is shown as "03 Nov 2026, 01:14 → 03 Nov 2026, 03:24 (Asia/Hong_Kong)" with the zone named, which is the clear form. Judgement: a first-time organiser typing a time cannot tell which zone it is in. "Your local timezone" is the browser's, "the venue's local time" is the display, and nothing says whether 09:00 typed in London means 09:00 London or 09:00 venue. The two lines together imply a conversion that the venue line then denies. Fix: once a venue is set, replace both with one line: "Times are in <venue zone>."

### NIT

- **R3b-7.** Registrations subtitle for creator: "Everyone registered for this event. Edit contact details and roles here. To check people in, open Check-in." Role chips are lowercase "chair"/"presenter" in the accessible names ("chair — ZZ R3b Alpha (locked: already attended)") but "Chair"/"Presenter" visually; attended rows' chips are locked with the reason in the name. Good.
- **R3b-8.** `/analytics` is titled "History" in the nav and page ("100 completed events. Pick one to review it.") while the URL and card say analytics/Analytics. Acceptable; flagged for the vocabulary list.
- **R3b-9.** History is dominated by `DELETE ME` fixture rows, so an organiser reviewing the page cold sees test data. Environment only.

## What worked well [X]

- Closed-loop check-in: typing a valid 6-character code checks the person in with no Enter press. The dialog says so ("It checks them in as soon as it's complete — no need to press anything."), then shows "Checked in · ZZ R3b Alpha is checked in. · Done", and the toast "Marked ZZ R3b Alpha attended (ZZ-R3b open window)."
- Walk-in: Full name + Email, "Register & check in", toast "Registered & checked in ZZ R3b Walkin.", row appears with a generated code and the checked-in time, counter went 1/2 to 2/3 (All 3, Checked in 2, Pending 1).
- Edit a NOT-attended row (Bravo): dialog "Edit registration" with Full name, Email (both editable) and "Their check-in code stays the same, so a pass already emailed to them keeps working." Saving the new email closed the dialog, live region said "Saved changes to ZZ R3b Bravo.", the row showed the new email. It says what happened, but not that nothing was re-sent: the note covers the code, not whether a new email goes to the new address.
- Decorative icon text (schedule, location_on, qr_code_scanner, keyboard) is aria-hidden="true" on the check-in page.
- Check-in header for the creator reads "Live capture only: scan, enter a code or add a walk-in. To edit a person's details or roles, open Registrations."

## Four-question table (ux-admin)

| Step | (1) Where am I | (2) Main thing | (3) Progress | (4) Back | Observation |
|---|---|---|---|---|---|
| Check-in desk, window open | Breadcrumb Events > event > Check-in, "Check-in is open.", "Started 10m ago", "0 / 2 checked in" | Scan / Enter code / Walk-in | Enter code, auto-submits at 6 chars | Close X, Esc, breadcrumb, "Registrations →" | Wrong code "Code not recognised." (R3b-3); excluded-char code silent (R3b-2). |
| Enter code success | Dialog "Enter code" | Check in Alpha | Type code | Done button | Clear success. |
| Enter code duplicate | Same dialog | n/a | Retype | Close | "Already attended at 03 Nov 2026, 01:25." no name (R3b-3). |
| Walk-in | Inline form under the action tiles | Register & check in | Fill 2 fields | "+ Walk-in" toggles | Toast confirms; row appears. No mention of whether a confirmation email goes out. |
| Speakers card | "SPEAKERS 0 / 1" | Check in Dr ZZ Speaker | One button | n/a | Visible change; no announcement (R3b-5). |
| Registrations (creator) | "Registrations", filters All 3 / Registered 1 / Attended 2 / Cancelled 0 | Edit contact details and roles | Edit per row | Breadcrumb, "Check-in →" | Roles locked on attended rows with reason in the name. |
| Edit dialog, non-attended | "Edit registration" | Fix email | Save changes | Cancel, close | Works; toast "Saved changes to ZZ R3b Bravo." |
| /events/new | "Create event", 7 numbered sections; intro "A name, date, times and venue are enough to save a draft." | Name, date, times, venue | Save draft / Publish event | Cancel | Static hint "Blocks are ordered by start time." present in section 4; timezone lines (R3b-6). Agenda out-of-order, Save draft, empty-start error NOT run. |
| /events/<published>/edit | "Edit", status published, summary of venue + agenda | CPD accreditation | Save, links to Public page, Operations, Analytics, QR, Check-in, export | Breadcrumb | Lock sentence present (R3b-1). |
| /analytics (History) | "History: 100 completed events. Pick one to review it." | Review a past event | Click a card | Sidebar | Test fixtures dominate (R3b-9). |

## Spine check (create > publish > registrations > check-in > History), partial

Only the middle was walked live: published event > registrations > check-in (code, walk-in, speaker) > registrations (edit) all worked with visible feedback and nothing died silently, apart from R3b-2 and R3b-5. Create and Publish through the UI, and the event reaching History after it ends, were not exercised. The History page loads (HTTP 200) and lists completed events with attendance counts; my event is still live so it is not there yet [X].

## Coverage gaps

- **ux-member persona: not walked.** I tried to sign in; my keystrokes did not land in the email field (it was not focused after the redirect), no link was sent, and I was out of calls. Still owed: sign in, /dashboard, /events/new Save draft + publish, check-in header on an event they did not create, Registrations subtitle for a non-creator editor, /settings chip and Sign out.
- **ux-body (body_admin) persona: not walked at all.** Still owed: /events/new, /checkin, read-only check-in on a published event (disabled Check in buttons with the reason), read-only Registrations subtitle, and that no control invites an action that then fails.
- Agenda blocks out of order (14:00 before 09:00), Save draft, reopen edit and confirm order by start; empty-start error "Every agenda block needs a start time." (not in served HTML, so it is client-side validation; unverified). The coordinator's note that createEvent now writes display_order as sorted position is not tested.
- Venue pick then live timezone line: not re-read this pass.
- Publishing a draft through the confirm dialog: not done.
- Create flow check that `UX03B pub admin` edit page shows the lock sentence with an empty agenda: not done.
- Mobile width and keyboard-only: not done.

## Tally

BLOCKER 0, MAJOR 0, MINOR 6 (R3b-1 to R3b-6), NIT 3. Tool calls used: 67 of 70, after which I stopped.
