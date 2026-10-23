# REVIEW CX-03 (user lens): `cn()` type-scale fix

Reviewer lens: first-time organiser, role `ux-admin` (already signed in), local stack, http://localhost:3100.
Evidence tags: [X] executed or measured in the browser this session; [I] inferred (source reading, the hand-back, or arithmetic on measured values).

## Verdict

CX-03 does what it says on the three spots it measured: the "Most popular" badge, the Manage buttons and the roster "Check in →" button now render at the token's 12px with 0.6px letter-spacing, and no primary (blue) button I could reach shows dark text on blue [X]. Nothing is a blocker.

Four things need a decision before this is called "looks right":

1. The hand-back says "the Manage row buttons no longer clip". For `ux-admin` the Check-in button on every Manage row is still clipped (27px of 93px hidden), at 1024 px and at 375 px [X].
2. The bulk "Cancel" button now shows its red label at 3.74:1 (light) and 3.79:1 (dark), under 4.5:1 at 12px [X]. CX-03's colour restoration is the likely reason the red label is visible at all [I].
3. The selected roster filter chip ("All (15)") is 2.37:1 in light and 2.14:1 in dark [X]. Probably not caused by CX-03 (see M3).
4. On /pricing in dark mode the "Choose Essential" and "Choose Enterprise" buttons are 2.33:1 [X]. Cause not established (see M4).

## Coverage, so nothing is over-claimed

- Light, 1024 px ("desktop" in this pane is 1024 px wide, not a wide monitor): /pricing, /dashboard/manage with one row ticked. Light, 375 px: /pricing, /dashboard/manage, checkin roster.
- Dark, 375 px: /pricing, /dashboard/manage (one row ticked), checkin roster, /dashboard, /events/new. Dark, 1024 px: checkin, screenshot only, no numbers. Styles do not change with viewport, so the dark numbers apply at both widths [I].
- Not sampled in light: /dashboard, /events/new, checkin at 1024 px.
- /login: the form was not reachable [X]. A signed-in session is redirected from /login to /dashboard. On http://127.0.0.1:3100/login (a no-cookie origin) the page styled correctly but the form stayed on "Loading…" (its JS did not hydrate), so the "Send magic link" button never rendered. Its contrast is inferred from source (`components/auth/MagicLinkSignInForm.tsx:107`: `min-h-11 … text-label-md text-on-primary!`, so 44px tall) plus the same `bg-primary` / `text-on-primary` token pair measured on the other buttons: 4.55:1 light, 7.59:1 dark [I]. Please check it by hand signed out.
- I did not click Export CSV, Delete or Cancel. Ticking a row is client state and was discarded on reload.
- I could not reproduce "before" (no before build). Every "was X before" below is from the hand-back or arithmetic on measured colours [I].
- Measuring method: `getComputedStyle` colour and background converted to sRGB through a canvas, translucent layers composited, WCAG 2.x relative luminance. Gradient backgrounds were excluded, so the dark hero card on checkin is not scored.

## Findings

### BLOCKER
None.

### MAJOR

**M1. Manage row: the Check-in button is still clipped for admins, and the hand-back's "no longer clip" does not hold.**
- Page: /dashboard/manage (also reachable from Programme rows). Role: ux-admin. Light and dark, 1024 px and 375 px.
- Seen [X]: on the LIVE row "F1-F5 Fixture 1792701327598" the Edit and Check-in buttons share a flex row inside a fixed `w-[116px]` column. Edit is 62px, Check-in 93px, gap 4px, so the pair needs 159px in a 116px column. Check-in's right edge is 27px past the card, which has `overflow:hidden`. The visible label reads "Check" with "-in" cut off; the screenshots at 1024 px and at 375 px show it. Same result in dark. All other row buttons fit (Details 116, Analytics 116).
- Why it matters: Check-in is the action an organiser wants on a live event, and it is the one that is cut. About 29% of the button is hidden. It is still tappable on its visible part, so the user is not blocked, but a half-word button looks broken.
- CX-03 effect: the 12px size helped (the pair was wider at 14px) but did not fix it. The hand-back measured as `ux-member`; if Edit is role-gated, Check-in is full width for that role and the clip never shows [I]. That would explain the claim; it does not make it true for admins.
- Fix: do not claim this closed. Stack Edit and Check-in, or widen the column to at least 160px, or drop the icons at this width. Needs a design call (UX-02/UX-03).

**M2. Bulk "Cancel" label is below 4.5:1 in both themes.**
- Page: /dashboard/manage, "N selected" bar. Role: ux-admin. 12px / 500.
- Seen [X]: light `#c0362c` on `#e6cfd2` = 3.74:1. Dark `#ec6a5e` on `#483335` = 3.79:1. Row Delete in dark is `#ec6a5e` on `#3f2523` = 4.53:1 (passes by 0.03). Row Delete in light was not measured (my de-duplication hid it behind the bulk "Delete").
- Why it matters: this is the destructive action, in a bar the user sees right after ticking a row. A red label at about 3.7:1 and 12px is hard to read for low-vision users and in sunlight.
- CX-03 effect [I]: the hand-back lists `ManageWorkstation.tsx:503` among sites where the destructive ink "was being evicted". If the label inherited dark text before, it was about 11.7:1 on this pink (arithmetic from the measured fill). CX-03 trades readability for the intended red. The fix is correct; the token pair under it is too weak at 12px.
- Fix: darken the destructive ink on the tint, or use the on-error-container token, so it reaches 4.5:1 at 12px in both themes (light needs about `#a82a21` or darker, to be checked). Do not revert the merger fix.

**M3. Selected roster filter chip is unreadable.**
- Page: /events/d52537d1-…/checkin, "All (15)" (also "Checked in", "Pending" when selected; `aria-pressed=true`). Role: ux-admin. 12px / 500.
- Seen [X]: light `#1a1a1a` on `#565656` = 2.37:1. Dark `#f0f0f0` on `#a6a6a6` = 2.14:1. The class list is `Button variant=secondary` (`bg-secondary text-secondary-foreground`), and `--secondary` is `#565656` with `--secondary-foreground` `#1a1a1a` in light (read from the page's CSS variables). In the screenshot the active chip is a dark grey pill with near-invisible text.
- Why it matters: this is the only indicator of which filter is on, on the main check-in page. A first-time organiser cannot tell which list they are looking at.
- CX-03 effect [I]: probably none in light, because the label colour is `#1a1a1a` both when inherited and when the token wins, so the rendering is the same before and after. It is a token mis-pairing that CX-03 does not touch. Nobody should "fix" it by touching `cn()`. (I did not check dark before and after.)
- Fix: pair `--secondary` with a foreground that reaches 4.5:1 in both themes, or give the selected chip a different treatment (e.g. primary-container fill, which already measures well elsewhere).

**M4. Dark mode: two of the three pricing plan buttons are illegible.**
- Page: /pricing. Role: ux-admin (page is public). 14px / 500, 32px tall.
- Seen [X]: "Choose Essential" and "Choose Enterprise" are `#1a1a1a` on `#555555` = 2.33:1 in dark. In light the same buttons are `#1a1a1a` on `#f5f5f5` = 16.03:1. The dark screenshot at 375 px shows a grey button with ghosted text.
- Why it matters: it is the main action of two of the three cards for anyone on a dark theme.
- CX-03 effect: unknown. The buttons are 14px, so not one of the size sites. A colour change is not ruled out [I]. The dev-lens reviewer can settle it by running this page with the old `cn()`.
- Fix: whichever it turns out to be, the dark foreground on this fill needs 4.5:1 or more. Same family as M3 (`secondary` pair), which suggests one token fix.

### MINOR

**m1. Touch targets: Manage row and bulk buttons are 32px tall, not 44px.** [X] All of Export CSV, Delete, Cancel, Clear, Details, Edit, Check-in, Analytics are 32px at 375 px, light and dark; the class list has `h-8` [X], so CX-03 did not change the height [I]. The roster "Check in →" is 44px (good). The login button is `min-h-11` [I]. Pricing CTAs and the header "Sign in" are 32 to 33px; Programme pagination buttons are 28px. 32px passes WCAG 2.2 target-size AA (24px); 44px is the stated bar for this review, and it is not met on Manage. Fix: `min-h-11` at the `sm` breakpoint and below for staff action rows.

**m2. Roster: raw `✓` shown to users.** [X] In the Status column for the checked-in attendee the cell reads `✓ 01 Oct 2026, 08:13` (screenshot at 375 px, and the DOM text node is the literal escape). Pre-existing, nothing to do with CX-03, but it is on the page the on-site team uses all day. Fix: render the character, not an escaped string.

**m3. Roster at 375 px: the table header overlaps itself.** [X] "ATTENDEE" is printed over a second header label ("ATCENDEE"-like), seen in the screenshot. The table is 406px wide in a 293px scroller, so the user has to scroll sideways for CODE and METHOD. The "Check in →" button (x 191 to 296) stays inside the visible part, so the main action is reachable. Cause not investigated; pre-existing [I].

**m4. Roster: success text under 4.5:1.** [X] The check-in time `01 Oct 2026, 08:13` is `#1e874b` on `#fafafa` = 4.35:1 at 12px / 600 (classes `font-label-md text-label-md text-[color:var(--success)]`). Misses by 0.15. Fix: darken `--success` slightly on light surfaces.

**m5. Dark mode: count badge on the "All" tab is unreadable.** [X] "69" is `#ffffff` on `#cfe2fa` = 1.32:1 at 11px. The class list has a literal `text-white` on `bg-[color:var(--on-primary-container)]`, which flips light in dark. Not one of the CX-03 sites [I]. Fix: use the matching "on" token instead of `text-white`.

**m6. Dark mode: /pricing uses two different primary blues.** [X] The header "Sign in" and the "Most popular" badge are `#0b1b3e` on `#7fb0f4` (7.59:1), but "Annual" and "Choose Professional" are `#ffffff` on `#0070f3` (4.55:1). In light all of them are `#0070f3`. Both pass AA; the mismatch is visible side by side in the dark screenshot. Probably a hard-coded colour on those two controls [I].

**m7. Bulk bar wording: "Cancel" next to "Clear".** [I, from the labels and screenshots; I did not click them to see whether a confirmation follows] "Cancel" (red, with a ⊘ icon) cancels the selected events, "Clear" empties the selection. A first-time user reads "Cancel" as "dismiss this bar". If there is a confirmation dialog, this is only a labelling issue. Suggest "Cancel events" or "Cancel N events".

### NIT

- n1. Disabled "Soon" navigation items (Accreditation, Communications) are 2.08:1 / 2.5:1 and the "Soon" pill 3.48:1 / 4.28:1 [X]. Disabled controls are exempt from WCAG contrast; noted because the grey-on-grey look is easy to read as "broken".
- n2. Dark /events/new: the date and time placeholder text ("Select time", "Open date", "Close date") is `#707070` on `#141414` = 3.72:1 [X]; days from other months in the calendar are 1.22:1 [X] (inactive).
- n3. Bulk bar hierarchy: Export CSV, Delete and Cancel have the same weight and size; only Cancel is tinted. There is no primary there, which is fine for a bulk bar. Delete is neutral while Cancel is red, which reads backwards [I].

## The four questions

- /pricing: where am I: clear (large "Plans & Pricing" heading, 39px). Main thing: the three plan buttons. Progress: "Choose Professional" is the clearly highlighted one. Back: header logo and "Home" / "Events" links. Dark mode weakens the first two plan buttons (M4).
- /dashboard/manage: where: "Manage events" 28px heading plus the active sidebar item. Main thing: open or run an event; "Check-in" is the key action on a live row, and it is the one clipped (M1). Progress: ticking a row reveals "N selected" with Export CSV, Delete, Cancel, Clear; clear and readable. Back: sidebar and header links.
- checkin: where: "UX Baseline Event A" 39px heading with breadcrumb and "Back to Event". Main thing: "Scan badge" (full-width primary, 64px, 4.55:1 light / 7.59:1 dark). Progress: roster "Check in →" buttons (44px, legible). Weak point: the filter state (M3).
- /login: not reachable; see Coverage.

## Contrast table (all [X] unless marked [I]; ratios are WCAG 2.x, normal text needs 4.5:1)

| Page | Element | Size/weight | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|---|---|
| all | Primary fill, header "Sign in" | 12.5/600 | `#fff` on `#0070f3` | 4.55 | `#0b1b3e` on `#7fb0f4` | 7.59 |
| /pricing | "Most popular" badge | 12/600 | `#fff` on `#0070f3` | 4.55 | `#0b1b3e` on `#7fb0f4` | 7.59 |
| /pricing | "Annual" toggle | 14/500 | `#fff` on `#0070f3` | 4.55 | `#fff` on `#0070f3` | 4.55 |
| /pricing | "Choose Professional" | 14/500 | `#fff` on `#0070f3` | 4.55 | `#fff` on `#0070f3` | 4.55 |
| /pricing | "Choose Essential" / "Choose Enterprise" | 14/500 | `#1a1a1a` on `#f5f5f5` | 16.03 | `#1a1a1a` on `#555555` | **2.33** |
| /dashboard/manage | "New event" | 13/600 | `#fff` on `#0070f3` | 4.55 | `#0b1b3e` on `#7fb0f4` | 7.59 |
| /dashboard/manage | Bulk Export CSV, Delete | 12/500 | `#1a1a1a` on `#eef2f7` | 15.50 | `#f0f0f0` on `#202529` | 13.60 |
| /dashboard/manage | Bulk Cancel | 12/500 | `#c0362c` on `#e6cfd2` | **3.74** | `#ec6a5e` on `#483335` | **3.79** |
| /dashboard/manage | Bulk Clear | 12/500 | `#565656` on `#f0f5fc` | 6.71 | not captured | - |
| /dashboard/manage | Row Details, Edit, Check-in, Analytics | 12/500 | `#1a1a1a` on `#f5f5f5` | 16.03 | `#f0f0f0` on `#191919` | 15.45 |
| /dashboard/manage | Row Delete | 12/500 | not measured | - | `#ec6a5e` on `#3f2523` | 4.53 |
| /dashboard/manage | "All" tab count "69" | 11/600 | white on navy (screenshot only) [I] | - | `#fff` on `#cfe2fa` | **1.32** |
| checkin | "Scan badge" | 16/700 | `#fff` on `#0070f3` | 4.55 | `#0b1b3e` on `#7fb0f4` | 7.59 |
| checkin | Roster "Check in →" | 12/500 | `#1c3c94` on `#f5f5f5` | 9.11 | `#7fb0f4` on `#191919` | 7.90 |
| checkin | Selected chip "All (15)" | 12/500 | `#1a1a1a` on `#565656` | **2.37** | `#f0f0f0` on `#a6a6a6` | **2.14** |
| checkin | Unselected chips, "+ Walk-in", "Enter code" | 12-16 | `#1a1a1a` on `#f5f5f5` | 16.03 | `#f0f0f0` on `#1c1c1c` | 15.01 |
| checkin | Check-in time (success green) | 12/600 | `#1e874b` on `#fafafa` | **4.35** | not captured | - |
| /events/new | "Publish event" | 14/500 | not sampled | - | `#0b1b3e` on `#7fb0f4` | 7.59 |
| /events/new | "Save draft", "Cancel" | 14/500 | not sampled | - | `#f0f0f0` on `#1c1c1c` | 15.01 |
| /login | "Send magic link" (`text-on-primary!`) | 12/500 | not reached; `#fff` on `#0070f3` [I] | 4.55 [I] | `#0b1b3e` on `#7fb0f4` [I] | 7.59 [I] |

Failing normal-text cases (under 4.5:1): Cancel (both themes), "All (15)" (both), Choose Essential/Enterprise (dark), "69" badge (dark), success time (light), dark placeholders. The blue primary pairs pass, but the light pair is only 0.05 above the line (4.55), so any change to `--primary` in light will fail it.

## Worked well

- "Most popular" badge: 12px / 600 / +0.6px, a 100 x 20 pill, reads as a badge, not a speck, on a 437px-tall card; no clipping or crowding at 1024 px or 375 px [X].
- No page-level horizontal overflow on any sampled page at 375 px (pricing, manage, checkin, dashboard, events/new) [X].
- The bulk bar wraps cleanly at 375 px (Export CSV, Delete / Cancel, Clear) with nothing clipped [X].
- Roster "Check in →": 44px tall, 105px wide, legible at 12px, inside the visible part of the scrolling table at 375 px; 9.11:1 light, 7.90:1 dark [X].
- No dark text on a blue fill on any reachable page: every blue button measured white (light) or navy-on-pale-blue (dark), which is the point of CX-03 [X].
- Neutral 12px buttons stay at 15 to 16:1, so the smaller size costs no legibility [X].
- /events/new dark: the primary and secondary actions keep a clear order (Publish event 7.59:1, Save draft and Cancel 15:1), each 44px tall [X].

## State left behind

Tab reset to the pane's desktop size with `eventar-theme` and my two helper keys removed from localStorage, then reloaded. Nothing staged, committed or edited other than this file.
