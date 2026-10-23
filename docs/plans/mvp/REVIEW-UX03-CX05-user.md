# User-lens review: UX-03 (confirm before publishing, saved banner, next steps) and CX-05 (accreditation lock)

Reviewer: Claude Sonnet 5.5 (user-lens agent), 2026-10-23. Local stack, http://localhost:3100. Uncommitted tree under review. Cold-start journey, no code review.
Evidence tags: [X] executed (I saw it in the browser or read it from the live DOM), [I] inferred, [R] read from a hand-back.
Design is Ivan's picks (a1, c1, d1); I judged whether the built result is understandable, not whether the design is right.

## Coverage and limits (read first)

Budget was 55 tool calls; I used about 54. What ran:
- ux-body: create form, Save draft (empty-name error, then a real save), edit page of the saved draft, details page with `?published=1` on that draft.
- ux-admin: edit page of that draft (published through the dialog), dirty banner and refusal, Save changes, keyboard dialog walk, double confirm, landing page, browser Back, reload of the landing page, `?published=1` on another person's draft, empty-form Publish on the create form, 375 px dialog, one dark-mode load.
- NOT run: ux-member (journey 3). Budget ran out before a third sign-in. CX-05 for a member is only covered by ux-body, which gets the same lock path ([R] hand-back says the member walk showed the same two notes). ux-admin through the create form to Save draft was not done end to end: my scripted form fill could not set the venue and date reliably, so I used ux-body's real Save draft for the landing, and loaded the admin edit page with `?saved=1` to read the admin wording (synthetic entry).
- Not seen: the banner and next-steps card at 375 px, the dialog in dark mode, the "Review and publish" inline button's action, the Copy link confirmation, a truly cross-organisation event with `?published=1` (the "other person's" event was another user's draft in the same organisation).

Harness notes (not product findings): setting input values from script did not register in React inputs; a script `.click()` on Publish for the empty form showed no error within 2 s while a real keyboard activation did (see F9). If the dev lens knows validation depends on trusted events, say so; I did not resolve it.

Fixture created: event "UX03R Body Draft edited", id 73b132a6-39e3-4094-bbc4-5154931b1266. Created by ux-body (draft), edited and published by ux-admin. Audit rows are permanent. Nothing else was saved.

## Findings, ranked

Counts: BLOCKER 0, MAJOR 1, MINOR 10, NIT 3.

### MAJOR

**F1. The "unsaved changes" signal is off screen exactly when you need it, and the Publish card still says "Ready to publish?" [X]**
- Page and role: `/events/<id>/edit`, ux-admin.
- What I did: opened a saved draft (banner "Draft saved. Review and publish when you are ready."), clicked into the event name in section 2, typed " edited", then took a screenshot.
- What I saw: the banner did change to "You have changes that are not saved." in the DOM ([X] live region text), but it sits above the progress strip and was scrolled out of view while I edited. The sticky Publish card on the right still read "Ready to publish?" with the same full-strength blue "Publish event" button. Only after I pressed Publish did the card show a red line: "You have changes that are not saved. Save them first, then publish." (clear and well placed). I then pressed Save changes and the card returned to normal.
- Why it matters: a first-time organiser who just fixed a typo sees an inviting primary button, presses it, and is refused. The refusal copy is good, but the page told them nothing while they were typing, and nothing nudges them toward the Save changes button at the bottom of a long form.
- Proposed fix: reflect the dirty state on the Publish card as soon as it happens (heading "Save your changes first", button `aria-disabled` with the reason tied by `aria-describedby`, or a one-line amber note), and keep the existing refusal as the backstop. Alternative: make the banner sticky while dirty.

### MINOR

**F2. Same lock sentence twice, 160 px apart, on the edit and details pages for roles that cannot set accreditation [X]**
- Page and role: `/events/<id>/edit` and `/events/<id>/details`, ux-body (CX-05 treats organiser_member the same way [R]).
- What I saw: "Your role can't set accreditation. An organiser admin can add or change it from this page." inside the CPD accreditation card, then the identical sentence again directly under the card (where the wizard entry used to be). The card also still shows a greyed "Accrediting body" select listing 22 bodies, a "CPD hours" box and a disabled Save. The hand-back already notes the repeat.
- Why: reads like a rendering bug, and a disabled 22-item select invites a try. "An organiser admin" names who but gives no route to ask them.
- Fix: show the note once (keep the card's note, drop the wizard's when the card already shows it), render the locked select as plain text ("Not accredited") instead of a disabled control.

**F3. "Draft saved" banner is placed under the large accreditation card and does not take focus [X for desktop, I for 375 px]**
- Page and role: `/events/<id>/edit` after Save draft, ux-body (real save) and ux-admin (`?saved=1`).
- What I saw: after the redirect the first thing on screen is the title, DRAFT badge and a big CPD accreditation card; the banner is the next block down (about 560 px from the top for ux-body, still above the fold at 1024x768). Focus stays on the document body; the banner is only a polite live region. The Published banner on the landing page, by contrast, is focused.
- Why: "where am I and did it save" is answered one card late; a keyboard or screen-reader user gets a less certain confirmation after Save draft than after Publish. On a phone the banner is certainly below the first screen [I].
- Fix: put the banner directly under the title block, above the accreditation card, and give it the same focus treatment as the Published banner.

**F4. Two "saved" messages after Save changes [X]**
- Page and role: `/events/<id>/edit`, ux-admin, after pressing Save changes on a draft.
- What I saw: two live regions, both polite: the banner "Draft saved. Review and publish when you are ready." and the form's "Saved." Focus stays in the name field.
- Why: redundant, and a screen-reader user hears two confirmations that read slightly differently ("Draft saved" vs "Saved").
- Fix: suppress the form-level "Saved." when the page banner is showing.

**F5. Address-bar flags are inconsistent and stale [X]**
- Page and role: `/edit` and `/details`, ux-admin.
- What I saw: after Save changes the address bar read `.../edit?saved=1` again (the hand-back says the flag is removed on arrival; it is removed on a fresh arrival but came back after an in-page save). The landing page keeps `?published=1` in the address permanently; reloading shows "Published. Your registration page is live." and takes focus again.
- Why: a bookmark, shared URL or refresh days later repeats a one-time confirmation. Harmless but it can read as if you just published again.
- Fix: strip `published` the way `saved` is stripped (`router.replace`), and strip `saved` after the in-page save too.

**F6. After publishing, the page offers Edit and shows padlocks, but nothing explains what is locked [X for button and padlocks, I for the reason]**
- Page and role: `/events/<id>/details?published=1`, ux-admin; then browser Back to `/edit`.
- What I saw: the dialog promised "Details cannot be edited after publishing yet". The landing page then shows a primary-looking "Edit" button and small lock icons beside the REGISTERING badge, the date and the venue, with no caption. Back from the landing page goes to the edit page of the now PUBLISHED event: PUBLISHED badge, no Publish card, only the accreditation "Save" button; the dialog's wording ("Details cannot be edited") is not on that page (I read the first part of it, not the whole form).
- Why: an organiser who just noticed a typo clicks Edit and finds a page that does not say why they cannot change it. Back being safe (no second Publish, no error) is good.
- Fix: one sentence under the status badge or on the edit page: "Published events are locked. Contact support to change date or venue." (whatever the real rule is), and label the padlocks (title text or visible caption).

**F7. "What to do next" has one action; the other two rows are information [X]**
- Page and role: landing page, ux-admin.
- What I saw: "Share the link" (the registration URL as plain text, plus a 44 px Copy link button); "Registrations show in the Registered count as people sign up."; "Check-in opens at 30 Oct 2026, 08:00, 60 minutes before the start." The only way to open the live registration page is the "Public" button in the header, which the card does not mention.
- Why: it does answer "is it live and who do I tell", but a first-time organiser has no step to confirm the page looks right. The hand-back already flags the missing Registrations link (UX-04).
- Fix: add "View your registration page" (link to the same target as Public) as the first row; make the URL itself a link.

**F8. The dialog gives the check-in time with no timezone [X]**
- Page and role: Publish dialog, ux-admin.
- What I saw: "Check-in opens at 30 Oct 2026, 08:00, 60 minutes before the start." The page header says "(Asia/Hong_Kong)", the dialog does not.
- Why: an organiser in another timezone reads 08:00 as their own. The create form already tells them times are in the venue's zone, but the dialog is the last thing they read before it goes public.
- Fix: append the zone ("08:00 Hong Kong time") using the event's timezone, which the dialog already uses to compute it.

**F9. Publish on an incomplete create form reports one error at a time and jumps a long way [X for first error, I for cascade]**
- Page and role: `/events/new`, ux-admin (empty form) and ux-body (Save draft with no name).
- What I saw: pressing Publish on the empty form (real keyboard activation) opened no dialog and scrolled about 1,700 px up to a red banner under "2. Basics": "Add the event basics (name) to continue." Focus moved to the message. It names only the name; date, times and venue are also required and the message does not say so. Correct: no dialog, nothing written.
- Why: after fixing the name the organiser meets the next error, and "(name)" in brackets reads as jargon next to a field labelled "Event name".
- Fix: list everything missing in one message ("Add an event name, date, times and venue to continue") and link each item to its field.

**F10. Body administrator can save but never publish, with no in-product route to the person who can [X]**
- Page and role: create form and edit page, ux-body.
- What I saw: before saving, the create form says "Your role can't publish events. Save a draft and ask an organiser admin to publish it." under the buttons and has no Publish button (the reason is clear and appears twice, once under CPD accreditation). After saving: banner "Draft saved. Publishing needs an organiser admin." plus a card "Publishing needs an organiser admin / Your role can't publish events. / Save your changes, then ask an organiser admin to publish this draft." Three variants of the same sentence in one viewport.
- Why: the reason is understandable and Save draft works, but the user is left to find an organiser admin outside the product. The card heading is a statement, not a next step.
- Fix: once is enough (banner or card). Add a next step: a link to the team list, or a "Copy link to this draft" so they can send it.

**F11. On a phone the Publish card is at the very bottom of the long form [X]**
- Page and role: `/edit`, ux-admin, 375 px.
- What I saw: the card sits after the last form section, directly above the footer; the first screen is nav, breadcrumb, title and the accreditation card. The dialog itself is fine (see Worked well). I did not see the banner at 375 px, so I cannot say whether its "Review and publish" button jumps to the card.
- Why: the main action is a long scroll away unless that banner button scrolls to it.
- Fix: confirm the banner button scrolls to the card; consider a compact "Publish" row near the top on narrow screens.

### NIT

**F12. Three names for one action [X].** Banner "Review and publish", card "Ready to publish?" with button "Publish event", dialog "Publish this event?". Known (hand-back). Pick one noun phrase.

**F13. Icon ligature text inside live regions and the dialog [I].** `innerText` of the status region reads "check_circle | Draft saved. ..." and of the dialog "public | Your registration page goes live. ..." / "lock | Details cannot be edited ...". innerText ignores `aria-hidden`, so this may be fine; confirm the icon spans are `aria-hidden` so a screen reader does not say "check circle".

**F14. Three save-like buttons on the edit page [X].** "Save" (accreditation card, 32 px tall, desktop), "Save & Preview", "Save changes". A first-time user cannot tell that the top Save covers only accreditation. Rename the card's button "Save accreditation".

No em-dashes in any new UX-03 or CX-05 copy I read (banner, dialog, card, lock notes, next steps). Em-dashes remain in older copy (for example the create form's "Leave blank for unlimited — registration then closes...").

## Per-page answers

| Page / role | Where am I | Main thing to do | How do I progress | How do I get back |
|---|---|---|---|---|
| `/events/new`, ux-admin | "Create event" heading, breadcrumb, 6-step strip. Clear. | Fill name, date, times, venue. Intro: "Use Save draft to keep working on it, or Publish event when it is ready to go live." Clear. | Save draft or Publish event; an incomplete Publish scrolls to one error (F9). | "Back to Programme", breadcrumb, Cancel. Clear. |
| `/events/new`, ux-body | Same. | Same, but only Save draft. Reason given twice before saving. Clear. | Save draft only; no route to publish (F10). | Same. |
| `/events/<id>/edit` right after Save draft (ux-body real, ux-admin `?saved=1`) | DRAFT badge and title are clear. The banner is one card down (F3). | Admin: Publish event card, bottom of the first screen. Body: nothing to do but wait for an admin. | Admin: Publish; dirty refusal is good once pressed (F1). Body: dead end (F10). | Breadcrumb, Back to Programme. Clear. |
| `/events/<id>/edit` dirty, ux-admin | Same. | Save changes. | Card still says "Ready to publish?" (F1). | Same. |
| Publish dialog (desktop and 375 px) | "Publish this event?" with the event name. Clear. | Confirm or Keep editing. Facts listed: public, registration opens now, check-in 08:00, cannot edit (no timezone, F8). | Publish event, which lands on the details page. | Keep editing, X, Escape, all return focus to the Publish button. Clear. |
| `/events/<id>/details?published=1` right after publish | "Published. Your registration page is live." in a focused banner under the title. Clear. | Share the link (Copy link). | Public button for the live page; the card does not point there (F7). | Programme breadcrumb, sidebar. Back goes to a safe edit page (F6). |
| `/events/<id>/details?published=1`, draft or another user's draft | Normal details page, DRAFT badge. | n/a | n/a | Normal. No banner and no false "Published" claim. |
| `/edit` and `/details` for ux-body, accreditation area | CPD accreditation card. | Nothing to do here. | "An organiser admin can add or change it" appears twice (F2). | Normal. |
| ux-member | Not walked (see Coverage). | | | |

## Worked well

- Dialog keyboard behaviour is complete [X]: opening from the keyboard puts focus on the Close button (named "Close Publish this event?"), Tab cycles Close, Keep editing, Publish event, back to Close; Shift+Tab goes backwards; Keep editing and Escape both close it and return focus to the Publish button; `aria-modal` true, labelled by the title, described.
- Dialog copy is plain and specific: what goes public, that registration opens now, when check-in opens, and the one-way warning [X].
- Pressing the confirm twice quickly published once and landed once; no error flash [X] (database duplicates are the backtest's job).
- The dirty refusal text next to the Publish button is clear and has `role=alert` [X].
- Browser Back after publishing lands on the edit page with a PUBLISHED badge and no Publish card, so no second publish is possible by accident [X].
- `?published=1` on a draft shows no banner; it does not lie [X].
- Published banner is focused, so it is announced; the share URL and 44 px Copy link are right where an organiser looks first [X].
- 375 px: no horizontal overflow (scrollWidth 375), dialog 343 px wide with 16 px gutters and 382 px tall in an 812 px screen, Close, Keep editing and Publish event all 44 px tall [X].
- Dark mode loads dark (page background rgb(10, 10, 10)), edit page text legible [X]; the dialog in dark was not verified.
- The body-admin reason is stated before the user does any work, on the create form [X].

## State left behind

Desktop viewport, light scheme, `eventar-theme` removed from localStorage [X read back null]. Signed in as ux-admin@eventar-review.invalid. The tab is on `/events/new` with an untouched empty form.
