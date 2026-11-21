---
name: eventar-cron-dispatch-setup
description: Use when Eventar cron-dispatch fails or needs its secrets.
category: tooling
---

# Eventar cron-dispatch: secrets and go-live

The dispatch route fails closed: an unset `CRON_SECRET` returns 503, a wrong secret returns 401 (`app/api/cron/dispatch/route.ts`). The GitHub workflow curls `$SITE_URL/api/cron/dispatch`, so an empty `SITE_URL` makes curl exit 3.

Rule: setting these secrets makes the workflow send reminder emails every 5 minutes. Do not enable it without Ivan's explicit go. Deploy stays paused until Stage 8.

1. Diagnose: read the latest run log, then probe the route status (see `vercel-env-presence-via-fail-closed-probe`). Never print a secret value.
2. Ivan generates `CRON_SECRET`. He sets it in Vercel Production env, then redeploys.
3. Set the same `CRON_SECRET` in GitHub Actions secrets.
4. Set `SITE_URL` in GitHub Actions secrets: the production origin, no trailing slash.
5. Only after go: run `gh workflow run cron-dispatch.yml`, then check the run.
6. While paused, offer `gh workflow disable cron-dispatch.yml` to stop failure runs.
