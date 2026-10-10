# Feature Specification: Event workspace

**Feature Branch**: `002-event-workspace` (no git branch is created: Hard Rule 6, single `main`)

**Created**: 2026-10-02

**Status**: Draft (revised 2026-10-02 after an independent review of all three specs)

**Block and surface** (Constitution II): surface S-Organiser (unfrozen 2026-08-01); owning block B1 Events & Attendance (events, registrations, check-ins); consumes K1 Identity & Access (roles, tenancy) and K2 Integrity Substrate (the audit chain) without changing them; B3 Credit Engine reads check-ins and is untouched. New work is a database function and its grants (the audited registrant edit, P6) and a window rule on the existing check-in function (P3), each with its admission answers written in the plan.

**Input**: User description: "Organisers cannot find their way around an event: two overlapping home pages, an Edit link that lands on a read-only page, three differently named links to one route, a preview button that cannot preview, a publish step with no confirmation that crashes the page when it fails, a roster that mixes records with check-in, no way to correct a registrant's details, and a check-in desk that accepts people five days early." Scope from the core-UX instruction (failures B, C, D, E, G), Ivan's decisions D8 (audited registrant edit), D9 (two portals), D10 (strict check-in window) and the approved plan, work packages P2a, P2b, P3, P6, P7a, P7b and P8. Evidence: `docs/plans/handoff_20261001-core-ux.md` §2 (findings B1 to B5, C1, C2, D1, E1 to E4, G1, G2).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One home that lists my events and takes me where I am going (Priority: P1)

An organiser signs in and lands on a single home that lists their organisation's events with their state (draft, upcoming, live, completed), lets them search, sort and act on several at once, and opens any event's workspace with one action. Today there are two overlapping homes: Programme is look-only (a row opens a small card with no links, and drafts are hidden) and Manage holds every action; the commit that split them removed the row links.

**Why this priority**: it is the front door of the organiser portal (decision D9) and the thing every other story hangs from. It is also the most visible symptom of the "two pages, one job" problem the instruction called failure C.

**Independent Test**: sign in as an organiser with a draft, a published and a completed event; the home lists all three with their state, a click on any row opens that event's workspace, and no second "manage" page exists.

**Acceptance Scenarios**:

1. **Given** an organiser with events in several states, **When** they open the home, **Then** every event of their organisation is listed with a state chip, drafts included, and the home's title names the page rather than the organisation.
2. **Given** the home, **When** the organiser clicks an event row, **Then** they arrive in that event's workspace (its overview), not in a dead-end card.
3. **Given** the home, **When** the organiser filters by state, searches, sorts, or selects several events, **Then** the actions the old Manage page offered (export, cancel, delete, restore) are available here, with a confirmation before anything destructive.
4. **Given** anyone who opens the old Manage address, **When** it loads, **Then** they are taken to the home, and the navigation no longer lists a separate "Manage".
5. **Given** a window 375 px wide, **When** the home is shown, **Then** no row action is clipped and no page-level horizontal scroll appears.

---

### User Story 2 - Review before I publish, and be told the truth when it fails (Priority: P1)

An organiser who has saved a draft can look at it exactly as the public will see it, then publish deliberately with a confirmation, and land on a "what now" screen. If they are not allowed to publish, they are told so before they try, and if publishing fails they see why, with their work intact. Today the draft cannot be previewed (the public address bounces staff back into the edit form), publishing has no confirmation, and a failure shows the full-screen crash page with a reference number.

**Why this priority**: publishing is the moment an event becomes public and registrations start; the instruction named the missing preview-then-confirm as failure D, and the crash page is the worst possible answer to an authorisation question.

**Independent Test**: as an organiser, save a draft, open its preview (clearly marked as not published, no registration form), publish through the confirmation, and see the next steps; as a read-only role, confirm the publish control explains why it is unavailable.

**Acceptance Scenarios**:

1. **Given** a saved draft, **When** a member of the owning organisation opens its public address, **Then** they see the page as the public would, with a visible "Preview, not published" banner, without a registration form, and the page is not indexable.
2. **Given** a draft, **When** the organiser chooses "Review and publish", **Then** a confirmation shows what will go public and what registration will do (open now, or open on its scheduled date) and requires an explicit confirm.
3. **Given** a confirmed publish that succeeds, **When** it completes, **Then** the organiser lands on the event's workspace in a "Published, next steps" state offering sharing or the poster, registrations, and when check-in opens, and the page says in words that the event is now public.
4. **Given** a role that may not publish (a body administrator or an auditor), **When** they view a draft, **Then** the publish control is replaced by a plain explanation of why, before any attempt.
5. **Given** a publish that fails for any reason, **When** the failure is shown, **Then** it stays inside the organiser's shell, says in plain language what happened and what to do, offers a way back to their home, and the draft is unchanged.
6. **Given** an organiser who has just created and saved a new event, **When** their role may publish and they review and confirm, **Then** it succeeds (it does not fail with "this account is not allowed" in any real role).

---

### User Story 3 - One workspace per event, with one name for each place (Priority: P1)

Inside an event, the organiser always sees the same bar of places: Overview, Registrations, Check-in, Edit, Analytics. Each place has one name and one address, and the current place is marked. Today the same check-in desk is reached through three differently named links ("Roster", "Open roster", "Open check-in"), there is no page for the people registered, and an organiser cannot tell which place they are in.

**Why this priority**: it is the structure the other stories sit in, and the fix to failure E's naming problem.

**Independent Test**: open any event as an organiser; the bar shows the five places on every event page; each leads to a page whose title matches its label; no other link in the product uses a different name for the same place.

**Acceptance Scenarios**:

1. **Given** any event page in the organiser's shell, **When** it loads, **Then** the five-place bar is shown with the current place marked.
2. **Given** the bar, **When** the organiser opens Registrations and Check-in, **Then** they are two different pages (people and their records versus capturing arrivals).
3. **Given** every link into the check-in desk anywhere in the product, **When** its label is read, **Then** it says "Check-in", and every link to the registrations page says "Registrations".
4. **Given** an organiser of another organisation, **When** they request this event's workspace, **Then** they get no action on it (the existing owner gate stays). What a non-owner may still see of a published event is governed by the separate cross-organisation reads task and is not changed here.

---

### User Story 4 - See everyone who registered and correct their details, with a trail (Priority: P1)

An organiser opens Registrations and sees each registrant with their record (name, email, role, status, registration time, whether attended), can filter and search them, assign roles, and correct a registrant's name or email when it was mistyped. Every correction leaves an audit entry naming who changed which fields and when, never the values. Today there is no records page, role chips sit on the check-in desk among scan controls, and nothing can edit a registrant: a typo in an email is permanent.

**Why this priority**: it is the missing half of the roster (failure E) and the thing organisers need most after an event opens; decision D8 made the audited edit a requirement.

**Independent Test**: register a guest with a mistyped email, correct it on the Registrations page, and confirm the row shows the new value and an audit entry names the editor, the time and the field names only.

**Acceptance Scenarios**:

1. **Given** an event with registrations, **When** the organiser opens Registrations, **Then** every registrant of that event is listed with name, email, role, status, registered time and attended state, and the page offers no check-in actions.
2. **Given** a registrant who is a guest (no account), **When** the organiser changes their name or email, **Then** the change is saved and one audit entry records the actor, the time and the names of the fields changed.
3. **Given** a registrant whose registration is linked to an account, **When** the organiser tries to change the email, **Then** it is refused with a plain reason (the account owns that email), while a name change is allowed.
4. **Given** a new email that already holds a registration for this event, **When** the organiser saves, **Then** it is refused with "that email is already registered for this event" and nothing changes.
5. **Given** a read-only role, **When** they open Registrations, **Then** they can see the list and cannot edit.
6. **Given** a registrant's check-in code, **When** their email is corrected, **Then** the code is unchanged, and the page says so (an emailed pass already in the registrant's inbox keeps working).

---

### User Story 5 - Check-in only captures arrivals, and only when arrivals are possible (Priority: P1)

At the door, the organiser's check-in page does one job: record that a registered person arrived (scan a pass, enter a code, or add a walk-in). It enforces the check-in window: arrivals are accepted from 60 minutes before an event or day starts until it ends, and refused with a clear reason outside it. The page updates from the result of each action without waiting for anything else, and is usable on a phone at the door. Today a check-in is accepted five days early (writing permanent attendance evidence) and after an event has ended (the call answers "ok"), the page says "not open yet" while every control stays active, and a checked-in row was seen not to update until a reload (the cause is still being isolated).

**Why this priority**: accepting arrivals outside the window writes immutable attendance evidence that later feeds credit; the instruction named it failure E and decision D10 reversed the old "trusted actor" design.

**Independent Test**: try to check someone in before the window opens, inside it, and after it closes; only the middle one succeeds, each refusal says why, and the successful one updates the page at once.

**Acceptance Scenarios**:

1. **Given** an event whose check-in window has not opened, **When** an organiser tries to check someone in (scan, code or walk-in), **Then** it is refused with "check-in opens at [time]" and nothing is recorded; the page shows the same state and its controls are disabled.
2. **Given** an event inside its window, **When** an organiser checks in a registrant, **Then** the registrant's row and the arrivals counter update from the result of that action, without a reload and without waiting for any other update.
3. **Given** an event that has ended, **When** an organiser tries to check someone in, **Then** it is refused with "check-in is closed"; corrections after the event are not possible from the organiser's pages.
4. **Given** a multi-day event, **When** a Day 2 arrival is scanned from 60 minutes before Day 2 starts until Day 2 ends, **Then** it is accepted against Day 2; a scan outside every day's window is refused.
5. **Given** a 375 px wide screen at the door, **When** the page loads, **Then** the scan control and the code entry are visible without scrolling and the walk-in control is at least 44 px.
6. **Given** a window that opens or closes while the page stays open, **When** the time passes, **Then** the page's controls follow the clock without a reload.

---

### User Story 6 - Leave the app, and read the room correctly (Priority: P2)

An organiser can sign out from the shell wherever they are, and the labels on the home and tabs describe what they do. Today sign-out exists only inside Settings, the account block in the sidebar does nothing when clicked, one action is clipped at narrow widths, and the Manage subtitle still promises "archive" (the action is called Delete).

**Why this priority**: small, independent, and each one is a "which site am I on" cue; it ships after the P1 stories.

**Independent Test**: from any organiser page, sign out in two actions or fewer; resize to 375 px and confirm no clipped action; read each page subtitle against what the page does.

**Acceptance Scenarios**:

1. **Given** any organiser page, **When** the organiser opens their account block in the shell, **Then** a visible sign-out is offered and works.
2. **Given** a window 375 px wide, **When** any home or workspace page is shown, **Then** no action is clipped.
3. **Given** every page subtitle in the workspace, **When** it is read, **Then** it describes only things the page does today.

---

### Edge Cases

- A draft is opened by a member of a different organisation: refused as in Story 3, never previewed.
- An event is cancelled or deleted while an organiser has its workspace open: the next action explains the state and returns them to the home.
- A registrant's email is corrected while an emailed pass is already in their inbox: the pass keeps working (the code is not rotated), and the page says so. This is a recorded risk, not a feature: a pass emailed to a mistyped address stays valid for whoever owns that inbox (see Assumptions).
- A registrant is checked in, then their name is corrected: the attendance record is unchanged and the audit trail shows the correction.
- An event with a single day but long hours: the window is the event's own start minus 60 minutes to its end.
- A body administrator or auditor opens an event: they can view the workspace and the server refuses their writes (publish, registrant edit, check-in). The publish control says why it is unavailable (decided in the plan); hiding or explaining the other controls for read-only roles is new scope beyond the plan and is left to the design pass.
- The check-in desk is open on a phone that loses connectivity: the failed action says it could not confirm the arrival was recorded and tells the organiser to check the arrivals list before trying again; the page does not show the person as arrived.
- The organiser's device clock differs from the server's: the server's decision wins; a page that is a few seconds off shows the refusal and records nothing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The organiser portal MUST have exactly one home that lists the organisation's events in every state, including drafts, each with a state chip; the page title MUST name the page, not the organisation.
- **FR-002**: Opening an event from the home MUST arrive in that event's workspace (its overview), never in a card without links.
- **FR-003**: The home MUST offer the actions the old Manage page offered (state filters including draft, cancelled and deleted, search, sort, select several, export, cancel, delete, restore) with an explicit confirmation before any destructive action; the old Manage address MUST redirect to the home and the navigation MUST drop "Manage".
- **FR-004**: A member of the owning organisation MUST be able to open a draft's public address and see a preview marked "Preview, not published", without a registration form, not indexable; nobody outside the organisation MUST be able to see it.
- **FR-005**: Publishing, from any place that offers it, MUST require an explicit confirmation that states what becomes public and what starts, and on success MUST land the organiser on the event's workspace in a "Published, next steps" state (share or poster, registrations, when check-in opens).
- **FR-006**: A role that may not publish MUST see the publish control replaced by a stated reason before any attempt; a role that may publish MUST be able to publish a draft it has just saved without error.
- **FR-007**: A failed publish, save or other organiser action MUST be shown inside the organiser's shell in plain language with a route back to the home and the user's work intact; the public crash page MUST NOT be shown to an organiser for an authorisation or validation failure.
- **FR-008**: Every event page in the organiser's shell MUST show one bar of five places (Overview, Registrations, Check-in, Edit, Analytics), mark the current one, and give each place one address and one name used consistently by every link to it.
- **FR-009**: Registrations MUST be a page of its own listing every registrant of the event with name, email, role, status, registration time and attended state, with search and filters, and offering no check-in actions.
- **FR-010**: An organiser of the owning organisation (and platform staff) MUST be able to change a guest registrant's name or email; every such change MUST write one audit entry naming the actor, the time and the changed field names, and MUST NOT record the values. No other path MUST be able to change a registrant's name or email: a direct write outside this audited one MUST be refused.
- **FR-011**: For a registration linked to an account, an email change MUST be refused with a plain reason and a name change MUST be allowed; an email already registered for the same event MUST be refused with a plain reason; a registrant's check-in code MUST NOT change when their details are corrected.
- **FR-012**: Role assignment for registrants (presenter and chair) MUST live on the Registrations page, not on the check-in page, and MUST be limited to the owning organisation.
- **FR-013**: The check-in page MUST only capture arrivals (scan, code entry, walk-in, a registrant row's own check-in button, and speaker check-in); it MUST NOT edit registrant details or roles.
- **FR-014**: A check-in, by any method, MUST be accepted only from 60 minutes before the event (or the day, for a multi-day event) starts until it ends, MUST be refused outside that window with a reason that states when it opens or that it has closed, and MUST record nothing when refused; the refusal MUST come from the server, not only from the page.
- **FR-015**: After a successful check-in the page MUST update that registrant's row and the arrivals counter from the result of the action, without a reload and without waiting for any other update; the page's controls MUST follow the clock as the window opens or closes.
- **FR-016**: On a 375 px wide screen the check-in page MUST show the scan control and code entry without scrolling, and the walk-in control MUST be at least 44 px.
- **FR-017**: Corrections to attendance after an event has ended MUST NOT be possible from any organiser page; they remain a platform-staff operation outside the product pages.
- **FR-018**: A signed-in organiser MUST be able to sign out from the shell on every organiser page in at most two actions.
- **FR-019**: No action on the home or workspace pages MUST be clipped at 375 px; no page subtitle MUST describe something the page does not do.
- **FR-020**: Every organiser page this feature adds or changes MUST have a descriptive page title, at most one primary action per card, no eyebrow label that repeats the heading beneath it, equal-height card rows on desktop, touch targets of at least 44 px, text contrast of at least 4.5:1, no horizontal page scroll from 320 px up, and MUST work in the light and dark themes. Every successful action MUST give a visible confirmation that is also announced to assistive technology, driven by the result and not by a timer, with a way to undo where the action is reversible (decisions D15 and D16).
- **FR-021**: Copy this feature writes or changes MUST contain no em-dashes (decision D14) and MUST use the spelling "organiser"; new form fields in these pages MUST be 44 px high with a visibly stronger border than today's fields, at least 3:1 against their ground (Ivan's decision of 2026-10-01).
- **FR-022**: Every organiser-facing write in this feature MUST be limited to the organiser's own organisation (multi-tenancy, Q20; platform staff excepted), and every refusal MUST say whether the cause is permission, state or input, except a refusal that would reveal whether another organisation's event exists, which says only that it was not found.

### Key Entities

- **Event**: an organiser's event with a state (draft, published and upcoming, live, completed, cancelled or deleted), one or more days, and an owning organisation.
- **Registration**: a person registered for an event, either a guest (email only) or linked to an account, with a role, a status, a check-in code and an attended state.
- **Day (occurrence)**: one calendar day of an event with its own start, end and check-in window.
- **Check-in record**: the immutable evidence that a registrant arrived on a day; later feeds credit decisions.
- **Audit entry**: who did what to which record, when, naming fields changed but never their values.
- **Role**: organiser administrator, organiser member, platform staff (may act); body administrator, auditor (read only).
- **Organisation**: the tenant that owns events and whose members may act on them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the home, an organiser reaches any of an event's five places in one action, and from any of them returns to the home in one action.
- **SC-002**: 0 check-ins are accepted outside the window across the acceptance walk's refusal cases (before opening, after close, wrong day), each refused attempt records nothing, and each refusal states its reason.
- **SC-003**: Publishing, from the create flow and from a saved draft, succeeds for every role that may publish and is explained before the attempt for every role that may not; 0 organisers see the public crash page for a permission or validation failure.
- **SC-004**: Every change to a registrant's details leaves exactly one audit entry with the actor, time and field names and no values, verified by reading the entry back in the walk; a direct write to the registration's name or email by any role is refused, verified by attempting it.
- **SC-005**: After a successful check-in the page shows the arrival without a reload in every attempt of the walk, including when no background updates arrive.
- **SC-006**: On a 375 by 812 screen the scan control and code entry are visible without scrolling, and the walk-in control measures at least 44 px.
- **SC-007**: A reviewer who has never seen the product can answer "where am I", "what can I do here", "what just happened" and "what do I do next" on every page this feature adds or changes, at desktop width and at 375 px.
- **SC-008**: Every page this feature adds or changes is fully operable with the keyboard alone, has no text below 4.5:1 contrast, no touch target below 44 px, and no horizontal page scroll at 320 px.

## Assumptions

- The two portals decision (D9) holds: this is the organiser portal; nothing here changes the attendee portal (specification 001) or event authoring (specification 003).
- Any active organiser administrator or organiser member of the owning organisation, and platform staff, may edit a registrant's details and assign roles; body administrators and auditors are read only. **To confirm with Ivan at the checkpoint if a narrower set (administrators only) is wanted.**
- The check-in window rule is decision D10, which reverses the earlier documented "trusted, physically present actor" design for staff check-in; the platform-staff-only correction path after the event is by design and outside the product pages.
- A registrant's check-in code is not rotated when their email is corrected (an emailed pass in their inbox keeps working); a re-sent pass is out of scope. **Flagged risk for Ivan:** a pass emailed about an hour before the start to a mistyped address stays valid for whoever owns that inbox. Rotating the code and re-sending is the fix and is deliberately not in this version.
- Two organisers editing the same registrant at once is last-save-wins in this version (the database still serialises writes and enforces every rule); detecting a stale form is out of scope unless Ivan asks for it.
- Dependencies: the organiser door and shell (Band 1, `89910b0`), the existing event, registration, occurrence and audit data, and the publish permission rules already in the database. The strict check-in window and the audited registrant edit are enforced by the database (packages P3 and P6 in the plan), not only by the pages.
- Per-day check-in windows depend on multi-day events being created with one occurrence per day, and on how a day's own start and end are defined, which is an open question in specification 003; until then a single-day event's window is its own start minus 60 minutes to its own end.
- The home keeps what Programme already has (its stat row, needs-attention list and calendar) and gains Manage's tabs, sorting, bulk and row actions in Programme's look (plan P7b); which of those survive the design pass is not decided here.
- Deferred findings carried with this feature and not specified here: F11 (the Team page shows a member only themselves, with no explanation, deferred to P7b).
- Visual direction is decision D12 (Direction C) as rendered in the D0 specimens (artifact v6) on the light-theme ground of decision D13 (package G1, `docs/plans/2026-10-02-g1-ground-tokens.md`).
- Out of scope: creating and editing an event's content, agenda and dates (specification 003), the "event updated" email, the attendee portal, cross-organisation pickers and analytics redesign (a separate task is open for those reads), Open Capture Mode, and any payment or ticketing change.
