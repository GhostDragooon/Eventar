# Auth and session guard details

## Server Action gates

- Current write-gate examples: the check-in action calls `canCheckIn(role)` before any write; refused roles get the shared `CHECKIN_ROLE_MESSAGE` from `lib/lifecycle/eventLifecycle.ts`.
- Ruling (2026-11-02): agenda blocks save in start-time order. Send the blocks sorted, and write `display_order` as the position. `create_event_with_blocks` saves the `display_order` it is sent (`coalesce((block->>'display_order')::int, 0)`), while `update_event_with_blocks` uses array position. Map each block to `{ ...block, display_order: pos }` before the RPC, or a stale client's numbers decide the saved order. Test: send conflicting `display_order` values and assert the RPC argument carries 0..n in start order.
- A field the form always fills (agenda block start time) still gets a plain server error. The action may not assume the form ran.

## Sign-out callers

- Current callers: AccountShell (rail and onboarding bar), AccountMenu, the account Session card in `app/account/AccountClient.tsx`, and organiser Settings through `components/auth/SignOutAction.tsx`. A new sign-out surface calls the helper.
- The invite and `/login` PractitionerPanel sign-outs were left as they were. Check them when you touch those files.
- Failure is a visible state. Exception: a rejected token refresh removes the session before the error returns, so the error can show to someone already signed out. Pressing again succeeds. Never write comments or copy that say the session is still in place on error.
- Verify on the local stack: block `**/auth/v1/logout*` in the browser, press Sign out on each surface, and expect the alert, the page still signed in, and a working button. Unblock, press again, and expect the redirect.
- Put the failure alert outside `role="menu"`. ARIA allows only menu items inside a menu.

## Abuse tier mechanics

- On the first rejection of each window (`count === max + 1`), `rateLimitBySession` calls `recordAbuseHitAndMaybeRevoke` in `lib/abuseTier.ts`. `rate_limit_check` counts rejected calls too, so UI retries never stack hits.
- Windows are fixed 60-minute buckets, not sliding. A burst across a window edge can reach 4 hits before the revoke. This ceiling is marked `ponytail:` in `lib/abuseTier.ts`.
- If the abuse tier throws, log the error with UUIDs only (no token, no email) and still return the rejection. Never report a bypassed limit as success.
- The rejection that revokes returns `sessionRevoked: true`. The action returns the `session_revoked` error so the form says why. Account actions map a dead session to signed-out copy in `app/account/signedOutCopy.ts`, not to field errors.
- Before judging a shared read bucket safe, count the calls per page render (banner plus menu, each counted) and divide the max per 60 seconds by that number. Give the banner its own key if the count is near what a normal user reaches.
- Read-only and page-render limiters pass `{ abuseTier: false }`. They still rate-limit, but never count toward a sign-out (Q45 ruling, 2026-10-14).
- `withSecurity` is the documented target wrapper but has no live caller. Confirm an action calls `rateLimitBySession` directly rather than assuming the tier comes from `withSecurity`.

## Ended sessions on staff actions

- `proxy.ts` redirects an action POST to `/login` before the action runs, so the client sees a generic error. A client calling a staff action (door check-in, walk-in, role toggle) calls `checkDoorSession()` after a failure. `ended` or `signed_out` shows signed-out copy with a Sign in link back to the page. `unknown` (network) shows a retryable message and never claims a sign-out.
- Audit every page that redirects on the session cookie (sign-in, sign-up, login, invite), not only the page that looped. Pages that only display the session may stay cookie-based.

## Coverage check

- Known gap (2026-10-15): 15 staff action files had no `rateLimitBySession`, so the tier never reached them. Before claiming "every authenticated route", grep the action files for the limiter.
