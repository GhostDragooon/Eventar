# CARD UX-R9: the check-in desk updates its counter and row after a successful check-in or walk-in

Card type: frontend behaviour fix (S-Organiser). Raised 2026-11-22 by Ivan ("6 open a card"), from the UX-R8 user-lens walk. Status: NOT STARTED.

## Problem
After a successful code check-in or walk-in the dialog and toast confirm it, but the counter ("0 / 4 checked in"), the row ("Check in →") and the tab counts stay stale until a reload. Seen live for every role, the event's creator included, so UX-R8 did not cause it. [X] user lens.
Cause [I]: `app/events/[id]/checkin/RosterClient.tsx` (about lines 139-164) updates the roster only from Realtime `postgres_changes`. After `markAttended` / `walkIn` succeed there is no local update. The local stack logs `subscription_errors` from the moment the desk opens, so Realtime may be failing there. Hosted behaviour is untested.
At a live door a stale counter looks like a failed check-in and invites a double scan.

## Change (proposed, nothing edited)
1. After a successful `markAttended` (ok or already) and `walkIn`, update the matching row in local state (status attended, `check_in_at`, method) from the action result, or call `router.refresh()`. Realtime stays as the multi-device path.
2. Investigate why local Realtime subscriptions fail (publication includes `registrations`? RLS on the subscribed table for a staff JWT?). Record the finding; fix only if it is a repo-side cause.
3. Same card, small: "+ Walk-in" is 32px tall at 375px; Scan and Enter code are 64px. Raise it to the 44px touch target (rem, per the units rule).

## Needs Ivan
A visual change (the walk-in button) needs the rendered before/after in an Artifact before the edit. Items 1 and 2 are behaviour.

## Tests (must fail first)
- RTL: after a mocked successful check-in the row shows as checked in and the counter increments without a Realtime event.
- Walk-in: the new row appears checked in.
- Backtest on :3100 and :54322: check in by code as an organiser member, read the row back, watch the counter.

## Review
Dev lens, separate user lens, backtest, per `eventar-mvp-card-handback`. Local stack only.
