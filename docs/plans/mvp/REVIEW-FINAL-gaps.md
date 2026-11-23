# REVIEW-FINAL-gaps — four remaining MVP acceptance gaps (2026-11-21)

**Verdict: 3 of 4 gaps PASS [X]; gap 4b is a FAIL against the brief's wording (not against the shipped behaviour). Zero BLOCKER. Zero MAJOR. One brief-vs-product conflict needs Ivan's ruling (F1). The MVP is not declared done by this file: rows for PROJECT_STATE, vault and graph stay NOT RUN until Ivan rules.**

Walked on :3100 (server I did not start, `eventar-noreview`: signed-out `/events/new` returned 307, so auth is real). Product tree clean: `git status --porcelain app components lib` empty. Real clicks and real typing only; no `dispatchEvent`. Sign-ins were real magic links read from Mailpit, never printed.

## Gap table

| # | Gap | Result |
|---|-----|--------|
| 1 | Phone bottom pill, 375 and 320, attendee and organiser tabs | PASS [X] at 375 both tabs and at 320 attendee. **Organiser tab at 320: halves 121.4 vs 126.6 px, not equal (F2, MINOR).** No overflow, no clip, one "Talk to sales" mailto hero button, no /login hero link. |
| 2 | Dark theme: `/`, `/events`, event Register card, login | PASS [X] with 1 MINOR (F3). Body `rgb(10, 10, 10)` on every page. Reason line sits directly under the Register heading. |
| 3 | Practitioner check-in: before / inside / after | PASS [X]. Counts below. One MINOR (F4) and two NITs. |
| 4a | organiser_member: `/dashboard` New event, `/events/new` end to end | PASS [X]. Event row confirmed: right org, created by the member's staff row. NIT on the brief's "member uuid" (F5). |
| 4b | body_admin read-only: disabled New event, no tick boxes/Delete on Drafts, no Edit link on a draft | **Partial. New event disabled with the exact reason: PASS [X]. Edit link absent: PASS [X]. Tick boxes + Delete on Drafts: present (F1) — FAIL vs brief.** |

## Findings, ranked

**F1 [MINOR, needs ruling] Read-only role still gets Drafts tick boxes plus Export CSV and Delete.** [X]
- Signed in as `body_admin` (role label on page: "Body Admin"). `/dashboard?tab=drafts` shows a tick box on each draft. Ticking one opens a bar: "1 selected", `Export CSV`, `Delete`, `Clear`. The brief expected none of these.
- Clicking Delete opens a dialog: title `Delete “ZZ-GAP draft”?`, body `Your role can’t delete events. Ask an organiser admin.`, buttons `Cancel` and `Delete 1 event` (disabled). Nothing was deleted.
- So the shipped behaviour matches commit b948806 ("a role-true bulk refusal"), not the brief. Either the brief is stale or the tick boxes should be hidden. Same tick boxes also appear on the Active tab. Ruling needed; any option that changes the page ships rendered before/after first (specimen round). I did not edit anything.

**F2 [MINOR] Organiser-tab bar halves are unequal at 320 px.** [X]
- Bar halves read back: Events `x=32 w=121.4`, Organiser log in `x=169.4 w=126.6`. Cause: the label "Organiser log in" is longer than "Log in", so the half sizes to content. At 375 the halves are equal (151.5 / 151.5) on both tabs. Attendee tab at 320 is equal (124 / 124). No clipping (`scrollWidth == clientWidth` on both links), `scrollWidth == innerWidth` at 320 and 375.
- Nav padding is `8px 8px 8px 16px`, so the pill is also lopsided left to right by design (NIT).

**F3 [MINOR] Dark input boundary is almost invisible.** [X computed]
- Register-card inputs: border `rgba(255,255,255,0.08)` on near-black, about 1.2:1 against the page, under the 3:1 non-text rule. The fill is slightly lighter, so the field is findable but weakly bounded. Placeholder `rgb(166,166,166)` reads fine.
- My contrast scan (all text nodes, composited backgrounds) found 0 text below AA on `/events`, the event page and both login pages. On `/` it flagged 2 items, both false positives I checked by hand: the "Attendee" tab text is navy `rgb(11,27,62)` on the blue thumb `rgb(127,176,244)`, and one paragraph uses an `oklab()` colour my parser could not read.
- No white flash: the head carries a synchronous script that reads `eventar-theme` before first paint [R]. Server HTML ships class `light`, then the script swaps it.

**F4 [MINOR] Check-in refusal leaves a contradictory page.** [X]
- On a page still showing the open state, after the window closed, the error `Check-in for this event has closed. Please see a member of staff.` appears, but the button `Confirm I’m here` stays enabled and the line `Tap when you arrive · staff will see you in the roster instantly.` stays beneath it. A reload fixes it (button gone, closed line only).

**NIT list**
- Success copy says `via self-scan` although the practitioner tapped a button (DB `check_in_method=qr`). [X]
- Edit page repeats "Your role can’t set accreditation" twice (member). [X]
- Date picker keeps showing November with a greyed `10` selected after picking Dec 10. [X]
- First typing after Sign out landed nowhere: the email field looked focused but stayed empty; the first Next click raised the browser's "Please fill out this field." Clicking the field then typing worked. Possibly a pane artefact. [X]
- Draft details page for a read-only role still shows `Save`, `Export evidence`, `Export College package`, `Export attendance evidence` controls. Not clicked. [R]
- A newly registered practitioner is redirected from `/account/check-in` to `/account/complete` (4-step wizard) before any pass is visible. The pass itself works at `/checkin/confirm?code=…` without the wizard. Consent line now reads: `By continuing you agree to Eventar using your details for this. The full terms and privacy policy are not published yet. We will show them to you before launch.` It no longer asks acceptance of unpublished documents as if they existed; the earlier MAJOR is reworded, not resolved by publishing pages. [X read]

**F5 [NIT, docs] `events.created_by` is the staff row id, not the auth uuid.** [X]
- For the member fixture: `created_by` = staff.id; the auth uuid is different. `events.created_by` is a FK to `staff(id)` and `staff` has no user_id column. Hard rule 1 (UUID keyed on `auth.users.id`) and the brief's "created_by = member uuid" do not match the schema. Not a bug in the form; a docs conflict to settle.

## Gap 3 counts (event `ZZ-GAP checkin`, registration code ZZGP42, practitioner has no staff row)

| State | Surface copy / controls | `registration_checkins` rows |
|---|---|---|
| BEFORE (start +5h) | Pass with QR. `Check-in opens at 03:47 on Sun 22 Nov — an hour before the event starts. Keep this pass handy.` No button. Direct `self_check_in` RPC: `not_open_yet` | 0 |
| INSIDE (start +30m) | `Confirm I’m here` plus `Tap when you arrive · staff will see you in the roster instantly.` | click -> 1 (`check_in_method=qr`, status `attended`). Page: `You’re checked in.` `at 21 Nov 2026, 23:51 · via self-scan` |
| AFTER, open page clicked (window moved to ended first) | Server refusal: `Check-in for this event has closed. Please see a member of staff.` Button still enabled (F4) | 0 new (stayed 0) |
| AFTER, reloaded | No button. `Check-in for this event has closed. Please see a member of staff.` RPC: `closed` | 0 |

Window shifts used `walk-window.sh`; it worked because the fixture has no agenda blocks. Not walked here: staff-side writers into `registration_checkins` / `speaker_checkins` in the before state (NOT RUN, out of this brief).

## Gap 4a read-back

- `/dashboard` as `organiser_member`: link `New event` -> `/events/new`, enabled. Sidebar role label: "Organiser".
- Typed: title `ZZ-GAP member created event` and description (read back from the inputs before Save, both stuck, no fill artefact). Venue: typed "Hong Kong Convention", waited 5 s, clicked the option by ref; timezone read back `Asia/Hong_Kong`. Date Dec 10, start 09:00, end 10:00 picked by real clicks.
- Save draft -> redirect to `/events/<id>/edit`, banner `Draft saved. Review and publish when you are ready.`
- psql: `status=draft`, `start_time=2026-12-10 01:00:00+00`, `timezone=Asia/Hong_Kong`, `organisation_id` = the disposable org (true), `created_by` = the member's staff id (true).

## Gap 4b read-back (body_admin)

- New event: disabled button, `aria-describedby="new-event-why"`, copy exactly `Your role can’t create events. Ask an organiser admin or member.` [X]
- Draft rows show `Details` and `View` (no `Edit`). Draft details page (`/events/6007b54f-…/details`): line `Your role can’t change events. Ask an organiser admin.`; header action `View`; no link containing "Edit event". [X]
- `/events/new` direct: `Create event` + `Your role can’t create events. Ask an organiser admin or member to create it.` [X]
- Auditor role not walked (NOT RUN; body_admin only).

## Screenshots

The Browser tool cannot name files; each image is saved by the harness under `/Users/ivan/.claude/projects/-Users-ivan-Eventar/d34a0c1c-6fa2-4cf1-b5a9-ceb867212205/tool-results/`. All below are on disk. N dev badge hidden by injected CSS for the 375/320 pill frames only (not in code); it is not hidden in dark or check-in frames.

| Step | On disk |
|---|---|
| 1 attendee 375, badge present | mcp-Claude_Browser-blob-1795275976927-1vu11k.jpg |
| 1 attendee 375, badge hidden | mcp-Claude_Browser-blob-1795275986013-379m4p.jpg |
| 1 attendee 320, badge hidden | mcp-Claude_Browser-blob-1795276002738-yzcfn6.jpg |
| 1 organiser 320, badge hidden | mcp-Claude_Browser-blob-1795276013829-b2x8mv.jpg |
| 1 organiser 375, badge hidden | mcp-Claude_Browser-blob-1795276020176-7f9izs.jpg |
| 2 dark `/` hero / mid | mcp-Claude_Browser-blob-1795276082334-aldxs6.jpg / -1795276097697-wgopgj.jpg |
| 2 dark `/events` | mcp-Claude_Browser-blob-1795276112132-c34o0q.jpg |
| 2 dark event page top / form | mcp-Claude_Browser-blob-1795276121676-nvj54v.jpg / -1795276125795-obec63.jpg |
| 2 dark `/login`, `/account/sign-in` | mcp-Claude_Browser-blob-1795276134959-32qih2.jpg / -1795276151216-z2wpsa.jpg |
| 3 before | mcp-Claude_Browser-blob-1795276224161-e186hp.jpg |
| 3 after-window refusal on open page | mcp-Claude_Browser-blob-1795276248696-9n74ys.jpg |
| 3 inside, checked in | mcp-Claude_Browser-blob-1795276269376-0r3e9w.jpg |
| 3 account gate (wizard) | mcp-Claude_Browser-blob-1795276206348-b4mcdg.jpg |
| 4a member dashboard / create form / saved | -1795276310160-wqzcml.jpg / -1795276318352-v9va3t.jpg / -1795276396185-1w1uul.jpg |
| 4b body_admin dashboard / drafts / ticked / delete dialog | -1795276447527-x17faw.jpg / -1795276454755-msin19.jpg / -1795276460876-um0lze.jpg / -1795276477176-dw1is8.jpg |
| 4b draft details | -1795276496944-if7ck6.jpg |

Not on disk: the 320 attendee zoom crop is a blank-region zoom (mcp-Claude_Browser-blob-1795276000711-dkicts.png) and proves nothing; the 320 full frame above is the proof.

## Fixtures and teardown

- Org `ZZ-GAP org` (slug `zz-gap-org`), staff `organiser_member` (staff id `fffd0fac-9719-4b66-bb8a-3bc7861d1929`, auth `39df21f5-855a-40ed-a48a-0a36993e2877`), staff `body_admin` (auth `ce67a229-51b9-4ba2-b4b9-697f7d661988`), practitioner auth `d7897470-9e9e-49f8-9440-4cc1d7c150bf` (no staff row). Events: `ZZ-GAP checkin` e544dcf9-88bf-4387-83c6-d6918453229d, `ZZ-GAP register` 811fe02e-0526-4476-92cb-7e7f3c6fe948, `ZZ-GAP draft` 6007b54f-d36f-4a94-9023-9dffedb85164, `ZZ-GAP member created event` 22b1be6f-b2f9-4272-9b51-c0f045313dd8.
- First cleanup attempt rolled back: deleting the registration was blocked by `participation_evidence` (FK, written by the self check-in). The auth deletes then ran: member and body_admin 200, practitioner 500. Fixed by deleting my own one evidence row (the table's delete trigger writes an `evidence_deleted` audit event), then events, staff, org, and the practitioner auth user (200). Evidence row: `99bbe11f-403f-415b-b3d0-104a712bbd1c`, 0 `credit_ledger` rows touched.
- Final count: `events=0 staff=0 orgs=0 auth=0`, `public.users=0`, orphan `consent_records=0`, orphan `professional_profiles=0`, registrations `zz-gap-%`=0.
- Residue by design: `audit_events` rows `attendee_checked_in`, `evidence_recorded`, `evidence_deleted` (1 each in the walk window; sign-in rows, if any, also stay).
- Not mine, untouched: peer fixtures `ZZ-WALK Cardiology update` event 94a86294-cd48-404a-83a4-d9a123fd8c5a and `ZZ-WALK org` (events=1, orgs=1 remain from the baseline before this walk).
- Scratch: pw/svc/ids/link files deleted. A one-shot redirector on 127.0.0.1:3917 served the magic link to the browser so the token never entered the transcript; it exited after one request (`lsof` shows 0 listeners). The :3100 server was not started or stopped by me and is still running; its lock still names session 7be90e.
- Tab reset: viewport desktop, colour scheme light, `eventar-theme` and my helper key removed from localStorage; tab ends signed out at `/login`.
- `git status --porcelain app components lib`: clean. Nothing staged or committed.

## Status

- Reached: all four gaps.
- Not reached / NOT RUN: auditor role; staff-side check-in writers (`speaker_checkins`, walk-in) in the before-window state; `/account/check-in` "Open now" list for a completed account (blocked by the wizard gate, would need a completed-profile fixture); Publish and non-creator publish path for the member; 320 px check of the check-in pass page.
- Rests only on my own runs: every finding above was executed by me; no agent was dispatched (the brief asked for the walk itself).
- Ruling queue for Ivan: F1 (brief says hide, product shows and refuses), F2 (equalise the organiser-tab halves at 320), F5 (which uuid `created_by` should mean). Each needs rendered before/after before any edit.
