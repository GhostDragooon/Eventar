# Incident / DDoS playbook (one page)

_Eventar — minimal and actionable. No invented CSIRT. Updated 2026-11-25._

## Who to notify

1. **Primary:** Ivan (product owner / operator) — immediate on any suspected breach, mass abuse, or sustained outage.
2. **Hosting:** Vercel status + support (when production is on Vercel).
3. **Data plane:** Supabase project support (Seoul today; Singapore when provisioned).
4. **Edge:** Cloudflare support (when the zone is live and orange-clouded).

Use a private channel; do not post tokens, session cookies, or PII into chat logs.

## If under attack (DDoS / credential stuffing / check-in hammering)

1. **Cloudflare (when live)**
   - Security → Settings → enable **I'm Under Attack Mode** (or equivalent challenge mode).
   - Confirm rate-limit rules on `/login`, `/account/sign-in`, `/account/sign-up`, `/checkin/confirm` are **Block** (not Log).
   - Optionally tighten thresholds temporarily (e.g. check-in 5/min/IP).
2. **Application**
   - Confirm `CRON_SECRET` is set so `/api/cron/*` is not a public mail cannon.
   - Do **not** turn off CPD issuance as a DDoS response unless credit integrity is itself at risk (`CPD_ISSUANCE_ENABLED=false` is a last resort and fails open when unset).
3. **Identity abuse**
   - Application abuse tier already revokes sessions after repeated rate-limit hits (`lib/abuseTier.ts`).
   - For a compromised staff account: remove/suspend the `staff` row and force sign-out via Supabase Auth admin.

## Evidence to preserve

Collect quickly; do not overwrite:

| Source | What |
|--------|------|
| Cloudflare | Firewall events, rate-limit analytics, Security Events export (time window of incident) |
| Application | Server logs (UUIDs only — no PII). Note approximate UTC times |
| Supabase | Auth logs, Postgres logs if available, `audit_events` / `rate_limits` samples for the window |
| Vercel | Deployment and request logs for the same window |

Store exports in a private operator location, not the public repo.

## Suspected data exposure

1. Rotate exposed secrets immediately (Supabase service role, Resend, `CRON_SECRET`, any OAuth client secrets) per operator credentials procedure.
2. Revoke sessions for affected users if Auth is implicated.
3. Record what was exposed (categories, not full dumps) and notification obligations under applicable law — escalate to legal counsel; do not improvise public statements.
4. Past attendance / credit ledger rows are **not** erased on user request (product doctrine); profile suppression ≠ deletion of organiser event evidence.

## Restore normal mode

1. Disable Under Attack Mode when traffic normalises.
2. Return rate-limit thresholds to baseline values in `EDGE_RULES_READY.md`.
3. Write a short incident note: timeline, impact, actions, follow-ups.

## Contacts checklist (fill before public launch)

- [ ] Operator phone / primary chat
- [ ] Cloudflare account + zone ID
- [ ] Vercel team + project
- [ ] Supabase project ref (prod)
- [ ] security@ mailbox monitored
