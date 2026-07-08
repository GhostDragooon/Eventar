# DEFERRED — technical debt with a due date

Every deferral carries a **re-entry criterion** — the observable event that makes it wrong to keep deferring. Reviewed at each sprint boundary (standing ritual). Living tracker, not a phase doc.

_Last updated: 2026-07-08 (CPD Sprint 2 shipped)._

| Deferred item | Re-entry criterion | Earliest |
|---|---|---|
| **Staff MFA workstream** — password+TOTP backend on `auth.mfa`, `mfa_is_fresh` helper, wrapper freshness-gate wiring, enrolment UI, TOTP-mandatory enforcement | Signing ships; moved wholesale from Sprint 2 (had no Sprint 2 consumer) | **Sprint 4** |
| **Turnstile provisioning + escalating unauth strike ladder** | **Cloudflare keys provisioned** — gates public exposure (ADR Finding 2). Unchanged by Sprint 2 | When keys land |
| **Resend cutover** — real-user OTP + email-template customisation + zh-HK variant | Pre-pilot (before any real attendee cohort) | Sprint 2 exit / Sprint 3 start |
| **CSP enforcement mode + nonce-boundary decision** | A clean real-user violation window in report-only mode (Sprint 2 shipped report-only, allowlist verified against actual app calls — nominatim + Google Fonts) | Sprint 3/4 |
| **Historical registration linking** | Wallet unfreeze (ledger keys on `licence_id`, so not needed for credits) | post-M4 |
| **`request_events` table + pg_cron scoring job** (4 inference signals → flags) | Ships alongside the first authenticated API surface, one sprint after data accrues | Sprint 5 |
| **`Staff.role` TS union widen** (`'organizer'\|'manager'` → include `'eventar_staff'`) — Sprint 2's Task 1 split this out after finding it breaks `tsc` at 9 call sites via `StaffShell.tsx`/`SettingsClient.tsx`'s own local prop types | Bundle with the 5-role enum migration below + frontend unfreeze — same commit will touch those two files anyway | Sprint 3 |
| 5-role staff enum (`organiser_admin`/`organiser_member`/`body_admin`/`auditor`/`eventar_staff`) + `organizer`→`organiser` spelling | Accrediting-body / auditor roles needed | Sprint 3 |
| **P2 shared-vs-separate audit-chain lock decision** — does the Sprint 3 credit ledger share the global audit-chain advisory lock, or use a separately-anchored chain? | Sprint 3 credit-ledger design | Sprint 3 |
| **`lib/abuseTier.ts` live-caller wire-up** — the §4 3-in-60 session-revoke capability shipped in Sprint 2 has no live caller; nothing authenticated-attendee-facing exists yet to feed it | First authenticated attendee-facing mutation surface (post-freeze) | Sprint 3+ |
| **Two residual bare-`PUBLIC` grant entries** (`self_check_in`, `app_private.require_active_staff`) — harmless today (former is intentionally anon-open; latter isn't PostgREST-exposed) but inconsistent with the explicit-revoke discipline every other Sprint 2 function follows | Cosmetic; batch with the next grant-hygiene pass | Sprint 3/4 |
| **Exit-gate burst-throughput test's 2s P99 threshold occasionally flakes** (~1-in-4 runs) against real network conditions to the remote Seoul project — genuine variance, always well under 3s when it happens, not a functional regression | Ivan's call: loosen the bound, make it informational-only, or measure DB-side timing instead of client-observed latency | Whenever it becomes annoying |
| Audited-function template / codegen | ~12 near-identical definer functions accumulate (gate-drift risk) | Sprint 3/4 |
| Cross-jurisdiction schema polymorphism (bodies, licence types, credit schemes) | AU or 2nd jurisdiction onboards — **migration cost accepted as debt** | Sprint 5+ |
| Practitioner-in-a-week product-flow sketch | Before wallet-unfreeze consideration | Before Sprint 4 |
| External review by real accrediting body + organiser | **Gates Sprint 3 credit-ledger implementation** | Before Sprint 3 |
| Bulk-verify endpoint for accreditors | Documented request from an onboarded body | On request |
| W3C Verifiable Credentials + DID:web + Status List 2021 | First accrediting-body request, or verifier-tooling maturity | Phase 2 |
| RFC 3161 TSA anchor (external tamper proof) | First body asks how tampering is externally provable | Phase 2 |
| Behavioural detection graduation (flags → auto-action) | **Locked at "never"** — standing pushback flags any attempt | — |
| 7-year retention grounding + organiser-attested liability T&Cs (HK counsel) | Retention/evidence requirements firm up | Before launch |
