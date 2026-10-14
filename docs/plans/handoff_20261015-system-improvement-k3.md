# Handoff 2026-10-15 — weekly system improvement, sandbox gate, K3 abuse tier

Session: "System improvement" (2026-10-14 → 15). Covers four pieces of work:
1. The first `/improve-system` run, which built the skill and applied 16 approved proposals.
2. The `/dev-preview-uiport` production gate (`de08711`).
3. The K3 §4 abuse-tier wiring, including the sign-out experience fixes (commit in this change).
4. The hold on the peer session's UI-port deletion.

## §0 Ivan's action list

### Decide (recommendation first)

1. **Door check-in freezes after a sign-out** (round-2 user-lens, MAJOR; verified by reading).
   - **What happens:** after any server-side sign-out, the QR scan, the manual-code dialog and "Mark attended" freeze or do nothing. The same applies to the role toggles (inferred). This bug predates K3, but the tier now makes it reachable mid-event.
   - **Why:** `markAttended` (`app/events/[id]/checkin/actions.ts:135`) does not catch `NotAuthorizedError`, and `ManualCodeDialog.submit` / `handleMark` have no try/finally.
   - **Recommend:** the walk-in fix pattern, about 3 files.
   - **Before → after:** frozen "submitting…" becomes "You've been signed out. This check-in was not saved. Sign in again to continue."
2. **`/login` tells a signed-out organiser "This is on our side, try again"** (round-2 user-lens, MAJOR).
   - **Why:** `/login` trusts the cookie, then `getAccountMenuState` returns `staffUnknown`.
   - **Recommend:** use `lib/doorSession.ts` in `/login` too, with an organiser `session_ended` line. This is the same fix you chose for the attendee doors.
3. **Copy accuracy** (round-2, MINOR; both lenses). Each line below is before → after.
   - Staff session, or an auth outage, on an account form:
     - Before: "You're signed out."
     - After: own codes, saying "signed in as an organiser" or "could not check your sign-in".
   - A suspended staff member doing a walk-in:
     - Before: "You've been signed out".
     - After: "Your organiser access has changed. This walk-in was not saved. Ask your event admin."
   - A walk-in whose network dropped after saving:
     - Before: "Nothing was saved".
     - After: "Could not confirm this walk-in. Check the roster before trying again."
   - The claim flow:
     - Before: "You need to sign in first".
     - After: the shared signed-out line.
   - A walk-in that tripped the revoke:
     - Before: generic.
     - After: the security reason, as practitioners already see.
4. **`lib/doorSession.ts` hardening** (round-2 dev-lens, MINOR).
   - Treat only 401, 403 and session-missing as "ended". Today 429 counts too, so a GoTrue rate limit would sign a valid session out locally.
   - Check the `signOut` result.
   - Add try/catch in both doors so the page can never stay blank.
5. **After an in-form "signed out" message, the next step is unclear** (round-2 user-lens, MINOR). The header still says "Account". Recommend a "Sign in again" link carrying `next`.
   - Also: the Profile delete buttons drop a row from the screen even when the action fails (round-2 dev-lens, MINOR, older than this change).
6. **15 staff action files have no rate limiter, so no abuse tier.** Q45's "all authenticated routes" is not met for staff (DEFERRED row). Decide whether they get limiters.
7. **`/dev-preview-uiport/breadcrumb-compare` RSC bypass** (dev-lens on `de08711`, MINOR, inferred). A crafted RSC request can skip the layout gate on this one dynamic page, which is static markup with no auth UI. Options:
   - accept it;
   - add the same one-line gate to the page;
   - delete that one page, whose own header says to.
8. **UI-port library: rule on the peer's proposal**, `docs/plans/2026-10-14-ui-port-library-proposal.md` on branch `claude/epic-cannon-6eafe9`, commit `b15a8fe`, not on main.
   - Its counts: 35 Keep, 9 Replace, 4 Delete (TeamTabs, SplitActionButton, ExpandablePlanPicker, PlanSelectionCards), and 2 for you (SubscriptionDialog and NotificationSignupButton overlap).
   - The branch is on HOLD. Nothing leaves main until you rule each row.
9. **Old UI findings** (user-lens, out of scope, not fixed):
   - The 404 page marks "Home" as the current page (`app/not-found.tsx:12`).
   - `/login` "Contact an admin" is styled as a link but is plain text.
   - The `/pricing` title reads "Pricing — Eventar · Eventar".

### Execute (only Ivan can, in order)

1. Glance at the two dashboard files someone else changed in the main checkout at 00:42: `app/dashboard/page.tsx` and `components/dashboard/DashboardWorkstation.tsx`. The "events this week" metric now counts only open events. They are not in this session's commits.
2. Nothing to push. `main` is ahead of `origin`, and pushing is your call.

### Queued for Claude

- Implement whichever of decisions 1–7 you pick. Every one comes with its before/after, per the standing frontend-review rule.
- Next `/improve-system` run (weekly). The ledger at `~/.claude/improve-system/ledger.md` carries this run's 16 accepted items and the follow-on rulings.

### Other sessions

- **Dead UI-port deletion:** `claude/epic-cannon-6eafe9`, ON HOLD, proposal written (decision 8).
- **ownEvents() loader and email stub switch:** spawned 2026-10-14 in their own worktrees. Their state is in their own sessions; neither had landed on `main` when this was written.

## What shipped

### 1. `/improve-system` (Claude setup, not repo code)

- **The skill and its memory:**
  - The skill lives at `~/.claude/skills/improve-system/`.
  - Reports and the ledger live under `~/.claude/improve-system/`.
  - All 16 proposals were accepted. Setup, memory and hook items were applied; the code items were spawned as tasks.
- **Standing rules added, both in `~/.claude/CLAUDE.md`:**
  - ponytail and i-have-adhd are always on (hooks).
  - The headroom proxy runs for CLI sessions.
  - **Frontend reviews: show Ivan the difference, Ivan decides**, also injected by the frontend hook. A better replacement is a proposal, never a deletion.
- **The `dead-code-deletion` skill gained an intent check:** search plans, specs, status docs and the vault before calling anything dead.

### 2. `de08711`: the sandbox is gated, not deleted (Ivan: "gate, don't delete")

- `app/dev-preview-uiport/layout.tsx` calls `notFound()` in production, with a test.
- The production build serves the not-found page for every sandbox route. It is HTTP 200 + noindex, because the root `loading.tsx` streams the response.
- The 7 UI-port components stay as library code (diagnosis per component in this session):
  - `CreateEventWizard` and `EventWizardStepIndicator` serve spec 003 US1.
  - `EventDateTimeRangePicker` serves plan P10.
  - `AuthShell` is superseded by `SiteShell`, which makes it a proposal, not a deletion.

### 3. K3: the §4 abuse tier is live (Decisions Log Q45)

- **Wiring:** `rateLimitBySession` (`lib/rateLimit.ts`). The first rejection in each window counts one hit, and the 3rd hit in 60 minutes triggers a global sign-out plus a `session_revoked` audit row.
- **Fixed on the way:**
  - It revoked on the 4th hit; `ABUSE_MAX` is now 2.
  - The subject was the limiter key, which is wrong for `staff.id`; it now comes from the caller's own session.
  - A failed sign-out still wrote a permanent audit row; it no longer does.
- **Sign-out experience (Ivan's 4 rulings):**
  - The revoking rejection says why.
  - Every account form maps a dead session to "signed out".
  - Both attendee doors verify the session with the server, which fixes a verified infinite /account ⇄ sign-in loop (283+ requests), and say "Your previous session has ended".
  - Walk-in no longer freezes.
  - Page-render reads don't count toward the tier.
- **Kept:** `withSecurity` stays as the planned standard. The inline vs wrapper split is deferred "with clarity" (DEFERRED row).
- **Removed:** `lib/attendeeAuth.ts`, superseded by the live sign-in action.

## Evidence

- **Static gates:**
  - tsc clean.
  - eslint at baseline (1 old error in `app/settings/page.tsx`, 11 warnings).
  - vitest: 1500 passed, 0 failed. Flakes seen only under peer-session CPU load; each passed in isolation.
  - `next build`: clean, 39 routes.
- **Backtests, local stack only:**
  - The real `rate_limit_check` sequence.
  - A GoTrue global sign-out that kills the refresh token.
  - A real audit row.
- **Live end-to-end on :3100:** trip → in-form copy → `session_revoked` row → 0 live sessions → reload → sign-in form with the "ended" message, with 0 loop requests (283+ before the fix).
- **Mutation checks:** both `firstRejection` and `checkDoorSession` failed their tests when broken.
- **Reviews:**
  - **Dev-lens:** round 1 found 2 MAJOR and fixed both; round 2 found 0 BLOCKER/MAJOR.
  - **User-lens:** round 1 found a BLOCKER, which was verified live and fixed; round 2's 2 MAJORs are decisions 1–2 above.
- **Local residue:** 3 `session_revoked` audit rows for deleted test users. They are local only, and `audit_events` is append-only.
