# REVIEW-R3: organiser portal, user lens

- Date: 2026-11-03. Lens: user (cold-start organiser). Status: **PARTIAL** (70-call cap; the venue/time pickers ate about 25 calls).
- Method: built-in browser pane, :3100 only, magic link from Mailpit for ux-admin@eventar-review.invalid (organiser_admin). A no-cookie `GET /events/new` returned 307 to `/login?next=%2Fevents%2Fnew` (review mode confirmed OFF).
- Tags: [X] observed live, [R] read in source, [I] inferred.
- Personas walked: ux-admin only (as a non-creator editor on `ZZ-FINAL member c1`, as the creator on `UX03B pub admin`). **ux-member and ux-body NOT walked.**
- Fixtures created: **none.** I opened /events/new and filled name, venue and date, but never pressed Save draft, so no event row exists. No `ZZ-R3` events. No SQL writes. ZZ-FINAL events only read.
- **Sign out: NOT verified.** I clicked the Sign out button through a script (not a real click). The page went blank and `/dashboard` still loaded as "Events", so the ux-admin session is probably STILL SIGNED IN in the browser pane. Please sign it out (staff chip area > Sign out) before the next agent starts.

## Findings

### MAJOR

**R3-1. Literal "✓" text shown in the checked-in row of the check-in roster.** [X]
- Route: `/events/ee926641-.../checkin`, row "ZZ-FINAL Member Walkin" (Method column area, between code and time).
- Saw: a SPAN whose text is the six characters `✓` (char codes 92, 117, 50...), not a tick. Reads as a broken glyph at a live door.
- Why it matters: the desk is the screen staff stare at all day; a raw escape string looks like a bug and is read aloud by a screen reader as "backslash u 2 7 1 3".
- Fix: replace the string with the real character or an icon with an accessible name "Checked in". I did not find the source line: my grep command failed on a zsh glob (`--include=*.tsx`) and I had no calls left to retry. Search `u2713` under `app/events/[id]/checkin/`.

### MINOR

**R3-2. `/checkin` rows carry no per-row state.** [X] The chooser says "Nothing live right now · 8 coming up", and each row shows only date, venue and "0 / 0 checked in". The task asked that each row's state be clear. Eight events up to 6 weeks away read as equally actionable; none says "Opens 04 Dec, 08:00" or "Not open yet". The person only learns on the next page. Fix: a short state chip per row ("Opens in 31d" / "Open now" / "Ended").

**R3-3. Two contradictory timezone lines on /events/new.** [X] After picking the venue the page shows "Timezone follows the venue — Asia/Hong_Kong." (good, live), and directly beside the time fields the old line stays: "Times are in your local timezone. The event page will display them in the venue's local time." An organiser cannot tell which zone to type in. Fix: remove the old line once a venue is set, or reword to "Times are in Asia/Hong_Kong".

**R3-4. Venue search needs a near-complete name.** [X] "Hong Kong Conv" returned "No matches. Try a more specific name or the venue's address." (Nominatim does not do prefix search; the live service answered 200.) The full name worked. The copy is honest, but it makes a first-time organiser think the venue does not exist. Fix: add "type the full name" to the hint, or prefix-match on a local list. Combobox role and `aria-expanded` now exist (the old F9 gap is partly closed; I did not test ArrowDown + Enter).

**R3-5. Events home footer contradicts the count.** [X] Header says "14 events"; footer says "Showing the 300 events with the latest dates. Finished events are in History." The footer is shown even when nothing is cut off. Fix: show the footer only when the list is truncated.

**R3-6. Published event edit page does not say details are locked.** [X] `UX03B pub admin` (published) `/edit` shows status "published", then only the CPD accreditation block and a Save button (7 controls, 1 disabled). A regex over the whole page text for "locked", "cannot be", "after publish", "unpublish" found nothing. The task expected a sentence naming the lock and real next steps. A cold organiser sees a nearly empty page and cannot tell why name, date and agenda are missing. Fix: one sentence at the top ("Name, date, venue and agenda are locked once an event is published. To change them, [real next step]"). I did not confirm whether a separate banner sits elsewhere, so treat as MINOR until a dev check.

**R3-7. Sign out through the button looked inert from a script.** [I] See top: unverified, may be only my script-click. A real-click check is still owed.

### NIT

**R3-8.** [X] The staff chip shows the line "UX" (display name) over a truncated email "ux-admin@eventar-review..." (full email only in a hover title) over "Organiser Admin". Works, but the truncation hides the part that tells staff apart.
**R3-9.** [X] Create page title appears twice ("Create event", "Create event") in text order; likely breadcrumb plus heading. Fine.

## Staff shell chip (step 1) [X]

Chip is three plain `div` lines: name, email, role. Computed cursor `auto`, tabindex -1, no ancestor link or button, transparent background, no border: it does not look or behave clickable. Role label is plain English ("Organiser Admin"). A separate "Sign out" button (default cursor) sits above the chip in the sidebar with a logout icon. Sign out result: NOT verified (see top).

## Four-question table

| Step | (1) Where am I | (2) Main thing | (3) Progress | (4) Back | Observation |
|---|---|---|---|---|---|
| Magic link to /dashboard | "Events", sidebar Events active | 14 events list, "New event" | Row buttons Details / Edit / Check-in | Sidebar | Footer count mismatch (R3-5). |
| Staff chip | Sidebar bottom | Show who is signed in and role | Sign out button above | n/a | Static chip, clear. |
| /checkin | "Check-in: choose an event", sub text exactly as specified | Pick an event | Click a row | Sidebar | Rows lack state (R3-2). Empty state not reachable (events exist): not seen. |
| /events/<non-creator>/checkin (admin on `ZZ-FINAL member c1`) | Breadcrumb Events > event > Check-in, "NOT OPEN YET, Starts in 31d 7h" | Scan, code, walk-in | Scan and Enter code and both "Check in" row buttons are disabled with the sentence "Check-in has not opened yet. It opens 60 minutes before the event starts." (title plus aria-describedby). Walk-in opens a form with the same sentence and a disabled "Register & check in". | Close link, "Registrations →" cross-link | Header line correct for non-creator: "...To edit a person's details, open Registrations." Speakers empty text exact. Raw "✓" (R3-1). |
| /events/<creator>/checkin (admin on `UX03B pub admin`) | Same layout, 0 registrants | Same | Same | Same | Header line correct for creator: "...details or roles, open Registrations." Speakers empty text exact. "No registrants yet." |
| /events/<id>/registrations (non-creator editor) | "Registrations", list with filters All 3 / Registered 2 / Attended 1 / Cancelled 0 | Edit contact details | Edit button per row, "Check-in →" cross-link | Breadcrumb | Subtitle exactly: "Everyone registered for this event. Edit contact details here. To check people in, open Check-in." |
| Edit dialog, attended row | "Edit registration" dialog | Correct name or email | Full name editable; Email disabled with note "This person has already checked in, so their email cannot be changed. The name can." (aria-describedby set) | Cancel, close X | Clear, reason shown. Non-attended row (email editable): NOT reached. |
| /events/new | "Create event" with 7 numbered sections | Name, date, times, venue | "Blocks are ordered by start time." hint is shown above the agenda | Cancel | Venue pick by real click works; live line "Timezone follows the venue — Asia/Hong_Kong." appears (R3-3). Time pickers hard to drive; Save draft not pressed. |
| /events/<published>/edit | "Edit", status published | CPD accreditation only | Save | Breadcrumb | No lock sentence (R3-6). |

## What worked well

- Creator vs non-creator header copy on the check-in desk and the registrations subtitle are role-correct and match the brief word for word.
- Closed-window desk: disabled controls point at one shared note, so a screen reader hears the reason.
- Attended-row email lock explains itself.
- Venue picker now exposes combobox semantics and shows a live timezone line after a pick.

## Coverage gaps (not reached, 70-call cap)

- ux-member persona (all steps) and ux-body persona (read-only desk with disabled Check in buttons and reason; read-only registrations subtitle "...an organiser admin or member can edit them.", read-only check-in variant). Not seen at all.
- Walk-in success, duplicate code, wrong code messages, Speakers card with speakers: need a window-open event; I created none and the only fixtures are closed or far future. Not seen.
- Non-attended row edit (email editable) and the creator-only roles control in the dialog: not seen.
- Agenda out-of-order entry, Save draft, reload, order by start time, "hold released on click"; empty-start error "Every agenda block needs a start time.": not run (Save draft never pressed). Only the static hint "Blocks are ordered by start time." was seen.
- Venue picker: click a result while the next search runs; network-failure text "Venue search is not responding. Try again in a moment." (not triggered; text exists in `components/VenueSearchBox.tsx` [R]).
- `/settings` and Settings > Session sign out; `/analytics` (History) and the full spine create > publish > registrations > check-in > History: not walked. "Dies in silence" assessment of the spine therefore not possible this round.
- Sign out button: unverified (top of file).
- Keyboard-only and mobile width: not done.

## Tally

BLOCKER 0, MAJOR 1, MINOR 6 (R3-2 to R3-7), NIT 2. Tool calls: 70 of 70 (cap reached).
