---
name: eventar-staff-email-multi-org
description: Use when staff email matches two orgs or PGRST116 appears.
category: multi-tenancy
---

# One email on two organisations' staff lists is a case, not an outage

- `staff` allows one email in several organisations (`UNIQUE (email, organisation_id)`). Any read that filters on email alone and calls `.maybeSingle()` returns PGRST116 when two active rows match. Two active rows prove the person is staff.
- Do not map PGRST116 to `unknown` (outage copy: "could not check your organizer access … try again") or to "not on the list". Those are the two lies CX-07 was written to remove.
- Verified by execution against the repo's installed `@supabase/postgrest-js`: two rows gives `code: 'PGRST116'`, zero rows gives `data: null`, and a server-side timeout gives code `57014`, a separate error.
- Landed by CX-07 (2026-10-23): `proxy.ts` sends PGRST116 on gated routes to `/login?error=multiple_organisations` with organiser copy, logging UUID and code only, never the email. `lib/auth.ts` logs it and returns `'staff'` (ruling below); `requireStaff` still throws the database error, never `NotAuthorizedError`. Four mutations each failed their test; the live check was not run.
- Review round 1b (`docs/plans/mvp/REVIEW-CX07.md`) found `getStaffSessionState` returned `unknown` for this person, so every consumer read it as outage. Three doors were wrong, and the ruling below fixes them: `/login` with no `?error=`, the public "Start an Event" button (`/login?next=/events/new`), and `/account`, which sends a two-org organiser to practitioner onboarding. The proxy redirect covers only the gated routes, so a fix in `proxy.ts` alone leaves these doors wrong.
- Before any fix, trace every consumer of the tri-state. `requirePractitionerSelf`, `acceptRequiredConsents` and `registerForEvent` use `'staff'` only to refuse. `getAccountMenuState`, the `/account` layout and the public event page use it only to frame. A new union member fails open in any consumer that does not name it.
- Ruling (Ivan, 2026-10-23): option A. `getStaffSessionState` and `isStaffSession` map PGRST116 to `'staff'`. Do not map it back to `unknown`. The `/login` bounce needs the live-URL fix in `react-url-state-initializer-stale`, because the mounted page keeps its first `checking` state.
- Mock-client tests must reproduce PGRST116 the way the real client does. See the global `vitest-spy-isolation` skill.
