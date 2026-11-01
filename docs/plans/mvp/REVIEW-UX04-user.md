# REVIEW UX-04 user lens (organiser Registrations page + Check-in split)

Reviewer: user-lens agent, 2026-11-01. Local stack, :3100, review mode. Tags: [O] observed in the browser or DB, [I] inferred from code or standard behaviour.

## Setup and limits
- Fixture: event "UXLENS Walk Event" (published, org 0000...0001, created_by the borrowed staff) with 4 registrations: Amy (registered), Ben (attended), Cat (cancelled), Dan (registered, account-linked via user_id). All removed (see end).
- Identity: review mode borrowed `manager_email`, role **eventar_staff**, NOT organiser_admin [O: page footer + staff table]. `canEditRegistrations` allows both, so the walk is equivalent for edit, but organiser_admin and organiser_member specifically were not exercised.
- Read-only role (body_admin/auditor): NOT feasible. Review mode borrows one fixed staff row; switching role means editing a shared staff row or a real session, both off-limits with a concurrent backtest. Read-only branch is [I] from `canEditRegistrations` and the page code only.
- Not done: the Published next-steps card ("Open registrations" after a publish). Publishing a fixture would send/seed more state than my budget allowed. Not reviewed.
- Dark-mode pressed-chip state: UNVERIFIED. Computed colours of a pressed chip equalled the unpressed ones, but the pane's animation timeline is frozen (memory: browser-pane-frozen-animation-timeline), so the measurement is not trustworthy. Needs a re-check in a real browser.

## Four questions per page

### /events/[id]/details (toolbar)
- Where am I: yes (title, "Event Manager", status pill).
- What can I do: yes. Toolbar now reads Edit, Registrations (group icon), Check-in (how_to_reg icon), Public, Analytics. No control labelled "Roster" [O].
- What happened: n/a (no action).
- What next: two clear doors. Sidebar "Check-in" goes to the global /checkin, toolbar "Check-in" goes to this event's desk. Same label, same icon, two destinations (see M-3).

### /events/[id]/registrations
- Where am I: yes. Breadcrumb, h1 "Registrations", event title, sidebar "Back to Event".
- What can I do: filter pills with counts (All 4, Registered 2, Attended 1, Cancelled 1), search (name or email, case-insensitive, works) [O], Chair/Presenter toggles (aria-pressed present) [O], Edit. Locked chips are disabled with a title explaining why [O].
- What happened: weak. A role toggle changes only the chip (no text, no live region) [O]. A successful Edit closes the dialog and the row updates, no "Saved" [O]. Errors are good (below).
- What next: a "Check-in →" link under the title. No pointer to Details, no hint about what to do with an attended row.

### /events/[id]/checkin
- Where am I: yes ("Check-in", event, date, venue).
- What can I do: Scan badge, Enter code, Walk-in, status tabs, search, per-row "Check in →". Capture only: no role chips, no word "Roster" anywhere on the page [O]. Link back "Registrations →" present and correct [O].
- What happened / what next: before the window opens, "Check-in has not opened yet. It opens 60 minutes before the event starts." and all Check in buttons are disabled [O]. Clear.

## Findings

### MAJOR
**M-1 Role toggle gives no confirmation and drops keyboard focus.** [O] Registrations. Steps: Tab to "Chair" on Dan, press Enter. The button is disabled while pending, `document.activeElement` becomes BODY and never returns; no `role=status` text. Pressed state is a colour tint plus aria-pressed, which a screen reader does not announce because focus is gone. Success of an Edit is equally silent. Fix: keep focus (use `aria-disabled` + ignore clicks while pending, or restore focus to the same button after the action), and add a polite live region ("Amy Alphabet marked as chair") that also covers "chair removed" and "details saved". [I] Chrome keeps its sequential focus start point at the disabled node, so a sighted keyboard user can still Tab onward; a screen-reader user is the one who loses out.

**M-2 No sign of an account-linked row until you open Edit.** [O] Dan's row looks like Amy's. Only the dialog says "belongs to an Eventar account, so its email cannot be changed here." Email field is disabled [O]. The message does not say what to do instead (the person changes their own account email; or nothing). Fix: show a small "Account" tag on the row, and extend the message with the next step.

### MINOR
**m-1 Empty-result message ignores the active filter.** [O] Filter Cancelled + search "dan" shows only "No matches." Does not say that Cancelled is on or offer to clear it. Fix: "No cancelled registrations match "dan". Show all" with a clear button.

**m-2 Mobile first screen has no rows.** [O] At 320x640 the first row's top is at y=658 (viewport 640); at 375 it is below the fold. Cause: horizontal nav strip, account row, breadcrumb, h1, subtitle, link, wrapped filter pills (2 lines), search. Fix: tighten the header on small screens (put search above the pills or make the pills a single scroll row), or reduce chrome on this page.

**m-3 Same label "Check-in", two destinations.** [O] Sidebar "Check-in" is /checkin (global); toolbar "Check-in" on Details is this event's desk. On the Registrations page the sidebar shows "Check-in" while the page body also has "Check-in →" to the event desk. Fix: name the in-page link "Check-in desk for this event" or "Open this event's check-in".

**m-4 Locked-chip reason is mouse-only for sighted users.** [O] The reason is a `title` tooltip plus the aria-label. Disabled buttons are not focusable, so keyboard and touch users never see it. Fix: one visible line per locked row ("Roles are locked once someone has attended") or an info text under the filters.

**m-5 Counts disagree across surfaces.** [O] Details shows "Registered 4" and "1 / 4 attended" with one cancelled registration; Check-in shows "1 / 4 checked in" and "Pending (3)" including the cancelled person (with a disabled "Check in →"); Registrations shows Registered 2 / Cancelled 1. Pass delivery says "0 of 2 delivered" while PASSES SENT says "4 outstanding" (Details). Fix: define "registered" once (exclude cancelled) and use it on all three surfaces. Part of this predates UX-04, but the split now puts the two numbers one click apart.

**m-6 Error is not tied to its field.** [O] "That is not an email address." (for `a@b`) and "A name is required." (for a whitespace-only name) appear in a `role=alert` block, but neither input has `aria-invalid` and the alert is not `aria-describedby` [O: aria-invalid null]. Messages themselves are clear and the dialog stays open with the focus in a field. Fix: set aria-invalid and describedby on the offending input.

**m-7 Form inputs are 14px.** [O: computed 14px for the search box and dialog inputs] iOS Safari zooms the page on focus under 16px. [I] Fix: 16px on small screens.

**m-8 Dialog does not lock background scroll.** [O: body overflow visible while open at 320]. Cosmetic on a short list, annoying on a long one.

**m-9 First request to the page redirected to /login once.** [O, not reproduced] The first navigation to /details bounced to /login?next=...; the second worked, and curl without cookies got 200 on both routes. Likely a cold compile or a peer's restart. Flagged in case it is a real intermittent.

### NIT
- n-1 "Registered" status text sits right of the Chair/Presenter chips with no chip border, so it reads as a fourth, non-clickable chip. Give the status a visibly different treatment.
- n-2 Breadcrumb links are 25px tall at 320 (shared component).
- n-3 Check-in "Registrations →" link is plain small text; on the desk during an event it is easy to miss. Fine for capture-only, but the label could say what it is for ("Registrations: edit names, set chair").
- n-4 Details toolbar "Check-in" shows `how_to_reg` and the sidebar uses the same icon; consider a different icon for the event-level action.

## What worked well [O]
- Search (name, email, case-insensitive), filters with counts, filter+search combination.
- Roles: toggle on then off persisted and removed correctly in `registration_roles`.
- Edit: blank name rejected by the server ("A name is required."), malformed email rejected natively and server-side; a good name correction saved (row updated, DB updated, code `UXLENS01` unchanged, as the dialog promises). Focus returns to the row's Edit button.
- Dialog: modal, labelled, focus trap holds in both directions, Esc closes and focus returns to the Edit button [O].
- Locked chips for attended and cancelled rows, with a reason.
- No horizontal overflow at 375 or 320; dialog fits 320x640 with Save reachable; touch targets in the list are 44px tall [O].
- Check-in: capture only, no roster word, link back to Registrations.

## Counts
BLOCKER 0, MAJOR 2, MINOR 9, NIT 4.

## Fixtures removed
Before my fixtures: events 440, registrations 887 (counts earlier in the session read 441/890 because the backtest agent's own fixtures came and went). After removal: events 440, registrations 887; `UXLENS%` events 0, registrations 0, orphan registration_roles 0. Audit rows are append-only and remain (about a dozen from my role toggles and the one name edit; the audit_events total moved 43057 -> 43074 including concurrent activity). Browser viewport reset to desktop; `eventar-theme` localStorage key removed (was unset before).
