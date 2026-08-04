---
type: "query"
date: "2026-07-23T00:18:01.425718+00:00"
question: "Why does requireStaff() connect Staff Event Edit & Publish to Dashboard & Analytics Actions, Staff Check-in Roster UI, and 13 other communities?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["lib_auth_requirestaff", "lib_supabase_server_supabaseserver", "lib_withsecurity_withsecurity"]
---

# Q: Why does requireStaff() connect Staff Event Edit & Publish to Dashboard & Analytics Actions, Staff Check-in Roster UI, and 13 other communities?

## Answer

requireStaff() (lib/auth.ts L19, degree 50) is the single load-bearing gate for the entire staff surface, both read and write. All 10 staff-facing page.tsx Server Components import+call it directly at render time (dashboard, analytics, checkin index, event analytics, event details, event edit, new-event, settings, staff checkin, plus the public event page for owner-view branches) - this is Hard Rule 3 ('requireStaff() at the top of every staff Server Action, no exceptions') made structurally visible as a graph hub. Every mutating Server Action also calls it directly (createEvent, publishEvent, updateEvent, markAttended, bulkUpdate, exportRegistrantsCsv, toggleSpeakerCheckin, updateRegistrationClose, authorizeEvent, getEventQrPng). withSecurity.ts (the Sprint 2 wrapper: auth -> rate-limit -> Zod -> business logic -> audit) itself calls requireStaff() rather than replacing it, confirming it's the base primitive the newer wrapper composes on top of, not a superseded pattern. It calls supabaseServer() for session lookup and references NotAuthorizedError as its failure mode. A rationale_for edge to 'Task 1 split decision: requireStaff reconciliation (1a shipped / 1b deferred)' surfaces a real historical decision (Sprint 2, docs/plans/2026-07-04-cpd-sprint-2-implementation.md): Task 1a shipped the status='active' gate, Task 1b (widening the role union to include eventar_staff) was split out and deferred to Sprint 3 because it broke tsc at 9 call sites via StaffShell.tsx/SettingsClient.tsx's own local prop types. So the 16-community bridge isn't an architectural accident - the communities are feature areas (dashboard, checkin, analytics, edit/publish...) that the clustering correctly separated by cohesion, and requireStaff() is the one deliberate chokepoint Hard Rule 3 forces across all of them.

## Outcome

- Signal: useful

## Source Nodes

- lib_auth_requirestaff
- lib_supabase_server_supabaseserver
- lib_withsecurity_withsecurity