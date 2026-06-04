# Phase 8 — Vercel Deploy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Take Eventar to a public, custom-domain URL with a verified Resend sender so a real attendee can register and receive a real confirmation email.

**Architecture:** Repo-side work is intentionally minimal — devEmailStub removal (so prod is single-path) plus baseline security headers in `next.config.ts`. The rest is operational: domain procurement, Vercel project + env vars, Resend domain verification, DNS records, first deploy, verified-sender swap, live-URL smoke.

**Tech Stack:** Next.js 16 (App Router) · Vercel · Resend · Supabase (existing prod project) · custom domain (DNS at registrar).

**Source design:** `docs/plans/2026-06-04-phase-8-vercel-deploy-design.md` (commit `2c396f4`).
**Linked removal protocol:** `docs/plans/2026-06-04-phase-7-resend-design.md` §"Removal protocol" (commit `fc938e5`).

---

## Task ownership legend

- **[USER]** — happens in an external dashboard (registrar, Vercel, Resend, Mapbox) or your local `.env.local`. Not automatable from this session.
- **[CONTROLLER]** — happens in this repo / this session.
- **[USER+CONTROLLER]** — pair task: user does the dashboard click; controller can verify via CLI or browser.

No TDD scaffolding on operational tasks — there's nothing to red-then-green when the work is "click these 7 fields in Vercel." Operational tasks have explicit verification commands instead.

---

## Stage 1 — Local prep + domain procurement (parallel)

### Task 1: Procure domain — [USER]

**Action:**
1. Pick a registrar. Recommended: Cloudflare Registrar (at-cost), Vercel Domains (one-click but slight markup), or Namecheap (familiar).
2. Buy the domain. Confirm it shows in the registrar's DNS management page.
3. Note the registrar's name + the nameserver provider (Cloudflare delegates to its own DNS by default; most others use the registrar's DNS).

**Verification (USER):** Domain appears in registrar dashboard; you can see and edit DNS records for it.

**No commit.** This is an out-of-repo step.

---

### Task 2: Add Resend keys to `.env.local` — [USER]

**Files:**
- Modify: `.env.local` (gitignored, never committed)

**Action:** Append these two lines (replace `re_...` with your actual key from https://resend.com → API Keys → Create):

```dotenv
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL='Eventar <onboarding@resend.dev>'
```

Sandbox sender is correct for now — it requires no domain verification. Verified-domain sender swap happens in Task 9 once DNS is live.

**Verification (USER):** Run from repo root:

```bash
grep -c "^RESEND_API_KEY=re_" .env.local
```

Expected output: `1`

**No commit.** `.env.local` is gitignored.

---

### Task 3: Local smoke — real Resend send — [USER]

**Action:**
1. Make sure dev server is up on `:3000` (per CLAUDE.md it's always running).
2. From an incognito window, register against any published event on `http://localhost:3000/events/<id>` using a real email you control.
3. Watch the dev terminal for the registerForEvent log lines.
4. Check inbox for confirmation email.

**Verification (USER):**

```bash
# In Supabase SQL editor (read-only check; copy & run):
select id, status, sent_at, error
from email_log
order by created_at desc
limit 1;
```

Expected: latest row has `status='sent'`, `sent_at` is non-null, `error` is null. Email arrives in your inbox (check spam folder; sandbox sender often spam-filtered).

**If `status='failed':** stop. Check the `error` column. Most likely cause: API key typo or Resend key permissions. Fix `.env.local`, restart dev server, retry. Do NOT proceed to Task 4 until status='sent' is confirmed at least once.

**No commit.**

---

### Task 4: Execute devEmailStub removal protocol — [CONTROLLER]

**Files (4):**
- Delete: `lib/devEmailStub.ts`
- Delete: `lib/devEmailStub.test.ts`
- Modify: `app/(public)/events/[id]/actions.ts` (lines 12-16, 159-161, 187-192)
- Modify: `app/(public)/events/[id]/actions.test.ts` (lines 14-15, 198-215)

**Step 1: Delete the stub files**

```bash
rm lib/devEmailStub.ts lib/devEmailStub.test.ts
```

**Step 2: Edit `app/(public)/events/[id]/actions.ts`**

Replace lines 12-16 (the TEMP dual-import block):

```ts
// TEMP: dual import while RESEND_API_KEY is being set up.
// REMOVE both lines + the env-switch below once the key is in .env.local.
// See docs/plans/2026-06-04-phase-7-resend-design.md §"Removal protocol".
import { sendEmail as sendEmailReal } from '@/lib/resend';
import { sendEmail as sendEmailStub } from '@/lib/devEmailStub';
```

with the single-import line:

```ts
import { sendEmail } from '@/lib/resend';
```

Replace lines 159-161 (the env-switch comment block + assignment):

```ts
  // Step 6 — render template + dispatch via the facade.
  // TEMP: env switch picks devEmailStub when RESEND_API_KEY unset. See design doc.
  const sendEmail = process.env.RESEND_API_KEY ? sendEmailReal : sendEmailStub;
```

with the single-line comment:

```ts
  // Step 6 — render template + dispatch via the facade.
```

Delete the `else if ('skipped' in sendResult) { ... }` branch (lines 187-192). After deletion, the if/else structure reads:

```ts
  // Step 7 — close the ledger per outcome; registration_id always set.
  const logUpdate: Record<string, unknown> = { registration_id: reg.id };
  if ('ok' in sendResult) {
    logUpdate.status = 'sent';
    logUpdate.sent_at = new Date().toISOString();
  } else {
    logUpdate.status = 'failed';
    logUpdate.error = `${sendResult.error.code}: ${sendResult.error.message}`;
  }
```

**Step 3: Edit `app/(public)/events/[id]/actions.test.ts`**

Delete line 15 (the devEmailStub mock):

```ts
vi.mock('@/lib/devEmailStub', () => ({ sendEmail: mockSendStub }));
```

In the `vi.hoisted` block at lines 10-13, drop `mockSendStub`:

```ts
const { mockSendReal } = vi.hoisted(() => ({
  mockSendReal: vi.fn(),
}));
```

Delete the entire "uses devEmailStub when RESEND_API_KEY is unset" test case (lines 203-215). Also drop the `mockSendStub.mockReset()` line (~199) and the `delete process.env.RESEND_API_KEY` line (~200) from the `beforeEach` since the real-key path is now the only path. Verify the remaining two test cases ("uses real sender ... ok response" and "uses real sender ... error response") still have their `process.env.RESEND_API_KEY = 'test_key'` setup lines.

**Step 4: Run all gates — expect clean**

```bash
pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run
```

Expected: tsc clean, eslint 0 errors (warnings unchanged from before this task), vitest **178/178** (was 180; –2 because we removed the stub test file's 1 test and 1 test from actions.test.ts). If vitest reports a different delta, investigate before proceeding — likely you missed a step.

**Step 5: Run `next build` — expect clean**

```bash
pnpm exec next build
```

Expected: exit 0, 14 routes (unchanged).

**Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(email): remove devEmailStub — production code is single-path

Phase 7 shipped two parallel email senders (real + stub) so the
infrastructure could land before the Resend credentials. With
RESEND_API_KEY now in .env.local and a successful local smoke (Task 3),
the stub is removed per docs/plans/2026-06-04-phase-7-resend-design.md
§"Removal protocol."

- rm lib/devEmailStub.ts lib/devEmailStub.test.ts
- actions.ts: dual import collapses to single; env-switch removed;
  'skipped' branch in step-7 ledger update deleted (TS dead-code).
- actions.test.ts: drop the 'uses stub' test + the mockSendStub
  scaffolding around it.

Test count 180 → 178. Phase 8 prep.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Baseline security headers in `next.config.ts` — [CONTROLLER]

**Files:**
- Modify: `next.config.ts` (currently 7 lines — just the boilerplate `NextConfig` import + empty config)

**Step 1: Replace the entire file**

```ts
import type { NextConfig } from 'next';

// CSP — explicit allowlist because:
// - Mapbox: tiles + telemetry from api.mapbox.com / events.mapbox.com (Phase 1.5 venue search).
// - Supabase: REST + Realtime (wss://) on *.supabase.co.
// - 'unsafe-inline' for script-src: Next 16's app-router emits inline bootstrap;
//   revisit with a nonce strategy if/when CSP tightens.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://api.mapbox.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com",
  "img-src 'self' data: blob: https://api.mapbox.com https://*.supabase.co",
  "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy', value: csp },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
```

**Step 2: Restart the dev server**

```bash
# In a separate terminal — controller does NOT start a new dev server.
# Ask the USER to restart their `pnpm dev` so the new next.config.ts applies.
```

**Step 3: Backtest in browser (USER, eyes-on)**

USER opens DevTools → Network tab → Response Headers → reload `http://localhost:3000`. Confirm:
- `strict-transport-security`, `x-frame-options`, `x-content-type-options`, `referrer-policy`, `content-security-policy` all present.
- DevTools → Console: NO red CSP violation messages on:
  - `/` (landing)
  - `/dashboard` (Mapbox not loaded here, but Supabase wss: is)
  - `/events/<id>/edit` (Mapbox venue search active — this is the critical CSP test)
  - `/events/<id>` (public, Mapbox active)

If CSP violations appear, identify the offending host, add to the appropriate directive (most likely `connect-src` for a new endpoint or `img-src` for a missed image host), reload, verify clean.

**Step 4: Run all gates — expect clean**

```bash
pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build
```

Expected: all clean. Test count unchanged at 178. Routes unchanged at 14.

**Step 5: Commit**

```bash
git add next.config.ts
git commit -m "$(cat <<'EOF'
feat(security): baseline security headers in next.config.ts

Adds Strict-Transport-Security (HSTS, 2y preload-eligible),
X-Frame-Options DENY, X-Content-Type-Options nosniff,
Referrer-Policy strict-origin-when-cross-origin, and a
Content-Security-Policy tuned for Mapbox (tiles + telemetry)
and Supabase (REST + Realtime over wss://).

'unsafe-inline' in script-src is regrettable but Next 16's
app-router emits inline bootstrap; revisit with a nonce
strategy if a future phase tightens CSP further.

Phase 8 prep.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Stage 2 — Vercel + DNS

### Task 6: Create Vercel project + wire env vars — [USER+CONTROLLER]

**Action (USER):**
1. https://vercel.com/new → import `GhostDragooon/Eventar`.
2. Framework Preset: Next.js (auto-detected). Build/Output commands: defaults.
3. Don't deploy yet — click into Project Settings → Environment Variables.
4. Add the 7 env vars from the design doc's checklist. For each: mark **Production + Preview + Development** environments unless the table below says otherwise. Mark Sensitive where indicated.

| Var | Value | Sensitive | Environments |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from `.env.local` | No | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from `.env.local` | No | All |
| `SUPABASE_SERVICE_ROLE_KEY` | from `.env.local` | **Yes** | Production only (no Preview/Development) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | from `.env.local` | No | All |
| `RESEND_API_KEY` | from Resend dashboard | **Yes** | Production only |
| `RESEND_FROM_EMAIL` | `'Eventar <onboarding@resend.dev>'` (sandbox for now) | No | All |
| `NEXT_PUBLIC_SITE_URL` | the custom domain you procured in Task 1 (e.g. `https://eventar.example`) | No | Production only |

**Why service role + Resend keys are Production-only:** Vercel preview deploys run on `*.vercel.app` subdomains. Limiting these to Production means a preview deploy literally cannot send real email or bypass RLS. If you want preview deploys to be fully functional later, add them to Preview env then — but for Phase 8, keep blast radius tight.

5. Trigger NO deploy yet. Domain still needs to land.

**Verification (CONTROLLER):**

```bash
# Confirm the Vercel CLI sees the project (no deploy yet)
pnpm dlx vercel projects ls 2>&1 | grep -i eventar
```

If you don't have Vercel CLI authed, skip — verification is done in Vercel dashboard by USER.

**No commit.** Vercel state is external.

---

### Task 7: Custom domain at Vercel + DNS records — [USER]

**Action:**
1. Vercel Project → Settings → Domains → "Add Domain". Enter the domain from Task 1.
2. Vercel emits 2 DNS records (or 1, depending on apex vs subdomain):
   - Apex (`eventar.example`): A record to `76.76.21.21`
   - `www`: CNAME to `cname.vercel-dns.com`
3. Add both at your registrar's DNS panel.

**Verification (USER):**

```bash
# From any terminal — DNS lookup. Replace eventar.example with your domain.
dig +short eventar.example A
# Expected after propagation: 76.76.21.21
```

Vercel dashboard shows green checkmark next to domain when DNS is verified.

**Wait time:** typically 15-60 minutes; up to a few hours.

**No commit.**

---

### Task 8: Resend domain verification + DNS records — [USER]

**Action:**
1. https://resend.com → Domains → Add Domain. Enter the same root domain from Task 1.
2. Resend emits SPF + DKIM + DMARC + Return-Path records (typically 4-5 TXT/CNAME records).
3. Add all at your registrar's DNS panel.
4. Click "Verify" in Resend dashboard. May take 5-30 minutes after DNS propagation.

**Verification (USER):** Resend dashboard shows green Verified on each record type (SPF, DKIM, DMARC, Return-Path).

**Pitfall:** if SPF already exists for the domain (e.g. you have Google Workspace), DO NOT add a second SPF TXT record — merge into the existing one (Google's `include:_spf.google.com` + Resend's `include:amazonses.com` in one record). Multiple SPF records = SPF fails.

**No commit.**

---

## Stage 3 — First deploy + verified-sender swap

### Task 9: First deploy + verified sender swap — [USER+CONTROLLER]

**Step 1 (CONTROLLER): Push the Stage-1 commits**

```bash
git push origin main
```

Expected: Vercel webhook fires; auto-deploy begins. Build log visible in Vercel dashboard.

**Step 2 (USER): Watch the build log**

Vercel dashboard → Deployments → latest → Build Logs. Expect:
- `pnpm install` (uses pnpm-lock.yaml).
- `pnpm next build` → 14 routes built.
- Output: "Ready in <duration>"

**Expected build time:** ~60-90 seconds.

**Step 3 (USER): Hit the live URL**

Visit `https://eventar.example`. Expect:
- Landing page renders.
- DevTools → Response Headers shows all 5 security headers.
- HTTPS works (Vercel auto-provisions SSL).
- DevTools → Console: zero CSP violations on landing + dashboard + a published event page.

**Step 4 (USER): Switch `RESEND_FROM_EMAIL` to verified sender**

Vercel → Project → Settings → Environment Variables → `RESEND_FROM_EMAIL`. Change from:

```
Eventar <onboarding@resend.dev>
```

to (use a sender at the verified domain from Task 8):

```
Eventar <noreply@eventar.example>
```

Vercel → Deployments → click latest → "Redeploy" (or push any commit; the auto-deploy picks up new env). Wait for redeploy to complete (~60s).

**Verification:**
- Visit the live URL after redeploy → still loads.
- Continue to Task 10 for the actual end-to-end smoke.

**No commit.** All operational.

---

### Task 10: End-to-end live smoke — [USER+CONTROLLER]

**Step 1 (USER): Magic-link login from a fresh browser**

1. Open incognito → `https://eventar.example/login`.
2. Enter your staff email. Click "Send link."
3. Email arrives from `noreply@eventar.example` (verified sender). Click link.
4. You're at `/dashboard`.

**Step 2 (USER): Create + publish a real test event**

1. Dashboard → "Create event."
2. Title: "Phase 8 smoke event." Date: tomorrow. Time: any. Venue: any (use Mapbox search to confirm the API works through CSP).
3. Save draft. Then click Publish on the details view.
4. Copy the public event URL.

**Step 3 (USER): Anonymous register from a phone**

1. On your phone (not the staff browser), open the public event URL.
2. Fill the registration form with a real email you control on the phone.
3. Submit.
4. Within ~5 seconds, your phone's inbox shows a confirmation email from `noreply@eventar.example`.
5. Email contains a 6-char registration code (per the post-R1 widening) and a "Confirm attendance" link to `https://eventar.example/checkin/confirm?code=...`.

**Step 4 (USER): Hit the check-in confirm link**

Tap the link in the phone email. Expect:
- Page loads.
- "Ready to check in" + the event name.
- Click "Confirm" → "You're checked in" confirmation.

**Step 5 (USER + CONTROLLER): Backtest via Supabase SQL editor**

Run in the Supabase SQL editor:

```sql
-- Last 3 email_log rows: expect 1 'sent' for the registration, 0 'queued', 0 'failed'.
select id, purpose, status, sent_at, registration_id, error
from email_log
order by created_at desc
limit 3;

-- Last 3 registrations: expect 1 row, with attended_at populated.
select registration_code, full_name, email, attended_at
from registrations
order by created_at desc
limit 3;
```

Expected:
- One new `email_log` row, `status='sent'`, `sent_at` is recent, `error=null`.
- One new `registrations` row, `attended_at` populated (you confirmed in step 4).

**Step 6 (USER): Delete the smoke event** (optional cleanup)

You created a real event in prod. If it pollutes your dashboard, delete it via the Supabase SQL editor:

```sql
delete from events where title = 'Phase 8 smoke event';
-- cascade deletes registrations + email_log rows
```

**Failure modes:**
- Login email never arrives → check Resend dashboard → Logs. If "delivered" but inbox doesn't show it, check spam.
- Public event page fails to render → check Vercel → Functions → recent invocations for the error.
- Mapbox search returns nothing → CSP `connect-src` likely missing `api.mapbox.com` or `events.mapbox.com`. Check DevTools Console for CSP violation; patch `next.config.ts` and redeploy.

**No commit.**

---

## Stage 4 — Phase close

### Task 11: Three-check protocol against live URL — [CONTROLLER]

**Step 1: Dev-lens review (subagent)**

Dispatch a code-reviewer or general-purpose subagent with this brief:

```
Review the diff between origin/main at the start of Phase 8 and HEAD now (run `git log fb6a180..HEAD --oneline` to see the scope).

Focus on:
- Stub removal cleanliness: any orphan refs to devEmailStub? Run `grep -rn "devEmailStub\|sendEmailStub\|skipped: true" .` and verify only docs hits remain.
- Security headers correctness: CSP directives consistent with how Mapbox + Supabase are used in the codebase.
- No new mutations introduced that bypass requireStaff or RLS.
- Project rule compliance: read /Users/ivan/Eventar/CLAUDE.md and confirm the 13 rules are honoured in the diff.

Report: list of findings (Critical/Important/Nice-to-have) + a verdict (ready-for-handoff / needs-fix).
```

Address Critical + Important findings before proceeding.

**Step 2: User-lens review (subagent, MUST be a different subagent from step 1)**

Dispatch a fresh subagent (general-purpose) with this brief:

```
You are a first-time visitor to https://eventar.example. You have a workshop invitation in your email and want to register.

Walk through the cold-start journey on the live URL. Report:
- What's confusing in the public flow (event details, registration form, post-submit confirmation page)?
- What's confusing in the email (subject, copy, the embedded link's target)?
- After clicking the link: is it obvious you "did the right thing"? Are error states clear?
- Accessibility: tab order, focus indicators, error message contrast.

Do NOT review code. Browse the live site only.
```

Address misleading-copy / dead-end findings before proceeding.

**Step 3: Live backtest**

Repeat Task 10 once more, end-to-end, from a different device/email. Confirm the second registration also lands `email_log.status='sent'`.

**No commit yet** — that's Task 12.

---

### Task 12: Rotate PROJECT_STATE + write handoff — [CONTROLLER]

**Files:**
- Modify: `docs/plans/PROJECT_STATE.md`
- Create: `docs/plans/handoff_DDMMYYYY.md` (use today's date when this task runs)

**Step 1: Rotate `PROJECT_STATE.md`**

Move the ACTIVE PHASE section to JUST SHIPPED. Set ACTIVE PHASE to Phase 9 (pg_cron — reminders + survey invites). Remove all CARRIED-FORWARD entries that closed during Phase 8:
- Drop "Phase-8 deploy gates" (all 4 are now closed AND deployed).
- Drop "devEmailStub removal protocol" (executed in Task 4).
- Drop "`NEXT_PUBLIC_SITE_URL` must be set in Vercel" (set in Task 6).
- Keep "@react-email/components → @react-email/ui migration" (still applies).
- Keep "Phase 9 (pg_cron) will read email_log" (still applies).
- Keep the Q18/Q19 + three-layer + rate-limit patterns (always-on).

Add a new CARRIED-FORWARD item for any Phase-8 finding that didn't get addressed (e.g. if CSP needed loosening for a host you discovered during smoke).

**Step 2: Write `docs/plans/handoff_DDMMYYYY.md`**

Mirror the structure of `handoff_04062026.md`:
- Session outcome (one paragraph)
- What shipped (table by stage)
- Static gates at handoff
- Architecture decisions worth remembering
- Two-lens review summary
- Backtest evidence (live smoke)
- Open items
- Next session pointer (Phase 9)

**Step 3: Commit + push**

```bash
git add docs/plans/PROJECT_STATE.md docs/plans/handoff_*.md
git commit -m "$(cat <<'EOF'
docs(handoff): Phase 8 shipped — Eventar is live on <domain>

Public custom-domain URL. Verified Resend sender. Real attendee
registration smoke-tested end-to-end. CARRIED-FORWARD updated.
Phase 9 (pg_cron) is the next active phase.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin main
```

The push triggers a Vercel auto-deploy of the doc-only change. Harmless.

---

### Task 13: Vault note — [USER]

**Action:** Author `/Users/ivan/Desktop/Eventar/20 — Roadmap/Phase 8 — Vercel deploy.md` in Obsidian.

Draw content from:
- This plan document (the execution shape)
- `docs/plans/2026-06-04-phase-8-vercel-deploy-design.md` (the decisions)
- `docs/plans/handoff_DDMMYYYY.md` from Task 12 (what actually happened)

Pattern matches the prior phase notes (`Phase 1 — Foundation.md`, `Phase 6.5 — Dashboard Redesign...md`, etc.). The vault is user-maintained and not git-tracked.

**No commit.**

---

## Definition of Done

Phase 8 is shipped when:

- [ ] Tasks 1-13 complete.
- [ ] All gates clean: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build`. Test count 178.
- [ ] Live URL `https://<your-domain>` serves Eventar.
- [ ] Magic-link login works against verified sender.
- [ ] Anonymous registration triggers a real email from the verified sender.
- [ ] `email_log.status='sent'` for the smoke registration (DB-confirmed).
- [ ] Security headers present on all routes (5 headers verified in browser).
- [ ] CSP-zero-violation on the 4 surfaces tested in Task 5.
- [ ] PROJECT_STATE.md rotated; handoff doc written + pushed.
- [ ] No "Critical" findings outstanding from Task 11's two-lens review.
- [ ] Vault note authored (Task 13).

After Phase 8, the MVP is one phase from complete. Phase 9 (pg_cron-driven Email #2 + Email #3) closes the loop.
