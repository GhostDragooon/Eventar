# DEFERRED — technical debt with a due date

Every deferral carries a **re-entry criterion** — the observable event that makes it wrong to keep deferring. Reviewed at each sprint boundary (standing ritual). Living tracker, not a phase doc.

_Last updated: 2026-07-04 (CPD Sprint 2 scope lock)._

| Deferred item | Re-entry criterion | Earliest |
|---|---|---|
| **Staff MFA workstream** — password+TOTP backend on `auth.mfa`, `mfa_is_fresh` helper, wrapper freshness-gate wiring, enrolment UI, TOTP-mandatory enforcement | Signing ships; moved wholesale from Sprint 2 (had no Sprint 2 consumer) | **Sprint 4** |
| **Turnstile provisioning + escalating unauth strike ladder** | **Cloudflare keys provisioned** — gates public exposure (ADR Finding 2) | When keys land |
| **Resend cutover** — real-user OTP + email-template customisation + zh-HK variant | Pre-pilot (before any real attendee cohort) | Sprint 2 exit / Sprint 3 start |
| **CSP enforcement mode + nonce-boundary decision** | A clean real-user violation window in report-only mode | Sprint 3/4 |
| **Historical registration linking** | Wallet unfreeze (ledger keys on `licence_id`, so not needed for credits) | post-M4 |
| **`request_events` table + pg_cron scoring job** (4 inference signals → flags) | Ships alongside the first authenticated API surface, one sprint after data accrues | Sprint 5 |
| 5-role staff enum (`organiser_admin`/`organiser_member`/`body_admin`/`auditor`/`eventar_staff`) + `organizer`→`organiser` spelling | Accrediting-body / auditor roles needed | Sprint 3 |
| Audited-function template / codegen | ~12 near-identical definer functions accumulate (gate-drift risk) | Sprint 3/4 |
| Cross-jurisdiction schema polymorphism (bodies, licence types, credit schemes) | AU or 2nd jurisdiction onboards — **migration cost accepted as debt** | Sprint 5+ |
| Practitioner-in-a-week product-flow sketch | Before wallet-unfreeze consideration | Before Sprint 4 |
| External review by real accrediting body + organiser | **Gates Sprint 3 credit-ledger implementation** | Before Sprint 3 |
| Bulk-verify endpoint for accreditors | Documented request from an onboarded body | On request |
| W3C Verifiable Credentials + DID:web + Status List 2021 | First accrediting-body request, or verifier-tooling maturity | Phase 2 |
| RFC 3161 TSA anchor (external tamper proof) | First body asks how tampering is externally provable | Phase 2 |
| Behavioural detection graduation (flags → auto-action) | **Locked at "never"** — standing pushback flags any attempt | — |
| 7-year retention grounding + organiser-attested liability T&Cs (HK counsel) | Retention/evidence requirements firm up | Before launch |
