# DEFERRED — technical debt with a due date

Every deferral carries a **re-entry criterion** — the observable event that makes it wrong to keep deferring. Reviewed at each sprint boundary (standing ritual, Reminder A/B). This is a living tracker, not a phase doc.

_Last updated: 2026-07-04 (CPD Sprint 2 design)._

| Deferred item | Re-entry criterion | Earliest |
|---|---|---|
| W3C Verifiable Credentials + DID:web + Status List 2021 | First accrediting-body request, or verifier-tooling maturity | Phase 2 |
| RFC 3161 TSA anchor (external tamper proof) | First body asks how tampering is externally provable | Phase 2 |
| Bulk-verify endpoint for accreditors | Documented request from an onboarded body | On request |
| Behavioural detection graduation (flags → auto-action) | **Locked at "never"** — standing pushback flags any attempt | — |
| **Turnstile + escalating unauth IP strike ladder** | **Turnstile (Cloudflare) keys provisioned** — gates public exposure (ADR Finding 2) | When keys land |
| **Real-user OTP via Resend (Supabase Auth SMTP)** | SMTP configured; needed before any real attendee cohort | Sprint 2 exit / Sprint 3 start |
| **Historical registration linking** | Wallet unfreeze (ledger keys on `licence_id`, so not needed for credits) | Sprint 5+ / post-M4 |
| MFA enrolment UI + TOTP mandatory for staff | Signing ships (sensitive actions gated on `amr` freshness) | Sprint 4 |
| 5-role staff enum (`organiser_admin`/`organiser_member`/`body_admin`/`auditor`/`eventar_staff`) + `organizer`→`organiser` spelling | Accrediting-body / auditor roles needed | Sprint 3 |
| Audited-function template / codegen | ~12 near-identical definer functions accumulate (gate drift risk) | Sprint 3/4 |
| Cross-jurisdiction schema polymorphism (bodies, licence types, credit schemes) | AU or 2nd jurisdiction onboards — **migration cost accepted as debt** | Sprint 5+ |
| Practitioner-in-a-week product-flow sketch | Before wallet-unfreeze consideration | Before Sprint 4 |
| External review by real accrediting body + organiser | **Gates Sprint 3 credit-ledger implementation** | Before Sprint 3 |
| 7-year retention grounding + organiser-attested liability T&Cs (HK counsel) | Retention/evidence requirements firm up | Before launch |
