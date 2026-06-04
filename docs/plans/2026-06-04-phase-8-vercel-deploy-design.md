# Phase 8 — Vercel deploy (design)

_Date: 2026-06-04_
_Status: design approved (brainstorm 2026-06-04). Implementation plan: see follow-up `2026-06-04-phase-8-vercel-deploy.md` produced by `writing-plans` skill._
_Roadmap reference: [[20 — Roadmap/Phased Roadmap]] Phase 8 — "Open the live Vercel URL on a phone → register → email arrives."_

---

## Context

Phase 7 (Resend integration) shipped as code; `RESEND_API_KEY` still needs to land in `.env.local`. All 4 Phase-8 deploy gates are closed (R1 security batch + M1 migration drift). Repository is on `main`, working tree clean (only the pre-existing IDE-local `.claude/launch.json` is unstaged). 91 commits are pushed to `origin/main`.

Phase 8 brings Eventar to the public internet for the first time. It's operational rather than code-heavy: the only repo-side work is a small `next.config.ts` change (security headers) plus running the documented devEmailStub removal protocol. Everything else happens in Vercel, Resend, and a domain registrar.

## User direction recorded during brainstorm

- **Audience:** "First real public event." Real attendees, not a personal demo.
- **Domain:** "Need to procure a domain today."
- **Supabase:** "Existing project = production." No fresh prod project; the dev/prod boundary is the Vercel host, not the DB.
- **Deploy cadence:** "Auto-deploy: every push to main is prod." Matches the single-`main`-branch + batched-push pattern.
- **Hardening:** "Baseline security headers in `next.config.ts`" only. Sentry, uptime monitoring, robots.txt noindex, manual promotion → all deferred.

Key implications:
1. **Resend domain verification is required**, not optional. The sandbox sender `onboarding@resend.dev` is acceptable for the local smoke and the very first Vercel deploy, but `RESEND_FROM_EMAIL` must flip to a verified-domain sender BEFORE the first real attendee registers.
2. **devEmailStub removal happens LOCAL, BEFORE the first prod deploy.** Prod must be single-path from day one — no `process.env.RESEND_API_KEY` branch surviving in production code. The removal protocol is documented at `docs/plans/2026-06-04-phase-7-resend-design.md` §"Removal protocol."
3. **`NEXT_PUBLIC_SITE_URL` becomes hard-required.** `lib/origin.ts` throws in production when it's missing (Rule 12 — misconfig must surface). It must be set in Vercel env to the custom domain before the first deploy.
4. **CSP must not be reflexively strict.** Mapbox tiles + Supabase Realtime + Resend webhook posture (for future Phase 9) all need explicit allowlist entries. A maximally-restrictive CSP that breaks Mapbox is worse than no CSP for an MVP.

---

## Scope

### In scope (code surface — minimal)
- `next.config.ts` — `async headers()` returning baseline security headers (CSP tuned for Mapbox + Supabase, HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin).
- devEmailStub removal — `rm lib/devEmailStub.ts lib/devEmailStub.test.ts` + ~4-line cleanup in `app/(public)/events/[id]/actions.{ts,test.ts}` per the documented protocol.
- `.env.example` — add `RESEND_API_KEY` + `RESEND_FROM_EMAIL` actual key shape (already done in `ec388b2`); add a comment block noting Vercel as the canonical home for prod values.
- `PROJECT_STATE.md` — rotate ACTIVE → Phase 9 (pg_cron) on close-out; rotate JUST-SHIPPED → Phase 8.

### In scope (operational — primary work)
- Domain procurement (USER, registrar of choice).
- Vercel project creation + linkage to `GhostDragooon/Eventar`.
- Vercel env vars (7 entries — see checklist below).
- Resend domain verification (DNS records at registrar).
- First deploy + verified-sender swap.
- End-to-end smoke against the live URL.

### Out of scope (deferred)
- **Sentry / structured error tracking** — Vercel runtime logs are the MVP observability surface.
- **Uptime monitoring** (BetterStack / UptimeRobot) — defer; events are time-bounded and the user will be watching launch day.
- **robots.txt noindex** — defer; the user did not opt in. Site will be indexable from day one.
- **Manual deploy promotion** (`vercel --prod`) — Vercel default auto-deploy on push is fine for solo + batched-push cadence.
- **Fresh production Supabase project** — the existing project IS prod.
- **Staging branch** — violates single-`main`-branch rule (CLAUDE.md Hard Rule 6).
- **Phase 9 (pg_cron)** — that's its own phase. Email #2 / Email #3 wait.
- **`@react-email/components` → `@react-email/ui` migration** — small follow-up logged for post-Phase-8.

---

## Execution stages

Four stages with the two preparatory stages running in parallel where possible.

### Stage 1 — Local prep + domain procurement (parallel)

| Step | Owner | Action |
|---|---|---|
| 1a | USER | Procure domain at chosen registrar. Note nameserver provider. |
| 1b | USER | Drop `RESEND_API_KEY` + `RESEND_FROM_EMAIL='Eventar <onboarding@resend.dev>'` into `.env.local`. |
| 1c | USER | Smoke a local registration against `:3000`. Expect `email_log.status='sent'`, real email arrives. |
| 1d | CONTROLLER | Execute 3-step devEmailStub removal protocol per `docs/plans/2026-06-04-phase-7-resend-design.md` §Removal. Single commit. |
| 1e | CONTROLLER | Add security headers to `next.config.ts` (`async headers()` block). CSP tuned for Mapbox + Supabase. Single commit. |

**Stage 1 success criterion:** working tree contains 2 new commits (stub removal, security headers); `pnpm exec tsc && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build` all clean; test count drops to ~177 (–3 from devEmailStub.test.ts deletion + the integration test's stub-path assertions).

### Stage 2 — Vercel + DNS

| Step | Owner | Action |
|---|---|---|
| 2a | USER+CONTROLLER | Create Vercel project linked to `GhostDragooon/Eventar`. Framework auto-detect = Next.js. Build command default. |
| 2b | USER+CONTROLLER | Wire 7 env vars in Vercel (see checklist). Mark `SUPABASE_SERVICE_ROLE_KEY` + `RESEND_API_KEY` as Sensitive. |
| 2c | USER | Add custom domain in Vercel project settings → copy DNS records emitted (typically A → 76.76.21.21 + CNAME for www) → add at registrar. |
| 2d | USER | Add same domain in Resend → copy SPF/DKIM/DMARC + Return-Path records → add at registrar. |
| 2e | — | Wait for DNS propagation. Typical 15 min – few hours. Both Vercel and Resend show "verified" indicators in their dashboards. |

**Stage 2 success criterion:** Vercel dashboard shows custom domain Active + SSL provisioned; Resend dashboard shows domain Verified across all DNS record types.

### Stage 3 — First deploy + verified-sender swap

| Step | Owner | Action |
|---|---|---|
| 3a | CONTROLLER | Push Stage-1 commits. Vercel auto-deploys (~60–90s). Domain serves real traffic. |
| 3b | USER | In Vercel env settings, change `RESEND_FROM_EMAIL` from sandbox (`Eventar <onboarding@resend.dev>`) to verified (`Eventar <noreply@yourdomain>`). Trigger redeploy. |
| 3c | USER+CONTROLLER | Smoke against the live URL: magic-link login from a different browser → create event → publish → register anonymously from a phone (per roadmap demo state) → confirm real email arrives from verified sender → `/checkin/confirm?code=` works. |

**Stage 3 success criterion:** prod URL responds; magic-link auth works; one real anon registration triggers one real Resend send from the verified sender; `email_log.status='sent'`; `/checkin/confirm` resolves the registration.

### Stage 4 — Phase close

| Step | Owner | Action |
|---|---|---|
| 4a | CONTROLLER | Three-check protocol against live URL (dev-lens review, user-lens review, backtest). Dev-lens reviews the security-headers diff + the stub-removal diff against the design. User-lens covers the cold-start phone journey. Backtest: real prod registration + DB query-back. |
| 4b | CONTROLLER | Update `PROJECT_STATE.md` — rotate ACTIVE → Phase 9, JUST-SHIPPED → Phase 8. Append CARRIED-FORWARD items surfaced by the live smoke. |
| 4c | CONTROLLER | Write `docs/plans/handoff_DDMMYYYY.md` for the session. |
| 4d | USER | Author vault note `20 — Roadmap/Phase 8 — Vercel deploy.md` from this design + the handoff. |

---

## Vercel env-var checklist

Seven entries. Identical names to `.env.local`.

| Var | Value source | Sensitive? | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | No | Public anon URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | No | Public anon key — RLS does the gating |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` | **Yes** | Server-only; bypasses RLS — must be marked Sensitive |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | `.env.local` | No | Restrict to prod origin in Mapbox dashboard before deploy |
| `RESEND_API_KEY` | Resend dashboard | **Yes** | Production code throws if missing |
| `RESEND_FROM_EMAIL` | sandbox initially; verified post-Stage-3b | No | Default in code is `Eventar <onboarding@resend.dev>` |
| `NEXT_PUBLIC_SITE_URL` | custom domain | No | **Required**; `lib/origin.ts` throws in prod if unset |

---

## Security headers — what lands in `next.config.ts`

Direction-only — exact config in the executable plan. Headers to set on all routes:

| Header | Value (sketch) | Why |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Force HTTPS; 2-year max-age standard for HSTS preload eligibility |
| `X-Frame-Options` | `DENY` | Prevent clickjacking of any Eventar page |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing on assets |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Default-safe referrer leakage |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' https://api.mapbox.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com; img-src 'self' data: blob: https://api.mapbox.com https://*.supabase.co; style-src 'self' 'unsafe-inline' https://api.mapbox.com; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` | Tuned for Mapbox tiles + Supabase Realtime (`wss://`) + inline-styled emails. `unsafe-inline` for scripts is regrettable but Next 16's inline bootstrap script needs it; revisit if a CSP nonce strategy lands later |

Mapbox + Supabase Realtime get explicit allowlist entries because they are the two known sources that will fail-loud against a default-deny CSP.

---

## Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| DNS propagation slower than expected | medium | low (just adds wait) | Plan a buffer; Stage 2e can extend by hours. Not a code issue. |
| CSP too strict, breaks Mapbox or Supabase Realtime | medium | high (broken pages) | Backtest Stage 1e change in browser; check console for CSP violations. Adjust before push. |
| Resend outage on launch day | low | high | Production code throws on missing key (Rule 12). Check status.resend.com before publishing the real event. |
| Mapbox token leaks via public bundle | known | low | Token is already in `NEXT_PUBLIC_*` — public by design. Restrict to prod origin in Mapbox dashboard before Stage 2a. |
| `NEXT_PUBLIC_SITE_URL` set wrong (typo, trailing slash, http://) | low | high (QR/email links broken) | `lib/origin.ts` validates; smoke catches it Stage 3c. |
| First real attendee registers before Stage 3b verified-sender swap | low | medium (email from `onboarding@resend.dev` looks unprofessional) | Don't publish the real event until Stage 3b is complete. |
| Stub removed but real Resend path has a bug we didn't catch | low | high (no fallback) | Stage 1c smoke is the safety net; if local Resend works, prod will. If a regression slips, Vercel instant rollback covers ~5s recovery. |

---

## Three-layer pattern compliance (carried-forward checks)

Phase 8 introduces no new mutations or Server Actions, so the three-layer validation + three-layer auth + Q18A/B + Q19 owner-only patterns are unchanged. The carried-forward list in `PROJECT_STATE.md` survives intact.

The one possible exception is if Stage 1e's CSP forces a minor change to inline scripts somewhere — but Next 16's app router doesn't generate inline scripts in our routes (only the bootstrap), so this is not anticipated.

---

## What "Phase 8 shipped" means

Demoable end-state matches the roadmap: open the live Vercel URL on a phone, register against a published event, receive a real confirmation email from the verified sender, hit `/checkin/confirm?code=` and see "Ready to check in." All gates closed; CARRIED-FORWARD updated; vault note + handoff doc written.

After Phase 8 closes, Phase 9 (pg_cron) closes the MVP loop with Email #2 (60-min reminder) and Email #3 (10-min survey invite).
