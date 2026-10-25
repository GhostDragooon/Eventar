---
name: eventar-live-verify-worktree
description: Use when live-checking Eventar on :3100 with seeded data.
category: verification
---

# Eventar live verify: run the worktree's own server, seed and clean fixtures

Render the change from the worktree's own dev server on :3100 and read the result there. Never copy edited files into the main checkout at `/Users/ivan/Eventar`: peers share it, and a failed cleanup left the copies in place.

- Check ports first: `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200) '`. Never use :3000, which points at production.
- The default `eventar` preview config on :3100 runs review mode, which opens signed-out staff pages. Before trusting any auth walk, `curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/events/new` with no cookie: 200 with the form means review mode is on. Sign in and probe the signed-in path; a signed-out pass proves nothing.
- Use only the local stack, `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Never read `.env.local` and never use the Supabase MCP.
- Seed a disposable org, an `organiser_admin` staff row and events, all titled or slugged `ZZ-…`, so cleanup is one delete per table. Seed SQL, probe matrix and cleanup: `references/fixture-seed.md`.
- Compare before and after on the same fixtures. Record HEAD's output before you apply the change, or check out HEAD in a separate worktree.
- Cleanup order: events, staff, organisation, then the auth user. Then query for leftovers and expect `events=0 staff=0 orgs=0 auth=0`.
- `audit_events` rows that a walk writes (a consent grant, a sign-in) stay. Audit rows are permanent by design (hard rule 11), so they are expected residue, not a cleanup failure. Name them in the hand-back.
- After cleanup, confirm the main checkout is clean with `git -C /Users/ivan/Eventar status --porcelain`. A guard can pass silently in zsh; see `shell-zsh-path-lists`.
- Sign-in, revoke and redirect checks need the `eventar-noreview` preview config. The default `eventar` config runs review mode, which bypasses auth, so it cannot exercise a revoke.
- Sign in as a disposable local test user by injecting its session cookies in the browser (localhost only). Write the cookies to a scratch file, never into chat. Delete the user and the scratch file afterwards.
- Clear a stale auth cookie before a long browser run; it can make the page loop and hammer the server.
- A cold dev compile can exceed 6 seconds, so a blank card is not yet a bug.
- If :3100 to :3200 are all held by peer sessions, the live check is blocked. Record the change as not live-verified and name the first live check to run. Never fall back to :3000. Wait, then count RSC requests with `read_network_requests` before calling a redirect loop fixed or still present.
- A peer's claim lives in `scratch-demo/locks/dev-3100.lock` (session, task, timestamp). Read it with `cat` before starting a server. If a peer holds it, message that session (SendMessage) asking it to release the lock and keep :3100 running, then wait with a background watcher on the lock file, not a foreground sleep. Do not start a server or touch the Browser pane until the lock is gone, because the cookie jar is shared.
- Remove only a lock you wrote, and only after `cat` shows your session in it. Never clean up with `rm -f scratch-demo/locks/dev-3100.lock` (or any shared lock path) as a last step: a peer can write its claim after yours, and the blanket delete takes it too. Check before deleting, and if a delete may have hit a peer's lock, tell that session at once (SendMessage) so it can re-create the lock.
- Probe a server-rendered, zone-dependent value with curl before the browser: `curl -s -H "Cookie: eventar-tz=Asia/Hong_Kong" http://localhost:3100/dashboard`, then grep the header label and the stat tile. Run the probe on a preview config that sets TZ=UTC, which mirrors the Vercel server. Compare a few zones, an invalid zone (expect the UTC fallback), and no cookie. Output that changes with the cookie proves the code reads it.
- The organiser "today" zone comes from the `eventar-tz` cookie. A cold browser renders once in UTC, then self-refreshes once. Verify the cookie is written, and that a warm reload triggers no refresh.
- A hidden preview pane returns empty reads. Call `tabs_select` or take one screenshot to wake it before concluding the page is blank.
- The browser cookie jar is shared with the main session and any browser subagent. Set or clear the cookie you test before each run.
- While a browser reviewer walks :3100, hold edits to source files the reviewed routes import (for example `lib/auth.ts`). Hot reload changes the screens under the reviewer mid-walk. Write the failing test first, then apply the fix after the reviewer reports.
- Fixtures are clock-anchored. When local midnight passes, shift their start times by a day so they still straddle the boundary under test (for example 08:00 HKT). A stale fixture passes or fails for the wrong reason.
- The in-app preview browser is pinned to HKT. To see an organiser in another zone, open a Playwright context: `browser.newContext({ timezoneId: 'America/New_York' })`, then wait for the `(GMT-4)` label before reading.
- The TZ=UTC preview config lives in `.claude/launch.json`. Add it only for the run and revert it before commit.
- Reset the tab after any Browser-pane check. Viewport emulation and color scheme both persist: run `resize_window` with preset `desktop` and colorScheme `light`, then clear the theme key with `localStorage.removeItem('eventar-theme')`. A dark-scheme emulation survives reloads until it is reset.
- Narrow-width check: read `document.documentElement.scrollWidth` against `innerWidth` at 375 px. Equal values mean no horizontal overflow.
- Before/after proof: screenshot each state's crops and Read them, or embed both as base64 in one HTML grid and render it from `file://` in Playwright. `browser_run_code_unsafe` has no `fs`, so write the HTML from bash.
- A browser reviewer whose brief forbids starting servers cannot fix a dead :3100 itself. Before dispatching it, confirm `lsof` shows :3100 listening. If it does not, start the server under the lock first. If a reviewer hands back "blocked: nothing listening", start the server, take the lock, and SendMessage the same reviewer to resume. Do not spawn a new agent for the same walk.
- Check a signed-out public list page against the DB, not by eye. Count the card links in the HTML (`grep -oE 'href="/events/[0-9a-f-]{36}"' events.html | sort -u | wc -l`) and compare with the matching row count from `psql`. Then check that no title the DB marks as past appears in the HTML. Start the server only when nothing listens on :3100, under the lock, and say in the reply whether it is still running.
- A readiness watcher must exit non-zero when its timeout passes. A wait loop that falls through with exit 0 reports a dead server as a successful wait, and a completion notification then looks like a pass.
