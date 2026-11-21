---
name: eventar-phone-nav-bottom-bar
description: Use when editing Eventar's phone bottom nav bar items.
category: frontend-design
---

# Eventar phone nav: logo strip on top, glass pill fixed at the bottom

Below 640px (`max-sm:`), the top nav pill is hidden. Keep only the logo strip at the top, and let it scroll away. A glass pill fixed to the bottom edge holds the items, 10px above the edge plus the safe-area inset, with equal widths.

- Current items: `Events` and `Log in`. The Organisers item was removed on 2026-11-22 (Ivan: remove it). Measured at 375px: two items, 160.5px each, insets 9px left and right, gap 0. Read these as pane numbers.
- Current page only: the item for the page open is highlighted, and no other item carries a tint. A detail page (`/events/<id>`) highlights nothing. `/events` highlights `Events`. Remove any tint on `Events` from a detail page. The CLAUDE.md phone bar rule says the same.
- Do not turn the phone nav back into a horizontal scroll strip.
- Equal widths: every item gets the same width class (`flex-1`). If a variant ever shows a third item, measure with it shown and hidden at 375px and 320px. Item widths must match within 1px, and left and right insets must match.
- The page root under the nav adds `max-sm:pb-[5rem]`. Apply it in each shell that renders the bar.
- Desktop (640px and up) keeps the sticky top pill. After an edit, measure it: sticky at 10px, 51.5px tall, label centres level.
- The logo renders twice (phone strip and in-pill mark). Tests must query both; see `responsive-duplicate-control-tests`.
- Scope: leave other mobile polish open unless Ivan names it.
- Frames: hide the Review banner and the Next badge with injected CSS, for frames only. Name the hidden overlay in the caption.
- The Browser pane floors the viewport. A 320px request can read 332px. Claim 320px only from a 320px iframe, or caption the real width.
- Spacing is the repeat complaint on this bar. Put the numbers in each frame caption before `SendUserFile`: item widths, gaps, insets, and the width tested.
- Measure at 320, 375 and 430px, with two items and with three, before the frame is sent. A reply that ends "phone width isn't checked" is not ready: measure the width first, then send.
