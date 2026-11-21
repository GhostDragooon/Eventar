---
name: eventar-login-door-labels
description: Use when changing a Log in or Organiser log in link, the copy on /login, /account/sign-in or /account/sign-up, or auth-page text.
category: frontend-design
---

# Eventar has two login doors; every link names its door

Signed-out visitors get two doors, both reachable from public pages (Doctrine 2026-10-30 section 1). No link may say "Log in" for a door it does not open. Covers `SiteShell`, `PublicShell`, the invite page and the sign-up page.

- Attendee door: `/account/sign-in`, label `Log in`. This is the plain CTA in `components/shell/SiteShell.tsx` and `components/shell/PublicShell.tsx`.
- Organiser door: `/login`, label `Organiser log in`. Shown in the public header for signed-out visitors, from `sm` up. On `app/account/sign-up/page.tsx` it is not repeated in the card: the header reaches it.
- Auth pages (`/login`, `/account/sign-in`, `/account/sign-up`) carry one short sentence and one toggle line to the other page of the same door. No eyebrow line, no guest paragraph, no expiry sentence, no cross-door link inside the card. Ivan, 2026-11-19: too much instruction copy.
- Below `sm` the header shows the short label `Organisers`; from `sm` up it shows `Organiser log in` (Ivan chose this on 2026-11-20). Both carry `aria-label="Organiser log in"`. The visible text holds both labels, so a test reads the `aria-label` attribute, not `textContent`, and asserts the `href` of each match.
- A page whose sign-in must keep context passes `loginHref` to `SiteShell`. The invite page passes `/login?next=/invite/<token>`, so the header pill keeps the invite. When `loginHref` is set, the separate organiser link is not rendered, because the pill is that door.
- Test role names anchored (`/^log in$/i`, `/^organiser log in$/i`) and assert the href of every match.
- After any header change, measure at 640 px: it must fit with no overflow.
- Organiser login failure copy (the `/login` error line and the signed-in non-organiser panel) is one bland line for every failure. It has no password language, does not say whether the email is on the staff list, and points to Attendee log in and Sign up. Current line: "We couldn't log you in as an organiser. If you attend events, use Attendee log in or Sign up instead." Ivan ruled this on 2026-11-01. Test the strings and the links, not only the rendered text.
- Landing exception (Ivan, 2026-11-21): on `/` the header has ONE login pill that follows the hero toggle, `Log in` to `/account/sign-in` for Attendee and `Organiser log in` to `/login` for Organiser, via `AudienceProvider` and `LandingNav`. The separate Organiser link is dropped there; the hero repeats no login (Attendee keeps `Sign up`, Organiser has no button). One button, one page. Every other public page keeps both doors.
