---
name: eventar-auth-session-guards
description: Use when changing a write gate, link-key edit, sign-out, rate limit, or a staff email on two orgs.
category: security
---

# Eventar auth and session guards: gate inside the action, sign out through one helper, limit through one wrapper

Every guard the UI promises is enforced inside the server path it protects. A disabled button, a read-only sentence or a cookie check is not a gate.

## Server Action writes

- Run the role gate before any read or write. Call the helper the UI uses (`canCheckIn(role)` in `lib/auth.ts`), and for a refused role return the shared constant (`CHECKIN_ROLE_MESSAGE`). Do not copy the role list.
- Map Postgres errors to plain copy, never HTTP 500: `42501` becomes "You do not have access to this event."; `40P01` and `40001` become "That check-in collided with another change. Try again."
- Validate enum inputs with Zod. Sort on save inside the action and write the sorted index into the stored order field. Ivan's ruling (2026-11-02): the agenda is saved in start-time order.
- Test: a refused role triggers no insert or update, each error code maps to its plain message, and reverting the gate fails the test.
- Empty-input shortcuts (`if (ids.length === 0) return ...`) go AFTER `requireStaff()` and the role gate, never before. A shortcut ahead of the gate answers an unauthorised caller with a success-shaped reply and breaks Hard Rule 3.
- Deny-side helpers (`getStaffSessionState`) only deny or frame. Never make one return a definite `not_staff` for a state the grant side already refuses: an unconfirmed address that matches a staff row then slips past the practitioner-write guards. Put a new grant-side check (email confirmed) in `requireStaff` and `proxy.ts`, and leave the deny-side helper matching on the email string.
- Adding a read of a new auth field (`email_confirmed_at`) changes every test fixture that mocks `getUser`. Grep `getUser:` across `app/` and `lib/` tests and add the field to each staff fixture before running the suite, or the fixtures read as the wrong state and fail in bulk.
- `app_private.auth_email()` (Q52, kernel K1) returns the JWT `email` only when the claim's `sub` matches an `auth.users` row with `email_confirmed_at` set and the same address. Otherwise it returns `''`, which fails closed in RLS: the query returns 0 rows, not an error. A test that fakes an authenticated JWT must set `sub` and insert a confirmed auth user with that email, or it reads as signed out.
- A refused login redirects to `/login?error=<code>`, and that page must not run the gate it refused. Render the form plus one neutral notice for the code, with no staff lookup and no second redirect. Redirecting an unconfirmed staff email into `/dashboard` loops between `/login` and `/dashboard`. Use one notice for every unconfirmed address so the copy reveals no staff membership. Test the target: 200 with the form, not another redirect.

## Role gates on each write path: lib/auth.ts is display, the live SQL is the authority

- The `lib/auth.ts` helpers (`canPublishEvents`, `canEditRegistrationRoles`, `canCheckIn`) decide what the UI shows. Each write path's real gate is the live SQL function: read `select prosrc from pg_proc where proname='<fn>'` for its `app_private.resolve_actor(...)` role list and any `created_by` or `organisation_id` check. For direct table writes, read `pg_policies`. Quote the live text, not the migration file.
- An org-scoped RLS policy (`organisation_id = app_private.current_staff_org_id()`) lets every role in the org write the row. A "members edit only their own events" rule therefore needs a `created_by = staff.id` check inside the SQL function or policy. A gate one layer above the write does not count.
- Found 2026-11-06: `events_org_member_insert`, `events_org_member_update` and `agenda_blocks_org_member_full` check the organisation only, so `auditor` and `body_admin` could create and edit events and agendas in their org.
- Ruled 2026-11-06 (Ivan): admins act on every org event; members only on events they created (edit, publish, cancel, check-in, contact edits, role chips); `body_admin` and `auditor` read-only. Built locally 2026-11-07 as the `event_writer_guard` trigger on the nine event-owned tables (`supabase/migrations/20261107100000_role_rights_q51.sql`). The app-side `canWriteEvent` helper is built too, and every write action and UI gate calls it. Uncommitted until Ivan says commit. Apply the rule to every write path, DB gate and helper alike. A bulk action refuses the whole batch when any selected event falls outside the rule; it never acts on the rest.
- A row-level write guard on UPDATE must check both the OLD and the NEW row's event. Checking only NEW let a member move a colleague's speaker check-in onto their own event. Resolve each row's event through `app_private.event_of_row(table, row)`.
- One exemption: a practitioner claiming their own registration (`user_id` null to `auth.uid()`, with only `user_id`, `profile_snapshot` and `updated_at` changing). A staff account is also a practitioner account, so without it the staff member cannot claim their own registration.
- Before changing any role rule, inventory every write path first: server actions, SQL functions with no role list, storage buckets and email sends. On 2026-11-07 a subagent inventory found 14 staff write paths and 7 surprises. The worst: the hero-image bucket let any staff overwrite any org's images, and `create_event_with_blocks` / `update_event_with_blocks` had no role list at all. Body_admin could also email registrants. A rule applied to the obvious paths alone leaves these open.

## Sign-out

- Every sign-out goes through `signOutAndLeave()` in `lib/signOut.ts`. Never call `supabase.auth.signOut()` from UI code, and never ignore `{ error }`.
- Known inline call sites (`login`, `invite`) predate the helper. Swapping them changes UX: login stays on the page with a "signed out here" notice, and invite carries `?next=`, which the helper's type does not allow. Flag the swap as a decision for Ivan with the case and options; do not swap silently.
- Navigate to the signed-out page only when the revoke succeeded. On failure stay put, show "Could not sign out. Try again.", and keep the button usable.
- A menu that closes on outside click stays open while signing out. The failure alert sits outside `role="menu"`.
- Each sign-out surface has a test with a failing signOut: alert shown, button enabled, and a successful retry clears the alert.
- Keep the verbs "Log in" and "Sign out" (Ivan's ruling, 2026-11-01).
- Prove sign-out in the browser with one `javascript_exec` read of cookie names, `localStorage`, `sessionStorage`, `indexedDB.databases()` and `caches.keys()`. Then open a protected page and expect a redirect to sign-in.
- `document.cookie` cannot list HttpOnly cookies, so an empty `cookieNames` does not prove the session cookie is gone. Replay the pre-sign-out cookie with `curl` against a protected route and expect the redirect, or the 403 `session_not_found`, as in `eventar-live-verify-worktree`.

## Link-key edits use the claim's own predicate
- A claim that matches rows by value links every matching row, whatever its state. An edit that changes that value copies the claim's WHERE clause into its own guard. A guard on `user_id is not null` alone let an unlinked, attended registration be re-routed to a new owner.
- Refuse with a named error when the claim would link the row (`user_id is null`), or when the row holds attendance or credit (for example a `registration_checkins` row).
- Grep `supabase/migrations` for every SECURITY DEFINER function that matches the column, and read each hit.
- Prove it by execution: attend an unlinked registration, change its email through the action, then run the claim as the new owner. The edit must be refused, or the claim must link nothing.

## Staff email on two organisations is a case, not an outage
- `staff` allows one email in several organisations (`UNIQUE (email, organisation_id)`). A read that filters on email alone and calls `.maybeSingle()` returns PGRST116 when two active rows match. Two active rows prove the person is staff.
- Never map PGRST116 to `unknown` or to "not on the list". Ruling (Ivan, 2026-10-23, option A): `getStaffSessionState` and `isStaffSession` map it to `'staff'`.
- Verified against the installed client: two rows give code PGRST116, zero rows give `data: null`, and a server timeout gives code 57014, a separate error.
- Before a fix, trace every consumer of the tri-state. A new union member fails open in any consumer that does not name it.
- A proxy redirect on gated routes does not fix the other doors. `/login` with no error, the public start-an-event link and `/account` need the same answer.
- Mock-client tests reproduce PGRST116 the way the real client does.

## Rate limits and the abuse tier

- Every authenticated limiter goes through `rateLimitBySession` in `lib/rateLimit.ts`. A direct `rateLimit` call skips the automatic session revoke (Q45).
- Three hits in 60 minutes sign out every session of that user and write a `session_revoked` audit row. `ABUSE_MAX` is 2 on purpose: do not raise it without a Decisions Log entry.
- The subject is the caller's own auth user from the session, never `staff.id` or an id passed as an argument. Reads never feed the tier: pass `{ abuseTier: false }`.
- A page that redirects a signed-in visitor verifies the session server-side with `checkDoorSession()` (`lib/doorSession.ts`), not from the cookie alone. A network error or a 429 never clears the cookie.

Full rules and the coverage grep: references/guard-details.md
Local-stack backtest recipe: references/backtest-facts.md
