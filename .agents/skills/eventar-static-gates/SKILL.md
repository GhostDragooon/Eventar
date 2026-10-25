---
name: eventar-static-gates
description: Use when running Eventar tsc, lint, test or build gates.
category: verification
---

# Eventar static gates: run in order, reset only generated caches

Run the gates one at a time, in this order: `pnpm exec tsc --noEmit`, then `pnpm exec eslint .`, then `pnpm exec vitest run`, then `pnpm exec next build`. Heavy gates run sequentially. Never run `pnpm test:rls` alongside `next build`; contention fakes failures.

- Last recorded baseline (2026-10-16, with the organiser-timezone dashboard change, +1 test): vitest 1501 passed and 404 skipped (187 files passed, 46 skipped); eslint 1 pre-existing error in `app/settings/page.tsx` and 11 warnings; `next build` 39 routes. Expect the delta to match exactly what you changed.
- A test that passes alone but fails in the full run under peer load: check `uptime` first (load was 29 with three peer sessions), then rerun the full suite with `--maxWorkers=4`. Report the first failure as a flake, never as a pass.
- `Test timed out in 5000ms` in files your change did not touch is the same flake. Rerun those files alone (`pnpm exec vitest run <file> ...`) and report the isolated result. On 2026-10-15 three such files failed in the full run and passed 78/78 alone.
- Before commit, scan added copy lines for the em-dash (Decisions Log Q41: no em-dashes in new copy): `git diff -U0 -- app components lib | rg '^\+[^/*].*—'`. Fix any hit that is new copy. A hit on a line you only reshaped (an existing label rewritten around a variable) is pre-existing copy: report it, do not silently rewrite it.
- `next build` regenerates `.next/types`. If tsc then fails on stale generated types, check that no dev server is running (`lsof -nP -iTCP -sTCP:LISTEN`), delete only `.next/dev/types`, and re-run tsc. Never delete source to make a gate pass.
- A tsc run that hangs at low CPU or exits 134 (OOM) after a type change is usually a stale incremental cache, not the change. Reproduce from HEAD: check out the HEAD versions of the changed files in a clean extract (no `.next`), run `tsc`, then restore your files and re-run incrementally with that buildinfo. Deleting `tsconfig.tsbuildinfo` or `.next/cache/.tsbuildinfo` only hides the hang on this checkout; every other checkout hits it on its next incremental build.
- Exported generics that wrap supabase-js `.select(cols)` (e.g. `ownEvents`) OOM incremental tsc when the row type is left inferred. Spell the second select generic out (see `eventar-org-scoped-event-lists`).
- Read the real exit code. Piping hides it in zsh. Use `${pipestatus[1]}` or run the command unpiped first.
- The tree and the local Supabase stack are shared with peer sessions.
- Full `vitest run` needs Supabase env. `tests/helpers/env.ts` throws if `.env.local` is missing, and gated files build a Supabase client at import, so an empty file alone still fails 46 files with "supabaseUrl is required". Pass the local-stack values as process env from `supabase status -o env` (API_URL, ANON_KEY, SERVICE_ROLE_KEY, mapped to NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY), refuse unless API_URL is 127.0.0.1 or localhost, and create an empty `.env.local` only for the run. Delete it after. Never copy values from `.env.local`. Before blaming a failing gate on your change, check the other sessions and their running servers.
