# REVIEW-FINAL: organiser, user lens

- Date: 2026-11-01. HEAD 4ca0bbe. Lens: user (cold-start organiser). Status: **PARTIAL** (budget cap).
- Tools: Claude built-in browser (mcp__Claude_Browser__*), because the Playwright MCP refused to start ("Browser is already in use ... mcp-chrome-d615853", `browser_close` also refused). psql (read-only except the ZZ-FINAL timestamp updates listed below), curl on Mailpit.
- Tool calls: about 108 of 110.
- Personas walked: ux-admin, steps 1 to 5 fully, step 6 and 7 partly. ux-member and ux-body NOT walked.
- Screenshots: the built-in browser cannot save to a chosen path. I copied the few I took into `/Users/ivan/Eventar/.playwright-mcp/final-walk/` as `org-admin-1.jpg`, `org-admin-2.jpg`, `org-admin-3.jpg`. Step 4/5 shots stayed in the tool-results folder only. A user-lens screenshot per step is missing for steps 4 to 6.
- Organiser time label: all times are labelled "(Asia/Hong_Kong)" on the event; Events home shows "GMT+8". Times read correctly (09:00 HKT stored as 01:00Z). Check-in page showed "01 Nov 2026, 23:28" for 15:28Z, which is correct.

## Per-step table

| Persona | Step | Result | (1) Where am I | (2) Main thing | (3) Progress | (4) Back | Screenshot |
|---|---|---|---|---|---|---|---|
| admin | 1 login | PASS | "Log in" page, labelled Organiser. | Enter email, Next. | "Check your inbox (...) for a log-in link." Link opens, lands on Events (/dashboard). | "Back to home", "Attendee log in" links. | org-admin-1.jpg (Events home) |
| admin | 2 create + Save draft | PASS with MINOR notes | "Create event" with breadcrumb. | Name, date, times, venue, Save draft. | Empty Save draft gives a focused alert "Add the event basics (name) to continue.", then "Pick a venue from the dropdown to continue." After all four fields: lands on /edit with "Draft saved. Review and publish when you are ready." | Breadcrumb "Events", "Back to Events", Cancel. | org-admin-2.jpg |
| admin | 2b draft on Events home with chip | NOT CHECKED | I never reopened /dashboard after saving (budget). The event page shows a DRAFT chip. | | | | none |
| admin | 3 agenda add/reorder/remove | FAIL (reorder) | Edit page, section "4 Agenda". | Pick a type button, fill start, end, title, topic, speaker. | 3 blocks saved: DB had exactly 3 rows, no duplicates. Remove saved: DB had exactly 2 rows. | Cancel / breadcrumb. | org-admin-3.jpg |
| admin | 4 publish | PASS with MINOR notes | Edit page. | "Publish event" opens a "Publish this event?" confirm: "Your registration page goes live. Anyone with the link can register.", "Registration opens now.", "Check-in opens at 04 Dec 2026, 08:00 (Asia/Hong_Kong), 60 minutes before the start.", "Details cannot be edited after publishing yet". | After confirm: Event Manager page, "Published. Your registration page is live." plus "What to do next": Share the link / Copy link / Open registrations. DB: one published row, double-click on confirm made no duplicate. | Breadcrumb "Events". | step 4 shot not saved |
| admin | 5 open event, Registrations, Check-in | PASS | Event Manager. | Buttons Edit / Registrations / Check-in / Public / Analytics. | Registrations opens /registrations (list, filters, "No one has registered yet."). Check-in opens /checkin (capture). Each has a cross-link arrow to the other, neither lands on the other. | Breadcrumb "Events". | not saved |
| admin | 6 window: before | PARTIAL FAIL | Check-in page, "NOT OPEN YET, Starts in 32d 9h". | Scan, enter code, walk-in. | Walk-in submit is disabled and says "Check-in has not opened yet. It opens 60 minutes before the event starts." No registration row written (DB 0). BUT the speaker "Check in" button was live and wrote a row (see F1). | Breadcrumb. | not saved |
| admin | 6 window: inside | NOT REACHED | Event moved inside the window by SQL. Page then said "Live, Started 10m ago, Check-in is open." | | | | |
| admin | 6 window: after end | NOT REACHED | | | | | |
| admin | 7 walk-in | NOT REACHED | My script could not open the walk-in form after the reload; budget ended. | | | | |
| admin | 8 History | NOT REACHED | | | | | |
| member | 2 to 6 | NOT WALKED | | | | | |
| body | 2, 4 | NOT WALKED | | | | | |

Sign-out was not exercised, so I cannot say whether it works. The ux-admin session is still signed in in the built-in browser.

## Findings

### MAJOR

**F1. Speaker check-in ignores the check-in window.** [X]
- Route: `/events/766736a1-.../checkin` (event 32 days in the future, "NOT OPEN YET").
- Did: clicked "Check in" next to the speaker "Alpha SPEAK" while the page said check-in had not opened.
- Saw: button was enabled; page then showed "Checked in at 01 Nov 2026, 23:28 ✓ Checked in"; `speaker_checkins` got a row (`checked_in_at` 2026-11-01 15:28Z) for an event starting 2026-12-04.
- Why it matters: a mis-tap on the desk, a wrong event tab, or a pre-event rehearsal writes a permanent attendance record 32 days early. Attendee check-in on the same page refuses with the right message, so the page contradicts itself. Whether speaker rows feed credit or the College export I did not check.
- Failure scenario: organiser opens tomorrow's event the day before, taps speakers to "see how it works"; their attendance is recorded and cannot be undone from the UI.
- Fix: gate the speaker button with the same window rule as walk-in and show the same sentence when closed (disabled button plus message). Also check the server action refuses, not only the UI.

**F2. Agenda has no reorder control; order shown is entry order, not time order.** [X]
- Route: `/events/<id>/edit`, section 4 Agenda.
- Did: swapped times of block 1 and block 3 so Charlie ran first (09:00) and Alpha last (10:00); saved.
- Saw: no move up/down, no drag handle, no hint on ordering. DB after save: Alpha start 02:00Z `display_order` 0, Charlie 01:00Z `display_order` 2. The page keeps Alpha on top although it runs last.
- Why it matters: the plan step "reorder, save again" cannot be done as a user; the only way is to retype times, and the list then looks out of order. Whether the public page sorts by time I did not check.
- Fix: either sort blocks by start time on save/display and say so ("blocks are ordered by start time"), or add move up/down buttons. Needs Ivan's pick (two options, differing cost).

### MINOR

**F3. Stale success message stays after later saves.** [X] After the first "Draft saved. Review and publish when you are ready." the same banner stayed on screen next to "Saved." through three more saves, including a save that I had just seen fail validation (the alert "Fix the highlighted agenda blocks (each needs a valid time inside the event window, plus a title)." appeared once, then the old green banner remained). A person cannot tell which save succeeded. Fix: clear old status banners on each new save, keep one.

**F4. Three save buttons on the edit page.** [R from button list] "Save", "Save & Preview", "Save changes" (plus Cancel). Only "Save changes" saved the agenda in my run; I did not test the others. Fix: one primary Save; say what the others do.

**F5. Draft event shows "CPD hours 2" with "Not accredited".** [X] The CPD card on the fresh draft pre-fills 2 hours while no body is chosen; the create form says hours are "Required once a body is chosen". Looks like a value the organiser never entered. Fix: leave blank until a body is chosen.

**F6. Leftover workshop-era placeholders.** [X] Event name placeholder "Workshop on TDD", topic tag "engineering · onboarding · etc.", description "One paragraph about the workshop." For a CPD platform these mislead. Fix: CPD-flavoured examples.

**F7. The "Event Manager" page still exists (route `/details`, heading "EVENT MANAGER").** [X] The task brief says Doctrine 2026-10-30 has "no separate Manage page". The Events row links "Details" to it and publish lands there. It worked well for me, so I did not treat it as broken; I flag it as a possible doctrine mismatch for Ivan [I]. Also the Events row offers Details / Edit / Check-in and no "Registrations" shortcut, although the brief names that action.

**F8. Publish dialog does not say what stays hidden or lists what goes public.** [X] It says "Your registration page goes live. Anyone with the link can register." It does not name the agenda or venue that become public, nor that speaker names show. The brief asks the confirm to name what becomes public. Acceptable but thin. Fix: add one line listing title, date, venue, agenda.

**F9. Venue picker accessibility.** [X] The venue search suggestions did not respond to ArrowDown + Enter (mouse click worked); the input has no combobox role (`aria-expanded=true` on a plain input). Time pickers' listbox has no accessible name. Keyboard-only organisers cannot pick a venue, which blocks Save draft.

**F10. Time-of-day picker: end list opens near the start, not at a sensible later time; the first Save draft click that failed on venue gave no visible alert at the clicked position.** [X] The alert did appear at the top and took focus (checked via the DOM), but I did not see it at the Save button; on a long page the person may think nothing happened. Fix: also show a short note next to the buttons, or scroll the alert into view (the DOM shows focus moved, so check scroll).

### NIT

**F11.** Login page spells "Organiser" in the shell and "Organizer access only" / "organizer list" in the body. [X] Mixed spelling.
**F12.** Staff Events home shows a banner "Email delivery: development stub (no inbox)." [X] Dev-only; confirm it is hidden in prod builds.
**F13.** The create-form progress list shows 6 steps, but the form has 7 numbered sections (CPD accreditation is missing from the list). [X]
**F14.** Remove on an agenda block deletes instantly with no undo or confirm (only saved on Save). [X] Acceptable because nothing is saved until Save; mention the unsaved-changes banner worked ("You have changes that are not saved.").

## Things that worked well

- `/dashboard` signed out redirects to `/login?next=/dashboard` (307); the magic link returns to Events.
- Empty create form: clear, focused, plain-language alerts, one at a time.
- Agenda save: no duplicates across add, save, retime, save, remove, save (DB read-back 3, 3, 2 rows).
- Outside-event-window agenda time is rejected with a message that names the rule.
- Publish: confirm dialog, then a clear "What to do next" panel; double-clicking confirm wrote one published row.
- Walk-in is disabled before the window with the right sentence.

## Not walked / coverage gaps

- Step 1 sign out (never tried). ux-member steps 2 to 6. ux-body steps 2 and 4 (the "reason publish is unavailable" copy is unreviewed).
- Step 2b: draft on Events home with its chip (reopen not done).
- Step 6 inside window (attendee check-in count of exactly one, via scan or code) and after the end (refusal): not run. Step 7 walk-in `source = 'walk_in'` and `user_id` not the staff member's: not run (admin user id is dcabf588-bc58-4e1b-b6a0-1315fe1b2c3d; no registration exists on the event, so nothing to compare). Step 8 History, feedback, records, College export: not reached.
- Wrong-URL tests by role, Back-button tests, past-date test: not done.
- Mobile / keyboard-only passes beyond F9: not done.

## SQL I ran (ZZ-FINAL event only)

All on event `766736a1-77ae-487f-8ad7-c303c0c88b43`, guarded by `title like 'ZZ-FINAL%'`:
1. `update events set start_time=now()-10min, end_time=now()+60min` (inside window).
2. `update events set start_time=now()-3h, end_time=now()-1h` (ended).
3. same as 1 again.
Final state: start/end are about now minus 10 min to plus 60 min at about 15:50Z on 2026-11-01. Nothing deleted, no non-ZZ-FINAL row touched.

## Fixtures created

- Event "ZZ-FINAL admin before-window", id `766736a1-77ae-487f-8ad7-c303c0c88b43`, status published, 2 agenda blocks (titles "Alpha TITLE", "Charlie TITLE"), 1 `speaker_checkins` row (Alpha SPEAK, id 0ca97b23-6ce9-47da-91a9-c0b7a74284e8). No registrations or `registration_checkins` rows.
- Counts at the end: events 443 (baseline 442, +1 mine), registrations 898, auth.users 1081, professional_profiles 354, registration_checkins 700. Cleanup: delete the event (agenda blocks and speaker_checkins cascade or need removing first; check FKs).
- Mailpit holds ux-admin magic-link messages; the ux-admin browser session is still signed in.

## Tally

BLOCKER 0, MAJOR 2, MINOR 7, NIT 4 (F1 to F14; F7 to F10 as listed, F10 counted MINOR).

## Continuation A (ux-admin remainder)

- Date: 2026-11-01. Lens: user. Persona: ux-admin (organiser_admin), built-in browser, :3100 only. Status: **PARTIAL**. Steps A to E walked. **F (sign-out) NOT walked**: I miscounted tool calls and ran past the cap (about 100 calls vs 75), so I stopped before reaching the Sign out control. Sign-out is therefore still unverified.
- Screenshots: taken inline only (built-in browser cannot save to a chosen path).
- Brief mismatch: the ux-admin auth id in the local DB is `dcabf588-bc58-4e1b-b6a0-1315fe1b2c3d`, not `484c8efb-...` as the brief says. I checked against the real id.
- Window state: the event was already "inside" (start 15:19Z, end 16:29Z, checked by psql). For step D I moved it to start 12:34Z, end 14:34Z.

### Step table

| Step | Result | (1) Where | (2) Main thing | (3) Progress | (4) Back | DB read-back |
|---|---|---|---|---|---|---|
| A. 2b Events home lists the ZZ-FINAL event with chip | PASS (chip checked as published only) | Events home, sidebar Events active. | Event shown in "Needs attention" ("ZZ-FINAL ... is live now, 0 of 0 checked in, open check-in") and in the list with a LIVE chip, venue, "0 registered, 0 checked in", buttons Details / Edit / Check-in. | One click on the row's Check-in (or the "open check-in" attention row) reaches /checkin. Next action is obvious. | Breadcrumb Events, sidebar Events. | n/a. A draft chip was not re-seen: the event is now published (Drafts tab shows 4). |
| B. 6 inside window: check in one person, duplicate, wrong code | PASS | Check-in page: LIVE, "Started 12m ago", "Check-in is open.", Scan badge / Enter code / + Walk-in. | Enter code dialog: "It checks them in as soon as it's complete, no need to press anything." | Pre-registered person (see SQL) via code `zzfn42` (lowercase accepted): "ZZ-FINAL Prereg One is checked in." + Done. Same code again: "Already attended at 01 Nov 2026, 23:32." Wrong code `ABCDEF`: "Code not recognised." | Close X on dialog, breadcrumb. | `registration_checkins`: exactly 1 row per person (walk-in 1, prereg 1; no duplicate after the repeat code), `check_in_method='manual'`, `checked_in_at` equals `registrations.check_in_at`. `participation_evidence`: written (2 rows after two people, 3 after three; the Event page says "3 evidence records, in sync"). |
| C. 7 walk-in inside window | PASS | Check-in page, + Walk-in opens "Walk-in registration" (Full name, Email, Register & check in). | Fill two fields, one button. | Empty submit: native "Please fill out this field", focus on name. Bad email: native "Please include an '@'...". Double-click on submit: one row only. Toast/line "Registered & checked in ZZ-FINAL Walkin One." Same email again: "This email is already registered. Use code entry to check them in." | Close link in form. | `registrations`: source `walk_in`, status `attended`, `user_id` NULL (staff id not used), `check_in_method manual`. `professional_profiles` count unchanged at 354, 0 rows under the staff id. No `*@final.invalid` rows in `auth.users`. |
| D. 6 after end: refused | PASS (message right; one inconsistency, F22) | Check-in page: "Ended 1h ago", CLOSED, "ATTENDANCE · FINAL", "Check-in is closed. This event has ended." | Read-only roster. | Scan badge and Enter code greyed out. + Walk-in still opens; submit gives red alert "Check-in is closed. This event has ended." | Breadcrumb. | Before and after the refused walk-in: registrations 3 / checkins 3. Nothing written. |
| E. 8 After the event: feedback, records, College export in 2 clicks | FAIL (3 clicks to exports) | Events home does not list finished events ("Finished events are in History."). | History (sidebar) lists the event first: "3 / 3 attended, 0 responses". Row opens **Analytics**: attendance, funnel, feedback Q1 to Q5, "Export CSV" button. No College export, no records link on that page. | Events > History (1) > row (2) shows feedback only. Event Manager via "Back to Event" (3) holds: Registrations / Check-in / Analytics links, "Export evidence (JSON + CSV)" and "Export College package (CSV)" both **disabled**, "Export attendance evidence (CSV)" enabled, "View full analytics", "Send survey invites" (not clicked). | "Back to Event", sidebar. | I did not read an export file (see gaps). |
| F. Sign out | NOT WALKED | | | | | |

### Findings (F20 onward)

**MINOR**

**F20. Code field keeps the old code after an error, so the next code is appended and nothing happens.** [X] Route `/events/<id>/checkin`, Enter code dialog. Did: typed the existing code (got "Already attended"), then typed a new code. Saw: the field still held `Y3TJ5F`; my next typing ended up in the same field (`Y3TABCDEFJ5F`, 12 characters; part of that was my caret click landing mid-text). No error, no submit, no hint. "Code not recognised." also leaves the typed code in place. Why: at a queue, the second attendee's code stalls silently. Fix: select-all on focus, or clear the field after an error (keep the message), and show "6 characters" when more are typed. The field's only name is the placeholder "XXXXXX" (no visible label), a keyboard/screen-reader gap.

**F21. Roster and counters did not refresh after my first walk-in.** [X, seen once, not reproduced] After "Registered & checked in ZZ-FINAL Walkin One." the page still said "0 / 0 checked in", "All (0)", "No registrants yet." and stayed so 1.5 s later; a reload showed the row. The second walk-in refreshed correctly (All (3)). Possible cause [I]: first row after an empty roster, or my double-click. Why: the desk cannot tell whether the first person counted. Fix: re-fetch after walk-in success whatever the roster state; the dev lens should check.

**F22. After the end, "+ Walk-in" and the speaker "Check in" button are still enabled; only submit refuses.** [X] Scan badge and Enter code are greyed, which is right. Walk-in opens a full form and refuses only at submit; before the window the same submit was disabled with a sentence (earlier section). Speaker "Check in" for Charlie was enabled after the end (same family as F1; I did not click). Fix: same rule everywhere: disabled control plus the one sentence.

**F23. Duplicate walk-in message points to the wrong tool.** [X] "This email is already registered. Use code entry to check them in." for a person who was already checked in; code entry then says "Already attended at ...". Fix: say "already checked in at 23:32" when so, and point to the roster search when they lost the code.

**F24. College export and evidence export are 3 clicks away and not from History.** [X] The History row opens Analytics (title "Analytics", nav label "History"); the exports sit only on Event Manager (`/details`). A post-event organiser looking for "the College export" sees "Export CSV" on Analytics and may take that for it. Fix: one "Records and exports" link on the Analytics page, or make the History row open the Event Manager. Needs Ivan's pick (also relates to F7).

**F25. Disabled exports do not say why or what to do.** [X] "Available once credit has been posted for this event." On this event no accrediting body is set ("Not accredited"), the event is "Completed" and locked, so credit can never post; the page does not say so or whether the body can still be set (a "Save" button is shown). Dead end for an organiser who forgot the body. Fix: say "No accrediting body is set for this event" and what is still possible.

**F26. Analytics feedback copy is clinical/workshop wording for every event.** [X] "Which speaker or session provided the most clinical utility?", "this summit", Q1 shows the label "Priority Expansion" while "no answers yet", a paragraph about "marketing versus logistics". For a non-clinical CPD event (HKICPA, HKIE bodies are in the list) this misleads. Fix: neutral wording, hide labels with no data.

**NIT**

**F27.** [X] Event Manager page shows "Email delivery stubbed, RESEND_API_KEY is unset" (dev-only copy on an organiser page); same family as F12.
**F28.** [I] Clicking "Export attendance evidence (CSV)" gave no visible feedback in my run and I could not capture a download (I had patched anchor click and blob URLs; this may have blocked it). Unconfirmed; a dev-lens check should confirm there is a success or error message.
**F29.** [X] Accrediting-body dropdown lists test fixtures ("RLS-ACCGRP-... RLS Test Body"). Local data only; ignore in prod.

Tally for this continuation: BLOCKER 0, MAJOR 0, MINOR 7 (F20 to F26), NIT 3 (F27 to F29).

### Things that worked well
- Typed code is forgiving: lowercase accepted, auto-submits at 6 characters, clear confirmation dialog.
- Refusals use plain sentences ("Already attended at ...", "Code not recognised.", "Check-in is closed. This event has ended.") and wrote nothing.
- Walk-in does not touch the staff identity: `user_id` NULL, no profile row.
- Double-click on Register & check in wrote one row.

### SQL I ran (ZZ-FINAL only)
1. Read-only selects (events, registrations, registration_checkins, participation_evidence, professional_profiles, auth.users).
2. `insert into registrations (event_id,email,full_name,registration_code,source) select '766736a1-...','pre1@final.invalid','ZZ-FINAL Prereg One','ZZFN42','self_registration' where exists (select 1 from events where id='766736a1-...' and title like 'ZZ-FINAL%')` (done because the walk-in form can only create already-checked-in people, so a pending registration for the code path needed SQL). Row id 3139b224-7541-42fe-b3a7-4e38b08ce2dc.
3. `update events set start_time=now()-interval '3 hours', end_time=now()-interval '1 hour' where id='766736a1-...' and title like 'ZZ-FINAL%'`.

### Fixtures created
- Event "ZZ-FINAL admin before-window" (766736a1-77ae-487f-8ad7-c303c0c88b43): now ended (12:34Z to 14:34Z on 2026-11-01), 3 registrations: walkin1@final.invalid (walk_in), walkin2@final.invalid (walk_in), pre1@final.invalid (self_registration via SQL), all attended; 3 registration_checkins; 3 participation_evidence; 1 speaker_checkins (from F1).
- Counts now: registrations 901 (898+3), registration_checkins 703, professional_profiles 354, events unchanged by me. auth.users not recounted (no `*@final.invalid` there).

### Gaps
- Step F (Sign out button, `/dashboard` redirect to `/login` after it): not done.
- Back-button and past-date wrong-input tests: not done. Export file contents (header row) not read. Draft chip not re-verified. Keyboard-only pass not done beyond F20's label note.

## Continuation B (sign-out, ux-member, ux-body)

- Date: 2026-11-01. Lens: user. Built-in browser, :3100 only. Status: **PARTIAL**. Tool calls about 68 of the 70 stop line (cap 80). Screenshots inline only.
- Done: sign-out of ux-admin (verified), ux-member sign-in, ux-member empty Save draft, ux-member view of someone else's event (admin ZZ-FINAL event). **NOT done: ux-member steps 2 (create saved), 3, 4, 6; ux-body steps 2 and 4 and its Events home.** Reason: the create-event form could not be driven cheaply (see F43 and gaps) and the budget ran out before a second sign-out and sign-in.
- Brief mismatch: none new. No event, registration or check-in was created by me in this continuation (psql: 0 events titled "ZZ-FINAL member%"). Baseline counts unchanged by this continuation.

### Step table

| Persona | Step | Result | (1) Where | (2) Main thing | (3) Progress | (4) Back | DB read-back |
|---|---|---|---|---|---|---|---|
| admin | Sign out | PASS (location MINOR, F40) | Settings, section "Session", button "Sign out" (Material icon text "logout" precedes the label). | Press it. | One click, no confirmation. Lands on /login (staff "Log in" page, "Organizer access only" card). GET /dashboard in the browser then goes to `/login?next=%2Fdashboard`. | The "Back to home" link on /login. | n/a |
| admin | Back button after sign-out | MINOR (F41) | Back twice reached `/settings`. | The page rendered with the sidebar chip "ux-admin" and the settings form, i.e. a signed-in staff view. | A request without a session cookie (curl) to /dashboard and /settings gives 307 to /login (next=...), so the server is correct. | n/a | n/a |
| member | login | PASS | Magic link from Mailpit; lands on Events (/dashboard). | | | | |
| member | 2 create, empty Save draft | PASS (empty submit) | "Create event". | Name, date, start, end, venue. | Empty Save draft: focused alert "Add the event basics (name) to continue." Name typed but no venue chosen: "Pick a venue from the dropdown to continue." The page also tells the member up front "Your role can't set accreditation. You can still create the event without it and ask an organiser admin to add it later." | Sidebar "Back to Events", Cancel. | Draft not saved, see F43. 0 ZZ-FINAL member events. |
| member | 2 create, saved draft + chip on Events home | NOT REACHED | | | | | |
| member | 3 agenda add/remove | NOT WALKED | | | | | |
| member | 4 publish | NOT WALKED (UI hints only, F42) | /events/new shows "Publish event" enabled to a member, with the caption "Publish event makes the registration page live. Details cannot be edited after publishing yet, so check them first." | | | | I did not publish, so I cannot say whether a member can. |
| member | 5 Registrations vs Check-in on admin's event | PASS (links) / MINOR (F42) | `/events/<id>/registrations` titled "Registrations", `/checkin` titled "Check-in"; each has a cross-link ("Check-in→", "Registrations→") and neither lands on the other. | | | Breadcrumb "Events". | Read by fetching the page HTML from the signed-in member session. |
| member | 6 windows | NOT WALKED | | | | | |
| body | 2, 4, Events home | NOT WALKED | | | | | |

### Findings (F40 onward)

**MINOR**

**F40. Sign out lives only in Settings (Session section); there is none in the sidebar or the page header.** [X] Route `/dashboard`, `/settings`. Did: looked for "Sign out", "Log out", "Account" on the Events home (interactive element list: sidebar links Check-in, Events, History, Settings, a "New event" link, no sign-out). Opened Settings: the "Session > Sign out" button sits at the bottom, below the organisation profile form, appearance, text size, account email form and Team. The sidebar bottom chip shows the name and email ("ux-admin"); I did not open it to see whether it is a menu (unverified [I]). Why it matters: at a shared check-in desk or a borrowed laptop, a person who wants to leave has to know to open Settings and scroll. Failure scenario: a volunteer at the door leaves the tablet signed in because there is no obvious exit. Proposed fix (proposal, needs Ivan's pick): put Sign out in the sidebar user chip menu and keep the Settings one. Not a re-opening of the closed sign-out behaviour ruling: behaviour (no confirm, lands on /login) is fine.

**F41. Browser Back after sign-out shows the signed-in staff page again (cached).** [X] Did: Sign out, then GET /dashboard (redirected to /login?next=%2Fdashboard), then Back three times. Saw: `/settings` rendered with the full form and "ux-admin" in the sidebar chip. Server side is correct (a cookie-less request is redirected). I did not reload in the browser to confirm that a reload redirects, so the cache cause (bfcache vs HTTP cache) is [I]. Why it matters: the next person at a shared device can read the previous organiser's page by pressing Back. Failure scenario: shared front-desk laptop, the previous user's name, email and settings are visible after sign-out. Proposed fix: `Cache-Control: no-store` on authenticated staff routes, or a `pageshow` handler that re-checks the session.

**F42. A member sees, on an event someone else created, the same controls an admin sees; some are likely to fail.** [X for visibility, [I] for failure; I did not click them.] Route `/events/766736a1-.../registrations|checkin|edit|details`, fetched as ux-member. Saw: Registrations page: three "Edit" buttons (role chips, enabled) on rows that are all "Attended"; Check-in page: closed ("Check-in is closed. This event has ended.") but "+ Walk-in" and the speaker "Check in" button enabled (same family as F22); Edit page: "Download QR", "Export registrants (CSV)", "Open check-in" all present; Event Manager: "Export evidence" and "Export College package" disabled with the reason "Available once credit has been posted for this event." (same as F25). Settings (as member) shows "Manage team" (link to /settings/team) and the sidebar groups Settings under a label "ADMIN". Why it matters: the brief and CLAUDE.md say role chips are creator-only and locked after check-in; a member who is not the creator sees chips as editable, then (probably) gets a refusal. A control that looks enabled and then fails is the worst feedback. Proposed fix: render role chips read-only for non-creators and after check-in, with the one reason sentence; hide "Manage team" and the "ADMIN" label from roles that cannot use them. Needs a dev-lens confirm of what the server does on click.

**F43. Venue field: keyboard selection did not pick a suggestion, so Save draft is refused with "Pick a venue from the dropdown to continue." while the field looks filled.** [I, seen once, partly my tooling] Route `/events/new` as member. Did: typed "Central Hong Kong" into "Search a venue, building, or address..." then ArrowDown and Enter. Saw: field kept the typed text, no suggestion list visible in the screenshot, Save draft still refused with the venue alert. Earlier, typing "Hong Kong" via script produced a list ("Hong Kong, China", "Hong Kong Island, Hong Kong, China"), but a script click on an option did not select either, so the first attempt was tooling, the second may be real. Why it matters: a keyboard-only organiser can type a venue and cannot tell it is not chosen. Proposed fix: show the typed text as "not chosen yet" (state), keep the list open on Enter, support ArrowDown plus Enter. Needs a real-keyboard re-check by a dev-lens agent.

### Things that worked well
- Sign out: one click, no dialog, plain landing on /login, protected route then redirects with `next=`.
- Empty create-form alerts name the missing thing and move focus; the CPD accreditation line explains a role limit before the person hits it.
- Registrations and Check-in are separate pages with a single cross-link each.

### SQL I ran
Read-only only: count of events with title like 'ZZ-FINAL member%' (0); one staff-role lookup that failed (`column s.user_id does not exist`) and one more that returned nothing useful. No write, no timestamp update, no insert in this continuation.

### Fixtures created
None. ux-member is still signed in in the built-in browser (my script click on Sign out did not complete before I navigated away; unconfirmed whether that was my race or a real fault, so it is not recorded as a finding).

### Gaps (to hand to the next agent)
- ux-member: finish creating "ZZ-FINAL member <short>" with real keystrokes and a real mouse click on the venue option (React/base-ui inputs ignore script-set values; a typed name works, `type` action), then steps 3, 4 (does a member publish, and what the UI says), 5 on own event, 6 windows.
- ux-body: step 2 (create / Save draft), step 4 (publish: is the reason shown, does it say what to do instead), Events home for body_admin. Sign out ux-member first with a real click on Settings > Session > Sign out.
- Unverified: whether the sidebar user chip is a menu with Sign out; whether `/settings/team` works for a member; whether the three "Edit" chips fail for a member.
- Note: while signed in, GET /login redirects to /dashboard (no account switch without sign-out). Not recorded as a finding (door copy rulings closed).

### Tally for this continuation
BLOCKER 0, MAJOR 0, MINOR 4 (F40 to F43), NIT 0.

## Continuation C (ux-member and ux-body gaps)

- Date: 2026-11-01. Lens: user. Built-in browser, :3100 only. Status: **PARTIAL**. Tool calls about 70 of cap 80 (stop line 70 reached; the venue picker cost about 30 calls, so most of the budget went on step 2). Screenshots inline only.
- Done: ux-member step 2 (draft saved, chip seen), step 4 (publish). **NOT done: ux-member step 3 (agenda), step 6 (windows); ux-body steps 2, 4 and Events home.** Not started because the budget ran out before a second sign-out and magic-link sign-in.
- The browser was signed in as ux-member. The tab needed `tabs_select` before reads returned content (pane hidden). Screenshots lagged one action behind (a shot after a click often showed the state before the click); I confirmed state with `find` and page text.

### Step table

| Persona | Step | Result | (1) Where | (2) Main thing | (3) Progress | (4) Back | DB read-back |
|---|---|---|---|---|---|---|---|
| member | 2 create + Save draft | PASS after a hard fight with the venue field (F50 to F52) | "Create event" with breadcrumb and numbered sections. | Name, date, start, end, venue, Save draft. | Save draft lands on `/events/<id>/edit`: chip DRAFT, "Draft saved. Review and publish when you are ready." The page also says "Your role can't set accreditation. An organiser admin can add or change it from this page." | Breadcrumb "Events", sidebar "Back to Events". | events row `ee926641-01e0-494d-b261-20b70918e787`, org 00000000-...-0001, start 2026-12-04 01:00Z, end 04:00Z (09:00 to 12:00 HKT). |
| member | 2b draft on Events home with chip | PASS (F53) | Events home, default tab "Active, 12". | The draft is NOT on the default tab. It is on the "Drafts, 5" tab with a "DRAFTED" chip, date, time, venue, Details / Edit links. | Click "Drafts" tab (URL `?tab=drafts`). | Sidebar. | n/a |
| member | 3 agenda add, remove, read back | NOT WALKED | | | | | The table name I guessed (`event_agenda_blocks`) does not exist; I did not look up the real one. 0 agenda rows not confirmed. |
| member | 4 publish | PASS (F54) | Edit page, "Publish event" button. | Dialog "Publish this event?" lists four lines: "Your registration page goes live. Anyone with the link can register." / "Registration opens now." / "Check-in opens at 04 Dec 2026, 08:00 (Asia/Hong_Kong), 60 minutes before the start." / "Details cannot be edited after publishing yet, so check them first." Buttons "Keep editing", "Publish event". | After confirm: Event Manager, chip REGISTERING, "Published. Your registration page is live.", "What to do next": Share the link (URL shown), Copy link, "Open registrations", and a check-in line. So a member CAN publish; the dialog is identical to the admin one. | Breadcrumb "Events". | events.status = published. |
| member | 6 windows | NOT WALKED | | | | | registrations 901 and registration_checkins 703 unchanged (no write by me). |
| body | 2, 4, Events home | NOT WALKED | | | | | |

### Findings (F50 onward)

**MAJOR**

**F50. Venue picker: results arrive 3 to 5 seconds after typing and the list is rewritten under the pointer, so a click can choose a different place than the one you aimed at; the chosen place silently sets the event timezone.** [X, partly tooling timing] Route `/events/new` as ux-member. Did: typed "Hong Kong", then clicked the first row. Saw: the field then showed "Konghong Xian, Domar township, Rutog County, Ngari Prefecture, Xizang, China" and a line "Timezone follows the venue — Asia/Shanghai." (I never asked for Tibet). The list had changed between my screenshot and my click. Typing the long query "Hong Kong Convention and Exhibition Centre" first showed stale rows ("Hong Kong Island") for several seconds, then the right rows; a click after waiting 5 s picked it correctly and the line became "Timezone follows the venue — Asia/Hong_Kong." Why it matters: a wrong pick changes the timezone the event is stored and displayed in. The only signal is a small grey line, and "Clear" is a small link. Failure scenario: a hurried organiser types a city, clicks a row that moved, saves, and the event shows 9:00 in Asia/Shanghai; attendees get a one-hour-off time. Proposed fix (proposal): show a "Searching..." state and disable rows until results match the current text; show the chosen place as a card with the timezone in the same card (the card exists after pick; keep it prominent); do not reorder rows once shown. Needs dev-lens re-check of the request ordering (stale response overwriting a newer one).

**MINOR**

**F51. The venue suggestion list shows duplicate rows (same name, same address): "Hong Kong, China" twice, "Hong Kong Island, Hong Kong, China" twice.** [X] Why it matters: two identical choices look like a bug and make the user unsure which one to pick. Proposed fix: de-duplicate by place id.

**F52. Clicking a duplicate "Hong Kong Island" row closed the list but did not select it; the field still showed the typed text and no "Clear" or timezone line appeared. Save draft would then say "Pick a venue from the dropdown to continue."** [X, once with a real mouse] This confirms F43 is not only a keyboard problem. Why it matters: the field looks filled but is not. Proposed fix: show "not chosen yet" state under the field when text is present and no place is chosen.

**F53. After "Save draft" the person lands on the Edit page; on the Events home the draft is not on the default "Active" tab, it is under "Drafts".** [X] Why it matters: a member who goes back to Events to find the draft sees 12 active events and no draft, and has to notice the "Drafts, 5" tab. Failure scenario: "my event disappeared", the organiser creates a second one. Proposed fix: the "Draft saved" message gets a link "See in Drafts", or the Events home shows a short "Your drafts" strip. Also the "Events" breadcrumb opens the Active tab.

**F54. The publish dialog tells a member that "Details cannot be edited after publishing yet" but does not say the event has no CPD accreditation and that the member cannot add it.** [X for text, [I] for consequence] The edit and details pages say "Your role can't set accreditation. An organiser admin can add or change it from this page", but the dialog that locks the details does not. Failure scenario: a member publishes an event that should have earned credit; after publishing, attendees check in and earn nothing, and the member finds out later. Proposed fix: one more dialog line when the event is not accredited and the role cannot set it: "This event has no CPD accreditation. An organiser admin can add it later." (Needs a dev-lens check whether admin can still add accreditation after publish.)

**F55. Date calendar: days from the neighbouring month are drawn grey (look disabled) but a click on one changed the selected date to Nov 30 while Dec 2026 was showing.** [I, may have been a stray click of mine during the popup closing] I re-picked Dec 04 and Save draft stored 04 Dec 09:00 to 12:00 correctly. Proposed fix: make out-of-month days truly disabled or hide them.

**NIT**

**F56. The accrediting-body list on the member's read-only accreditation box includes local test fixtures ("RLS Test Body ... fixture") and the Events home carries "DELETE ME" fixtures.** [X] Environment data only, not a product defect; it would show if seed data reached a live organisation.

### Things that worked well
- Member create form says up front what the role cannot do, and the Save draft alerts name the missing field.
- Publish confirmation is concrete: it says what goes live, when registration opens and when check-in opens, with the timezone label.
- After publishing, the "What to do next" block gives a copy-able link and the next click (Open registrations).
- Time pickers: choosing a start enables the end; the field shows "3h" duration.

### SQL I ran
Read-only: `select id,title,status,organisation_id,start_time,end_time,created_by from events where title like 'ZZ-FINAL member%'`; a count on a table name that does not exist (error); counts of registrations and registration_checkins (901, 703). No write.

### Fixtures created
- Event "ZZ-FINAL member c1", id ee926641-01e0-494d-b261-20b70918e787, created by ux-member, **published** (REGISTERING), 04 Dec 2026 09:00 to 12:00 HKT, venue Hong Kong Convention and Exhibition Centre. 0 registrations, 0 check-ins, 0 agenda blocks (by UI, not by SQL).

### Gaps (to hand to the next agent)
- ux-member step 3 (two agenda blocks, remove one, read back by psql; find the real table name first) is NOT possible on the published fixture because details cannot be edited after publishing. Needs a new ZZ-FINAL draft; creating one takes about 10 calls once the venue is chosen (type the full venue name, wait 5 s, click the first row, confirm "Timezone follows the venue" line before Save).
- ux-member step 6: the published fixture above is ready. By psql you may set start_time and end_time of 'ZZ-FINAL member%' events: before window (now), inside (start = now - 10 min, end = now + 2 h), after (end in the past); check refusals on `/events/ee926641-.../checkin` and counts of registration_checkins.
- ux-body: steps 2, 4 and Events home not seen. Sign out ux-member via Settings > Session > Sign out first, then magic link for ux-body from Mailpit.
- Not verified: whether F50's wrong pick came from a stale response overwriting a newer one (dev-lens).

### Tally for this continuation
BLOCKER 0, MAJOR 1 (F50), MINOR 5 (F51 to F55), NIT 1 (F56).

## Continuation D (last gaps)

- Date: 2026-11-01. Lens: user. Built-in browser, :3100 only. Status: **PARTIAL**. Tool calls 52 of cap 60 (walk stopped at the 52 line; this append is the report write). Screenshots inline only (none taken: text reads were enough).
- Done: ux-member step 3 (read), ux-member step 6 (all three windows). Signed out ux-member via Settings > Session, signed in as ux-body by magic link (landed on `/dashboard`, tab title "Events"). **NOT done: ux-body Events home content, /events/new, step 4 (Publish reason), wrong-thing probes.** The sign-in used the whole remaining budget.

### Step table

| Persona | Step | Result | (1) Where | (2) Main thing | (3) Progress | (4) Back | DB read-back |
|---|---|---|---|---|---|---|---|
| member | 3 agenda on a published event | FAIL, "not reachable after publish" (F60) | `/events/<id>/edit`, chip "published". The page has CPD accreditation, Venue, Public page, Operations, Analytics, QR, Check-in and Export cards. **No agenda section exists.** | Nothing editable. A grey line says: "Editing event details isn't available yet — this view is read-only. Need a change? Ask an admin." | No path. The admin cannot edit either (the publish dialog said "Details cannot be edited after publishing yet"). | Breadcrumb "Events". | `agenda_blocks` where event_id = fixture: 0 rows. |
| member | 6a before window | PASS | Check-in page: status "NOT OPEN YET, Starts in 32d 9h", "0 / 0 checked in". | "+ Walk-in" opens a form (Full name, Email, "Register & check in"). | Text under the form: "Check-in has not opened yet. It opens 60 minutes before the event starts." Click on submit did nothing. | Breadcrumb "Events"; "Registrations" arrow. | Before and after: registrations 901, registration_checkins 703, fixture registrations 0. No row written. |
| member | 6b inside window (start now-10m, end now+2h) | PASS with notes (F62, F63) | Status "LIVE, Started 10m ago", "Check-in is open." | Walk-in "ZZ-FINAL Member Walkin" / memberwalkin@final.invalid, "Register & check in". | Button showed "Registering…", then the form closed and the counter went 0/0 to "1 / 1 checked in"; roster row with code M7YJDU, a tick, time 01 Nov 2026 23:47, method "Manual". | Same. | registrations 901 to 902 (1 fixture row), registration_checkins 703 to 704 (1 row, method manual, same registration). Exactly one row each, no duplicates. |
| member | 6c after end (start now-3h, end now-5m) | PASS | Status "Closed, Ended 5m ago", "Attendance · final". | Message "Check-in is closed. This event has ended." The "+ Walk-in" button is still there; pressing it gives that message and no submit button exists. | Nothing to progress. | Same. | No form existed, so no write possible. Last count read 902 / 704 (read before this step; not re-read after). |
| body | 2 Events home | NOT WALKED | Sign-in landed on `/dashboard`, title "Events · Eventar". Content not read. | | | | |
| body | 2b /events/new | NOT WALKED | | | | | |
| body | 4 Publish reason, probes | NOT WALKED | | | | | |

### Findings (F60 onward)

**MAJOR**

**F60. On a published event the edit page says "Need a change? Ask an admin", but the admin cannot change it either, and there is no agenda section at all, so agenda work is impossible after publish.** [X] Route `/events/ee926641-.../edit` as ux-member. Did: opened the edit page of the published fixture. Saw: the full text "Editing event details isn't available yet — this view is read-only. Need a change? Ask an admin."; no agenda block; `agenda_blocks` has 0 rows for the event. The publish dialog (Continuation C, F54) already said "Details cannot be edited after publishing yet, so check them first", and it does not name the agenda. Why it matters: the sentence sends a member to a person who has the same wall. The agenda and speakers are also what the check-in page needs (see F61). Failure scenario: the member publishes first (the page invites it), then finds the agenda cannot be added; the admin says it cannot be done; the organiser has to unpublish or recreate the event, with a live registration link already shared. Proposed fix (proposal): say plainly "No one can change details after publishing yet" (drop "Ask an admin" while that is true); add one line to the publish dialog: "The agenda and speakers cannot be added after publishing." Or order the page so Agenda comes before Publish and the dialog warns when the agenda is empty. Plan-ordering finding: agenda (step 3) must happen before publish (step 4), and nothing on the draft page says so. Needs dev-lens check on whether an admin has any hidden edit route.

**MINOR**

**F61. Check-in page on the published fixture says "No speakers configured — add them to the agenda first." but the agenda cannot be edited after publish (F60).** [X] Why it matters: it is an instruction that cannot be followed. Failure scenario: an organiser opening check-in on the day sees the speaker box empty and is told to do something impossible. Proposed fix: when the event is published and has no agenda, say "No speakers on this event." and drop the instruction, or make F60 untrue.

**F62. The check-in roster status cell shows the literal text `✓` instead of a tick, and it is inside `aria-hidden`, so a screen reader hears nothing for "checked in".** [X] DOM: `<span aria-hidden="true">✓</span>` (backslash-u-2-7-1-3 as text, not the glyph); page text showed `✓` in the Status column. Did not confirm visually with a screenshot, but the DOM text is literal. Why it matters: the Status column is the whole point of the roster; "✓" looks like a bug, and the checked-in state has no text alternative. Failure scenario: a door volunteer cannot tell checked-in from pending at a glance, and a screen-reader user cannot at all (the Method and time cells still carry the information, so it is not a dead end). Proposed fix: render the glyph "✓" (or an icon) and add a visually hidden "Checked in".

**F63. Walk-in success has no visible confirmation.** [I, I read the page after the fact and may have missed a short toast] After "Registering…" the form closed and the counter and roster changed, but the only live-region text I could find was "Check-in is open." Why it matters: at a busy door the volunteer needs "Done: Name checked in". Failure scenario: the volunteer presses submit twice because they are unsure, or turns the person away. Proposed fix: a short success line naming the person and the code.

**NIT**

**F64. Before the window opens, the Walk-in form still opens with its fields, then refuses at the bottom.** [X] The text is right ("Check-in has not opened yet. It opens 60 minutes before the event starts.") but a user types a name and email before reading it. In the closed state the form does not open, only the message shows, which is better. Proposed fix: same behaviour in both states (message, no fields).

**F65. The edit page prints "Your role can't set accreditation. An organiser admin can add or change it from this page." twice (once under the heading, once under Save), and on a published event it still shows the accrediting body list and CPD hours with a Save.** [X] Proposed fix: one message, and no Save on a read-only page.

### Things that worked well
- Check-in window states are clear and accurate in all three phases: "Starts in 32d 9h", "Started 10m ago", "Ended 5m ago", each with its own sentence, and the time is shown with the timezone label.
- Refusals wrote no rows; the success wrote exactly one registration and one check-in, method "manual".
- Closed state: the "Walk-in" button gives the reason and there is no submit to misuse.
- Magic-link sign-in for body_admin landed straight on Events.

### SQL I ran
Read-only: event row, `agenda_blocks` where event_id = fixture (0 rows), counts of registrations and registration_checkins (901/703 before, 902/704 after the walk-in), the fixture's registration and check-in rows. A failed select (no `created_at` on registrations). Writes, on the ZZ-FINAL member event only:
- `update events set start_time=now()-interval '10 minutes', end_time=now()+interval '2 hours' where id='ee926641-01e0-494d-b261-20b70918e787' and title like 'ZZ-FINAL member%'`
- `update events set start_time=now()-interval '3 hours', end_time=now()-interval '5 minutes' where id='ee926641-01e0-494d-b261-20b70918e787' and title like 'ZZ-FINAL member%'`
No delete. The fixture is now in the PAST (ended 01 Nov 2026 about 23:42 HKT, 20:47 start).

### Fixtures created
- Registration for "ZZ-FINAL Member Walkin" / memberwalkin@final.invalid on the fixture event, code M7YJDU, checked in manually (created by the UI, not SQL). Counts now: registrations 902, registration_checkins 704.
- The fixture event's dates were changed as above (original 2026-12-04 01:00Z to 04:00Z).
- ux-member signed out; the browser is signed in as ux-body@eventar-review.invalid.

### Gaps (to hand on, if anyone continues)
- ux-body: Events home content, `/events/new` (click path from the UI, redirect or message), the fixture event page and any draft (is Publish offered; the exact reason and whether it says what to do instead), probes `/events/<id>/edit` and `/events/<id>/registrations` as body_admin, and Back. The browser is already signed in as ux-body.
- F63: confirm by watching the moment after "Register & check in" (screenshot at once), not by reading afterwards.
- F62: confirm visually with one screenshot.
- Not walked: speaker check-in on the fixture (no speakers exist and none can be added).

### Tally for this continuation
BLOCKER 0, MAJOR 1 (F60), MINOR 3 (F61 to F63), NIT 2 (F64, F65).
