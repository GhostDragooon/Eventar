---
name: eventar-rate-limit-abuse-tier
description: Use when changing a rate limit or the abuse-tier revoke.
category: security
---

# Eventar rate limits feed the abuse tier

Every authenticated limiter goes through `rateLimitBySession` in `lib/rateLimit.ts`. Never call `rateLimit` directly for a signed-in route: that skips the automatic session revoke locked in Q45.

- On the first rejection of each window, `rateLimitBySession` calls `recordAbuseHitAndMaybeRevoke` in `lib/abuseTier.ts`. "First" means `count === max + 1`. `rate_limit_check` counts rejected calls too, so UI retries never stack hits.
- Three hits in 60 minutes sign out every session of that user and write a `session_revoked` audit row. `ABUSE_MAX` is 2 on purpose. Do not raise it without a Decisions Log entry.
- The subject is the caller's own auth user from the session. Never use `staff.id` or any id passed in as an argument.
- If the abuse tier throws, log the error with UUIDs only (no token, no email) and still return the rejection. Hard Rule 12: never report a bypassed limit as success.
- `withSecurity` is the documented target wrapper but has no live caller. Do not assume an action gets the tier from it. Confirm the action calls `rateLimitBySession`.
- Windows are fixed 60-minute buckets, not sliding. A burst across a window edge can reach 4 hits before the revoke. This ceiling is marked `ponytail:` in `lib/abuseTier.ts`.
- Reads never feed the tier. Read-only and page-render limiters pass `{ abuseTier: false }` to `rateLimitBySession` (example: `account.unlinked_count`). They still rate-limit, but they never count toward a sign-out (Q45 ruling, 2026-10-14).
- The rejection that revokes returns `sessionRevoked: true`. The action must return the `session_revoked` error so the form says why. Every account action maps a dead session to signed-out copy (`app/account/signedOutCopy.ts`), not to field errors.
- A page that redirects a "signed-in" visitor (sign-in, sign-up) must verify the session server-side with `getUser()`, never trust the cookie alone. Use `checkDoorSession()` in `lib/doorSession.ts`, which clears a dead cookie on a 4xx. Without it, a revoked user loops between `/account` and `/account/sign-in`. Audit every page that redirects on the session cookie (sign-in, sign-up, login, invite), not only the page that looped. Pages that only display the session may stay cookie-based. A network error or a 429 from the session check never clears the cookie or redirects: show the error, so an outage does not sign a live user out.
- A staff action reached with an ended session never reaches its own signed-out branch: `proxy.ts` redirects the action POST to `/login` before the action runs, so the client sees a generic error. A client that calls a staff action (door check-in, walk-in, role toggle) must call `checkDoorSession()` after a failure. `ended` or `signed_out` shows signed-out copy with a Sign in link back to the page. `unknown` (network) shows a retryable message and never claims a sign-out.
- Known gap (2026-10-15): 15 staff action files had no `rateLimitBySession`, so the tier never reached them. Before claiming "every authenticated route", grep the action files for the limiter.
- Backtest on the local stack only: set the limiter's `rate_limits` row to its max for the test user, set `sessionAbuse:<uid>` to 2, trigger one more hit, then check `audit_events` for `session_revoked`. Delete the test user and both rows afterwards.

Backtest recipe and the local-stack facts: `references/backtest-facts.md`.
