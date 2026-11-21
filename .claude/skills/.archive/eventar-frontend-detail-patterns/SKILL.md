---
name: eventar-frontend-detail-patterns
description: Use when a nav label, icon, scroll row or filename jumps.
category: frontend-design
---

# Eventar: fix small UI jumps with the defined detail classes, not inline re-derivations

Reach for the existing `app/globals.css` class before writing a new fix. Each one below was approved on the 2026-11-19 styling and typography round.

- **Active label changes weight** (`font-medium` to `font-semibold`): wrap the label in `reserve-bold` with `data-text={label}`. The hidden semibold copy holds the width, so siblings never shift. The weight must match `font-semibold`.
- **Horizontal scroller** (filter row, tab strip; the phone nav is a bottom bar now, see `eventar-phone-nav-bottom-bar`): `scroll-fade overflow-x-auto overflow-y-hidden` plus a ref and `useScrollFade(ref)` from `lib/useScrollFade.ts`. `overflow-x-auto` alone forces `overflow-y` to `auto`, so a classic-scrollbar browser draws a vertical bar on the row. On 2026-11-20 that bar was the stray line in the nav, fixed in `components/shell/SiteNav.tsx`. The mask fades only the side with hidden content. On a vertical nav at `md:` and up, add `md:[mask-image:none] md:[-webkit-mask-image:none]`. Never centre a scrolling row with `justify-center`: the leading overflow lands at a negative x and the first item cannot be scrolled to. Use `justify-center-safe`. On 2026-11-20 the `/events` category tabs moved "All" from x=-11 to x=24 at 375px after this change.
- **Icon state swap**: stack both icons inside `<span className="icon-swap">`, each `aria-hidden`, with `data-state="in"` on the active one and `data-state="out"` on the other. Do not swap with a conditional render. Icon weight follows the label through `.font-semibold`, so set no per-icon weight.
- **Long filename**: split base and extension. Base gets `min-w-0 truncate`, extension gets `shrink-0`. The full name stays in `title` and the accessible name.
- **Card title**: `line-clamp-3`. The link's accessible name stays the full title.
- **Nested corners**: inner radius = outer radius minus padding. A 12px panel with 4px padding takes `rounded-md` (8px) rows. Dropdown panels use `bg-popover`, which steps up one tone in dark.
- **Gradients and `color-mix`**: interpolate with `in oklch`. Leave mask-image gradients alone.
- **Full-height shells**: `min-h-dvh` and `md:h-dvh`, not `min-h-screen`. The print poster page is the exception.
- **Abbreviations**: `<abbr>` only, with no dotted underline and no small caps (Ivan, 2026-11-20). Acronyms otherwise stay plain.
- **Hyphenation** in narrow running text: `prose-hyphen`.
- **Tap target under 44 px** (2026-11-20): `tap-44` on a header, brand or footer link gives a 44 px hit area without changing the look. Form inputs and the submit button take `min-h-11` at the call site, because the shared Input and Button default to 32 px. Measure every interactive element at 375 px before reporting the fix.

- **Nav labels sit at different heights** (one up, one down): centre each nav item with `inline-flex items-center` on the item in `components/shell/SiteNav.tsx`. Do not re-edit the shared `.reserve-bold` ghost in `app/globals.css` to fix it. The first ghost fix passed in the Browser pane and still showed one label higher in Ivan's browser. Measure each label's line centre against the pill centre, and ask for a render from his browser before calling it fixed.

Verify each change at 375px with `document.documentElement.scrollWidth` equal to `innerWidth`, in both schemes, then run the dark-parity test (`app/globals.test.ts`) and `pnpm run check:ui-colours`.
