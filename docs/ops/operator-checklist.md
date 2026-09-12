# Operator Checklist — Eventar MVP

## Environment

- [ ] `.env.local` points at the correct Supabase project (local stack for dev, Seoul/Singapore for production)
- [ ] `NEXT_PUBLIC_SITE_URL` is set (lib/origin.ts throws without it in production; for demo use a LAN-reachable address like `http://192.168.x.x:3100`)
- [ ] `CRON_SECRET` is set (dispatch route returns 503 without it)
- [ ] `RESEND_API_KEY` is set for real email delivery (unset = dev stub, emails logged to console only)
- [ ] Supabase dashboard → Auth → "Secure email change" is **enabled** on the production project

**Wrong-target check:** `.env.local` defaults to the Seoul production project. For local development and RLS tests, use `scripts/demo/dev-local.sh` (port 3100) which derives env vars from `supabase status`. Never run `pnpm test:rls` against a hosted project — the test client guard blocks it.

## First organisation setup

See [org-onboarding.md](org-onboarding.md) for the full steps:

1. An `eventar_staff` operator provisions the org (Server Action or SQL)
2. First admin signs in via `/login`, lands on Programme
3. First admin uses Settings > Team to invite members via link

## Event lifecycle — the happy path

1. **Create event** — `/events/new` (title, date/time, venue, agenda, optional capacity)
2. **Set CPD accreditation** — Event details page, if this is an accredited event
3. **Publish** — Event details page → Publish button (locks CPD config)
4. **Share** — Copy the public event URL for registration
5. **Reminder** — Fires automatically ~60 min before start (requires cron; see [cron.md](cron.md)). Fallback: "Send reminders now" button on the details page
6. **Check-in** — Event check-in page: scan QR / enter code / walk-in button
7. **Survey** — Fires automatically ~10 min after end (same cron). Fallback: "Send survey invites" button on the details page
8. **Export** — Event details page: "Export attendance" (CSV) and "Export evidence" (JSON+CSV)

## Cron setup

See [cron.md](cron.md). Without a trigger, reminders and surveys only fire when staff clicks the manual buttons.

## Email modes

| `RESEND_API_KEY` | Behaviour | UI indicator |
|---|---|---|
| Set | Real delivery via Resend | — |
| Unset | Stub: logged to console, not sent | Yellow "Dev mode" banner on Programme/Manage; "dev mode" copy on registration success |
