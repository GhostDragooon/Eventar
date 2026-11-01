# Ivan's design picks (recorded by Claude on his instruction, 2026-10-23)

UX-01 (a): a1, 2026-10-23
UX-01 (b): b2, 2026-10-23
UX-01 (c): c1, 2026-10-23
UX-01 (d): d1, 2026-10-23

Notes from Ivan, same day:
- Registrations list (b2, built in UX-04): keep the outer border, no lines between rows ("outside border is fine, not all around"). Separate rows with spacing.
- Rejected, with reasons in docs/plans/mvp/UX-01.md: a2, a3, b1, b3, c2, c3, d2, d3.
CX-04R states (2): a (filter tabs Active | Drafts | Cancelled | Deleted with counts), 2026-10-31
CX-04R actions (3): c (keep Manage card and bulk; checkbox only on events you created, all for eventar_staff), 2026-10-31
CX-04R composition (1): f (dated cards with an action row; status row above the date), 2026-11-01
CX-04R motion (2): a (almost none), 2026-11-01
CX-04R actions (3) REVISED: tick box on every event in the organisation, 2026-11-01 (Ivan; the 2026-10-31 creator-only pick rested on a wrong reading of the bulk RPC, which is org-scoped since 20260910000000)
CX-04R follow-ups: deep link opens the tab and keeps ?tab= in sync; Needs attention capped at 3 rows; date block shows the month (year when not this year); drafts show Details and Edit only, 2026-11-01
CX-04R review proposals 1 to 6 (filter buttons, honest cap notes, small copy, no Check-in on cancelled, remove DashboardWorkstation, CSV formula prefix): all applied, 2026-11-01 (Ivan: "Apply all six"). Commits cf9a2e1 and f587bf6.
UX-02 re-cut (1) phone nav: b (five tabs sized to their labels, 11 px), 2026-11-01
UX-02 re-cut (2) sign out: a (quiet row under the nav; on a phone it is on the Account page), 2026-11-01
UX-02 re-cut (3) Events: b (/events inside the shell for a signed-in attendee), 2026-11-01
UX-02 re-cut (4) onboarding bar: a (brand, email, Sign out), 2026-11-01
UX-02 re-cut (5) unbuilt destinations: a (Check-in, Registrations, History as inert Soon rows), 2026-11-01
UX-02 re-cut (6) Account in the rail: a (flat list of five), 2026-11-01
UX-02 re-cut (7) row shape: a (rounded rows, tinted fill, D0), 2026-11-01 (Ivan: "Accept all picks")
