# Full-stack security audit, 2026-11-04

Read-only review. Nothing in the repo was changed, nothing upgraded, nothing pushed. Local stack only (Postgres :54322, app :3100). `.env.local` and the Supabase MCP were not touched.

Method: deterministic scans (pnpm audit, secret grep over tree and history, DB grant/RLS/definer sweep, live headers), then five read-only lenses (dependencies, access control, input/crypto, database, unauthenticated runtime). Lens output is a lead, not a verdict. Each finding carries how it was verified.

Verification labels: EXECUTED (run against local stack), SOURCE (read from code/config), VENDOR (advisory text), INFERENCE.
"Re-checked" = I re-ran or re-read it myself after the lens reported.

Raw lens reports (scratchpad, not in repo): `sec-deps.md`, `sec-authz.md`, `sec-input.md`, `sec-db.md`, `sec-runtime.md`.

## Not covered

- Hosted Supabase Auth settings and the hosted PostgREST version (cannot be seen from here). F1 depends on them.
- Production-mode behaviour: :3100 is a dev server. Dev-preview gate, source maps, error pages, prod Cache-Control are unproven.
- Authenticated runtime walk, HTTP-level Storage/GoTrue/GraphQL/websocket tests.
- `lib/cpd`, the `self_check_in` and `rate_limit_check` bodies, the claim/OTP flow, remaining accreditation RPC bodies.
- Strix (not installed; needs an LLM key and budget), gitleaks, semgrep. No exploit-proven scan was run.
- Secrets: no secret-shaped strings in tracked files or git history; `.env.local` not tracked. This was a pattern grep, not a full secret scanner.

## High (conditional or exposed)

### H1. Staff identity is the email string, and no path checks it is confirmed
- Where: `proxy.ts:90`, `lib/auth.ts:111`, `lib/auth.ts:178`, `app_private.auth_email()` (reads the JWT email claim). `provisionOrganisation` (`app/settings/orgActions.ts:15-62`) inserts an active `organiser_admin` row for an email that has not logged in.
- Local `supabase/config.toml`: `enable_signup = true`, `enable_confirmations = false`; local GoTrue reports `mailer_autoconfirm=true`.
- Scenario: if the hosted project also has Confirm email off and open signup, anyone with the public anon key signs up with a provisioned staff email and gets that staff row's powers. Not executed (would create an account). Local: 168 active staff rows, all confirmed, so no live exploit locally.
- Also contradicts Hard Rule 1 (UUID-keyed); `staff` has no `user_id` column. Debt already recorded in PROJECT_STATE (2026-10-31 ruling). Severity here comes from the config risk, not the debt.
- Verified: SOURCE + local config; re-checked (lookup sites, no `email_confirmed_at` in the staff path). Three lenses reported it independently.
- Fix: (1) Ivan checks hosted Auth → "Confirm email" is ON and password signup is closed. (2) Require `email_confirmed_at` in one shared helper used by `requireStaff`, `getStaffSessionState`, `proxy.ts`, and in SQL `auth_email()`. (3) Long-term: `staff.user_id`.

### H2. `next@16.2.12` is behind on security releases
- `pnpm audit --prod`: 5 critical + 12 high under the `next` subtree.
- EXPOSED: GHSA-p3m5-59mp-jv5r, Server Actions denial of service, unauthenticated, no workaround. The app has 32 `'use server'` files, public ones included (survey).
- Judged not reachable (SOURCE/VENDOR, not tested on a running server): image-optimizer RCEs (no `images` config, no attacker-supplied image path), `use cache`, `next/og`, image SSRF, ISR cache poisoning, `next dev` MCP endpoint (dev machine only). UNKNOWN: GHSA-p293-qw3h-jr36 applies only on a Windows host (Stage 8 host not chosen).
- Fix: bump `next` and `eslint-config-next` together (both pinned exactly) to 16.4.5; this is a minor jump 16.2 → 16.4, so run the full gate. The lens downloaded 16.4.5 and confirmed `experimental.serverActions.bodySizeLimit` is still valid; no build or test was run on it. Then `pnpm install` and re-run `pnpm audit --prod`.
- Needs Ivan's go (dependency upgrade, Stage 8 not started).

## Medium

### M1. `bulk_update_event_status`: no role gate, caller-supplied audit actor
- `app/dashboard/actions.ts` only calls `requireStaff()`; the RPC calls `resolve_actor(..., variadic array[]::text[])` with an empty role list, so any active role passes (`auditor`, `body_admin` can cancel or soft-delete events in their own org). Org scoping holds (0 rows on another org's events).
- EXECUTED (DB lens): as an org-B admin, cancelling an org-B event with another user's uuid in `p_actor_user_id` wrote that user as the actor in `audit_events`. Audit attribution is forgeable.
- Also: `p_event_ids` not validated as uuids and unbounded.
- Re-checked: function body and action (SOURCE); `authenticated` holds EXECUTE (EXECUTED).
- Fix: the app calls it with the service-role client, so `revoke execute ... from authenticated` costs nothing; add a role gate (`canManageEvents`-style helper) in the action; Zod `z.array(z.string().uuid()).max(n)`.

### M2. `consent_records` is writable and forgeable by any signed-in user
- Grants: `authenticated` has INSERT/UPDATE/DELETE. Policies `consent_self_insert` / `consent_self_withdraw` only check `user_id = auth.uid()`. No app code writes it with the user client; `grant_consent` and `withdraw_consent` exist.
- EXECUTED (DB lens): inserted a row with version `forged` and `granted_at` 1999; rewrote own `granted_at`, `withdrawn_at`, `version`, `consent_type`. Cross-user writes failed.
- Re-checked: grants (t/t/t) and the policy text.
- Already noted in the `eventar-grant-guard-proof` skill on 2026-11-01 and still open. A consent record people may rely on as legal evidence is user-editable.
- Fix (migration, Hard Rule 11): revoke INSERT/UPDATE/DELETE from `authenticated`, drop the two self-write policies, add the table to `tests/rls/audited_table_writes.rls.test.ts`, seed.sql and the CI replay gate in the same commit.

### M3. No enforcing CSP and no clickjacking protection
- `frame-ancestors 'none'` exists only in `Content-Security-Policy-Report-Only`; browsers ignore it there. No `X-Frame-Options` on any route, so `/login`, sign-in and check-in can be framed.
- EXECUTED (headers on :3100, re-checked on `/` and `/login`). `script-src` also allows `'unsafe-inline'` (deferred nonce work).
- Fix: add `X-Frame-Options: DENY` (or an enforcing `Content-Security-Policy: frame-ancestors 'none'`) in `next.config.ts`; `poweredByHeader: false`.

### M4. CSV formula injection in every export
- `lib/csv.ts:6-12` quotes cells but never neutralises a leading `=`, `+`, `-`, `@`, tab or CR. Anonymous registrants control `full_name` (max 100, trimmed) and email; they reach attendance, college and participants exports opened in Excel by organisers and HK College administrators.
- Re-checked in source; not executed end to end.
- Fix once in `csvEscape`: prefix `'` to cells starting with those characters; add a test.

### M5. Registration code is a weak long-lived bearer token
- 6 chars from 31 symbols (~30 bits), CSPRNG, unsigned, no expiry. It is the only credential for anonymous `selfCheckIn`, the survey and the credit-status lookup. Legacy 4-char `WK-` codes (~20 bits) are still accepted (`lib/registrationCode.ts:22`).
- Limiter is 60 req/min per IP and the IP is the leftmost `X-Forwarded-For`, safe only on Vercel; the host is undecided until Stage 8. `submitSurvey` also reveals whether a guessed code is valid. A guesser could mark an absent registrant attended and trigger a CPD credit.
- SOURCE only; the `self_check_in` function body and its DB-side limits were not read.
- Fix: retire the legacy format, add a per-code and per-event failure limit, pin the proxy-IP rule to the chosen host.

### M6. Storage buckets
- `avatars`: no `file_size_limit`, no `allowed_mime_types`, listable by anon; action checks only the client-declared type. Any signed-in user can put arbitrary content under `<uid>/*` via the Storage API. Path is fixed to `<uid>/avatar`, so no traversal.
- `event-hero-images`: any staff member of any org can insert at any path (INSERT 0 1 executed at an org-A-style path); overwrite/delete blocked in SQL; HTTP API not tested.
- Fix: set bucket limits and MIME allow-list in a migration, add magic-byte check in the action, scope the hero-image insert policy to the caller's org path.

### M7. Unauthenticated mail and registration abuse
- `sendMagicLink` and `sendAttendeeMagicLink` have no app-level rate limit; Turnstile is not wired anywhere. The staff `/login` door can create auth users (`shouldCreateUser` default true). `registerForEvent` has only 30/min per IP and no proof of email ownership (spam third parties, squat seats); its capacity check is not atomic, so concurrent submits can oversubscribe.
- Responses are uniform for known and unknown emails (no account enumeration). SOURCE.
- Fix: `rateLimit` on both doors keyed by email and IP, Turnstile (Stage 8), atomic capacity check inside the registering RPC.

### M8. Dependency hygiene that clears most of the audit noise
- `shadcn` is in `dependencies` but its only use is `@import "shadcn/tailwind.css"` at `app/globals.css:3` (re-checked: no TS/TSX imports). Moving it to `devDependencies` drops ~70 of the 97 findings, including the one critical (`proxy-addr`), from `pnpm audit --prod`. These are not runtime exposure.
- `zod@4.4.3` needs ≥4.6.6 (memory exhaustion from large arrays). Reachable spot: public survey `future_preferences` has no `.max()` (`app/(public)/survey/schema.ts:18`, re-checked), request body capped at 5 MB. `pnpm update zod` fits the existing caret range.
- sharp, postcss, nanoid: not reachable by attacker input; the `next` bump resolves them.

## Low

- `compute_accreditation_credit` (SECURITY DEFINER, no check inside, EXECUTE for `authenticated`): a practitioner given another user's uuid learns licence presence, `licence_id` and attendance outcome. EXECUTED (DB lens). Revoke EXECUTE from `authenticated`.
- `verify_evidence_chain` callable by any signed-in user; leaks global evidence row count (590) and tamper status. **Closed 2026-11-06 (Q50, `20261106110000`): `service_role` only, like the audit and ledger verifiers. Applied locally and to Seoul 2026-11-06 on Ivan's go (`supabase db push --linked`, exit 0; the file's own grant and trigger assertions ran there). Commit `43f3821`, on origin since `bdc87c4`. Seoul not read back: Ivan stopped that read on 2026-11-07.**
- 8 functions have EXECUTE for PUBLIC (trigger functions or invoker-gated), one SECURITY DEFINER trigger function executable by anon (`trigger_reconcile_on_attendance_points_change`). Revoke from public and anon.
- Write policies ignore staff role: an org-A `body_admin` inserted `agenda_blocks` and `speaker_checkins` (EXECUTED); `auditor` inferred from policy text. Needs a decided role matrix.
- `sendReminderForEvent` and `sendSurveyInviteForEvent`: no role gate or rate limit; `auditor` / `body_admin` can trigger mass mail.
- `/api/security/csp-report`: unbounded body (2 MB accepted with 204), no content-type check, no rate limit, `blockedOrigin` uncapped in the log line. EXECUTED (runtime lens).
- `/events/<non-uuid>`: unhandled PostgREST 22P02, page returns HTTP 200 with the React error payload; `/events/<non-uuid>/calendar.ics` returns 503. EXECUTED. Validate the UUID, then 404.
- Raw database error text returned to staff clients (`settings/team/actions.ts:39`, `events/new/actions.ts:151`, `details/actions.ts:46,68`, `exportEvidenceActions.ts` ×5, `createInviteLink`); contradicts the security note §11.
- Anon-readable columns: `events.created_by` (organiser auth UUID, all 454 local events), `accrediting_bodies.organisation_id`, `agenda_blocks.notes`. EXECUTED. Decide if intended.
- Users can null their own `deleted_at` and `pseudonymised_at` (UPDATE 1, EXECUTED). `credit_disputes` INSERT can set resolver columns (inferred).
- Partner and hero URLs are not scheme-restricted (`z.string().url()` accepts `javascript:` in zod 4.4.3; React 19.2.4's block is the only protection); hero URL has no validation.
- ICS: `icsEscape` (`lib/calendarLinks.ts:45`) misses a bare `\r`, so an organiser-controlled title can inject calendar properties.
- Duplicate-registration oracle: "That email is already registered for this event." (`app/(public)/events/[id]/actions.ts:263-265`).
- Invite links are bearer tokens not bound to an email (token itself is well built: 192-bit, SHA-256 stored, 7-day expiry, single use under row lock).
- Rate limiter fails open on error; `staff.walkin` limiter keys on `staff.id` not the auth user id (against the K3 skill rule).
- `X-Powered-By: Next.js` header.
- CI: neither workflow has a `permissions:` block (add `permissions: {}` to `cron-dispatch.yml`, `contents: read` to `replay-verify.yml`); `supabase/setup-cli@v1` is a floating third-party tag and the CLI version is `latest`; `curl -sf` hides the error body (use `-fsS`).
- No `packageManager` / `engines` field, no dependabot or renovate config.

## Accepted or informational

- `anon` holds MAINTAIN on 24 public tables. Accepted in migration `20261010175112` (lines 38-40). EXECUTED: anon can take ACCESS EXCLUSIVE locks and ANALYZE with raw SQL as the role, but no anon-callable function runs dynamic SQL, so PostgREST and GraphQL give no path. No API role holds TRUNCATE or TRIGGER; PUBLIC holds no table privileges.
- `authenticated` holds DML grants on `staff`, `organisations`, `accrediting_bodies`, `organisers`, `survey_responses` (default ACL on new tables). EXECUTED: RLS blocks the escalation attempts. Per the grant-guard skill each hit still needs a stated reason or a revoke.
- `email_log`, `rate_limits`: RLS on, zero policies, deliberate (migration `20260803090000`).
- Dev-only observations from :3100: `/dev-preview-uiport/*` returns 200, source maps served, absolute paths in dev HTML. The layout gates on `NODE_ENV === 'production'` (SOURCE). Re-test against `next build && next start`.
- Hosted settings the local config shows at local values and that must differ in production: confirmations, minimum password length 6, MFA disabled, a `192.168.*.*` wildcard redirect, `secure_password_change` off.

## Ruled out (checked, fine)

- No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, JSON-LD in the scanned tree; email templates auto-escape.
- No PostgREST filter injection or raw SQL (the only user-derived filter is an escaped `.ilike`). No SSRF (Nominatim host fixed, no user URL fetched server-side; image optimizer refused an SSRF probe).
- Service-role client is `server-only` with no client importer; no `NEXT_PUBLIC_` variable holds a secret. ~50 `console.*` sites log only SQLSTATE codes and UUIDs.
- Open redirects: `safeNextPath` holds at every sink; six variants tried on the live server, no off-site `Location`.
- `proxy.ts`: uses `getUser()`, fails closed, matcher covers every staff route; staff pages 307 with and without `RSC: 1`. Review-mode bypass cannot run in a production build.
- `/auth/callback` (PKCE), `/api/cron/dispatch` (401, constant-time compare, 503 when `CRON_SECRET` unset), mass assignment (Zod strips unknown keys), event IDOR (org checked before any service-role read).
- No cross-tenant read or write found in about 20 definer functions probed; invite escalation to `eventar_staff` blocked by CHECK `invite_tokens_role_check` (23514); `p_actor_override` impersonation from a non-service JWT blocked.
- All SECURITY DEFINER functions in `public` pin `search_path`; no view lacks `security_invoker`; all public tables have RLS.
- `rate_limit_check`, `self_check_in`, `get_org_participants` are service_role only.
- Supabase REST as anon: private tables return zero rows or 42501 (local DB is mostly empty, so this does not prove policies with data).
- Secrets: none in tracked files or history; `.env.local` untracked; `.mcp.json` tracked but holds URLs only.

## Decisions for Ivan

1. Hosted Auth: is "Confirm email" ON and password signup closed? (Dashboard → Auth.) Decides whether H1 is live.
2. Hard Rule 1 vs the email-keyed `staff` table: fix now via `staff.user_id`, or keep the recorded debt and ship the confirmed-email guard first?
3. Staff role matrix for writes and mass mail (`auditor`, `body_admin`): what may each role do?
4. Go to bump `next` to 16.4.5 (full gate afterwards) and move `shadcn` to `devDependencies`?
5. Strix run: needs an LLM key and a budget; it is the only way to get exploit-proven results.

## Status after fixes (2026-11-04, same day)

Nothing here is committed or pushed. Migration `20261104100000` is applied to the LOCAL database only; Seoul is untouched.

Closed per layer (a finding is not "fixed" while a layer I did not execute against is open):

- **H1 staff identity by unconfirmed email: app layer closed, SQL layer OPEN (needs sign-off).** `requireStaff` and `proxy.ts` refuse an unconfirmed address (unit-tested, mutant-checked, live: a confirmed organiser still reaches `/dashboard`). `getStaffSessionState` is deliberately unguarded (deny-side; the practitioner-write guards depend on it). `app_private.auth_email()` and about 15 SECURITY DEFINER RPCs (`publish_event`, `set_event_cpd_config`, `mark_attended`, `set_registration_role`, ...) still match `staff.email` to the JWT claim with no confirmation check, so a caller holding the anon key and a JWT can bypass the app layer. That is a kernel change (Decisions Log + Ivan sign-off). The guard only protects while hosted Auth has "Confirm email" ON; Ivan confirmed it is ON on Seoul (2026-11-05).
- **M1 `bulk_update_event_status`: closed at action and SQL layers, executed.** Role gate in the action (before any read or write) and in the function (42501 for body_admin and auditor); EXECUTE is `service_role` only, so the forged-actor path through `authenticated` is gone. The action was not exercised live as an auditor.
- **H2 `next` 16.2.12: upgraded to 16.4.5** (and `eslint-config-next` 16.4.5). `pnpm audit --prod` reports no advisory against `next` any more. EXPOSED item GHSA-p3m5-59mp-jv5r: the installed version is at or past the fixed release per the advisory (vendor docs); the exploit itself was not re-run. Gates on 16.4.5: tsc 0, eslint 0 errors (10 warnings, unchanged), vitest 233 files / 2200 passed, `next build` exit 0 with 47 routes (unchanged) and no warnings. Live on :3100: proxy gate 307 (also under `RSC: 1`), cron 401, image optimizer refuses an SSRF probe (400), headers unchanged, and a real Server Action round trip (`/login` session check, then redirect to `/dashboard`) works with no console errors.
- **M8 `shadcn`: moved to `devDependencies`.** Its only use is the CSS import at `app/globals.css:3`; the build resolves it. The `pnpm audit --prod` count fell from 97 (6 critical, 37 high) to 7 (0 critical, 4 high, 1 moderate, 2 low). The shadcn subtree was hygiene, not runtime exposure.

Still open, in the order Ivan set:

1. ~~Hosted Auth "Confirm email"~~ **ON on Seoul** (Ivan, dashboard check, 2026-11-05). A signup with a provisioned staff email now needs that mailbox to confirm, so the H1 signup scenario is not live on Seoul. Password signup is OFF on Seoul (Ivan, 2026-11-06).
2. H1 SQL layer: `auth_email()` confirmed-email check (kernel sign-off).
3. M2 `consent_records` forgeable (revoke writes from `authenticated`, drop the self-write policies, add to the audited-writes matrix).
4. M3 missing clickjacking header (`X-Frame-Options` or an enforcing `frame-ancestors`).
5. `zod` 4.4.3 -> 4.6.6 or later (`pnpm update zod`; the one remaining direct-dependency advisory, high). Not in the go for this change.
6. After those: M4 CSV formula injection, M5 weak registration codes, M6 storage limits, M7 rate limits.
7. Post-MVP (Ivan): auditor and body_admin write rights, Strix run.

Remaining `pnpm audit --prod` items after the bump: browserslist, source-map-js and baseline-browser-mapping (all inside `next`'s own dependency tree, build-time only), and `zod`.

Review dispositions for the two fixes (dev-lens and user-lens, both read-only): no blocker. One regression the user-lens found in my first version (an unconfirmed staff-email session would loop between `/login` and `/dashboard`) was fixed with a distinct `email_unconfirmed` code and tested at the proxy, copy and login-page layers. Open for Ivan as frontend proposals, not applied: whether to hide or disable the bulk controls for body_admin and auditor, the false "Moved to the Cancelled tab" dialog title shown during the 10-second cancel countdown, and the polite 4.5-second error toast.
