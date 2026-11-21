---
name: eventar-login-door-labels
description: Use when editing Log in, Organiser log in or /login links.
category: frontend-design
---

# Eventar: no Organiser item in the header; the landing pill is the only organiser door

The public header shows one login link: attendee `Log in` to `/account/sign-in`. No Organiser item exists at any width. Ivan removed it on 2026-11-22. Doctrine 2026-10-30 section 1 never asked for it: the 2026-11-01 reading "both doors reachable from the public chrome" was wrong, and section 1 now carries a clarification saying so.

- The organiser door is `/login`. It is reached from the landing `/` pill (`AudienceProvider` and `LandingNav`) and from the wrong-door helper below. No public header, nav, footer, or sign-up card links to `/login`.
- Tests assert absence: no link named `organiser log in`, and no link with `href="/login"` on `SiteShell`, `PublicShell`, or `/account/sign-up`. Use `queryByRole` or an empty filter, not a count of 1.
- Every link names the door it opens. `Log in` opens the attendee door. `/login` shows the organiser form.
- `Talk to sales` lives on the Organiser tab of the landing hero only (`components/landing/LandingHero.tsx`). Attendee views never carry it. Ivan, 2026-11-22: keep it on Organiser.
- Auth pages (`/login`, `/account/sign-in`, `/account/sign-up`) carry one short sentence and one toggle line. No eyebrow, guest paragraph, expiry sentence, or cross-door link inside the card (Ivan, 2026-11-19), except the wrong-door helper below (Ivan, 2026-11-22).
- Wrong-door helper (Ivan, 2026-11-22): after two failed log-ins in the browser, the card shows one fixed line. On `/account/sign-in`: "Organiser? Organiser log in", linking to `/login`. On `/login`: "Attending an event? Attendee log in", linking to `/account/sign-in`. `MagicLinkSignInForm` counts the errors its submit returns; a success resets the count. No DB lookup, no URL flag such as `not_organiser` or `not_authorized`, and no email in the line. Tests assert the typed address never appears. The old `Attending an event? Sign up` line on `/login` is gone.
- Landing exception (Ivan, 2026-11-21): on `/` one login pill follows the hero toggle. Attendee gives `Log in` to `/account/sign-in`. Organiser gives `Organiser log in` to `/login`. The hero repeats no login.
- Organiser login failure copy stays the one bland line ruled on 2026-11-01. Test the strings and links, not only the rendered text.
- Open, not ruled: the `Log in` pill on `/login` points to the attendee door. Ask Ivan before changing it.
- After any header change, measure at 640 px: it must fit with no overflow.
