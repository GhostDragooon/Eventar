# REVIEW CX-07 backtest lens (2026-10-23)

Scope: the live proxy and auth path on http://localhost:3100 (review mode OFF, local Supabase) for a signed-in staff member whose email has two active `staff` rows. curl, psql and the auth admin API only; no browser tool was used, no server was started or stopped, no repo file was edited.
Evidence tags: [X] executed, [R] read, [I] inferred.
Authenticated curl worked: yes. The session cookie was built with the repo's own `@supabase/ssr` (cookie `sb-127-auth-token`, `base64-` plus base64url JSON, one unchunked cookie of about 2.5 KB) from a real password sign-in. Proof the cookie is accepted: the one-org control reached 200 on every gated route.

## Findings

| ID | Sev | Route / file | What I saw | Ev | Suggested fix |
|---|---|---|---|---|---|
| F1 | MAJOR | `/login` without `?error=` (for example the "Start an Event" CTA, `/login?next=...`), `app/login/page.tsx:152-174`, `lib/auth.ts` `getStaffSessionState` | For the signed-in two-org user the Server Action `getAccountMenuState` returns `{"isStaff":false,...,"staffUnknown":true}` (controls: one-org `isStaff:true`, no-staff `isStaff:false` with no `staffUnknown`). The page maps `staffUnknown` to `checkFailed`, so it renders the old outage copy "We could not check your organizer access just now. This is on our side, please try again in a moment." for a permanent condition. This is the exact message CX-07 set out to remove; the card lists it as a known limit. The render itself was not seen (no browser); the action result is executed, the mapping is read. | X, R | Return a distinct signal for PGRST116 from `getStaffSessionState` (or a `staffConflict` flag on `getAccountMenuState`) and map it to the `multiple_organisations` copy. See F2 for a one-change option that fixes both. |
| F2 | MAJOR | `/account`, `/account/profile`, `/account/record` (redirect), `/`, `/events` (shell), `app/account/layout.tsx`, `isStaffSession` | `isStaffSession` fails open to `false` on PGRST116, so the two-org organiser is treated as a practitioner. `/account` and `/account/profile` stream `NEXT_REDIRECT ... /account/complete` (one-org control: `/dashboard`). `/account/complete` renders the practitioner onboarding (consent, identity, professional, licence). `/events` shows the practitioner "Account" menu (one-org control: "You're viewing the public page" and "Programme"; no-staff control: identical to the two-org user). Pressing Continue on that page runs `acceptRequiredConsents`, which returns `{"ok":false,"error":"db_error"}` and writes nothing (0 `consent_records`), so it fails closed, but the person meets a practitioner sign-up and then a generic error right after being told they are an organiser with too many organisations. Q32 says organisers have no attendee identity. | X | Two active rows prove the caller IS staff, so PGRST116 could map to `'staff'` in `getStaffSessionState` (and `true` in `isStaffSession`). Then `/account` goes to `/dashboard`, the proxy shows the CX-07 message, shells show organiser chrome, practitioner writes answer `not_authorized`, and F1 resolves too. This changes the tri-state contract, so it is Ivan's call (rule 7), not a drive-by. |
| F3 | MINOR | `/events/<draft-id>` public page, `app/(public)/events/[id]/page.tsx:72-79` | For a DRAFT event in the two-org user's own organisation the page calls `requireStaff`, which now throws the raw PostgREST error (a plain object, not an `Error`). The page only swallows `NotAuthorizedError`, so the render errors: body is empty, contains `$RX("B:1", ... "Switched to client rendering because the server rendering errored: {code: ...}")`, the dev log shows `⨯ Error: {"code":"PGRST116",...}` twice, HTTP status is 200 because the response streams. The one-org control gets `NEXT_REDIRECT /events/<id>/edit`; anon gets not-found. The user then sees `app/error.tsx`, not the CX-07 message (not seen; no browser). The "never `NotAuthorizedError`" choice in `requireStaff` is right, but this caller was not taught the new case. | X | In that catch, treat `code === 'PGRST116'` like "not an owner" (`notFound()`), or have `requireStaff` throw a typed `MultipleOrganisationsError` that pages map to the redirect. |
| F4 | MINOR | `proxy.ts:104-107` | The two-org redirect carries no `next` (`/login?error=multiple_organisations`), unlike `not_organiser` (`...&next=%2Fdashboard`). After support fixes the account, a deep link is lost. Same as the existing `unavailable` branch, so consistent, just not helpful. | X | Use `loginUrl('multiple_organisations')`. |
| F5 | NIT | `proxy.ts`, `lib/auth.ts` logging | One `console.error` per gated request: 12 `[proxy]` lines for my 12 redirected requests, 14 `[auth]` lines across public, account and event pages. A permanent data condition logs at error level on every navigation and prefetch, which will be noisy or page someone if errors are captured. | X | Keep, but consider `warn`, or once per user per minute. |
| F6 | NIT | `/login?error=multiple_organisations` | The text renders for anyone, no session needed (same as every other code). A crafted link shows "Your account belongs to more than one organisation..." to a one-org user or a visitor. Fixed copy, no data. | X | None needed. |
| F7 | NIT | `.next/dev/logs/next-development.log` | The dev log sink prints structured arguments as `{}` (also for `[csp-report] {}` and `[checkin] eligibility read failed {}`), so I could not confirm the `{ userId, code }` payload or the absence of the email in the live log. The unit tests cover it (3 files, 48 tests pass, run by me). | X | None for CX-07. |
| F8 | NIT | proxy matcher | Matcher entries `/events/:id/edit` and the like match only the exact path; a future nested staff route under them would be unguarded. No such route exists today. | R | Add `:path*` when a nested route is added. |

Observed, not attributed to CX-07: the one-org control's `/events/<id>/checkin` logged `[checkin] eligibility read failed` once (the fixture event has no registrations; the code was not captured because of F7). The page still returned 200.

## Verified OK

All [X] unless noted.
- Fixtures behaved as intended: UNIQUE (email, organisation_id) allowed the two active rows.
- Two-org user, tokens fresh: 307 to `/login?error=multiple_organisations` on `/dashboard`, `/dashboard/manage`, `/events/new`, `/settings`, `/events/<id>/edit`, `/events/<id>/details`, `/events/<id>/checkin`, `/events/<id>/analytics`, `/checkin`, `/analytics`, `/participants`, `/settings/team`. No Set-Cookie (nothing cleared).
- Session kept: with `expires_at` forced into the past, the same redirect carries `Set-Cookie: sb-127-auth-token` (refreshed, Max-Age about 400 days), so `redirectWithCookies` preserves a refresh. The original cookie kept working afterwards.
- One-org control: 200 on all of the same routes. No-staff control: 307 `/login?error=not_organiser&next=...` on the four gated routes. Anonymous `/dashboard`: 307 `/login?next=%2Fdashboard`.
- Only two ACTIVE rows trigger it: setting the default-org row to `suspended`, `removed` or `invited` gave 200 on `/dashboard`; back to `active` gave the redirect again (row restored before cleanup).
- `/login?error=multiple_organisations` returns 200 with the exact organiser text in the server-rendered HTML for the two-org cookie, the one-org cookie and no cookie, with `role="alert"` present; no auto-redirect for the signed-in user, so no loop. `&next=%2Fdashboard` does not change it.
- Attendee door `/account/sign-in?error=multiple_organisations` falls back to the generic "Sign-in could not be completed. Request a new link below." (no organisation text), as the card says.
- Layer 2 fails closed: `acceptRequiredConsents` as the two-org user returned `db_error` with 0 rows written; the same action as the no-staff control wrote 2 `consent_records` (so the test is not vacuous).
- Dev log: `[proxy] ... more than one active row` and `[auth] ...` lines present, no email text in any line.
- `pnpm exec vitest run proxy.test.ts lib/auth.test.ts components/auth/auth-error-messages.test.ts`: 3 files, 48 tests passed.
- Matcher (read): every staff page under `app/` is covered: `/dashboard/:path*`, `/events/new`, `/events/[id]/{edit,checkin,details,analytics}`, `/checkin`, `/analytics`, `/settings`, `/settings/team`, `/participants`. Staff-aware but unmatched, by design: `/account/*`, public `/events/[id]` (F3), `/`, `/events`, `/pricing`, `/invite/[token]`, `/dev-preview-uiport/*`.

## Not reached

- Browser rendering and hydration of `/login` (form visible, focus, copy placement); the coordinator's walk covers it.
- Magic-link round trip through `/auth/callback` for the two-org user (expected: lands on a gated route, then the CX-07 redirect).
- Layer 2 (`requireStaff`) on staff pages: unreachable past the proxy; exercised only through the public draft page (F3). Server Action POST to an unmatched path not attempted.
- Whether "Ask Eventar support" has a reachable contact on `/login`.
- Production build, review mode ON, hosted project.
- Whether the "Start an Event" CTA is shown to the two-org user on `/` (fixtures were gone by the time I thought of it); F1 reachability from the CTA is [I].

## Fixtures and cleanup

Created (all `cx07`, local DB only):
- auth users: `cx07-twoorg@cx07.invalid` 3a53a464-67f4-4c5b-b28e-fe5b5bc9532c; `cx07-oneorg@cx07.invalid` ab33d346-56f7-4d90-aa1e-c301a5807eb3; `cx07-nostaff@cx07.invalid` d518ded7-a1d1-4552-b894-2932fb6e18fd
- organisation `CX07 probe org` / `cx07-probe-org`: 06df102e-22d7-4297-b0cb-2b31076d6593
- staff: 402323ee-f57a-45cd-a887-e1a01658120b (twoorg, probe org), 60e29445-06ac-4a1c-a12b-e275e1a1b87f (twoorg, `default`), 179aad0f-1bf3-4b90-965f-6dd5315b6e22 (oneorg, probe org); all `organiser_member`
- events: 7b7a42c2-897a-44d5-84f9-1b6b0cbbfbfa (published), dde6a375-010d-4ea7-8658-5352f3ef03dd (draft)

Cleanup order: events, staff, organisation, auth users (admin API returned 200 x3), then the scratch cookie and env files.
Leftover count: `events=0 staff=0 orgs=0 auth=0`, plus `public_users=0 consent_records=0` (cascade).
Permanent residue: 2 `audit_events` rows of type `consent_granted` (2026-10-23 07:50:15 UTC) from the no-staff control's consent action; audit rows are append-only by design.
`git status --porcelain`: only the pre-existing CX-07 change set (`proxy.ts`, `lib/auth.ts`, the three tests, the message dictionary, `NewEventForm.test.tsx`, `CX-07.md`, `package.json`, `pnpm-lock.yaml`) and other sessions' untracked files; no source file changed by me. This review file is the only file I wrote in the repo.
