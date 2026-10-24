# REVIEW DB-03, user lens (cold-start person, not a developer)

Reviewer: Claude Sonnet 5.5, Claude Code subagent. Date: 2026-10-24. Environment: :3100, review mode off, local Supabase only. Evidence tags: [X] executed or seen in the browser or database, [R] read from code, [I] inferred.

Counts: BLOCKER 0, MAJOR 2, MINOR 1, NIT 2.

## Findings

| ID | Sev | Route | What I saw, as a person | Ev | Suggested fix |
|---|---|---|---|---|---|
| U1 | MAJOR | `/checkin/confirm?code=<code>` (public pass link) | A visitor who registered before the organiser deleted the event still gets a normal pass. For the upcoming deleted event: title, date, venue, QR and "Check-in opens at 16:40 on Mon 26 Oct — an hour before the event starts. Keep this pass handy." For a deleted event they had attended: "You're checked in. Enjoy the sessions — we'll email a short survey after it wraps." Meanwhile the same event's page and poster are a 404 for the same person. So the card's claim "an event an organiser deleted disappears for the public" is false for this public route, and the registrant is told to turn up to an event that no longer exists. | X | Decide the intent. If a deleted event is "gone", the pass page should say so ("This event was removed by the organiser") or 404, and not show title, venue or time. Notifying existing registrants on delete is a separate product call. Needs a ruling before the card is called done, because DB-03's own wording promises the public no longer sees the event. |
| U2 | MAJOR | `/events/<deleted id>/details`, `/events/<deleted id>/checkin`, `/events/<deleted id>` as a teammate | An organiser who opens a deleted event from an old bookmark is told nothing. The Event Manager shows status "Registering", "STARTS IN 47h 57m", and every control (Edit, Roster, Close registration, send controls, Save) as for a live event. The check-in desk opens as a working door ("Not open yet, Starts in 1d 23h", Scan badge, Walk-in, Check in buttons). The public event page, seen while signed in as staff, renders as a live event with the Register form ("You're signed in as an organiser. This creates a guest registration."). The "Public" link on the manager sends staff to that live-looking page, while the public gets a 404. No page text says "deleted" or "removed" other than my fixture's own title, which contains the word (fixture-title caveat: the app added no banner of its own). The register Server Action does refuse a deleted event (`app/(public)/events/[id]/actions.ts:100`, `deleted_at != null`) [R]; I did not submit the form, so the message a staffer would get is unseen. | X (pages), R (action) | When `deleted_at` is set, show a persistent banner on details, check-in and the staff view of the public page ("This event was deleted on <date>. Only your organisation can see it. Restore"), or send staff to the Manage list entry for it. Disable Register on the public page for staff too. |
| U3 | MINOR | `/events/<id>/checkin` as a teammate | Chair and Presenter toggles are shown on every roster row to a teammate, but tapping one is refused with the toast "Only the person who created this event, or Eventar staff, can make this change." On my first tap I read the page 3 seconds later and saw nothing; the message was only visible when I read it about 1 second after a second tap. At a busy door a person would think the tap did nothing. Nothing was written (0 `registration_roles` rows read back). The empty Speakers card also says "No speakers configured — add them to the agenda first", which a teammate may not be allowed to do (not tried). DB-03 ruling 2 said "creator-only at the database, the UI tightened to match"; this surface is not tightened. | X (toast, 0 rows), I (speakers) | Hide or disable the toggles for non-creators with a visible reason ("Only <creator> can set roles"), or keep the toast until dismissed. Out of DB-03's file list, so log it against the card that tightens the UI. |
| U4 | NIT | `/events/<id>/checkin`, eligible attendee | An attendee who will earn a credit gets no note at all (by design: `eligible` and `not_cpd` render nothing). A teammate cannot tell "eligible" from "not checked", except by the absence of the old warning. I could not show this case in the browser (see Not reached). | R | Optional: one line above the roster, "Attendees without a note will earn a credit when checked in" (only on CPD events). |
| U5 | NIT | `/events/<id>/checkin` roster | Every eligibility note is announced with an icon named "error" (text of the page), including the plain "no account, so no credit" case, which does not block check-in. Three of four rows carried it, so the roster reads as an error wall. I could not judge the colour (the pane rendered the screenshot too small to read). Pre-existing design, not changed by DB-03. | X (text), I (colour) | Use an info icon for the "won't post a credit" notes and keep the error icon for "cancelled, can't be checked in". |

## Worked well

- Teammate roster (the card's headline claim). As `db03ul-mate` (active organiser_admin, did not create the event) the check-in desk showed the per-attendee notes and no "CPD eligibility couldn't be checked just now" warning [X]:
  - Anon One and Anon Two: "No practitioner account for this email — checking in won't post a CPD credit."
  - NoLicence (account, no verified licence at the body): "No verified licence with this event's accrediting body — checking in won't post a CPD credit."
  - Cancelled: "Registration cancelled — this attendee can't be checked in.", and the row's button text became the same sentence (the action is not offered).
  - The notes are about the credit, not about the person: no licence numbers or body names for individuals.
- Signed-out visitor on the deleted event page and on its poster: a clean "404 This page doesn't exist. The link may be old, or the event it pointed at was removed." with links to Upcoming events and Home. Not blank, not a crash, not a partial page. The calendar file for the deleted event is a real HTTP 404. The deleted event was not in the public listing `/events` [X]. Page HTML carries `noindex` on these, and returns HTTP 200 with the 404 screen (the known streamed notFound behaviour, not new).
- Control: the live published event stays visible to the signed-out visitor, and shows "Event in progress. Registration has closed. If you're at the venue, please see the event staff at check-in." [X].
- Programme (dashboard) as the teammate listed the live event ("live now, 0 of 4 checked in") and did not list the deleted upcoming event at its date slot [X, from truncated page text, so only the 26 Oct slot is established].
- Teammate and the creator's own organisation share the event: the teammate's Event Manager title, roster and check-in loaded; another organisation was not tested in the browser (covered by the RLS test per the card).

## Not reached (and why)

- Manage list (`/dashboard/manage`) as the teammate: how a deleted event appears there. After the first sign-in I signed out to test the public pages, and the second magic-link request produced no new email (Mailpit held one message, so I had no fresh link). Code read only: `app/dashboard/data.ts:107` maps `deleted: e.deleted_at != null`. What the person sees is unverified.
- The registered visitor's account record (`/account/record`) for a deleted event: needs a practitioner sign-in, not done. Only the pass link was walked (U1). Whether the record lists the deleted event, and with what words, is unknown.
- The creator's own view (second sign-in): not done. U2 and U3 were seen only as the teammate; the creator would presumably see the same banner-less pages [I].
- The positive "eligible" attendee in the browser: the licence table is definer-only (Hard Rule 11 revokes service_role writes), so I could not create a verified licence from SQL. Covered by the card's RLS test, not walked.
- The agenda of a deleted event and the poster of the deleted past event (no agenda blocks in my fixtures; poster of the upcoming deleted event covered).
- The Edit button shows a lock icon for the teammate in the Event Manager text ("lock … edit Edit"); I did not click it.
- Screenshots in the Browser pane rendered small and unreadable, so everything above rests on `get_page_text` and `read_page`, not on visual judgement (colour, spacing).
- Tool-call cap: I passed the 45-call cap during the walk (fixture setup took more calls than planned) and stopped walking at the points above.

## Fixtures and cleanup

Prefix `db03ul`, local DB only, default organisation `00000000-0000-0000-0000-000000000001`. Accrediting body HKICPA `3dcdd5ff-7c6a-4416-b122-6eb73eb43207` (active authorisation), `cpd_hours` 1.5.

- `DB03UL live event` `3f7dad07-58d7-4ea9-8e7a-2904a8ae5582`: published, started 30 min before the walk, 4 registrations (Anon One, Anon Two, NoLicence with an account, Cancelled).
- `DB03UL deleted event` `b5fca2ef-df53-435d-863c-cd1956db15ce`: published, `deleted_at` set, starts in 2 days; 1 registration (Visitor, code `DBXUV2`).
- `DB03UL deleted past event` `0adccc96-3c72-4ca3-9622-086549ecafe0`: published, deleted, 3 days ago; 1 registration (Visitor, attended, code `DBXUW3`).
- Auth users: `db03ul-creator@`, `db03ul-mate@`, `db03ul-visitor@`, `db03ul-nolic@` (all `@db03ul.invalid`); staff rows for creator and mate (organiser_admin, active). The `event_occurrences` rows were created by a trigger when the events were inserted.
- I did not create or delete `scratch-demo/locks/dev-3100.lock` (held by `claude-e94a72 DB-03 reviews`).
- Other agents' fixtures were visible on the dashboard ("Eligibility Fixture …", "set_event_cpd_config CREDITED fixture — DELETE ME …"); not mine, untouched.

Cleanup, in order (registrations, events, staff, users rows, auth users via admin API, Mailpit messages, scratch files): `events=0 staff=0 auth=0 registrations=0` (also `users=0`, Mailpit messages for `db03ul` = 0). The two magic-link sign-ins write permanent `audit_events` rows by design; a payload search for "db03ul" found none, so any sign-in audit rows are not attributable by text and remain as expected residue.

Browser reset: cookies cleared, `localStorage` cleared (including `eventar-theme`), viewport emulation set to desktop, colour scheme light, tab left on `/login`.

Repo: `git status --porcelain` tracked-modified list is identical to the list at session start (skills ledger files, `package.json`, `pnpm-lock.yaml`, `tests/cpd/roster_eligibility.rls.test.ts`, `tests/helpers/insertAsRole.ts`). The only file I wrote is this one.
