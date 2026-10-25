# UX-FU1 Pending front-end findings from review round 1, as one specimen round
STATUS: DONE (specimens), awaiting pick. Nothing is applied. 12 surfaces, 36 options, my recommendation is always letter `a` and is listed first on the page.
Look at: Route `/dev-preview-uiport/ux-fu1` on :3100 (dev only, gated out of production by the sandbox layout). The :3100 server (eventar-noreview) was already running from the queue session; I left it running.
Changed: `app/dev-preview-uiport/ux-fu1/page.tsx`, `frames.tsx`, `live.tsx`, `defects.tsx`, `measure.tsx` (new, specimens only, no product code), this file.
Tests added or changed: none (sandbox page, sample data, nothing wired).
Gates: tsc clean · eslint 0 errors/0 warnings on the new files · `check:ui-colours` and `check:ui-primitives` fail at HEAD on files this card does not touch, 0 hits in ux-fu1 [X] · vitest, next build and test:rls not run (no product code, no database).
Live check: :3100, public route, no sign-in. Desktop 1024 px; 375 px (page scrollWidth 375 = innerWidth); dark theme (all measured values read in both themes); console: no errors. [X]

## Answer in one line
Accept every recommendation: **1a 2a 3a 4a 5a 6a 7a 8a 9a 10a 11a 12a**. Or name the ids you want different. Record them in `PICKS.md` as `<surface> (<letter>): <option id>, <date>` and add exceptions on the same line (UX-01 precedent).

## The twelve surfaces (recommendation first; full cost lines are on the page)
1. **Unsaved state on the Publish card (F1).** 1a card follows the form (heading "Save your changes first", button marked unavailable with its reason, link to Save changes). 1b show today's refusal early (smallest). 1c sticky unsaved bar with Save (largest, top bar instead of UX-01's rejected bottom bar).
2. **Publish on a phone (F11).** 2a Publish button in the title row (DOM order, works on every visit). 2b leave it at the bottom (the banner jump exists only right after a save). 2c card first on phones (CSS order breaks tab order).
3. **Draft saved confirmation (F3, F4, m8).** 3a one banner directly under the title, focused on arrival, the form's own "Saved." dropped. 3b keep the position, dedupe and add focus. 3c save state beside the title, no banner.
4. **One name for Publish (F12).** 4a "Publish" everywhere (banner link, card heading, button, dialog). 4b "Review and publish" then "Publish event". 4c keep the three names. F14 ("Save accreditation") is applied in all options: a rename, nothing to decide.
5. **Locked accreditation (F2 and the creator rule).** 5a one note, values as plain text, no Save. 5b keep disabled controls, one note. 5c one summary row with a Why link.
6. **After publishing, what is locked (F6).** 6a one caption under the header plus the same on the edit page. 6b label each padlock. 6c "Why is this locked?" disclosure.
7. **After publishing, next steps (F7).** 7a one row: your page, Open and Copy link. 7b separate first row "View your registration page". 7c action in the banner.
8. **Create form, incomplete Publish (F9).** 8a one summary under the buttons listing everything missing, each item a link. 8b errors beside each field plus a count. 8c a checklist that fills in.
9. **Body administrator route to an admin (F10).** 9a copy link to this draft. 9b email this draft (mailto). 9c link to the team list (not verified for this role).
10. **Manage row, Check-in clipped (M1).** Measured: today Check-in sticks out of its 116 px column by 44 px [X]. 10a 160 px column, pair sized by content (148 px still overhangs by 12 px [X]). 10b stack Edit and Check-in. 10c Details and Check-in, rest under More.
11. **Bulk Cancel contrast (M2).** Measured today: 3.78:1 light (reviewer 3.74, reproduced) and 4.42:1 dark (reviewer 3.79, not reproduced); 12 px text needs 4.5:1, so it fails in both [X]. 11a dark red ink on the pale fill, one class on the shared variant: 6.39 light, 7.76 dark. 11b solid red: 5.52 / 6.40. 11c outlined red: 8.39 / 9.83.
12. **Selected chip contrast (M3).** Measured today: 2.37:1 light, 2.14:1 dark (reviewer's numbers reproduced) [X]. Root cause [R, confirmed by the numbers]: `--secondary-foreground` points at `on-secondary-container` while the Button's `secondary` variant fills with `--secondary`, a mismatched pair. 12a fix the pair in the token: 7.34 / 8.13, and it repairs all four users of `variant="secondary"` (roster chip, speaker check, multi-select chips, save toggle). 12b container tone plus border: 16.53 / 16.57 (fill alone is 1.10:1 against the page). 12c blue container like selected plans: 9.39 / 14.31.

## Finding withdrawn: M4 (dark /pricing "Choose" buttons)
Not a product defect [X]. In the Browser pane `document.timeline.currentTime` is 0: the animation timeline does not advance, so `Button`'s 150 ms colour transition stays on its first-paint (light) values. Finishing the transitions makes the same buttons read `#f0f0f0` text and a `#262626` border. The review measured in the same pane. Not checked: a real Chrome window, where a ≤150 ms light-to-dark flash on first paint is possible if the dark class lands after first style calculation (the transitions exist, so something changed after first style). Same cause explains late hydration in the pane: effects only ran after the first input. Recipe for any future colour measurement in this pane: `document.getAnimations().forEach(a => a instanceof CSSTransition && a.finish())` before reading computed styles. Saved to memory.

## Pipeline record (locked order, all run) and where skills disagreed
impeccable-design-polish → hallmark (component scope: no macrostructure, no theme rotation, existing tokens preserved; audience, use and tone inferred: organisers at HK CPD event teams, in-product surfaces, utilitarian) → frontend-design → stitch-design-taste → design-taste-frontend → high-end-visual-design → gpt-taste → ui-ux-pro-max → emilkowalski-motion. `/review-animations` is reserved to you and was not run.
Disagreements, and how each was handled:
1. 5a vs 5b: ui-ux-pro-max (read-only is not disabled) vs ponytail (delete one line) → both are options.
2. 11a vs 11b: stitch-design-taste / high-end-visual-design (clear hierarchy, solid primary) vs hallmark (locked tokens, no new colour) → options 11a/11b/11c.
3. 12a vs 12b vs 12c: ponytail (root cause in the token) vs design-taste-frontend (tone step) vs stitch-design-taste (one accent for state) → three options.
4. Container style, eyebrow tags, GSAP/scroll motion, hero rules (high-end-visual-design, gpt-taste, design-taste-frontend vs the shipped system): settled by UX-01 d1 and Q41 calls 4 and 5, not asked again. No specimen has an eyebrow, a gradient, a glow or a double bezel.
5. Page-level rules that do not apply to in-product cards and dialogs (inline-image hero, 2-line H1, picsum images, AIDA structure) were skipped on purpose.

## Motion spec to carry into the builders (stage 5)
Same as UX-01: 150 ms opacity crossfade for in-place swaps (surface 1 card heading and button, surface 3 banner), never animate height or width, buttons keep `active:translate-y-px`, nothing on a timer, everything driven by the action's result (D15), reduced motion removes travel and keeps the content. Focus on arrival only for the banner (3a), never for an in-page save, so typing is not interrupted.

## Findings (investigated; evidence tags)
- Surface 1 live "Today" runs the shipped `DraftSavedBanner` and `PublishDraftButton` against the shipped draft store: typing shows the banner line only; the card gives its reason only after pressing Publish [X].
- `variant="secondary"` is used by `RosterClient.tsx` (filter chip), `SpeakersCard.tsx`, `MultiSelectCombobox.tsx` and `SaveToggleButton.tsx` [R]; 12a changes all four, which is the point and also the blast radius.
- F9 is the create form (`/events/new`, `NewEventForm.tsx` line 363), not the Publish card; the missing-fields list needs the form's own validation to enumerate every required field [R].
- Surface 9c: `app/settings/team/page.tsx` computes an admin flag [R]; what a body administrator sees on it was not verified.
- Surface 7 and 9 copy that mentions Open, Copy link and clipboard failure reuse `PublishedNextSteps.tsx` behaviour [R].
- Not drawn: the Manage row at 375 px (the review did not check it either), the Registrations list (UX-04).
- Specimen frames draw private pieces of pages (edit page `ActionCard`, header, accreditation card; details header; create footer; Manage action column) as copies, listed on the page. Everything else is the shipped `Button`, `buttonVariants`, `StatusPill`, `DraftSavedBanner`, `PublishDraftButton` and tokens.

Deviations from the card, and why: none; the card was the review's pending list. Specimens use the UX-01 helpers (`ux-01/parts.tsx`) without changing them. Note: a `recommended` option's `order-first` in `ux-01/parts.tsx` moves it above the section heading when it is a direct child of `Section`, so this round wraps options in an `Options` box; UX-01's page does not, and its recommended options may sit above their headings [R, not re-checked].
Open questions for Ivan: the twelve picks. Also: should 5 and 6 wait for the UPD card's final rule before wording is chosen?
Needs from other cards: UPD (updateEvent draft gate and creator predicate) for the exact lock wording in 5 and 6. Unblocks: any builder card for surfaces 1 to 12 once picks are recorded.
Executor: Claude Sonnet 5.5, Claude Code (second session; the queue session is MVP execution queue continuation)
Committed: no (untracked: `app/dev-preview-uiport/ux-fu1/`, this file)
Fixtures created: none. Browser pane: `eventar-theme` set to dark for the dark check and removed again; no sign-in; viewport emulation reset to desktop. `scratch-demo/locks/dev-3100.lock` taken and released; server left running for the queue session.
Suggested commit message: docs(ux): UX-FU1 specimen round for the pending review-round-1 front-end findings
