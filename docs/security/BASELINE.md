# Eventar — Security Baseline

_Last updated 2026-11-25. Aligned with `Eventar_Security_Baseline_Instruction` (2026-11-22). Honest status only — no external pen-test or full-audit claims._

## Scope of this baseline

Minimum protective layer for the **current** product surface:

- Edge WAF + rate limiting (when Cloudflare is in front of production)
- Application-level rate limiting (already in code)
- Accurate encryption and residual-risk statements
- One-page incident playbook

This is **not** SOC 2 / ISO 27001, not a completed 13-layer audit, and not an external penetration test.

## Current deployment reality (blocker for WP-1–3)

| Item | Status |
|------|--------|
| Production deploy | **PAUSED** — needs explicit Ivan go (`PROJECT_STATE`) |
| Canonical prod region | Singapore (`ap-southeast-1`) — **unprovisioned** |
| Linked DB today | Seoul (`ap-northeast-2`) |
| Cloudflare zone / orange-cloud proxy | **Not live** for a public production hostname |
| Origin directly reachable | N/A until a public origin exists behind Cloudflare |

Per the instruction §3: when the domain is not on Cloudflare, document the blocker and ship rule definitions + verification plan so they can be applied the moment the zone is live. That material is in `docs/security/EDGE_RULES_READY.md` and `docs/security/evidence/2026-11-25-baseline-status.md`.

**Edge WAF and edge rate limits are therefore not yet active.** Application-layer controls below are the only live protection today.

## Encryption

| Layer | Status |
|-------|--------|
| **In transit** | TLS expected in production (Cloudflare + origin / Vercel). Local and non-proxied environments may be HTTP. |
| **At rest (platform)** | Supabase/Postgres managed disk encryption (host default). |
| **Application field encryption of personal data** | **Not implemented.** ADR-0003 dual-package (personal Key A / attendance Key B) is **deferred** by doctrine of the baseline instruction and by the ADR itself. Names, phones, licence numbers, profile fields are ordinary columns under RLS. |
| **Auth secrets** | Supabase Auth sessions/cookies; service-role key only in `lib/supabase/admin.ts` with `server-only`. |

Personal details are **access-controlled**, not **app-encrypted**. A privileged DB or server compromise would still see plaintext PII.

## Edge controls (target state — not yet applied)

When Stage 8 deploys and Cloudflare fronts the hostname:

1. Managed WAF ruleset (OWASP / Cloudflare Managed) — Block on high-confidence rules.
2. Custom WAF rules for obvious SQLi, XSS, path traversal (see `EDGE_RULES_READY.md`).
3. Edge rate limits on auth and check-in paths (same file).

Until then, treat edge controls as **planned**, not operational.

## Application-level controls (live in code)

| Control | Where |
|---------|--------|
| Staff route gate | `proxy.ts` (Next 16) + `requireStaff()` + RLS |
| Staff mutation wrapper | `lib/withSecurity.ts` (auth → session rate limit → Zod → handler) |
| IP / session rate limits | `lib/rateLimit.ts` (Postgres `rate_limits`, fixed window; **fails open** on limiter error) |
| Abuse tier | `lib/abuseTier.ts` — 3 session rate-limit hits / 60 min → global session revoke |
| Self check-in | `self_check_in` SECURITY DEFINER RPC: per-event limit for valid codes; IP used on **invalid-code / guessing** path |
| Cron | `CRON_SECRET` fails closed if unset |
| CSP reports | `app/api/security/csp-report` |
| PII in logs | Hard rule: UUIDs only |
| Audited tables | Hard Rule 11 grant revoke including `service_role` for append-only ledgers |

Known limitation called out by the baseline instruction: application rate limits **fail open on DB error**. Edge limits are mandatory once traffic is public.

## Routes that must be edge-rate-limited (discovered)

Exact product paths (methods are page loads and Server Actions; edge rules should match path prefixes):

| Surface | Paths |
|---------|--------|
| Organiser login | `/login` |
| Attendee sign-in | `/account/sign-in` |
| Attendee sign-up | `/account/sign-up` |
| Auth callback | `/auth/callback` |
| Event registration | `/events/[id]` (public register Server Actions under `app/(public)/events/[id]/actions.ts`) |
| **Check-in / short-code (enumeration surface)** | `/checkin/confirm` (query `?code=`); Server Action `selfCheckIn` |
| Survey | `/survey` |
| Invite accept | `/invite/...` |

There is **no classic password-reset route**. Auth is emailed magic link (`signInWithOtp`). Treat “password reset” in the instruction as **not applicable**; do not invent a reset endpoint.

Recommended edge thresholds (from instruction; tune after observation):

| Surface | Window | Max / IP | Action |
|---------|--------|----------|--------|
| Login / sign-in / sign-up | 1 min | 10–15 (sign-up 5–10) | Block or Managed Challenge |
| Check-in confirm | 1 min | 10–20 | **Block** |
| Event registration | 1 min | 20–30 | Block or Challenge |

## What has **not** been done

- External penetration test
- Formal multi-team incident response / CSIRT
- Completed 13-layer production audit
- ADR-0003 dual-package field encryption
- Turnstile / bot management on public forms (Stage 8)
- Live Cloudflare Managed WAF + edge rate limits on production
- Public marketing `/security` page claiming any of the above

## Residual risks (short)

1. **No edge shield** until Cloudflare is live — origin and application limits are the only layers.
2. **Check-in code guessing** — mitigated in DB for invalid codes by IP; not yet edge-limited.
3. **Application rate limiter fails open** on DB errors.
4. **Personal data at rest** is not field-encrypted (ADR-0003 deferred).
5. **Deploy paused** — residual risk is mostly pre-production; risk jumps when a public hostname is published without WP-1–3.

## Vulnerability disclosure

Report security issues to **security@eventar.local** (replace with the real operator mailbox before public launch). Do not file sensitive reports in public GitHub issues.

## Related docs

- `docs/security/INCIDENT_RESPONSE_PLAYBOOK.md`
- `docs/security/EDGE_RULES_READY.md`
- `docs/security/evidence/2026-11-25-baseline-status.md`
- `docs/adr/0003-dual-package-security-and-closed-rag.md`
- `docs/plans/PROJECT_STATE.md`
