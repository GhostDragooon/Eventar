---
name: eventar-phone-nav-bottom-bar
description: Use when moving Eventar's phone nav to a bottom bar.
category: frontend-design
---

# Eventar phone nav: logo strip on top, glass pill fixed at the bottom

Below 640px (`max-sm:`), the top nav pill is hidden. Keep only the logo strip at the top, and let it scroll away. Put Events, Organisers and Log in in a glass pill fixed to the bottom edge, 10px above the edge plus the safe-area inset, spread evenly. Ivan asked for this on 2026-11-21: compact, logo up top, no top bar.

- Do not turn the phone nav back into a horizontal scroll strip. The three labels fit at 375px with no overflow.
- The page root under the nav adds `max-sm:pb-[5rem]` so footers clear the bar. Apply it in each shell that renders the bar (`SiteShell`, `PublicShell`, and any page that uses its own root such as `app/page.tsx`).
- Desktop (640px and up) keeps the sticky top pill. After any edit, measure it: sticky at 10px, 51.5px tall, label centres level.
- The logo renders twice (phone strip and in-pill mark). Tests must query both; see `responsive-duplicate-control-tests`.
- Scope: Ivan said not to spend time on other phone polish. Leave other mobile issues (Live chip, long-title clipping) open unless he names them.
- Frames: the dev-only Review-mode banner and the Next badge sit in the bar's corner. Hide them with injected CSS for the frames only, and say so in the caption.
