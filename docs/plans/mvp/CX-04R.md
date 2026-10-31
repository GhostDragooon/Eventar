# CX-04R specimen round: the Events home
STATUS: BUILT 2026-11-01 (picks 1f + 2a; see `handoff_20261101-mvp-execution-7.md`). The specimen route and notes below are the record of the round.

## Look at
Route: `/dev-preview-uiport/cx-04r` (dev only, gated by `app/dev-preview-uiport/layout.tsx`). Sample today is Monday 2 November 2026.

Set 1, composition (reply with an id; every option draws the decided tabs, card, tick-only-on-your-own-events, bulk bar, Create, four-item sidebar):
- 1b Card list with search and sort. Recommended first, because it is the only layout where card, tick box, per-card links and bulk bar already coexist, and search plus sort is how a 242-event list is walked. Costs: dates stop being the spine, calendar and format chips dropped, tall cards on a phone.
- 1a Agenda by day with the calendar rail (the Today view reworked; row becomes a card because a tick box and links cannot sit inside the shipped whole-row link).
- 1c Agenda by day with a two-week strip (lighter cousin of 1a; strip day cells are about 32 px, under 44 px).
- 1d Agenda with no rules, tone steps instead (design-taste-frontend and stitch-design-taste position).
- 1e Nested-shell cards (high-end-visual-design position; gpt-taste has no position on a list).

Set 2, motion (text specs only, nothing animated): 2a almost none (emilkowalski-motion, review-animations), 2b slow and weighted (high-end-visual-design; review-animations would block it, 800 ms on a many-times-a-day control), 2c scroll-driven (gpt-taste; needs GSAP, not in the repo).

Not drawn: phone navigation. ui-ux-pro-max argues for a bottom bar of four labelled tabs; the shell keeps its top strip (it already cuts off History at 309 px). Own round if wanted.

Each option has four frames: desktop Active, desktop Drafts (past-dated draft, two ticked rows, a colleague's draft with no tick box, bulk bar), phone Active, phone Drafts.

## Changed
- New: `app/dev-preview-uiport/cx-04r/page.tsx` (157 lines), `parts.tsx` (439 lines).
- Edited, prop-only: `components/shell/StaffShell.tsx` (+10 -4): optional `navItems` (defaults to the current list), optional `activeHref`, and `export` on `NavRow`. Production callers pass neither, so output is unchanged. `StaffNavItem` type exported.
- Real components: StaffShell, NavRow, BrandMark, Button and buttonVariants, Input, Select, StatusPill. Redrawn from product class strings because not exported: agenda row, event card, month calendar, bulk bar. Phone frames draw the shell strip from the real NavRow because media queries read the window, not the frame.
- No PICKS.md change. Nothing committed.

## Tests
- eslint on `app/dev-preview-uiport/cx-04r` and `StaffShell.tsx`: exit 0. `tsc --noEmit`: exit 0. vitest `StaffShell.test.tsx` and `app/dev-preview-uiport`: 16 passed. No route test added (UX-02 has none).
- Executed in the browser on :3100: 375 px `scrollWidth` 375 = `innerWidth`; console errors none; no "Programme" or "Manage" in page text; 21 frames render.
- Contrast, transitions finished, light / explicit `.dark` class: active tab count badge 4.55 / 7.59 after fix. Before the fix it was 1.32 in dark (`text-white` on `--on-primary-container`, copied from the shipped tabs and calendar), so the specimen uses `bg-primary text-on-primary`. Other text: 7.03 to 16.67 light, 7.29 to 15.58 dark.
- Not verified: OS-dark emulation does not switch the theme (the app stamps `.light`), so dark was checked by setting `.dark` on `<html>`. Motion is text only. Phone frames at a 375 px window are 309 px wide.

## Needs Ivan
1. Pick a composition id from 1a to 1e, and a motion id from 2a to 2c. Recommendation is 1b and 2a.
2. The shipped Manage tabs and mini calendar use `text-white` on `--on-primary-container`: 1.32:1 in dark. The build should use the token pair, not copy them.
3. StaffShell still prints an "Admin" caption above Settings; the four-item doctrine list does not mention it. Keep or drop?
4. Shipped Manage buttons and tabs are shorter than 44 px; specimens use 44 px. Confirm.
