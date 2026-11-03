# MVP Acceptance Walk — ORGANISER user-lens (ux-admin), 2026-11-03

Persona: ux-admin@eventar-review.invalid (organiser_admin). Server :3100, review mode off, real magic-link auth.
Scope walked: steps 1-3, PARTIAL (tool-call cap of 40 hit during step 2). Step 3 NOT walked. No screenshot on disk; one inline screenshot taken in step 1 (Events home).
Compromise: findings written once at the end (not after each step) to save calls.

## Verdicts

| Step | Verdict | Note |
|---|---|---|
| 1 Sign-in + Events home + sidebar | PASS with findings | Sidebar correct; MAJOR copy/label issues below |
| 2 Create draft | INCOMPLETE (not a pass) | Blocked at venue picker (skipped per brief). Draft never saved. |
| 3 Agenda blocks | NOT WALKED | Needs the draft from step 2 |

## Step 1 — four questions
- Where am I: yes. Login: "Log in" heading, "ORGANISER · LOG IN". Home: heading "Events", sidebar Events highlighted, browser title "Events · Eventar".
- Main thing: yes. Blue "New event" button; each row has Details / Edit / Check-in.
- How to progress: yes. Signed-out /dashboard redirected to /login?next=%2Fdashboard; after link click landed on /dashboard (Events home) as required.
- Way back: yes from every page reached (sidebar always present; check-in desk has "Back to Event" and breadcrumb "Events"; new-event has "Back to Events" and breadcrumb).
- Doctrine 2026-10-30: PASS. Sidebar is Check-in / Events / History / (Admin) Settings, plus Sign out. No Programme/Manage dual nav, no Participants at root.
- Screenshot: 1 (Events home, inline, 0.5 scale).

Routes clicked and where each landed:
- Sidebar Check-in -> /checkin "Check-in: choose an event" ("Nothing live right now · 8 coming up").
- Check-in row -> /events/<id>/checkin desk (ZZ-FINAL member c1): "NOT OPEN YET / Starts in 31d", buttons Scan badge / Enter code / + Walk-in, tabs All/Checked in/Pending, link Registrations.
- Sidebar History -> /analytics "History / 100 completed events. Pick one to review it."
- Sidebar Events -> /dashboard. "New event" -> /events/new.
- Events tabs: Active 8, Drafts 4, Cancelled 2, Deleted 2 (URLs ?tab=drafts / cancelled / deleted).
- Needs-attention row "Sends failing — UX03B pub member" -> link to that event's /details (not clicked, see gaps).
- /login while signed in: rendered the page titled "Log in · Eventar" at /login (content not read; no redirect observed). Browser "back" then went to http://localhost:3100 (root), title still "History · Eventar" at that moment. Not conclusive.

### Findings (step 1)

MAJOR
1. Deleted tab labels deleted events with the chip "DRAFTED". Page /dashboard?tab=deleted rows read "DRAFTED | UX-03 Stale Draft ... Restore" and "DRAFTED | UX03B D7 softdeleted". A first-time organiser reads these as drafts, not deleted items; the chip contradicts the tab and the Restore button. Chip should say "Deleted" (or carry no state chip).
2. Active tab count vs list: header says "14 events." while the Active tab holds 8; the "14" silently excludes the 2 deleted but includes drafts and cancelled. Reader cannot tell what 14 counts. (Could be MINOR; ranked MAJOR because it is the first sentence under the page title.)

MINOR
3. Footer on every Events tab: "Showing the 300 events with the latest dates. Finished events are in History." With 14 events the "300" cap is noise and implies hidden data. Show it only when truncation actually happens.
4. History is capped: "Showing the newest 100 completed events. Older ones are not listed here yet." No search, filter or pagination on /analytics; older events are a dead end. Also every row shows "0 responses" and the page title says "History" while the URL is /analytics (and the row link goes to /events/<id>/analytics).
5. Check-in desk shows live-capture actions while closed: status "NOT OPEN YET ... It opens 60 minutes before the event starts." yet "Scan badge", "Enter code", "+ Walk-in" and per-row "Check in →" are still presented as ordinary actions. A first-time organiser cannot tell whether they work. (Not clicked; see gaps.) Rank MAJOR if clicking them writes data while closed — verify.
6. Events home banner "Email delivery: development stub (no inbox)." is shown to the organiser; fine for dev, must not ship. NIT if review-only.
7. Check-in list: 8 events listed but only 7 desk links exposed in the accessibility tree (last row, "UX03B D4 EDITED by member non-owner", had no link). Possibly a read_page truncation; verify by clicking.

NIT
8. Sidebar identity block differs between pages: Events home shows initials "UX" + email; /events/new shows "ux-admin" + email. Same person, two labels.
9. Check-in list sorts by date then arbitrary title order (Dec 11: "pub member" before "pub admin").

## Step 2 — four questions (partial)
- Where am I: yes. Breadcrumb "Events > Create event", heading "Create event", titled "New event · Eventar", "Back to Events" in sidebar.
- Main thing: yes. Intro: "A name, date, times and venue are enough to save a draft. Use Save draft to keep working on it, or P..." Buttons: Cancel / Save draft / Publish event. "Save draft" is honest wording (PASS on that point).
- How to progress: partially. Numbered sections 1-7 plus a "Form progress" list. But required fields are only reported one at a time (below).
- Way back: yes (Cancel, breadcrumb, sidebar).
- Verdict: INCOMPLETE. Draft not created; no draft appears on Events home; no event id to hand to the next lens.
- Screenshot: 0.

Wrong-thing tests done:
- Save draft with everything empty -> inline warning "Add the event basics (name) to continue." and the page scrolls to it (scrollY 367). Four red asterisks stay. Only the name problem is named; date, start, end, venue also required but not flagged.
- Name "ZZ-WALK Draft 1" + date Fri 4 Dec 2026 (status line "Selected date: Fri, 4 Dec 2026"), no times/venue -> Save draft gave "Pick a venue from the dropdown to continue." Start/end times not mentioned (the venue error came first).
- NOT done: end-before-start (needs the time pickers; budget). Venue picker skipped per brief (slow public geocoder).

### Findings (step 2)
MAJOR
10. Errors arrive one at a time in a fixed order (name, then venue, then presumably times). A first-time organiser with several missing fields needs one Save click per field. List all missing required fields in one message and mark each field.
MINOR
11. "Venue" is required to save a draft but the field is not marked "required" in the form (the Date, Start, End and Event name carry a "required" tag; the "Search a venue, building, or address…" box carries none). The first notice that it is required is the blocked save.
12. Timezone copy conflicts: "Times are in your local timezone. The event page will display them in the venue's local time." vs. the Events list showing "GMT+8" and the check-in desk "(Asia/Hong_Kong)". An organiser outside HK cannot tell which zone they are entering. (Confirm against the real rule: organiser "today" = organiser location.)
13. Venue is a hard dependency on an external geocoder with no free-text fallback visible; if the lookup is slow or down an organiser cannot save any draft (dead end). Not verified under failure.
14. Placeholder copy is generic/off-brand for CPD: "Workshop on TDD", "One paragraph about the workshop.", "engineering · onboarding · etc.".
NIT
15. Agenda section helper "Blocks are ordered by start time." appears before any block exists; correctness of this wording is NOT verified (step 3 not walked).
16. "7 · CPD accreditation" body list shows three test bodies to an organiser: "RLS-ACCGRP-1789786414526 — RLS Test Body (accreditation_groups guard fixture)", "RLS-FREEZE-FIXTURE ...", "RLS-SEC-FREEZE-FIXTURE ...". Fixture data in the local DB; flag so it is not mistaken for a product bug.

## Step 3 — NOT WALKED
Reason: cap reached before a draft existed. No agenda DB read-backs were done. "Saved in start-time order" wording unverified. Handed back to the next lens: create the draft (needs the venue picker), then walk agenda add / reorder / remove with DB read-back.

## Finding counts (this file)
BLOCKER 0 | MAJOR 3 (#1, #2, #10; #5 conditional MAJOR) | MINOR 8 (#3, #4, #5, #7, #11, #12, #13, #14) | NIT 5 (#6, #8, #9, #15, #16)

## Coverage gaps (not clicked, with reason)
- Events home: Details / Edit / Check-in buttons per row (Edit, Details) — budget; row checkboxes (bulk select) and whatever bulk bar appears — budget; Search events box, Sort combobox — budget; Restore buttons on Deleted tab (would change data; not clicked); Needs-attention row link; "Settings" sidebar item (opened only for sign-out, see below); "History" link in the Events header; brand "Eventar home" link.
- Check-in desk: Scan badge, Enter code, + Walk-in, per-row "Check in →", tabs All/Checked in/Pending, Registrations link, Back to Event, breadcrumb links (budget; the first three can write data).
- History rows (events/<id>/analytics).
- Browser "back" after sign-in was exercised only once and its result is unclear (see step 1).
- /login while signed in: content not read.
- New event form: Hero image upload, Topic tag, Description, Category select, Hosted by / Organized by add buttons, Max attendees, venue picker (skipped), month prev/next, Start and End time pickers, all agenda component buttons (+ Keynote ... + More, + Break), Registration open/close pickers, self check-in checkbox, CPD body select and CPD hours, Cancel, Publish event (publishing would be irreversible; not clicked).
- Mobile/narrow viewport not tested; keyboard-only not tested.
- Mailpit note: the brief said Inbucket; the catcher on :54324 is Mailpit (GET /api/v1/messages, /api/v1/message/<id>). Not a product finding.

Tool calls used: about 36 before this write (cap 40).

---

# RESUME 2 (second 40-call budget) — step 2 completed, step 3 still NOT walked

Signed in again via Mailpit magic link (the link carried no ?next, still landed on /dashboard). Draft created: event id 960f8842-f0f0-4448-9573-a2a71a68dcd2, title "ZZ-WALK Draft 1", org 00000000-0000-0000-0000-000000000001.

## Step 1 leftovers (previously "unresolved")
- /login while signed in: page shows "Log in / Loading…" for a moment, then redirects to /dashboard (Events). PASS, but the "Loading…" flash on a login page for a signed-in organiser is a NIT.
- Browser back after sign-in: from /login (redirected) back went to http://localhost:3100 -> Events. It did not return to the magic-link/verify page or a dead login form. PASS.

## Step 2 result: PASS with findings (the happy path saved)
Four questions: where am I (yes: heading "Create event", then after save "Edit event · Eventar" with h1 "ZZ-WALK Draft 1"); main thing (Save draft); how to progress (after save: message "Draft saved. Review and publish when you are ready." and a Publish control, helper "Makes the registration page live with the version you last saved, and unlocks the event QR code."); way back (breadcrumb/sidebar). Screenshot: 0.

Venue picker (Nominatim): typed "Hong Kong Convention"; the list shows the single row "Searching…" and took about 4.5 s from last keystroke to results (2.5 s more after a 2 s wait). Results are good (HKCEC first, then New Wing, Grand Hyatt, ...; each row is name + full address). After picking, the field shows the venue, the address, "Hong Kong, Hong Kong, China", a "Clear" button, and the line "Timezone follows the venue — Asia/Hong_Kong." This replaces the vague "Times are in your local timezone" copy seen before a venue is chosen (earlier finding 12 narrows to: the vague line is shown BEFORE a venue exists; once picked, the zone is stated correctly). Not tested: zero-result query / geocoder down (so the no-manual-entry-fallback concern, finding 13, is still unverified).

Time pickers: Start and End are lists of 96 slots (15-min, 12:00 AM to 11:45 PM), no typing. Picking Start 09:00 AM left End showing every slot, including earlier ones.

End before start: with End = 08:00 AM and Start = 09:00 AM, Save draft was refused and the form showed "End must be after Start." beside the field. PASS. The End list does not stop you picking an earlier time; the error only comes after you press Save. NIT.

DB read-back (psql): events row 960f8842…: status draft, start_time 2026-12-04 01:00:00+00, end_time 2026-12-04 04:00:00+00, timezone Asia/Hong_Kong, venue_name "Hong Kong Convention and Exhibition Centre", organisation_id 00000000-…-0001. Matches 09:00–12:00 HKT entered. Data correct.

### New findings (step 2, resume)
MAJOR
17. POSSIBLE SILENT DATA LOSS: the Event name field was empty after I had filled it and then chosen a venue/date/times. Sequence: name set to "ZZ-WALK Draft 1" (field showed it) -> typed in venue box -> picked venue -> picked date -> picked start/end. On Save the form said "Add the event basics (name) to continue." and the name input value was "" (checked in the page). The name had been wiped. Cause unproven: it may be my automated value injection (the tool sets the field without real keystrokes) rather than the product. Reproduce with real typing before ranking; I did not have calls left. If real, an organiser loses the name when they pick a venue.
MINOR
18. Errors are NOT always one-at-a-time: this time the form showed "Add the event basics (name) to continue." and "End must be after Start." together. Finding 10 narrows to: the page-level blocker (name/venue) shows alone, field-level errors can appear together. Inconsistent.
19. "Draft saved. Review and publish when you are ready." appears twice in the page text (two identical status regions); a screen reader would read it twice. NIT.

## Step 2 still not done
- Drafts tab on Events home: draft listed with its "DRAFTED" chip and Drafts count 4->5 — NOT CHECKED (no calls left).
- Every control on the New-event form (hero image, category, hosted by / organised by, self check-in, registration open/close, CPD, Cancel, Publish): NOT CLICKED. Publish was deliberately not pressed.

## Step 3 — NOT WALKED (second time)
No agenda blocks added, no psql agenda read-backs, no Details/Edit/Publish-area click tour of the draft, no check of "saved in start-time order" wording. The draft exists at /events/960f8842-f0f0-4448-9573-a2a71a68dcd2/edit for the next dispatch.

## Updated finding counts (whole file)
BLOCKER 0 | MAJOR 4 (#1, #2, #10 narrowed, #17 possible; #5 conditional) | MINOR 9 | NIT 7.

Resume-2 tool calls: 40 (counting every call inside batches).

---

# RESUME 3 (third 40-call budget) — Drafts-tab chip, step 3 agenda, Edit-page tour

Sign-in via Mailpit magic link OK (landed on /dashboard). Screenshots: 0 taken (text/JS reads only). Browser-pane note: `read_page` returned "(empty page)" on /events/<id>/edit even after tabs_select; get_page_text and find worked.

## (a) Drafts tab — /dashboard?tab=drafts
Draft IS listed: row "4 Fri Dec | DRAFTED | ZZ-WALK Draft 1 | 09:00 GMT+8 | Hong Kong Convention and Exhibition Centre | Details | Edit". Tab count Drafts 5 (was 4). Row title link goes to /events/960f8842-…/details; "Edit" goes to /events/…/edit.
- Chip says "Drafted" (past tense, reads like a verb). Same word is used on the Deleted tab (finding #1). MINOR: "Draft" is the state; #1 MAJOR stands.
- Clicked Details via the row title: the first click-through did not navigate before I read the page (text still the dashboard), then browser Back landed on the Active tab, not Drafts (lost my tab). MINOR, not conclusive (could be tool timing). Loaded the Details URL directly instead.
- Details page of a DRAFT, 31 days before the event, reads (quoted): "Status ELAPSED 00m 00s ... WRAPS IN 746h 53m ... 09:00 start 09:06 now 12:00 end". A live-event timer saying ELAPSED for an event that has not started and is not published.
  MAJOR #20: wrong/misleading status on a draft: "ELAPSED" is the opposite of the truth (nothing has started; the event is a draft).
- Same page shows post-event machinery for a draft: "survey Armed fires 10 min after end", "Attendance · opens 4 Dec 30d 22h to door", "Feedback · opens 12:10 10 min after wrap", Evidence-export blocks "Available once credit has posted". "Registration not open yet — Publish to begin registration." is the only hint that publishing is the next step, and there is no Publish button on Details (it lives on Edit). MINOR #21: a draft's Details page gives no way to progress except the small Edit link top-left.
- "Email delivery stubbed — RESEND_API_KEY is unset — new sends will record as stalled." shown to an organiser (dev wording; same as #6).
- Details/Edit pages: back path is breadcrumb "Events" and sidebar. PASS.

## (b) Step 3 — agenda integrity on /events/960f8842-…/edit
Agenda section copy before any block: "Blocks are ordered by start time." then "Event type" chips "+ Keynote + Lecture + Symposium + Panel + Workshop + Case Presentation + Oral Abstract + Debate + Other + More", "No components yet.", "Breaks + Break None."
Done: added Keynote, Lecture, Panel blocks in that order; set times so Keynote 10:00-10:30, Lecture 09:00-09:45, Panel 11:00-11:45 (all inside 09:00-12:00 HKT).
- LIVE REORDER TRUE: as soon as the Lecture was given 09:00 it jumped above the Keynote in the form (button order 09:00, 10:00, 11:00). The page sorts by start time without telling the user (blocks silently move under the cursor while editing). MINOR #22.
- SAVE REFUSED, WRONG-THING PROBE 1 (title/topic empty) — two warnings: "Fix the highlighted agenda blocks (each needs a valid time inside the event window, plus a title)." and, three times, "Please enter a valid topic 1 (title + speaker) to continue." Times were valid and block title was filled; the real fault was the blank default topic. The copy asks for a time/title fix that was not wrong, repeats the same line 3 times and does not say WHICH block (I could not tell block 1 from 3), and the topic fields have no label/placeholder (all inputs report placeholder "" and no aria-label). MAJOR #23: a first-time organiser cannot tell what is wrong or where; they see 3 identical warnings. Also a status line "You have changes that are not saved." sits in the same region (good).
- Required-ness: a Lecture/Keynote/Panel needs a topic with title AND speaker, but nothing in the form says so before Save. Block-level fields (title, host) and topic fields (title, speaker_name, speaker_credential, speaker_affiliation) are unlabeled to assistive tech.
- SAVE OK after filling the first topic: banners "Draft saved. Review and publish when you are ready." and "Saved." (two success regions again, see #19).
- psql read-back (public.agenda_blocks, HKT): exactly 3 rows, no duplicates, no loss:
  lecture | ZZ-B Lecture early | host Speaker A | 09:00-09:45 | display_order 0
  keynote | ZZ-A Keynote mid   | host Speaker B | 10:00-10:30 | display_order 1
  panel   | ZZ-C Panel late    | host Speaker C | 11:00-11:45 | display_order 2
  Each block has 2 topics (the default one I filled + one I added with "+ Add topic"; my filler text "ZZ fill N" is in title/speaker_name/speaker_credential/speaker_affiliation). Table has CHECK end_time > start_time and kind CHECK.
- WORDING "Blocks are ordered by start time." = TRUE (form sorts live; DB display_order 0,1,2 follows start time even though the blocks were created Keynote, Lecture, Panel). The task's other wording "saved in start-time order" = TRUE for this case.
- Typing note: titles were set with a React-safe native setter + input event (first title via real key events); they all persisted, so no "name empty at Save" defect was seen this time (this supports #17 being a tool artefact).

NOT DONE in step 3 (budget): out-of-window block and end-before-start block error text (attempted in the final JS pass, see below if present); manual reorder (there is NO drag/up-down control in the form; order is purely by time); Remove-a-block + Save + read-back; Break block.

## Step 3 verdict (partial): PASS on integrity (3 in, 3 out, ordered, no dups), FAIL on error clarity (#23)
- Where am I: yes (h1 "ZZ-WALK Draft 1", badge "draft", numbered section "4 · Agenda (optional)").
- Main thing: yes, event-type buttons then Save changes.
- How to progress: weak. First Save failure did not say which block/field (#23).
- Way back: yes (Cancel, breadcrumb Events, sidebar).

New findings this round: MAJOR #20, #23 | MINOR #21, #22 | NIT: chip "Drafted" wording.

### (b) addendum — error cases, remove, read-back (final JS pass)
- OUT-OF-WINDOW block (Panel end set to 12:30 PM, event ends 12:00): the end picker ACCEPTED 12:30 PM (it lists every slot); Save was refused with only "Fix the highlighted agenda blocks (each needs a valid time inside the event window, plus a title)." No block named, no time quoted, no statement of the window (09:00-12:00). MAJOR #24 (same family as #23): the organiser must guess which block and why. Nothing was written (verified: no extra/changed row in DB).
- END-BEFORE-START block (Panel start 11:00, end 10:30 AM): same single generic sentence; the sentence says "valid time inside the event window" though the real fault is order. MAJOR #25 (wrong diagnosis; same copy for two different mistakes). The picker does not disable earlier times (mirrors #9 NIT in step 2: end list not filtered).
- REMOVE a block (head-of-block "REMOVE", Panel): removed instantly, NO confirm (window.confirm not called, nothing else in the DOM), then Save changes -> "Draft saved. Review and publish when you are ready." + "Saved.". psql after: 2 rows only, lecture 09:00-09:45 (order 0), keynote 10:00-10:30 (order 1); no dups, panel row gone, display_order stays contiguous. PASS on integrity. MINOR #26: one click on REMOVE deletes a block with its topics/speakers from the form with no undo (it is only permanent after Save, which is some protection, but there is no "Undo" or per-block confirm).
- REORDER: no control exists; order = start time only (confirmed by DB).

### (c) Edit-page controls (partial — budget hit at 40; sign-out NOT done, session still signed in as ux-admin)
Edit page order (text): header "Events > ZZ-WALK Draft 1 > Edit", badge "draft", title, "04 Dec 2026, 09:00 → 04 Dec 2026, 12:00 (Asia/Hong_Kong)", THEN a standalone "CPD accreditation" box (body select with 30+ bodies, "CPD hours", its own "Save", link "Configure multiple accrediting bodies →") ABOVE the numbered form "1 · Hero image / 2 · Basics / 3 · Date & venue / 4 · Agenda / 5 · Registration period / 6 · Check-in", then "Cancel / Save & Preview / Save changes" and "Ready to publish? Makes the registration page live with the version you last saved, and unlocks the event QR code. Details cannot be edited after publishing yet, so check them first. [Publish event]".
- MAJOR #27: two Save scopes on one page. The CPD box has its own "Save" and sits first; the main form has "Save changes" and "Save & Preview" at the bottom. Nothing says the CPD Save does not save the rest or vice versa; an organiser who fills the form then presses the first "Save" they see loses/keeps the wrong half. (Not clicked: CPD Save; read from structure only. Verify before ranking BLOCKER.) Also numbered "1-6" section list skips CPD, which is numbered "7" on the New-event form but is un-numbered and first here.
- Cancel: with an unsaved change (self check-in toggled; page showed "You have changes that are not saved.") Cancel navigated straight to /events/<id>/details with NO warning (no confirm, no dialog) and the change was discarded. MAJOR #28: silent loss of unsaved edits on Cancel (Cancel semantic = discard, but the label does not say "Discard changes" and it goes to Details, not the Drafts list the user came from). Browser beforeunload / tab-close warning NOT tested.
- The page does show a passive "You have changes that are not saved." status when dirty (good) and a prominent publish warning "Details cannot be edited after publishing yet, so check them first." (good, honest).
- "Timezone follows the venue — Asia/Hong_Kong." and, right below the time pickers, "Times are in your local timezone. The event page will display them in the venue's local time." both show at once on the Edit page. The two lines contradict (updates #12). MINOR #29.
- Sidebar on Details/Edit: links Back to Events, Check-in, Events, History, Settings; no "Sign out" visible on the Event Manager page (sign-out lives in Settings > Session, per brief). MINOR #30: after a long edit session the organiser cannot sign out from the page they are on.
- Self check-in copy: "Let attendees check themselves in ... On a CPD-accredited event this posts attendance credit with no staff member present." Clear, honest. Control exists as the last checkbox; default is ON? (checkbox value "on" is the DOM default, not state; not verified).

### NOT clicked / coverage gaps for this resume
Hero image upload (file chooser), Category select values, Add hosted by / Add organized by (opens?), Max attendees, venue Clear, month prev/next, registration open/close date+time pickers, CPD body select and CPD Save, Save & Preview (where it lands, whether it publishes), breadcrumb "Events", "Configure multiple accrediting bodies →", Publish event (deliberately NOT pressed), Break block, "+ More" event types, tab-close/beforeunload warning, Settings > Session > Sign out (no calls left). Screenshots: 0.

## Final counts, RESUME 3 (new this round)
BLOCKER 0 | MAJOR 6 (#20, #23, #24, #25, #27 possible, #28) | MINOR 6 (#21, #22, #26, #29, #30, Drafted-chip wording) | NIT 0.
Whole file: BLOCKER 0 | MAJOR 10 | MINOR 15 | NIT 7.
Step 3 verdict: data integrity PASS (add 3 / save / read-back, order by start time, remove 1 / save / read-back, no dups, no loss, bad windows not written); user-facing error copy FAIL (#23-#25). Overall step 3: PASS WITH MAJOR FINDINGS.
Tool calls this resume: 40.

---

# RESUME 4 (fourth 40-call budget) — steps 4 (publish) and 5 (Registrations / Check-in), PARTIAL

Screenshots: 0 (text/JS reads only). Browser-pane note: read_page / find returned empty or no match on the public event page and Registrations page (known hidden-pane issue), so controls were read via DOM text and driven with synthetic events. Synthetic events can differ from a real user, so every "no effect" item below is marked UNVERIFIED and must be re-checked with real clicks.

## Step 4 — Publish: PASS with findings
Where is Publish: GET /events/<id> for a draft redirects to /events/<id>/edit (title "Edit event"). The only Publish control is the last block on the Edit page, under "Ready to publish?" ("Makes the registration page live with the version you last saved, and unlocks the event QR code. Details cannot be edited after publishing yet, so check them first." [Publish event]). It sits below the six form sections and the "Cancel / Save & Preview / Save changes" row. "Save & Preview" does not publish (not clicked). Discoverability: found only by scrolling to the bottom of a long form; the Details page of a draft has none (matches the earlier report).
Confirm dialog (quoted): "Publish this event? / ZZ-WALK Draft 1 / Your registration page goes live. Anyone with the link can register. / Registration opens now. / Check-in opens at 04 Dec 2026, 08:00 (Asia/Hong_Kong), 60 minutes before the start. / Details cannot be edited after publishing yet, so check them first. [Keep editing] [Publish event]". It names the event and states what goes public (registration page, anyone with link, registration opens now, lock). It does NOT list what the public will see (venue, agenda blocks, speakers) or whether the unsaved form state is what goes live (copy elsewhere says "the version you last saved").
Cancel test: clicked "Keep editing": dialog closed, URL unchanged, psql events.status = draft, updated_at unchanged (2026-11-03 01:10:10). PASS (no silent change).
Confirm test: clicked Publish event in the dialog: label became "Publishing…", about 2-3 s later redirect to /events/<id>/details. psql events.status = published. PASS.
After publish: Details page shows badge "REGISTERING", and "Published. Your registration page is live." then card "What to do next" with: "Share the link" + URL + [Copy link]; "Registrations show in the Registered count as people sign up." [Open registrations]; "Check-in opens at 04 Dec 2026, 08:00 (Asia/Hong_Kong), 60 minutes before the start."; a further QR item (text cut off in my read). Header buttons now: Edit, Registrations, Check-in, Public (new tab icon), Analytics. The earlier draft-Details defects are gone: STATUS now reads "STARTS IN 743h 47m / RUNS FOR 03h 00m" (finding #20 "ELAPSED" was draft-only). Next action is obvious.
Public page (same session, same URL /events/<id>): framed correctly as the public page: tag "REGISTERING", agenda in time order (Lecture 09:00, Keynote 10:00, the removed Panel absent), venue, "Fri 4 Dec · 09:00–12:00 (Asia/Hong_Kong)", and the line "You're signed in as an organiser. This creates a guest registration." above the form. Chrome is the public site header (Eventar, Upcoming events, "Events -> /dashboard", How it works, Platform), not the manager sidebar. Staff can get back via the header "Events" link only; there is no explicit "Back to event manager" link. 

Four questions (step 4): where am I yes; main thing yes (Publish event / Registered guest form); how to progress yes (What to do next card); way back partial (public page: only header "Events" link, label does not say it is the organiser dashboard). Verdict: PASS.

### Findings (step 4)
MAJOR
31. The "Copy link" button in the "Share the link" card failed with a visible message "Could not copy the link. Select it above and copy it." The message is honest, but the one-click share action did not work; this may be the automation pane (clipboard permission denied). Re-check in a normal browser before ranking. If it fails for real users it is the main post-publish action failing.
MINOR
32. Publish is only at the bottom of a long Edit page; the Details page of a draft has no Publish (repeats #21). A first-time organiser who just saved a draft and lands on Details cannot see how to go live.
33. Confirm dialog lists policy but not content: it does not say the venue, agenda and speakers shown are what the public sees, and does not say that unsaved edits in the open form are NOT included.
34. Success banner "Published. Your registration page is live." plus the next-steps card are on the Details page, but the "Details cannot be edited after publishing yet" lock is not repeated; the CPD accreditation "Save" box is still active on the published Details page. An organiser may think CPD can still be edited and may not know what is frozen. (Not clicked.)
NIT
35. Public page, staff view: the guest form is rendered at the bottom after the agenda; the organiser-signed-in notice is small. Public header shows the marketing nav (How it works, Platform) to a signed-in organiser.

## Step 5 — Registrations vs Check-in split: PARTIAL (Check-in surface NOT walked)
Registered ONE guest through the public page form: name "ZZ Walk Guest 1", email zzwalk1@final.invalid. Result panel: "GUEST REGISTERED / Registered as a guest / ZZ Walk Guest 1 (zzwalk1@final.invalid) / Registered. Email delivery is in dev mode, so check the operator console. / Closer to the event the guest receives their personal check-in pass by email." with [Register another guest]. Clear, and tells the staff member what happened. (Dev wording "check the operator console" is for review mode only; flag it must not ship — NIT 36.)
Registrations page /events/<id>/registrations: title "Registrations · Eventar", breadcrumb "Events > ZZ-WALK Draft 1 > Registrations", intro "Everyone registered for this event. Edit contact details and roles here. To check people in, open Check-in." plus link "Check-in →" (/events/<id>/checkin). The hard split holds in the text and the links: Details header "Registrations" -> /registrations, "Check-in" -> /checkin; the Registrations page links to Check-in and says where to check people in; "Open registrations" in the next-steps card also goes to /registrations. The Check-in desk URL was NOT opened in this resume, so "Check-in never lands on Registrations" is UNVERIFIED here (earlier lens: desk at /events/<id>/checkin showed NOT OPEN YET and a Registrations link).
Controls on Registrations: status filter buttons All (1) / Registered (1) / Attended (0) / Cancelled (0); search box "Search name or email"; per-row role chips "chair" and "presenter"; status chip "Registered"; "Edit" button; header links Events, event title (-> /details), Check-in →. The row shows name, email, "Registered 03 Nov 2026, 09:13".
Probes (all via synthetic events, UNVERIFIED):
- Typing the non-matching string "qqnomatchqq" into search (input + change + Enter, waited 2 s): the list still showed the guest. No empty-state copy appeared. If real, search does nothing.
- Clicking the "Attended (0)" filter: the Registered guest still showed in the list. Zero attended people should give an empty list. If real, the filter does nothing.
- Clicking the first button whose text starts with "Edit": no dialog opened (the first match may have been a different element). Edit dialog, Cancel, rename+Save and role chips NOT tested.

### Findings (step 5)
MAJOR (conditional, must be re-checked with real clicks and real typing)
37. POSSIBLE DEAD CONTROLS on Registrations: the status filter "Attended (0)" and the search "qqnomatchqq" both left the one registered guest on screen, with no empty-state message. A control that does nothing and says nothing is a silent failure (MAJOR by the brief). Re-run with a real click and real key events; if search needs Enter or a delay, the page should say so.
MINOR
38. Registrations page uses the same "Registered" word for the filter, the status chip and the count in "All (1)"; the filters have no active-state text (only visual) — not checked in an accessibility read.
NIT
36. Dev copy shown to organiser: "Email delivery is in dev mode, so check the operator console." (repeats #6).

Four questions (step 5, Registrations only): where am I yes; main thing yes (list + Edit); how to progress yes (Check-in → link and the explanatory intro); way back yes (breadcrumb, sidebar). Verdict: INCOMPLETE. Registrations split text PASS; controls UNVERIFIED; Check-in surface and its closed-state controls NOT WALKED.

## Coverage gaps (this resume)
- Check-in desk (/events/<id>/checkin) and sidebar Check-in: NOT opened (budget). Not verified: which controls are offered while NOT OPEN YET, and whether Scan badge / Enter code / + Walk-in / tabs respond with a clear refusal. Walk-in submit and check-in were never to be pressed.
- Registrations: Edit dialog (open, Cancel, rename, Save, result copy), role chips (they probably write data), real-click status filter, real-typed search + empty copy: NOT verified.
- Save & Preview (where it lands), "Open registrations" / "Copy link" in a normal browser, QR item of next-steps card, Analytics and Public header buttons on Details: not clicked.
- psql read-back of the registration row: not done (UI shows the row).
- Test data left: published event 960f8842-… with one registration "ZZ Walk Guest 1". Cleanup is left to the harness.

## Counts, RESUME 4 (new this round)
BLOCKER 0 | MAJOR 2 conditional (#31, #37) | MINOR 4 (#32, #33, #34, #38) | NIT 2 (#35, #36).
Whole file: BLOCKER 0 | MAJOR 12 | MINOR 19 | NIT 9.
Verdicts: step 4 PASS with findings; step 5 INCOMPLETE (Registrations text PASS, controls and Check-in not verified).
Tool calls this resume: 40 (counting every call inside batches), sign-out in the last two.

---

# RESUME 5 — steps 5d + 6a (PARTIAL, hit the 40-call cap)

Reviewer: organiser user-lens, ux-admin, event 960f8842-…, window state `before` (starts in ~3h, check-in not open). Screenshot: one taken (login page only, inline-only, not saved). Everything else read via read_page / get_page_text.

## 5d — Registrations Edit dialog, chips, search: PASS (with 1 MINOR)
URL /events/960f8842-…/registrations. Dialog opens with heading "Edit registration", text "Correct a mistyped name or email. Each change is recorded with who made it and which fields changed.", fields Full name + Email, hint "Their check-in code stays the same, so a pass already emailed to them keeps working.", buttons "Save changes" / "Cancel", plus a close X.
- Cancel closes with no change (row still "ZZ Walk Guest 1"). OK.
- Rename to "ZZ Walk Guest 1b" + Save: button reads "Saving…" then the page shows the line "Saved changes to ZZ Walk Guest 1b." and the row updates. psql read-back: full_name = "ZZ Walk Guest 1b", email unchanged, registration_code still MG6GNG, status registered; audit_events has a new `registration_contact_updated` row. Copy correct and the data change is not silent.
- Chips: "Cancelled (0)" shows "No matches." (no explanation like "Nobody has cancelled", MINOR #40 below). "Registered (1)" restores. Search "nobody" with Registered chip also "No matches." — clear enough. A matching search (positive case) was NOT walked (cap).
- MINOR #39: "Saved changes to ZZ Walk Guest 1b." lives in a status line under the header, and it stays until the next action; no sign it will disappear. Acceptable, low risk.
- MINOR #40: empty chip copy "No matches." is the same for "nobody cancelled" and "your search found nothing". A first-time organiser may think a search is stuck on after switching chips.
- Four questions: where am I (breadcrumb Events > event > Registrations, heading) clear; main thing (list + Edit) clear; how to progress ("To check people in, open Check-in" with a link) clear; how to get back ("Back to Event", breadcrumb) clear. PASS.
- NOT DONE: role chips (chair / presenter) were NOT clicked (no psql read-back of role); sidebar Check-in chooser (/checkin) was NOT opened; name NOT renamed back (the fixture guest is still "ZZ Walk Guest 1b", the harness owns cleanup; I only run read-only SQL).

## 6a — Check-in desk BEFORE the window: INCONCLUSIVE, leaning FAIL (silent clicks)
URL /events/960f8842-…/checkin. Desk header shows event, "03 Nov 2026, 12:20 → 03 Nov 2026, 15:20 (Asia/Hong_Kong)", scoreboard "NOT OPEN YET / Starts in 2h 58m / 0 / 1 checked in", and a status line "Check-in has not opened yet. It opens 60 minutes before the event starts." The wording is clear, correct (matches 60-minute rule) and states when it opens. GOOD.
- #41 MAJOR (conditional, needs a screenshot/eyes to confirm): I clicked the per-row action. The accessibility name of that button is "Check-in has not opened yet. It opens 60 minutes before the event starts." but its visible text is "Check in →" and it looks like a live action. After a real click, the page text shows NO new message, no toast, no changed row. If the button is truly disabled it is a disabled-looking-active control with no explanation on hover/click; if enabled, the click died silently. Either way a first-time organiser clicks "Check in" and sees nothing happen. Anything that dies in silence is at least MAJOR. Where the explanation exists (header status line) it is above the fold of the row, but not tied to the click.
- #42 MAJOR (conditional, same caveat): I clicked "Enter code" while closed. get_page_text afterward shows no code field, no dialog, no refusal, nothing. Either the control is inert before the window (no explanation at the control) or a field opened that the text read did not capture. Not confirmed by screenshot (cap). Same silent-click risk.
- "Scan badge" and "+ Walk-in" not clicked (cap). No walk-in/scan before-window refusal was checked.
- psql: registration_checkins and participation_evidence for this event NOT re-queried after the clicks (cap). Earlier state: 0 rows is expected but UNVERIFIED this resume.
- Four questions on the desk (closed state): where am I clear; main thing clear (status line); how to progress: ok, says when it opens; how to get back: "Registrations" link + breadcrumb + Back to Event. Fine.
- Not a new finding (already known): Speakers "Check in" buttons stay live before the window.

## Step 6b (inside), 6c (after, guest 2): NOT WALKED (cap). Fixture left in state `before`, NOT `inside`; the caller must run walk-window.sh inside before step 7.

## Verdicts
Step 5 (leftovers): PARTIAL, Edit dialog PASS; role chips and sidebar chooser UNTESTED.
Step 6: FAIL-pending / INCONCLUSIVE (6a clicks silent, 6b/6c not walked).

## Counts, RESUME 5
BLOCKER 0 | MAJOR 2 conditional (#41, #42) | MINOR 2 (#39, #40) | NIT 0.

## Coverage gaps (this resume)
Chair role chip + psql role read-back; rename back; sidebar Check-in chooser; Scan badge, Enter code typed submission, +Walk-in before window; 6b inside window check-in, duplicate check-in, DB rows; 6c guest 2 and ended-event desk. No screenshot saved; screenshots inline-only.

---
# ORCHESTRATOR WALK (steps 6, 7, 8 as ux-admin) — real clicks and typing in the fronted pane, DB read-back after each write
Evidence tags: [X] executed by the orchestrator this run. Fixture event 960f8842-… moved through before/inside/after by a local script that edits only that event and its occurrence.

## Step 6 — check-in window (O7): PASS on the desk; 1 MAJOR on speakers
- BEFORE (starts in 2h57m, opens 60 min before): desk status "NOT OPEN YET · Starts in 2h 57m" and "Check-in has not opened yet. It opens 60 minutes before the event starts." Scan badge, Enter code and the per-row "Check in →" are DISABLED; "+ Walk-in" opens a panel whose first line is the same red refusal. psql: 0 registration_checkins rows after every click. [X]
- INSIDE (started 30m ago): status "LIVE · Started 30m ago · Check-in is open." Wrong code XXXXXX -> "Code not recognised." (inline + toast). Right code MG6GNG -> dialog "Checked in · ZZ Walk Guest 1b is checked in." + toast "Marked ZZ Walk Guest 1b attended (ZZ-WALK Draft 1)." psql: exactly one registration_checkins row (method manual) and one participation_evidence row. Same code again -> "Already attended at 03 Nov 2026, 09:24." inline + toast; psql still one row. [X]
- AFTER (ended 1h ago): "CLOSED · Ended 1h ago · ATTENDANCE · FINAL · Check-in is closed. This event has ended." Scan, Enter code, per-row Check in all disabled. [X]
- MAJOR M-ORCH-1 (decision for Ivan, not a code slip): the Speakers card "Check in" buttons have NO window rule. Executed: before the window, 31 days early, one click wrote speaker_checkins "Speaker A" checked_in_at 2026-11-03 with updated_by = staff 484c8efb-… (psql). The UI gave no refusal, and the buttons stay enabled after the event has ended (checked after state "after"). `speakerActions.ts` says this is "an open product call, not an oversight". It conflicts with O7 "never written days early or after the event has closed" and with the attendee rows on the same page, which refuse.
- MINOR: the disabled Scan badge looks like a pale primary button, not an obviously disabled one; Enter code is grey. Two disabled controls look different.
- Correction to earlier lens notes: "+ Walk-in gives no response while closed" (#40) is NOT confirmed. The click opens a panel that sits under the control row and says the check-in has not opened. Earlier lens read a hidden pane. #40 downgraded to MINOR: the panel opens below the controls and is easy to miss on a short screen.

## Step 7 — walk-in (O8): PASS [X]
Inside the window: "+ Walk-in" -> Full name, Email, "Register & check in". Submitted ZZ Walk Walkin 1 / zzwalkin1@final.invalid. psql: source = 'walk_in', status attended, check_in_method manual, user_id NULL (staff row id 484c8efb-…, auth id dcabf588-… appear nowhere), profile_snapshot NULL. registration_checkins 2 rows, participation_evidence 2 rows (one per attendee). Four questions: all clear.

## Step 8 — post-event path (O9): PASS with MINOR
History (/analytics) -> click the event -> event Analytics: "2 of 3 registered attended · 0 of 2 responded (0%)", funnel, five feedback sections, "Export CSV" (1 click). Event Details (History -> event -> "Back to Event" = 2 clicks) holds "Export evidence (JSON + CSV)", "Export College package (CSV)", "Export attendance evidence (CSV)" and the feedback card with "Send survey invites". The College exports say "Available once credit has been posted for this event." so for an event with no accrediting body they are present but inert (copy explains why).
- MINOR: History rows show "0 responses" with no hint of exports; the Analytics page does not link to the College package, so the user must know to go "Back to Event".
- MINOR: Details says "survey Armed · fires 10 min after end" while the event ended 1h ago and "Survey invite 0 sent". Cron is deferred to Stage 8 locally; copy still promises an automatic send. Check wording for production.
- NIT (local only): History lists 100 fixture events ("… DELETE ME …"), so the real event is only the first row because it is newest.

# ux-member lens

Persona: ux-member@eventar-review.invalid (organiser_member, not admin, not creator of fixture 960f8842). 2026-11-03. Budget-capped walk (40 tool calls); coverage gaps listed per section.

## A. Sign-in, landing, Settings

Four questions (A): where-am-I PASS (title "Events"), main-thing PASS ("New event" primary), how-to-progress PASS, how-to-get-back PASS.

- MAJOR - A1 `/settings`, member sees admin-door controls. Settings shows a "Team" card: "Manage your organisation's members and invite new teammates." with a "Manage team" link. For this member the target `/settings/team` renders only "Members ... UX Member / Member" and no invite control and no invite links, although the page subtitle promises "invite links". The card promises an action the member cannot perform and the destination silently omits it with no "ask an admin" line. A first-time member is told they can invite and then finds nothing, with no explanation. (Not an error toast, but a promise that dead-ends; no copy tells the member who can invite.)
- MINOR - A2 sidebar. The member sees the same chrome as an admin: Check-in / Events / History plus an "ADMIN" section label over "Settings". Landing is `/dashboard` (Events) as expected. "ADMIN" heading over the one item a member uses (personal preferences, Sign out, change email) reads as "you are in the wrong place" for a non-admin.
- MINOR - A3 `/settings` has no tabs (single page: Appearance, Text size, Account, Team, Session). Nothing failing for a member here apart from A1; Change email is a member-usable control (not exercised).
- NIT - A4 sidebar links expose no accessible names in the interactive tree (icon+label links report as unnamed `link` for /checkin, /dashboard, /analytics, /settings); only visible text rescues sighted users.
- NIT - A5 two real clicks by ref (sidebar Settings, "Manage team") did not navigate in the pane; navigated by URL instead. Probably pane click-coordinate scaling (page 1024x768, frame 800x600), not necessarily an app fault; unverified.
- Dashboard note (not member-specific): "Needs attention" row "Sends failing - UX03B pub member / 1 message failed - attendees may have no pass / retry from Details" is shown to a member; row says retry is from Details (not exercised).

Screenshot: one taken inline only (not saved). Coverage gaps (A): Change email not exercised; clicks did not land so Settings tab/Team reached by URL.

## B. Create draft + publish (steps 2-4) - PARTIAL, not completed (tool budget)

Reached `/events/new` only; typed title "ZZ-WALK Member Draft"; venue, date, Save draft, agenda, Publish NOT done. No draft row created; nothing to verify by psql.

Four questions (B, `/events/new`): where-am-I PASS ("Create event", "Back to Events", breadcrumb "Events"), main-thing PASS (numbered sections 1-7, Save draft / Publish event at bottom), how-to-progress PASS ("A name, date, times and venue are enough to save a draft"), how-to-get-back PASS (Cancel, Back to Events).

- PASS (member-aware copy) - section 7 "CPD accreditation (optional)": "Your role can't set accreditation. You can still create the event without it and ask an organiser admin to add it later." Honest, tells member what to do next.
- MINOR - B1 Publish helper copy "Details cannot be edited after publishing yet, so check them first." sits under a member-visible Publish button; with a member who is not the creator this is a one-way door (publish locks details). Copy is clear but not tested against a confirm dialog (not reached).
- MINOR - B2 timezone line: "Times are in your local timezone. The event page will display them in the venue's local time." The date/time pickers are not labelled with the zone in use before a venue is chosen; a first-time organiser cannot tell which zone "Select time" means until the venue is picked (venue is in a later field than times? order is date/time first, venue picker above it - not confirmed because venue not exercised).
- Not verified (budget): venue picker latency, draft confirm message, agenda 2 blocks, Publish confirm dialog and "Keep editing", status transitions.

## C. Fixture event 960f8842 - Registrations and Check-in desk - PARTIAL

Four questions (C): where-am-I PASS (event name, "Registrations"/"Check-in" headings, "Back to Event"), main-thing PASS, how-to-progress PASS ("To check people in, open Check-in." with arrow link; check-in page: "To edit a person's details, open Registrations." with arrow link), how-to-get-back PASS.

- PASS - Registrations `/events/960f8842.../registrations` renders 3 people with status chips (Registered / Attended) and timestamps. Filters All(3)/Registered(1)/Attended(2)/Cancelled(0). Chips here are status labels, NOT role chips; no chair/presenter role control exists on this page, so the "role chip click" test is N/A on Registrations.
- PASS - Edit dialog opens for the member ("Edit registration. Correct a mistyped name or email. Each change is recorded with who made it and which fields changed." "Their check-in code stays the same, so a pass already emailed to them keeps working."). Not saved (left open, navigated away without changes; no write). A member can use it: no admin-only refusal seen at open (save path not exercised).
- MINOR - C1 Check-in desk shows live status: "Started 32m ago", "2 / 3 checked in", "Check-in is open." with buttons Scan badge / Enter code / + Walk-in. Clear. The page title row says "ZZ-WALK Draft 1" for a live event (fixture name only).
- OBSERVATION - C2 "SPEAKERS 1/6" strip lists Speaker A (checked in 09:18), "ZZ fill 2", "ZZ fill 6", Speaker B etc., each with "Check in". Whether a member can use these was not exercised (budget). Role chips live here, not on Registrations; exercising them for ZZ Walk Guest 2 not done.
- MINOR - C3 desk table shows Guest 1b / Walkin 1 method "Manual" for rows checked in via fixtures; no issue for the member.

Not done (budget cap): Enter code ZZWK22 check-in, success copy, registration_checkins row psql, walk-window.sh after / inside, disabled-controls-after-window check, role-chip click message. Fixture window left unchanged (inside); Guest 2 still not checked in.

Coverage gaps (whole walk): B steps 2-4 mostly unexecuted; C check-in action and after-window state unexecuted; two ref clicks (sidebar Settings, Manage team) did not navigate, navigation by URL substituted; role chip test N/A on Registrations; no psql run.

---
# ORCHESTRATOR WALK, ux-member and ux-body (partial)
Tags: [X] executed with real clicks/typing, DB read-back. Not run is listed.

## ux-member
- Sign-in -> Events; same sidebar as admin; /settings holds Appearance / Text size / Account / Team / Session. [X]
- Check-in desk inside window: Enter code ZZWK22 -> dialog "Checked in · ZZ Walk Guest 2 is checked in." + toast "Marked ZZ Walk Guest 2 attended (ZZ-WALK Draft 1)." A member can check in. [X]
- Registrations: Edit dialog opens for a member; no live role chips (read as text). [X per lens run]
- NOT RUN: steps 2-4 as a member (create draft through the venue picker, agenda, publish). The pane rendered the long form with a blank band after scrolling and the lens could not reach Save; recorded as a coverage gap, not a pass. Member publish rights are covered by the dev-lens/backtest at RPC level.
- MAJOR (from lens, member-aware copy gap): /settings shows a member a Team card ("Manage your organisation's members and invite new teammates") with a "Manage team" link; /settings/team then shows only the member's own row, with no invite control and no explanation of who can invite. Dead end for a member.
- MINOR: sidebar label "ADMIN" sits above Settings, the one item a member uses.

## ux-body (body_admin)
- Sign-in -> Events. Events home shows "New event" and Edit links for every event, including ones the body_admin did not create. [X]
- Step 4 [X]: on a draft's Edit page the Publish block reads "Publishing needs an organiser admin / Your role can't publish events. / Save your changes, then ask an organiser admin to publish." and the CPD block reads "Your role can't set accreditation. An organiser admin can add or change it from this page." The reason is shown instead of a Publish button: PASS (O4 for body).
- Step 2 as body not walked.
