# Feature Specification: Event authoring

**Feature Branch**: `003-event-authoring` (no git branch is created: Hard Rule 6, single `main`)

**Created**: 2026-10-02

**Status**: Draft (revised 2026-10-02 after an independent review of all three specs)

**Block and surface** (Constitution II): surface S-Organiser; owning block B1 Events & Attendance (events, occurrences, agenda sessions); B5 Communications sends the "event updated" email (it records in `email_log` first, as every send does); consumes K1 (roles, tenancy) and K2 (the audit chain) without changing them. New work is database functions and migrations (packages P4, P5, P9a in the plan), each with its admission answers written there; no kernel change.

**Input**: User description: "Creating and editing an event is one long page with seven sections, a progress strip that shows a tick on sections nobody touched, a single date with no end, an agenda that cannot show a day, and a published event whose details cannot be edited from its edit page. Make authoring clear, multi-day, and safe." Scope from the core-UX instruction (failures F and G), Ivan's decisions D7 (agenda modal on existing data, multi-day through per-day occurrences) and D11 (published events stay editable, with notification), the architecture decision ADR-0002 (per-day occurrences with stable identity) and the approved plan, work packages P4, P5, P9a, P9b and P10. Evidence: `docs/plans/handoff_20261001-core-ux.md` §2 (findings B1, B1b, B2, F1, F2).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create an event in clear steps and know what happens next (Priority: P1)

An organiser creates an event from a form that shows what is needed first (title, dates, venue, capacity), keeps everything else optional and out of the way, tells the truth about what is filled in, and ends with one obvious next step. Today the form shows seven sections at once, a progress strip that lists six of them and marks untouched optional sections with a tick, a single date with no end date, and, after "Save draft", three equally blue buttons.

**Why this priority**: it is the entry to everything an organiser does and the first thing a new organiser meets; the instruction's failure G ("root usability") is mostly this page.

**Independent Test**: create a draft with only the essentials; the form never asks for the optional sections up front, the status of each section is true, and after saving there is one clearly primary next step and a link to the saved event.

**Acceptance Scenarios**:

1. **Given** a new event form, **When** it opens, **Then** only the essential fields are expanded (title, start and end date and time, venue, capacity), and every other section is collapsed with an accurate status ("empty", "in progress", "complete").
2. **Given** an optional section that has not been touched, **When** the form shows its progress, **Then** it carries no "complete" mark.
3. **Given** a filled form, **When** the organiser saves it as a draft, **Then** a confirmation says the draft is saved, offers one primary next step ("Review and publish") and a link to the saved event, and never shows two competing primary actions after the save.
4. **Given** an event that runs over several days, **When** the organiser enters the first and last day, **Then** the form accepts a date range and each day appears in the agenda step.
5. **Given** a role that may not publish, **When** they save a draft, **Then** the next step explains that publishing needs a different role instead of offering "Review and publish" (specification 002 defines the explanation; the create form already says so before the save).

---

### User Story 2 - Build the agenda session by session and see it as a day (Priority: P1)

An organiser adds, edits, orders and removes agenda sessions one at a time in a focused editor, and sees the agenda laid out as a day timeline with a switcher between days. A session has a title, a type, a day and time, a length, a description, a chair, topics and speakers, and whether it is sponsored. Today the agenda is a long inline list on a single-day form, with no timeline and no way to see where the gaps are.

**Why this priority**: the agenda is the core of a CPD event (credit depends on it) and the instruction named a modal with a timeline as failure F.

**Independent Test**: build a six-session agenda over two days; the timeline shows each day separately, each session sits where its time says, a break is visible as a break, and opening a session shows all of its details.

**Acceptance Scenarios**:

1. **Given** an event with several days, **When** the organiser opens the agenda, **Then** a day switcher shows each day and the timeline for the chosen day lists its sessions in time order with gaps visible.
2. **Given** the agenda, **When** the organiser adds or opens a session, **Then** a focused editor shows the session's title, type, day, start time, length, description, chair, topics, speakers and sponsored flag, and saving returns them to the timeline with the session in place.
3. **Given** a session whose time falls outside its day's start and end, **When** the organiser saves it, **Then** it is refused with a message naming the day's window, and the minutes-only comparison that ignores the date no longer applies.
4. **Given** an agenda, **When** the organiser reorders, edits or removes a session, **Then** only that session changes.
5. **Given** a keyboard-only organiser, **When** they add and edit a session, **Then** focus enters the editor, stays inside it, returns to where it came from on close, and the day switcher is operable by arrow keys.

---

### User Story 3 - Multi-day events behave as multi-day everywhere (Priority: P1)

An event of several days is one event with one set of days. Check-in windows exist per day, the public page and the poster group the agenda by day, and an organiser is told when a day is not covered by the event's accreditation. Today the form is single-day and a three-day event created by other means ends up with a single day record, so per-day check-in and credit cannot work.

**Why this priority**: credit and attendance are per day; a multi-day event without per-day days cannot be checked into correctly (specification 002's check-in window depends on it).

**Independent Test**: create a three-day event; it has three days, the public page and poster show the agenda grouped by day, a day that the accreditation does not cover is flagged, and changing the dates of a day that already has attendance, or is covered by an accreditation, is refused.

**Acceptance Scenarios**:

1. **Given** an event over three calendar days, **When** it is saved, **Then** it has exactly three days with stable identities, each with its own start and end.
2. **Given** the public event page and the poster, **When** an event has several days, **Then** the agenda is grouped by day with a heading per day.
3. **Given** an accreditation that covers only some days, **When** the organiser views the event, **Then** each uncovered day carries a notice such as "Day 2 isn't covered by accreditation".
4. **Given** a published event whose organiser moves it by whole days, **When** they save, **Then** each day that maps to exactly one new day moves in place (its identity kept) and nothing attached to it is lost.
5. **Given** a day that already has attendance recorded, or is covered by an accreditation, **When** the organiser tries to remove or move it, **Then** it is refused with the reason, naming the day.

---

### User Story 4 - Edit a published event safely (Priority: P1)

Once an event is published, the organiser can still improve it: content (title, description, agenda, speakers) until the event is completed; logistics (dates, times, venue) until check-in opens; and capacity, never below the number already registered. Fields that are locked say so and say why. Today a published event opens a read-only page that says editing event details "isn't available yet" and sends the organiser to ask an admin.

**Why this priority**: events are corrected after they are published, constantly; a dead end here pushes organisers to workarounds that damage data.

**Independent Test**: publish an event with registrations, change its description (allowed), try to change its date after check-in has opened (refused with a reason), and try to set capacity below the registered count (refused).

**Acceptance Scenarios**:

1. **Given** a published event that is not yet completed, **When** the organiser opens Edit, **Then** the same form as creation opens with their saved content, and content fields are editable.
2. **Given** an event whose check-in window has opened, **When** the organiser opens Edit, **Then** date, time and venue fields are locked, each showing a lock and the reason, while content stays editable.
3. **Given** an event with 40 registrations, **When** the organiser sets capacity to 30, **Then** it is refused naming the current number of registrations.
4. **Given** a completed or cancelled event, **When** the organiser opens Edit, **Then** a read-only view is shown that says what the event's state allows, without sending them to "ask an admin".
5. **Given** a read-only role, **When** they open Edit, **Then** they see the content and no way to change it.

---

### User Story 5 - Registrants are told when the logistics change (Priority: P2)

When an organiser changes the date, time or venue of a published event that already has registrants, they are asked to confirm ("N registrants will be emailed the new details") and each registrant is emailed once about that change. Saving the same change twice does not email anyone twice, and an event with no registrants sends nothing.

**Why this priority**: it is the courtesy that makes story 4's logistics edits acceptable to attendees; it depends on story 4.

**Independent Test**: change a published event's venue with three registrants; the organiser sees the confirmation with the count, three emails are logged and sent once, and saving the same venue again sends none.

**Acceptance Scenarios**:

1. **Given** a published event with registrants, **When** the organiser changes date, time or venue and saves, **Then** a confirmation states how many registrants will be emailed and requires an explicit confirm before saving.
2. **Given** a confirmed change, **When** it is saved, **Then** each registrant receives one "event updated" email stating the new details, and each send is recorded.
3. **Given** the same logistics saved again without a further change, **When** it is saved, **Then** no further email is sent; a later change back to an earlier value counts as a new change and is emailed.
4. **Given** a change to content only (description, agenda), **When** it is saved, **Then** no email is sent.
5. **Given** no email provider is configured (as in development), **When** a change is confirmed, **Then** each send is recorded as queued, never as delivered.

---

### User Story 6 - Editing the agenda never silently destroys anything (Priority: P1)

Saving an agenda keeps each session's identity, so what depends on a session (survey answers) keeps pointing at it. Removing a session that has survey answers is refused with that session's title. Saving twice in a row never duplicates sessions. Today every save regenerates every session, so survey answers that point at a session would be cleared.

**Why this priority**: it prevents silent data loss, and it is a prerequisite of stories 2 and 4: editing a published event's agenda is unsafe until a save keeps each session's identity (the plan orders it first for that reason).

**Independent Test**: save an unchanged agenda twice and confirm session identities are unchanged; remove a session that has survey answers and confirm the refusal names it.

**Acceptance Scenarios**:

1. **Given** a saved agenda, **When** it is saved again with no changes, **Then** every session keeps its identity and nothing attached to it changes.
2. **Given** a session with survey answers, **When** the organiser removes it, **Then** the removal is refused, naming the session, and no answers are lost.
3. **Given** a new session added during an edit, **When** the agenda is saved twice in a row, **Then** it exists exactly once.

---

### Edge Cases

- Reducing an event from three days to two when the removed day has attendance or credit: refused, naming the day.
- A session that runs past midnight or across days: not allowed; sessions belong to one day.
- Overlapping sessions: flagged as parallel in the timeline, as the current form already flags them, and never silently merged; scheduling parallel tracks as a concept is out of scope (multi-track).
- A day moved to a different calendar date: the day keeps its identity, and so its attendance and accreditation links. Sessions carry absolute times and no link to a day today, so whether the form shifts them with the day or flags them for the organiser is an open design point (see Assumptions).
- An event in a time zone different from the organiser's: every time is shown in the event's own time zone, labelled. How times are entered is a flagged conflict, see Assumptions.
- An event that crosses midnight but lasts under 24 hours (for example 22:00 to 03:00): one day, not two. This constrains how days are generated (package P5) and needs deciding in its design; ADR-0002 says only "one occurrence per calendar day".
- A custom day arrangement made by other means (a day that is not a simple calendar day): refused with a clear reason rather than rewritten.
- The organiser edits while registrations are open: the confirmation states the number of registrants when it is shown and is refreshed before saving, so the count the organiser confirmed is the count that is emailed; the people notified are those with an active (not cancelled) registration at the moment of saving.
- A very long agenda: the timeline scrolls inside its own area, not the page.
- Dark theme: every authoring surface works unchanged in the dark theme.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The create and edit form MUST present the essential fields first and keep every other section collapsed until opened, each showing a TRUE status; an untouched optional section MUST NOT show as complete, and a "complete" mark MUST NOT use the primary action blue (UI contract rule 8). The proposed essential set (title, start and end date and time, venue, capacity) and the status wording ("empty", "in progress", "complete") are the authoring design pass's to confirm.
- **FR-002**: The form MUST accept a start and an end date and time, including events over several days.
- **FR-003**: Saving a draft MUST confirm that it saved, offer one primary next step ("Review and publish", specification 002) and a link to the saved event; the form MUST NOT show two competing primary actions after a save. Whether the create form's own Publish action also goes through the same review-and-confirm step is a flagged proposal (see Assumptions), not a requirement of this version.
- **FR-004**: The agenda MUST be edited through a focused editor per session, with title, type, day, start time, length, description, chair, topics, speakers and a sponsored flag; leaving the editor MUST return focus to where it was opened from.
- **FR-005**: The agenda MUST be shown as a timeline per day with a day switcher, showing sessions in time order, gaps and breaks.
- **FR-006**: A session MUST be refused when it falls outside its day's start and end, with a message naming that window; the check MUST compare full date and time, not minutes alone.
- **FR-007**: An event over N calendar days MUST have exactly N days, each with a stable identity and its own check-in window; each day's own start and end are the event's start and end time of day on that calendar day (flagged default, see Assumptions), and an event under 24 hours that crosses midnight is one day.
- **FR-008**: The public event page and the poster MUST group the agenda by day when an event has several days, and MUST show each session's description.
- **FR-009**: An uncovered day of an accredited event MUST carry a visible notice naming the day.
- **FR-010**: Moving an event by whole days MUST update each day in place when it maps to exactly one new day, keeping its identity and everything attached; removing or moving a day that has attendance, or is covered by an accreditation, MUST be refused, naming the day.
- **FR-011**: Saving an agenda MUST keep each session's identity across saves; saving twice with no change MUST change nothing; a new session MUST appear exactly once however many times it is saved.
- **FR-012**: Removing a session that has survey answers MUST be refused, naming the session, with no answers lost.
- **FR-013**: A published event MUST open the same form as creation: content editable until the event is completed; date, time and venue editable until check-in opens; capacity MUST never be set below the current number of registrations. The server MUST refuse an edit to a locked field whatever the page shows (the page is a convenience, the database is the authority).
- **FR-014**: A locked field MUST show a lock and the reason; a completed or cancelled event MUST show a read-only view that states what its state allows and MUST NOT send the organiser to "ask an admin".
- **FR-015**: A change to date, time or venue of a published event with registrants MUST require an explicit confirmation stating how many registrants will be emailed, then MUST email each registrant once about that change; the same change saved again, or a content-only change, MUST send nothing; a change back to an earlier value is a new change and MUST be emailed; every send MUST be recorded.
- **FR-016**: Every time shown MUST be in the event's own time zone, labelled.
- **FR-017**: Read-only roles MUST be able to view an event's content and MUST NOT be offered any way to change it.
- **FR-018**: Every authoring page this feature adds or changes MUST have a descriptive page title, at most one primary action per card, no eyebrow label that repeats the heading beneath it, new form fields 44 px high with a visibly stronger border than today's fields (at least 3:1 against their ground), touch targets of at least 44 px, text contrast of at least 4.5:1, no horizontal page scroll from 320 px up, and MUST work in the light and dark themes. Every successful action MUST give a visible confirmation that is also announced to assistive technology, driven by the result and not by a timer, with a way to undo where the action is reversible (decisions D15 and D16).
- **FR-019**: Copy this feature writes or changes MUST contain no em-dashes (decision D14) and MUST use the spelling "organiser".
- **FR-020**: Every write MUST be limited to the organiser's own organisation (platform staff excepted), and every refusal MUST say whether the cause is permission, state or input, except a refusal that would reveal whether another organisation's event exists, which says only that it was not found.

### Key Entities

- **Event**: the organiser's event, with a state, an owning organisation, one or more days, capacity, venue and an accreditation.
- **Day (occurrence)**: one calendar day of an event, with a stable identity, its own start and end, its own check-in window, and its own attendance and credit.
- **Agenda session**: a timed item on a day, with a stable identity, title, type, time, length, description, chair, topics, speakers and sponsored flag; survey answers point at it.
- **Registrant**: a person registered for the event; the audience of an "event updated" email.
- **Event-updated notice**: one email per registrant per confirmed logistics change (a change back to an earlier value is a new change), recorded; the registrants are those with an active registration at the moment of saving.
- **Accreditation**: the body and points an event is approved for, possibly covering only some days.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the acceptance walk, an organiser creates a two-day event with a six-session agenda and saves it as a draft in under 10 minutes without help, and the form never asks for an optional section up front.
- **SC-002**: Saving an unchanged agenda twice leaves 100% of session identities unchanged, and removing a session with survey answers is refused in 100% of attempts, naming the session.
- **SC-003**: Every multi-day event has exactly one day per calendar day, and a check-in on a later day inside its own window succeeds while a scan outside every day's window is refused (shared with specification 002).
- **SC-004**: Every confirmed logistics change on a published event with registrants produces exactly one email per registrant, including a change back to an earlier value, and saving the same change again produces 0.
- **SC-005**: 100% of locked fields on a published event show a lock and a reason, and 0 authoring pages send an organiser to "ask an admin".
- **SC-006**: Capacity can never be saved below the registered count (0 successes in the refusal cases), and moving or removing a day with attendance, or covered by an accreditation, is refused in 100% of attempts.
- **SC-007**: A reviewer who has never seen the product can answer "where am I", "what can I do here", "what just happened" and "what do I do next" on every page this feature adds or changes, at desktop width and at 375 px.
- **SC-008**: Every page this feature adds or changes is fully operable with the keyboard alone, has no text below 4.5:1 contrast, no touch target below 44 px, and no horizontal page scroll at 320 px.

## Assumptions

- **Flagged proposal for Ivan, defaulting to the approved plan.** The plan (P2a) keeps a "Publish event" action on the create form, hidden with a reason for roles that cannot publish, and its acceptance walk requires that create-and-publish succeeds. This specification therefore does not drop publish-at-once. The proposal is to route that action through the same review-and-confirm step as a saved draft (specification 002), so there is one publish path; the shipped contradiction (finding B1: copy saying "save first" above a filled Publish button) is already fixed by P2a's copy. Until Ivan rules, the plan's behaviour stands and FR-003 requires nothing more.
- This is the organiser portal's authoring half; the home, tabs, registrations and check-in are specification 002, and the attendee portal is specification 001. Publishing a draft is specification 002's "Review and publish".
- The agenda editor uses only the data sessions already carry (decision D7). A published flag per session, a track, a location and tags are deferred, each with a re-entry criterion; **track waits on the multi-track data-model decision** (CLAUDE.md rule 13), because multi-track scheduling is a deliberate model change, not a form field.
- A session's description (stored today as notes) becomes the description shown on the public agenda and the poster; this changes what attendees see and is flagged for Ivan's confirmation at the checkpoint. (Notes are already readable through the public API for a published event, so this widens what the page shows, not what the API exposes; organisers may still believe notes are private.)
- Only logistics changes (date, time, venue) email registrants; content changes are silent (decision D11). The "event updated" email is a new kind of message with its own record, so a second legitimate update is never blocked by the first.
- Per-day days follow ADR-0002 (stable identity, generated per calendar day in the event's time zone); events with day arrangements that are not simple calendar days are refused rather than rewritten.
- **Flagged default for Ivan: how a day's own start and end are defined.** ADR-0002 says only "one occurrence per calendar day" and that occurrences are flat and non-overlapping. The default here is the same time of day on every day (09:00 to 17:00 each day for an event that starts at 09:00 and ends at 17:00 three days later). The alternative treats the event as one span (first day from the start to midnight, whole days between, last day from midnight to the end), which would accept check-ins at 03:00 on a middle day. With the strict window of decision D10 a wrong rule locks people out at the door or lets them in at night, so this should be confirmed before package P5 is built. A day that needs different hours needs a per-day hours control, which is not in the plan.
- **Open conflict, not changed here:** the vault note Timezone Handling says an organiser types a time and means the event's own zone, but the shipped form takes times in the organiser's browser zone and labels it ("Times are in your local timezone"), while the event's zone is derived from the venue. For organisers in the event's zone the two agree; for anyone elsewhere they do not, and a day boundary (package P5) depends on which zone was typed. Decide before P5; FR-016 asks only that times are shown in the event's zone.
- Fields not named as logistics (date, time, venue, time zone) are treated as content, editable until the event completes, except capacity (its own rule) and the accreditation (its existing edit rules); this classification, including the registration window, category, format, hosts and hero image, is a flagged default.
- A date-range control already exists in a development preview; whether it is the one promoted into the form is a design-pass detail.
- The updated-event email's de-duplication must tell a repeat of the same change apart from a change back to an earlier value: a content hash alone cannot (the revert would collide with the first send and be silently dropped). Package P9a needs a revision counter or a last-sent comparison instead; recorded here so the design does not repeat the trap.
- Two organisers editing the same event at once is last-save-wins for content in this version (the database still serialises writes and enforces every rule); detecting a stale form is out of scope unless Ivan asks for it.
- Dependencies: Band 1 (`89910b0`), specification 002's check-in window (which reads these days), and the database packages P4 (stable sessions, lifecycle locks), P5 (per-day days) and P9a (the updated-event email) in the plan. Their order is fixed by the plan: P2a, P5, P3, P4, P6, P9a (P4 must precede the form packages P9b and P10 that share its files).
- Visual direction is decision D12 (Direction C) as rendered in the D0 specimens (artifact v6) on the light-theme ground of decision D13 (package G1, `docs/plans/2026-10-02-g1-ground-tokens.md`).
- Out of scope: multi-track scheduling, recurring events, ticketing or pricing, speaker invitations, the attendee portal, the check-in window rules themselves (specification 002), Open Capture Mode, and any change to how credit is calculated (Q26).
