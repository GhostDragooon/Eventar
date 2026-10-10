# Feature Specification: Attendee portal

**Feature Branch**: `001-attendee-portal` (no git branch is created: Hard Rule 6, single `main`)

**Created**: 2026-10-02

**Status**: Draft (revised 2026-10-02 after an independent review of all three specs)

**Block and surface** (Constitution II): surface S-Public, the existing `/account` practitioner area plus the public pages around it; reads B2 Professional Registry and B1 Events & Attendance through their existing actions; no new table, no kernel change. The post-Stage-13 S-Attendee wallet is a different thing and is not touched.

**Input**: User description: "Attendee portal: give practitioners a portal of their own, separate from the organiser side. Today a practitioner's 'portal' is a bare page inside the public marketing shell which has no navigation of its own beyond an account dropdown; the sign-up page has no inbound links at all; registering as a guest never offers an account afterwards (before registering, the card does nudge a visitor to sign in); and the record's empty state does not point to events." Scope from Ivan's decisions D6 and D9 (2026-10-01) and the approved plan, work packages P1a and P1b: funnels into the portal, a portal shell of its own, and consistent chrome and honest states on the surfaces a practitioner touches. Evidence: `docs/plans/handoff_20261001-core-ux.md` §2 (findings A1 to A6).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A practitioner finds the portal from where they already are (Priority: P1)

A practitioner who has never created an Eventar record arrives at the landing page, browses the public events list, or has just registered for an event as a guest. Each of those places offers a clear way into the portal: create a record, or sign in to the one they have. Today none does: the sign-up page can only be reached by typing its address, and the guest success card says nothing about an account (only how to cancel).

**Why this priority**: without an entry point the portal does not exist for the audience it is for. Every other story is unreachable until this one works. It is also the cheapest slice: links and prompts on pages that already exist.

**Independent Test**: from a signed-out browser, start at the landing page (practitioner mode), at the public events list, and at a guest registration success card; each offers a way into sign-up and sign-in that leads to the right door. Delivers value on its own because a visitor can now create or reach their record.

**Acceptance Scenarios**:

1. **Given** a signed-out visitor on the landing page in practitioner mode, **When** they look at the hero, **Then** it offers two actions, "Get started" (to sign-up) and "Log in" (to sign-in), mirroring the organiser pair, and the organiser pair is unchanged.
2. **Given** a signed-out visitor on the public events list, **When** the page loads, **Then** a practitioner band offers sign-up and sign-in, and the list itself stays fully visible without signing in.
3. **Given** a signed-in organiser on the public events list, **When** the page loads, **Then** no practitioner band is shown.
4. **Given** a signed-out visitor who has just registered for an event as a guest, **When** the success card appears, **Then** it offers "Create your Eventar record", which leads to sign-up and, once the record exists, to claiming the registration they just made.
5. **Given** a signed-in practitioner who has just registered, **When** the success card appears, **Then** it offers "My record" instead of a create prompt.
6. **Given** a signed-in organiser who has just registered a guest, **When** the success card appears, **Then** it carries no account prompt at all.
7. **Given** a practitioner whose record has no attendance yet, **When** they open the record, **Then** the empty state links to the events list.

---

### User Story 2 - Sign up and arrive where you were going (Priority: P1)

A new practitioner creates a record through the sign-up door and the first-run wizard (consent, identity, professional details, licence). Wherever they started, they end up there: the event they were registering for, the claim page, or the portal home. Today the wizard drops the destination, so the person finishes a four-step form and lands somewhere they did not choose.

**Why this priority**: it is the other half of the funnel. An entry point that loses the visitor's intent halfway wastes the visitor's effort and is the finding the 2026-09-25 review recorded as I6.

**Independent Test**: sign up through a link that carries a destination (for example the guest success card's create prompt), complete every wizard step, and confirm the final page is the destination, then repeat with no destination and confirm the portal home.

**Acceptance Scenarios**:

1. **Given** a visitor who arrives at sign-up with a destination inside the attendee area, **When** they follow the emailed link and complete every wizard step, **Then** they land on that destination.
2. **Given** a visitor who arrives at sign-up with no destination, **When** they complete the wizard, **Then** they land on the portal home.
3. **Given** a visitor whose destination is not a page inside the attendee area (another site, another audience's page, a malformed address), **When** they complete the wizard, **Then** the destination is ignored and they land on the portal home.
4. **Given** a person who leaves the wizard part-way and returns later, **When** they sign in again, **Then** they resume at the first unfinished step, as today. (The destination is carried through one sign-up journey; it is not remembered across separate sign-ins.)

---

### User Story 3 - A signed-in practitioner has a portal of their own (Priority: P1)

Once signed in and onboarded, a practitioner uses a portal with its own navigation: My record, Profile and licences, Claim past events, Account settings, Find events. They always know where they are, can reach any destination in one step, and never see the organiser side. Today the record, profile, claim and account pages are bare pages in the public marketing shell with no navigation of their own: a person moves between them through an account dropdown or an occasional in-page link.

**Why this priority**: it is the portal itself, and the thing the instruction named as missing (failure A).

**Independent Test**: sign in as a practitioner with a finished record and visit each destination; each shows the same portal navigation with the current place indicated, and none shows organiser navigation or links.

**Acceptance Scenarios**:

1. **Given** a signed-in practitioner with a finished record, **When** they open the record, profile, claim or account-settings page, **Then** the page appears inside the portal shell with every navigation destination visible and the current one indicated.
2. **Given** the same practitioner on a phone, **When** they use the portal, **Then** every destination remains reachable without horizontal scrolling and every control is at least 44 px.
3. **Given** a person on the sign-in or sign-up page, **When** the page loads, **Then** it appears in the public shell (it is a door, not a room of the portal).
4. **Given** a person in the first-run onboarding wizard, **When** the wizard shows, **Then** it appears with no portal navigation, so there is nowhere to wander off to before the record exists.
5. **Given** an incomplete account (onboarding not finished), **When** the person opens any record page, **Then** they are taken to the wizard, as today.

---

### User Story 4 - The same signed-in chrome on every page a practitioner touches (Priority: P2)

Around the portal, a practitioner also uses public pages: the landing page, the survey, pricing, the not-found page, an invite page. On several of them the header still says "Sign in" to a person who is signed in, the account menu reads oddly, and on a phone an organiser loses the line that says they are looking at the public page (it is hidden below 640 px and from screen readers; the workspace button itself stays). Each page should tell the truth about who is signed in.

**Why this priority**: it removes the "which site am I on" feeling that makes the portal feel unfinished, but each fix is independent of the stories above and can ship after them.

**Independent Test**: signed in as a practitioner, visit each listed public page and confirm the header shows the signed-in state; signed in as an organiser on a phone-width viewport, confirm the workspace button and the public-view label are both visible.

**Acceptance Scenarios**:

1. **Given** a signed-in practitioner, **When** they open the survey, pricing or the not-found page, **Then** the header shows their signed-in state (the account menu), never "Sign in". On the landing page it does so as soon as the session resolves: its first paint is the signed-out default, so the page can stay static, and a signed-in visitor sees one correction.
   - On an invite page (an organiser-door page, Constitution I) the header says who is signed in without offering attendee-only destinations; its exact form belongs to the portal's design pass.
2. **Given** the account menu, **When** a person opens it with a mouse, a keyboard or a screen reader, **Then** it behaves as a plain disclosure with plain labels and a visible way to sign out.
3. **Given** a signed-in organiser on a phone-width screen of a public page, **When** the page loads, **Then** the workspace button and a label saying this is the public view are both visible, and the label is announced by assistive technology.
4. **Given** a signed-in organiser on the check-in confirmation page, **When** it loads, **Then** the "claim past events" link is not shown.

---

### User Story 5 - A practitioner never meets the organiser side, and the reverse (Priority: P2)

The boundary the product already holds (Q32) must hold on every new surface here: practitioners never see organiser chrome, vocabulary or a link to the organiser log-in, and organisers never land in the portal.

**Why this priority**: it is a standing constraint rather than new capability, so it is verified across the other stories instead of delivering value alone; it is listed as a story so the acceptance walk checks it explicitly.

**Independent Test**: crawl every portal page and every new entry point as a practitioner and as an organiser; no portal page (record, profile, claim, account settings, the sign-in and sign-up doors) contains a link to the organiser log-in or workspace, and every organiser request for a portal page ends in the organiser home. The landing page is the one public page that serves both audiences and legitimately carries both pairs of actions.

**Acceptance Scenarios**:

1. **Given** a signed-in practitioner, **When** they visit any portal page, **Then** none of its links, labels or navigation items points at the organiser log-in or the organiser workspace.
2. **Given** a signed-in organiser, **When** they request a portal page, **Then** they are sent to the organiser home without a message that blames them.

---

### Edge Cases

- A visitor registers as a guest with an email that already has a record: the create prompt must not mislead them; the sign-up door already states that the same emailed link works for a first or a hundredth visit.
- A signed-in practitioner opens the public events list: no create prompt (they have a record); a shortcut to their record is enough.
- The destination carried through sign-up is hostile or malformed (`//evil`, `/\evil`, a tab or newline inside the path, an absolute address): it is ignored, the person lands on the portal home, and the same rule that protects every other redirect applies.
- An emailed sign-in link is expired, used, or opened in a different browser from the one that asked for it: the existing honest copy applies; this feature adds no new failure copy for it.
- A practitioner has guest registrations under their email that are not yet linked: the existing claim nudge stays; the new "Claim past events" destination is how they reach it deliberately.
- A very narrow screen (320 px): up to five navigation destinations must still fit or collapse without a horizontal scrollbar on the page.
- Dark theme: the portal shell must work in the dark theme unchanged; only the light theme's ground changes (decision D13, delivered by package G1).
- Between the session resolving and the account state resolving, the header never shows the wrong identity (no practitioner menu items for an organiser, no "Sign in" on the pages that know the session); if the account-state read fails, the header falls back to a safe neutral state instead of the wrong one.
- A visitor who is nudged before registering ("Sign in or sign up first", which stays) and then registers as a guest anyway sees the new success prompt; neither blocks guest registration.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The landing page, in practitioner mode, MUST offer two actions: "Get started" leading to sign-up and "Log in" leading to sign-in, mirroring the organiser pair; the organiser pair MUST be unchanged.
- **FR-002**: The public events list MUST show signed-out visitors a practitioner band offering sign-up and sign-in; a signed-in practitioner MUST see a shortcut to their record instead; an organiser MUST see neither; the list MUST remain visible without signing in.
- **FR-003**: After a guest registration succeeds, the success card MUST offer a signed-out visitor "Create your Eventar record" (leading to sign-up with the claim page as the destination), a signed-in practitioner "My record", and an organiser nothing.
- **FR-004**: The practitioner's record, when it has no attendance, MUST link to the public events list.
- **FR-005**: The sign-up and first-run flow MUST carry the visitor's original destination through every step and land them there on completion, defaulting to the portal home; only destinations inside the attendee area MUST be honoured, under the same rule as every other redirect target (nothing off-site, nothing from the other audience).
- **FR-006**: A signed-in practitioner MUST see the record, profile, claim and account-settings pages inside a portal shell whose navigation lists My record, Profile and licences, Account settings and Find events, plus Claim past events whenever the account has registrations to claim (the visibility rule Ivan set on 2026-09-21 for the account menu; see Assumptions), indicating the current page.
- **FR-007**: The sign-in and sign-up doors MUST use the public shell; the first-run onboarding wizard MUST use a variant with no portal navigation.
- **FR-008**: No portal page, shell, menu or prompt MUST contain a link, label or navigation item for the organiser log-in or workspace; an organiser requesting a portal page MUST be redirected to the organiser home.
- **FR-009**: The header of every public page a signed-in practitioner can reach (survey, pricing, not-found) MUST show the signed-in state and MUST NOT show "Sign in"; the landing page MUST show it as soon as the session resolves and MUST fall back to a neutral state, never the wrong identity, if the account-state read fails; an invite page MUST say who is signed in without offering attendee-only destinations.
- **FR-010**: The account menu MUST use plain labels, MUST be operable by keyboard and screen reader as a disclosure, and MUST always include a way to sign out.
- **FR-011**: At phone widths a signed-in organiser on a public page MUST see both the workspace button and the label that says this is the public view, and the label MUST be exposed to assistive technology.
- **FR-012**: The "claim past events" link MUST NOT be shown to a signed-in organiser on the check-in confirmation page.
- **FR-013**: Every page this feature adds or changes MUST have a descriptive page title, at most one primary action per card, no eyebrow label that repeats the heading beneath it, equal-height card rows on desktop, touch targets of at least 44 px, text contrast of at least 4.5:1, no horizontal page scroll from 320 px up, and MUST work in the light and dark themes. Every successful action MUST give a visible confirmation that is also announced to assistive technology, driven by the result and not by a timer (decisions D15 and D16).
- **FR-014**: Copy this feature writes or changes MUST contain no em-dashes (decision D14) and MUST use the spelling "organiser".
- **FR-015**: Any new empty, error or prompt state MUST say what happened and what to do next (Hard Rule 12: never report success when something was bypassed).
- **FR-016**: The sign-in door's "not recognised" message MUST NOT tell a person to register for an event in order to get an account (stale since sign-up exists); it MUST point to sign-up (finding M5 of the 2026-09-25 review).

### Key Entities

- **Practitioner record**: the account holder's profile, licences, memberships, attendance and credit history, reached through the portal; created by the first-run flow.
- **Guest registration**: a registration made with an email and no account; it can later be claimed into a record.
- **Destination**: where the person was going when they were sent to sign up or sign in; always a page inside the attendee area, or nothing.
- **Portal shell**: the signed-in practitioner's chrome (navigation of five places, account menu, page title); distinct from the public shell used by doors and public pages, and from the organiser shell.
- **Audience**: practitioner or organiser; every surface belongs to exactly one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the acceptance walk (landing, Get started, sign-up, emailed link, all wizard steps, portal home), a first-time practitioner reaches a finished record in under 5 minutes without typing any piece of information twice.
- **SC-002**: Every entry point in FR-001 to FR-004 is present and leads to the specified place: 4 of 4 verified in the walk, signed out, signed in as a practitioner and signed in as an organiser.
- **SC-003**: A crawl of every portal page as a practitioner finds 0 links to the organiser log-in or workspace, and a crawl of every portal URL as an organiser finds 0 pages rendered in the portal shell.
- **SC-004**: From any portal page, each of the five destinations is reachable in one action, at desktop width and at 375 px.
- **SC-005**: On every page this feature adds or changes, a reviewer who has never seen the product can answer "where am I", "what can I do here", "what just happened" and "what do I do next" without help, at desktop width and at 375 px (the intuitive-test questions from the core-UX instruction).
- **SC-006**: Every page this feature adds or changes is fully operable with the keyboard alone, has no text below 4.5:1 contrast, no touch target below 44 px, and no horizontal page scroll at 320 px.
- **SC-007**: After a guest registration, 100% of signed-out visitors are offered a way to create the record, and 0% of organisers are offered one.

## Assumptions

- This is the existing `/account/*` record surface given a shell and funnels. It is NOT the post-Stage-13 S-Attendee wallet app (still off-limits per CLAUDE.md and the block map), and the CPD compliance math (Q26) and the evidence locker are untouched.
- Account creation stays passwordless (an emailed link that works for first-time and returning visitors), and registering for an event as a guest without an account stays possible.
- The completeness gate stays: an account that has not finished onboarding sees only account settings and sign-out, and the record opens the wizard.
- The navigation label "Profile and licences" replaces the account menu's current "Profile & memberships" (decision D9's table); the page it opens is the existing profile page. **To confirm with Ivan at the checkpoint: it is a rename, not a new page.**
- Claim past events keeps the visibility rule Ivan set on 2026-09-21 for the account menu: shown only while there is something to claim. The plan's portal navigation lists it unconditionally, so this is a flagged default; say if the portal should always show it, which reverses that earlier call.
- Deferred findings carried with this feature and not specified here, with their evidence in the handoff (§7.3): a skip link on the public shell and 13 decorative icon spans without `aria-hidden` (F13), the first-run wizard's step labels truncating at 1024 px (m10), and an event page that does not say an already-registered signed-in person is registered (m11). They ship with the portal's design pass or stay open; they are not requirements of this spec.
- A signed-in practitioner on the public events list sees a shortcut to their record (the plan says only "hidden for organisers"; a create prompt for someone who already has a record would be wrong).
- The mobile navigation pattern (a compact bar of five destinations versus a menu) is a design decision for the portal's design pass and is not fixed here; the requirement is only that all five stay reachable at 375 px.
- Visual direction is decision D12 (Direction C) as rendered in the D0 specimens (artifact v6), on the light-theme ground of decision D13 (package G1, `docs/plans/2026-10-02-g1-ground-tokens.md`). Building this feature before G1 is possible; G1 then restyles it by token plus the exception list in that plan (full-page grounds written as `bg-surface` and outline buttons are the two that would otherwise be missed).
- Dependencies already in place: the door classifier and open-redirect guard from Band 1 (committed `89910b0`), the account layout that sends organisers to their home, the shared header with the account menu, and the completeness gate.
- Out of scope: organiser-side changes other than FR-011 and FR-012, email templates, account deletion or data-subject-request flows, and any analytics or tracking.
