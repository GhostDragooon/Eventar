---
name: eventar-live-verify-worktree
description: Use when live-checking Eventar on :3100 with seeded data.
category: verification
---

# Eventar live verify: run the worktree's own server, seed and clean fixtures

Render the change from the worktree's own dev server on :3100 and read the result there. Never copy edited files into the main checkout at `/Users/ivan/Eventar`: peers share it, and a failed cleanup left the copies in place.

- Check ports first: `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200) '`. Never use :3000, which points at production.
- Use only the local stack, `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Never read `.env.local` and never use the Supabase MCP.
- Seed a disposable org, an `organiser_admin` staff row and events, all titled or slugged `ZZ-…`, so cleanup is one delete per table. Seed SQL, probe matrix and cleanup: `references/fixture-seed.md`.
- Compare before and after on the same fixtures. Record HEAD's output before you apply the change, or check out HEAD in a separate worktree.
- Cleanup order: events, staff, organisation, then the auth user. Then query for leftovers and expect `events=0 staff=0 orgs=0 auth=0`.
- After cleanup, confirm the main checkout is clean with `git -C /Users/ivan/Eventar status --porcelain`. A guard can pass silently in zsh; see `shell-zsh-path-lists`.
- Sign-in, revoke and redirect checks need the `eventar-noreview` preview config. The default `eventar` config runs review mode, which bypasses auth, so it cannot exercise a revoke.
- Sign in as a disposable local test user by injecting its session cookies in the browser (localhost only). Write the cookies to a scratch file, never into chat. Delete the user and the scratch file afterwards.
- Clear a stale auth cookie before a long browser run; it can make the page loop and hammer the server.
- A cold dev compile can exceed 6 seconds, so a blank card is not yet a bug.
- If :3100 to :3200 are all held by peer sessions, the live check is blocked. Record the change as not live-verified and name the first live check to run. Never fall back to :3000. Wait, then count RSC requests with `read_network_requests` before calling a redirect loop fixed or still present.
- Probe a server-rendered, zone-dependent value with curl before the browser: `curl -s -H "Cookie: eventar-tz=Asia/Hong_Kong" http://localhost:3100/dashboard`, then grep the header label and the stat tile. Run the probe on a preview config that sets TZ=UTC, which mirrors the Vercel server. Compare a few zones, an invalid zone (expect the UTC fallback), and no cookie. Output that changes with the cookie proves the code reads it.
- The organiser "today" zone comes from the `eventar-tz` cookie. A cold browser renders once in UTC, then self-refreshes once. Verify the cookie is written, and that a warm reload triggers no refresh.
- A hidden preview pane returns empty reads. Call `tabs_select` or take one screenshot to wake it before concluding the page is blank.
- The browser cookie jar is shared with the main session and any browser subagent. Set or clear the cookie you test before each run.
- Fixtures are clock-anchored. When local midnight passes, shift their start times by a day so they still straddle the boundary under test (for example 08:00 HKT). A stale fixture passes or fails for the wrong reason.
- The in-app preview browser is pinned to HKT. To see an organiser in another zone, open a Playwright context: `browser.newContext({ timezoneId: 'America/New_York' })`, then wait for the `(GMT-4)` label before reading.
- The TZ=UTC preview config lives in `.Codex/launch.json`. Add it only for the run and revert it before commit.
- Before/after proof: screenshot each state's crops and Read them, or embed both as base64 in one HTML grid and render it from `file://` in Playwright. `browser_run_code_unsafe` has no `fs`, so write the HTML from bash.
