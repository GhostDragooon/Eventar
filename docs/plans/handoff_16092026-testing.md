# Handoff — 16 Sep 2026 (Testing Pass) — Practitioner + Org + Create-Event Verification

Manual QA pass against the work shipped the same day (`handoff_16092026.md`, `dbadc02`), executed per Ivan's "Detailed Testing Flow" script, wrapped by `~/.claude/plans/detailed-testing-flow-curious-cat.md`. Local stack only (`supabase db reset` + `scripts/demo/dev-local.sh` on :3100), never Seoul.

## Summary

Exercised the full practitioner onboarding wizard (both medicine and non-medicine paths), organiser first-run, Create Event end-to-end (agenda blocks, sponsorship, self-serve check-in, CPD accreditation), and the register → check-in → evidence integration chain. Found and root-caused **two real defects** — one confirms and fully explains a bug the shipping session left unresolved; the other is new, non-obvious, and specific to running review mode alongside a real staff session.

**Update, same day — both fixed, reviewed, and pushed.** Ivan asked for D1 and D2 to be fixed, reviewed (dev-lens + user-lens, both separate agents per the phase-completion protocol), debugged, and pushed. Fixing D2 correctly surfaced two more previously-invisible bugs (D3, D4) as a direct consequence — review mode's blanket service-role bypass had been masking them in every prior local test — plus a partial fix for D5. The user-lens review additionally found that `proxy.ts` was a third, unconditional instance of D2's exact bug class. All of it is now fixed, tested, and committed at `98a3c9c` (D1) and `7afe43d` (D2–D5 + proxy.ts). See "Fix, review, debug" below for the full account.

## Defects found

### D1 — Declaring the final onboarding gate silently ends the wizard, bypassing "Done"

**Status: ROOT-CAUSED.** This is the exact bug flagged in `handoff_16092026.md` as "investigated at length... couldn't pin a code-level cause" — reproduced cleanly here on the settled build (no concurrent file edits, unlike the original session), with definitive network-level evidence.

**Repro:** Fresh signup → complete Consent, Identity, Professional profile → on the Licence step (step 4 of 4), click "Declare licence" with a valid body + number. The app immediately navigates to `/account` — the "Done" button is never clicked.

**Root cause:** `app/account/complete/page.tsx` has its own guard — `if (completeness.complete) redirect('/account')` — added deliberately so an already-complete user visiting `/account/complete` directly (bookmark, back-button) bounces to `/account` instead of re-showing the wizard. Declaring a licence is *always* the step that flips `isAccountComplete()` from `false` to `true`, because licence is checked last in the step ladder (`!consents ? 1 : !identity ? 2 : !profile ? 3 : 4`). Next.js re-renders the invoking route's Server Component (`page.tsx`) as part of resolving the Server Action call from `CompleteClient.tsx`'s `onDeclareLicence` handler — and that re-render re-evaluates the same completeness check, now `true`, firing the page's own redirect. The client's own `onFinish`/"Done" button (`app/account/complete/CompleteClient.tsx:254-256`) is never involved; there is no client-side `router.push` in the declare handler (confirmed by reading the full component — the only `router.push` in the file is `onFinish`'s).

**Confirmed via live network trace:** the licence-declare click produces `POST /account/complete → 200` (the Server Action, which always targets the invoking route) immediately followed by `GET /account?_rsc=...` — the RSC payload fetch for the destination the server-side `redirect()` specified. This happens on *every* successful licence declare, deterministically, once all three prior steps are already done.

**Data integrity:** unaffected in every run (confirmed via direct SQL for both the medicine and non-medicine test users — licence, profile, identity, consents all landed correctly).

**Proposed fix (not applied):** `page.tsx`'s redirect guard is meant only for a genuine fresh navigation to `/account/complete`, not for a re-render triggered by the wizard's own last action. Server Actions carry a `next-action` request header; skipping the redirect specifically when that header is present (`if (completeness.complete && !(await headers()).has('next-action')) redirect('/account')`) would preserve the "already-complete → bounce" behavior for real navigations while letting the "Done" button remain the deliberate exit from the completed wizard.

### D2 — Review mode's bypass and the real-session client use inconsistent conditions, causing silent cross-org attribution

**Status: ROOT-CAUSED, NOT PREVIOUSLY DOCUMENTED.** Found while creating an accredited event for the CPD happy-path test.

**Repro:** With `EVENTAR_REVIEW_MODE=true` (the `dev-local.sh` default) and a **real magic-link session also active in the same browser** (e.g., a tester signed in for real as an organizer to check one thing, then continues testing other staff surfaces under review mode without signing out): staff-facing Server Components/actions that call `requireStaff()` directly report the review-mode **borrowed** identity (the first active `eventar_staff` row) — but a Server Action that also invokes a SECURITY DEFINER RPC gets a **different, real** identity for anything the RPC resolves independently via `auth.email()`/`current_staff_id()`.

Concretely: `/settings` displayed and saved data under the Default organisation (the borrowed `eventar_staff`'s org), but `/events/new`'s **create_event_with_blocks** RPC attributed the new event's `organisation_id` and `created_by` to the real, currently-signed-in organizer's own organisation — silently, with no error, no warning, and no indication in the UI that a different org than the one displayed in the sidebar was about to own the write.

**Root cause, precisely:**
- `lib/auth.ts`'s `requireStaff()` checks `isReviewMode()` **first and unconditionally** — if review mode is on, it *always* returns a borrowed identity via `resolveReviewStaff()`, regardless of any real session.
- `lib/supabase/server.ts`'s `supabaseServer()` checks review mode **conditionally** — it only returns the service-role (session-less) client when review mode is on **and no real Supabase auth cookie is present**. If a real auth cookie exists, it returns the real, cookie-bound client instead (this was a deliberate 2026-09-05 fix so review mode doesn't clobber a real attendee's own session on `/account`).
- `create_event_with_blocks` (`supabase/migrations/20260914000000_agenda_block_types_sponsored.sql`) resolves its acting identity via `coalesce(app_private.current_staff_id(), case when auth.role()='service_role' then event_input->>'created_by' else null end)`. `current_staff_id()` reads `app_private.auth_email()`, which reads the **actual JWT claims attached to whichever Supabase client executed the query** — not whatever `requireStaff()` returned to the calling TypeScript code.

So: the app-layer permission check (`requireStaff()`) and the RPC invocation (`supabaseServer()`) can be backed by **two different identities in the same request**, whenever a real session cookie is present alongside review mode. The RPC trusts the real session's identity over the app-passed `created_by` value, because `current_staff_id()` is checked first in the `coalesce`.

**Confirmed via:**
- `preview_logs` search for `AUTH BYPASSED` — every single `/events/new` request logged the SAME borrowed identity (`ab054612…`, the Default org's `eventar_staff`), with zero variance.
- Direct SQL on the created event: `organisation_id`/`created_by` belonged to a **different** organisation and staff row than the one review mode's logs said was acting — the one I'd signed into for real minutes earlier via magic link.
- Reading `supabase/migrations/20260814020000_review_mode_actor_override.sql`, which documents that `publish_event`/`mark_attended`/`set_event_cpd_config` were already patched to accept a `p_actor_override` parameter for exactly this service-role-vs-session gap — but that migration's fix only helps when the caller genuinely has no session (`auth.role() = 'service_role'`). It does not address the case this finding describes, where a real session **is** present and the RPC prefers it over the override.

**Extent:** confirmed for `create_event_with_blocks`. `update_event_with_blocks` (same migration file) independently calls `app_private.current_staff_org_id()` for its own authorization check, which is the same class of real-session-dependent resolution — worth the same scrutiny but not separately reproduced this session (time-boxed; flagging the pattern rather than auditing every RPC).

**Impact:** low likelihood in normal solo local dev (most people don't leave a real staff session logged in while also relying on review mode), but silent and undetectable when it does happen — no error, no log discrepancy visible to the user, a write lands under the wrong organisation. Worth knowing about for anyone testing multi-org scenarios locally.

**Proposed fix (not applied):** make `requireStaff()`'s review-mode branch respect the same "real auth cookie present → use the real session" condition `supabaseServer()` already uses, so the two bypasses can't disagree. This is the smaller, more surgical fix versus trying to make every RPC's identity resolution consistent with the app layer.

## Findings confirmed as pass (not defects)

| ID | Section | What was tested | Result |
|---|---|---|---|
| F1 | §1.1 | Fresh magic-link signup lands on `/account/complete`, step 1 (Consent) | Pass |
| F2 | §1.2 | Continue blocked with consent unchecked; checking + Continue advances; `consent_records` rows written (terms_of_service + privacy_policy, current LEGAL_VERSIONS, `withdrawn_at` null) | Pass |
| F3 | §1.3 | Continue blocked with empty identity fields; valid name+phone advances; `users` row updated correctly | Pass |
| F4 | §1.4 medicine | Profession=Medicine populates the seeded 3-item specialty dropdown; free-text hidden | Pass |
| F5 | §1.4 non-medicine (**critical path**) | Profession=Nursing (zero seeded specialties) → specialty dropdown shows "Not listed yet — use the field below", disabled; free-text field live and required; Continue correctly blocked until filled; position=Other reveals `position_other`; full submission verified via SQL (`specialty_other`, `position_other`, workplace, department all correct) | **Pass — this is the critical fix from today's handoff, confirmed working in the wizard specifically (previously only ProfileClient.tsx's version of this fix had a test)** |
| F6 | §1.5 | Licence declare against MCHK (medicine user) and HKAM (nurse user, cross-body — the mechanism doesn't enforce profession↔body matching, which is correct: HK practitioners can hold licences at any body) succeeded; both landed in `practitioner_licences` with status=`declared` | Pass |
| F7 | §1.6 | `/account`, `/account/profile`, `/account/claim` all correctly redirect to `/account/complete` for an incomplete account (stopped after Identity) | Pass |
| F8 | §1.7 | Resume-at-first-incomplete-step: an account with only Consent+Identity done reopens `/account/complete` at step 3 (Professional), not step 1 | Pass |
| F9 | §1.8 | `/auth/callback?next=/events/[fake-id]` with a missing code correctly bounces to `/account/sign-in` (attendee door), not `/login` | Pass |
| F10 | §2.1 | `provisionOrganisation` mechanics verified by direct replication of its 3-insert sequence (organisations → staff → audit event) per its own source; not separately UI-tested since it has no UI form (eventar_staff-only internal action, already covered by `orgActions.test.ts`) | Pass (by code reuse, not live UI — see note below) |
| F11 | §2.2 | Org first-run form: all fields (type, professions/specialties chips, scale, contact) saved correctly to `organisers`; form disappears after save and stays gone on a fresh reload (server-side check, not just client hiding) | Pass |
| F12 | §2.2 | `organisers_one_per_organisation` unique index fires `23505` on a genuine duplicate insert attempt for the same org — confirmed directly via SQL | Pass |
| F13 | §2.3 | Soft gate: `/dashboard` and (by extension) `/events/new` are reachable before org first-run completes; only `/settings` shows the prompt — matches documented "current expected behaviour," not a hard gate | Pass (documented current behavior, not a defect) |
| F14 | §3.1–3.4 | Create Event: empty-submit correctly blocked ("Add the event basics (name) to continue"); venue search (Nominatim, live) returns real HK results and populates lat/long/city/country + derives timezone (Asia/Hong_Kong) correctly; agenda Lecture block requires start/end/title (incomplete block correctly blocks Publish with "Fix the highlighted agenda blocks..."); Break block confirmed structurally has no topics field/Add-topic button | Pass |
| F15 | §3.1 | Sponsored toggle reveals a required Sponsor Name field; unchecking clears it (fine — never submitted) | Pass |
| F16 | §3.2 | Publish succeeds for an eventar_staff-equivalent caller; event status → `published` | Pass |
| F17 | §3.3 | Both-or-neither CPD: selecting a body with no hours blocked Continue implicitly (never reached an inconsistent state); the accrediting-body dropdown lists all 22 active non-authorized-irrelevant bodies (see note); "body not authorised" error surfaced correctly with "event was saved, event still exists" framing (Rule 12) — confirmed the event row persisted with `accrediting_body_id` still null after the rejected attempt, then successfully set via the edit page once authorization existed | Pass — see D2 for why the "not authorised" case fired unexpectedly on the first attempt |
| F18 | §3.5 | Format field absent from the Create Event form (confirmed via `find`); created event's `events.format` is `null`; matches documented known gap | Pass (documented gap, not a new defect) |
| F19 | §3.6 | Self-serve check-in checkbox correctly sets `checkin_modes.self_serve = true` alongside `staff: true` (always-on) | Pass |
| F20 | §3.8 | Edit page reloads with all saved values (title, dates, CPD state); shows an advisory (non-blocking) notice for a passed HKCP prior-approval deadline — confirms that check is informational only, doesn't block saving | Pass |
| F21 | §4.1 | Public registration (via the "not you? edit the fields" escape hatch, tested incidentally while a staff session was also active) succeeded; self-serve check-in correctly time-gated ("Check-in opens at 08:00... an hour before") since the event is tomorrow relative to server clock; staff-side manual-code check-in succeeded instead, registration → `attended`, `check_in_method = manual` | Pass |
| F22 | §4.1 | `participation_evidence` row written correctly (`evidence_type=check_in`, `capture_method=manual_entry`, `source=staff_attestation`) | Pass |
| F23 | §4.1 (**previously zero automated coverage**) | `verify_evidence_chain()` — no test file calls this RPC anywhere in the suite. Called live: 1 total link, 0 broken links, 0 broken content | Pass — closes a real automated-coverage gap, at least for this one manual run |
| F24 | Integration | Credit ledger has zero rows for the check-in (licence was at MCHK, event accredited via HKCP) — a body mismatch, consistent with "CPD held" copy shown at check-in. Not investigated further as a defect; flagged as a domain assumption worth confirming with Ivan (does credit require a licence at the *specific* accrediting body, or any active medical licence?) | Flagged, not a defect |

**Note on F10/F17**: `provisionOrganisation` has no UI form in this codebase (eventar_staff-only internal action). A second organisation was created for fixture purposes by directly replicating the function's own 3-statement sequence (read from `app/settings/orgActions.ts` first, to match its exact effect) rather than re-implementing or guessing. This is why cross-org isolation (§4.3) wasn't separately live-tested this session — the automated coverage (`organisation_body_authorisation.rls.test.ts:132-269`, covering unauthorised/revoked/cross-org-hop cases) was judged sufficient given time constraints and the D2 finding already surfacing a real cross-org attribution issue through a different path.

## Two known unresolveds from `handoff_16092026.md` — status update

1. **"Declaring a licence auto-completes the flow, skipping Done"** — **RESOLVED to a full root cause.** See D1 above. No longer "flagged as unresolved" — it's a specific, understood interaction between the wizard's completion gate and `/account/complete/page.tsx`'s own redirect guard.
2. **`ReferenceError: filteredSpecialtiesForForm is not defined` on `/account/profile`** — attempted a clean reproduction on the settled build (hard navigation, no concurrent edits, `/account/profile` for the nurse test user with appointments/society add-remove exercised). Did not reproduce. Consistent with the original session's own conclusion (likely a transient HMR artifact from editing files while testing). No further action.

## Fix, review, debug (same day, follow-up to the findings above)

**D1 fix** (`app/account/complete/page.tsx`, commit `98a3c9c`): skip the page's own "already complete → redirect to /account" guard specifically when the render is a Server Action's own response (Next's `next-action` request header, verified against the installed Next 16 source — `node_modules/next/dist/client/components/app-router-headers.js:104`), not a real navigation. Backtested live: declaring the final licence now leaves the wizard on-screen with "Done" enabled; clicking it lands on `/account`; a genuine fresh navigation to `/account/complete` after finishing still correctly bounces away.

**D2 fix** (`lib/auth.ts`, `lib/reviewMode.ts`, `lib/supabase/server.ts`, commit `7afe43d`): extracted the real-auth-cookie check `supabaseServer()` already had into a shared pure predicate, `isRealAuthCookiePresent()`, and gated `requireStaff()`'s bypass on the identical condition. Backtested live with a fresh real staff session (`d2.backtest@example.com`, a separate org created for the purpose): the dashboard's identity chip correctly showed the real signed-in staff member, not the borrowed review identity.

**Dev-lens + user-lens review** (two separate agents, per the phase-completion protocol):
- **Dev-lens** — no CRITICAL findings. Verified the `next-action` header claim independently, verified D2's fix has no sibling bypass elsewhere (grepped every `isReviewMode()` call site), verified D4's RLS-policy algebra doesn't accidentally hide the org's own drafts, verified `registrations` has its own independent org-scoped RLS as a second line of defense. Two actionable findings: (a) D2 had zero regression-test coverage of the actual bug — added (see below); (b) sharpened D5 from "genuinely unclear" into a confidently-fixable half (`creditsIssued`) and a genuinely product-ambiguous half (`creditsBlocked` — practitioner-owned, not org-owned, no valid join for organiser roles).
- **User-lens** — found the wizard fix (D1) ships clean. Found a **new, real issue** while walking the "not staff" rejection experience: `proxy.ts` was a **third, still-unconditional** instance of D2's exact bug class — never touched in the original D2 fix. A real non-staff session under review mode was sailing past `proxy.ts`'s own specific "not on the organizer list" rejection (clear copy, explicit sign-out) into a bare, unlabelled `/login` bounce from the page layer's `requireStaff()` catch instead. This is exactly the boundary-case bug CLAUDE.md's phase-completion protocol names as the reason for two separate lenses — dev-lens read the same file and confirmed it introduced no *security* hole (correct), but only user-lens's live walkthrough surfaced the *experience* regression.

**Debug — fixes applied from review findings:**
- **`proxy.ts`** (commit `7afe43d`): gated its own `isReviewMode()` check on the same `isRealAuthCookiePresent()` predicate, adapted for the middleware/edge runtime (`req.cookies.getAll()` instead of `next/headers`'s `cookies()` — the predicate itself is a pure function shared by both). Backtested live: a fresh non-staff real session now correctly lands on `/login?error=not_authorized` with "Your email is not on the organizer list. Contact an admin to be added." rendered, not a bare bounce.
- **D2 regression test** (`lib/auth.test.ts`, `lib/reviewMode.test.ts`): added tests asserting `requireStaff()` borrows the review identity only when no real cookie exists, falls through to the real staff lookup when one does, and still correctly rejects a real-but-non-staff session (no silent borrow as a fallback). Direct tests for `isRealAuthCookiePresent()` itself in `reviewMode.test.ts`.
- **D5, confident half** (`app/dashboard/page.tsx`): scoped `creditsIssued` to the caller's own events (`credit_ledger.event_id` join, same pattern as the already-existing `attentionEventIds` list) — was a global count across every organisation. `creditsBlocked` left unscoped and flagged (see D5 note in the findings table below) — needs Ivan's call between two concrete options dev-lens proposed: split the query by role (a `body_id`-based join exists and is correct for `body_admin` specifically, per that role's own RLS policy; hide or omit the stat for organiser roles), or redefine "blocked" for the organiser-facing card to mean revoked/expired `credit_ledger` entries scoped the same way as `creditsIssued`, so both halves of the pulse chip measure the same population.

**Final gates** (after all of the above): tsc clean · eslint 5 pre-existing errors / 0 new · vitest **904 passed** (+7 from this follow-up's new tests) · `pnpm test:rls` **263/263** · `next build` clean, 37 routes.

**Migration check:** none of this follow-up's fixes touch the database — pure TypeScript/middleware changes. Confirmed Seoul (`muieupgkpbxpqsrjjwol`) and local are already in sync at `20260916040000` (both sides), so there was nothing to migrate.

## Static gates

Run against the local stack, env vars sourced from `supabase status`, never Seoul.

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit` | Clean |
| `pnpm exec eslint .` | 5 pre-existing errors (`app/invite/[token]/*` ×4, `app/settings/page.tsx` ×1) — **matches baseline exactly**, 0 new. 11 pre-existing warnings, unchanged class (`<img>` LCP warnings, unused-eslint-disable in devEmailStub). |
| `pnpm exec vitest run` | **155 files, 895 tests passed** — matches baseline exactly, no regression |
| `pnpm test:rls` (clean re-run, isolated) | **35 files, 263 tests passed** — matches baseline exactly once isolated from this session's own interference (see investigation below) |
| `pnpm exec next build` | Clean. 37 routes, 0 errors. |

### test:rls — investigation of the first-pass failures (Rule 14)

First run (against the DB state left over from the full interactive pass above) showed 3 failures. Investigated each rather than reporting raw:

1. **`tests/rls/organisers.rls.test.ts`** — fixture setup failed with `duplicate key value violates unique constraint "organisers_one_per_organisation"`. **Self-inflicted**: my own §2.2 browser test had already inserted an `organisers` row for the Default org (the same fixture org this test file uses), and the new unique index correctly refused the test's own second insert — proof the index works, not a defect. Resolved by `supabase db reset`.
2. **`tests/cpd/award_f1_f5_gate.rls.test.ts`** — `afterAll` cleanup hook timed out at 10s, no assertion failed. Resolved by `supabase db reset` (consistent with DB load from ~2 hours of concurrent interactive testing, not a logic issue).
3. **`tests/rls/checkin_throughput.rls.test.ts`** — P99 latency 5785ms against a 2000ms budget (200 concurrent self-check-ins). **Did not resolve on the first clean re-run** (4313ms) — this is the one failure that survived eliminating this session's test-data pollution, and the shipping handoff documented this exact test passing cleanly (263/263) this same morning, so "just re-test after a reset" wasn't sufficient evidence to close it as environmental. Ran it a third time, in complete isolation (nothing else executing): **passed outright, 5.19s total, no timing pressure at all.** Root cause: I had launched `pnpm exec next build` (a CPU-heavy compile + typecheck + static-generation pass) in the background at the same moment as the full `test:rls` run — the build's CPU usage was competing directly with the throughput test's 200-concurrent-RPC burst on the same machine. Not a product regression; a self-inflicted resource-contention artifact from running two heavy background jobs simultaneously.

All three failures are now fully explained and none reflect a defect in the shipped code. The gates match the shipping session's documented baseline exactly.

## What's NOT done (flagged, not silently dropped)

- Cross-org isolation (§4.3) not separately live-tested via UI — relied on existing automated coverage (see F10/F17 note above) plus the fact that D2 already surfaced a real cross-org attribution issue through the CPD/create-event path.
- Auth door boundary (§1.8) tested only via the synthetic `/auth/callback?next=/events/[fake-id]` case, not a full real OTP failure from an actual public event page — the automated test (`route.test.ts:9-43`) already covers this exact case directly.
- Did not audit every RPC that might share D2's identity-resolution pattern (`update_event_with_blocks` flagged as the next most likely candidate, not verified).
- Avatar upload 5MB cap not exercised live this session (no image fixture prepared) — the Next.js `bodySizeLimit` config fix from the shipping session is a config value, not independently re-verified by upload.
- ~~Did not run a two-agent phase-completion review~~ — done in the same-day follow-up above, once D1/D2 were actually fixed.
- `update_event_with_blocks` (dev-lens flagged it as the next most likely candidate for D2's identity-resolution pattern) still not independently audited.
- `creditsBlocked`'s scoping (D5's unfixed half) awaits Ivan's decision between the two options dev-lens proposed above.
