# Cron — Automated Dispatch

The dispatch endpoint at `/api/cron/dispatch` fires reminder emails (carrying the personal QR pass) ~60 min before event start and survey invites ~10 min after event end. Both also have manual "Send now" buttons on the Event Manager details page as a fallback.

## Trigger options

### 1. GitHub Actions (default)

The workflow at `.github/workflows/cron-dispatch.yml` fires every 5 minutes.

**Setup:**
1. Add two repository secrets in GitHub → Settings → Secrets:
   - `CRON_SECRET` — must match the production environment's `CRON_SECRET`
   - `SITE_URL` — the production origin (same value as `NEXT_PUBLIC_SITE_URL`, e.g. `https://eventar.example.com`)
2. The workflow runs automatically. Use "Run workflow" in the Actions tab to test manually.

GHA cron is best-effort (may skip or delay a tick), but both dispatch windows have ample slack: reminders have a 60-min window, surveys have a 24-hour window.

### 2. Vercel Cron

Requires the Pro plan. The Hobby plan caps crons at one run per day, which misses every reminder window. If on Pro, add to `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/dispatch",
    "schedule": "*/5 * * * *"
  }]
}
```

Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when `CRON_SECRET` is set in the project environment.

### 3. pg_cron + pg_net

Host-independent but requires enabling both extensions on the Supabase project and storing `CRON_SECRET` in the Supabase Vault. Suited for a self-hosted setup.

### 4. Plain crontab

On any server with `curl`:

```
*/5 * * * * curl -sf -X POST -H "Authorization: Bearer $CRON_SECRET" "$SITE_URL/api/cron/dispatch"
```

## Cadence

At 5-minute ticks:
- Reminders land 55–60 min before start (window is 60 min wide)
- Surveys land within 5 min of opening (window is 24 h wide)

A tick interval longer than 60 minutes **will miss reminder windows**. Stay at 5 min or shorter.

## Authorization

The endpoint validates `CRON_SECRET` via timing-safe compare. It returns:
- **503** when `CRON_SECRET` is not configured on the server
- **401** on secret mismatch
- **200** with a JSON body listing scanned candidates and dispatched sends

## Manual fallback

The Event Manager details page has "Send reminders now" and "Send survey invites" buttons. These bypass the scheduler and work whether or not a cron trigger is configured.
