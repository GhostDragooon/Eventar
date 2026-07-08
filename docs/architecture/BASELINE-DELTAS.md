# CPD Baseline Deltas — authoritative amendments to the Slice 0.x build pack

_Status: frozen 2026-07-03 (four review rounds). Last updated: 2026-07-04 — see **Sprint 2 amendments** at end (two findings appended; no frozen decision above changed)._

The Slice 0.x build pack (`docs/source-buildpack/*.docx`, preserved verbatim) is the design source **as drafted**. It went through four review rounds on 2026-07-03 that changed real decisions and fixed real defects. **Where this file disagrees with a slice doc, this file wins.** Each domain doc gets properly rewritten under `docs/` during the sprint that builds it; until then, read the slice doc *through* this file.

Canonical decision record: vault `20 — Roadmap/Pivot — CPD Platform (2026-07-03).md` + Decisions Log Q20. Work plan: vault `20 — Roadmap/CPD Roadmap — Backend First.md`.

---

## 1. Scope cuts (deferrals with re-entry triggers)

| Cut | Launch replacement | Re-entry trigger |
|---|---|---|
| W3C Verifiable Credentials + DID:web + Status List 2021 (ADR 0011) | KMS-signed PDFs + hash registry; revocation = registry flag | First accrediting-body request, or verifier tooling maturity |
| RFC 3161 TSA anchor (Sectigo) (part of ADR 0012) | Hash chain only; `verify_audit_chain` | First body asks how tampering is externally provable |
| Custom auth (`otp_challenges`, `user_sessions`, `staff_mfa`, send-otp/verify-otp Edge Functions) | **Supabase Auth native**: email OTP; password + TOTP via `auth.mfa`; refresh rotation + reuse detection built-in | A gap native primitives can't express (needs a new ADR first) |
| Observability: SigNoz, self-hosted Langfuse, (CloudWatch stays for KMS/Bedrock alarms) | Sentry only | Scale/pilot evidence |
| Public verification portal (confirms ADR 0014) | Auditor portal on `audit.eventar.app` | Phase 2 |
| Bulk-verify endpoint for accreditors | Manual flag-clear at pilot volume | Documented request from an onboarded body |
| pgvector / LangGraph / LlamaIndex (confirms ADR 0009) | — | — |
| PPTX parsing | PDF (pdf-parse) + DOCX (mammoth) only | Parked log |

## 2. Decision changes vs the drafted docs

1. **Naming: Eventar, not CPD Compass.** All "Compass" refs purged; role `compass_staff` → `eventar_staff`.
2. **Region: Supabase `ap-southeast-1` (Singapore).** Supabase offers no Hong Kong region (verified 2026-07-03). AWS KMS keys stay in `ap-east-1` (HK). PDPO s.33 is not in force; PMP cites PCPD recommended model clauses against the Supabase DPA (recommended-practice framing, not statutory). Live legacy project is Seoul (`ap-northeast-2`); fresh Singapore project becomes canonical prod at Sprint 1 start (decided 2026-07-04).
3. **Signing key: `ECC_NIST_P256`, not Ed25519** — ap-east-1 KMS constraint. ADR 0010 rewritten; Ed25519 recorded as a future migration.
4. **Trust page sentence:** "Personal data processed in Singapore with Hong Kong-held cryptographic keys. No **personal** data at rest outside APAC." (Not "no data" — Sentry has no APAC region.)
5. **Sentry `beforeSend` scrub scope:** email, phone, licence number, **client IP** (disable default PII capture), any schema-tagged personal field.
6. **Verification portal (PRD pillar 7):** role separation, not "no account required" — `audit.eventar.app`, invite-only, password + TOTP, **host-only cookies**.
7. **Strike 4 = permanent** (Slice 0.5.1 wins over the PRD's 30-day ban); appeal is user-initiated via `appeals@eventar.app`, human review only.
8. **Jurisdiction/scale:** HK only, 5–8 bodies, HKCP first. AU + "20 bodies / 3,000 individuals" = post-launch expansion.
9. **Pillar 1 caveat:** accreditation confirmations are **organiser-attested** (distinct audit event type) until bodies onboard (~Month 5–6). Pitch language: "accreditation status recorded and attested before publication."
10. **OTP challenge retention:** 15 minutes; cleanup every 5.
11. **Resend committed** (SES evaluation language dropped).
12. **MFA freshness (30 min) via the JWT `amr` claim timestamps** — no custom freshness table. Checkable in the Server Action wrapper and RLS.

## 3. Defects in the drafted docs — fixed designs (do NOT implement as drafted)

1. **`pseudonymise_user` (Slice 0.3 DDL) — privilege escalation.** As drafted: SECURITY DEFINER + `GRANT EXECUTE TO authenticated` = any logged-in user can erase anyone via PostgREST RPC. Fixed design: inline `eventar_staff` + `status='active'` check inside the function (raise `insufficient_privilege`), in-function `user_pseudonymised` audit write in the same transaction, `SET search_path` kept.
2. **Audit hash chain (Slice 0.3/0.4) — race + ordering.** As drafted: no advisory lock in the trigger; `(created_at, uuid_v4)` ordering non-deterministic; identity `nextval` fires before BEFORE-triggers so sequence order ≠ lock order. Fixed design: `chain_seq bigint generated always as identity` where the trigger **overrides** it via `new.chain_seq := nextval(...)` *after* acquiring `pg_advisory_xact_lock(hashtext('audit_events_chain'))`; trigger and verifier order by `chain_seq` only. **Convention: audit insert is the last statement before commit** (the xact lock is held to commit). Test: 16-way × 10k concurrent inserts + deliberate mid-run rollback; assert prev_hash linkage; tolerate seq gaps (rollbacks burn nextval).
3. **`grant usage on sequence audit_events_id_seq`** — phantom (UUID PK). Resolved by the chain_seq sequence grant.
4. **Tamper-resistance wording.** Table owner (`postgres`) bypasses grants/RLS. Correct claim: "application roles cannot UPDATE/DELETE; owner-level tampering is detectable via `verify_audit_chain` (and externally provable once the TSA anchor lands)."
5. **Client-supplied `_behavioural_signals` + `signals.js`** — deleted entirely (trivially spoofable). Replaced by server-side signals (§4).
6. **"RLS deny counter" signal** — can never fire (RLS on SELECT filters silently). Replaced by **lookup miss-rate**: fraction of parameterised lookups per session returning empty/404; flag at >60% over 100 requests in 10 min.
7. **`middleware.ts`** — Next 16 renamed it: `proxy.ts` at repo root, exported function `proxy`, no `request.ip` (use validated `x-forwarded-for`).

## 4. Abuse-control design (final — replaces Slice 0.5.1 enforcement sections)

**Locked rule:** *automation is safe when the trigger is a measurement; dangerous when it is an inference. Measurements can auto-act; inferences produce flags.*

| Surface | Enforcement | Triggers |
|---|---|---|
| Unauthenticated auth endpoints | Automatic IP ladder: CAPTCHA → 5-min block → 5-min block → permanent suspend + email appeal. 24 h strike TTL. Turnstile always present | Turnstile fail/absent · per-IP rate limit · OTP failure burst (5 fails across ≥3 challenges / 10 min) |
| Authenticated routes | Session/account scoped, **no IP bans ever**. Automatic: 3 per-session rate-limit hits in 60 min → session revoke. Staff-actuated from flags: suspension pending identity re-verification. Termination = manual staff action only | Per-session/user rate limits (auto) · 4 behavioural signals — request cadence, endpoint traversal, lookup miss-rate, endpoint diversity — **flags only, forever** |
| Marketing pages | Exempt | — |

- Rate limits keyed per session/user on authenticated routes, never per IP. Check-in endpoint additionally limited **per event**. (ADR records the canonical counterexample: venue QR check-in, 200 attendees on one NAT — per-IP volume on a shared NAT is aggregation, not measurement.)
- Pipeline: `request_events` (session_id, path_template, response_class, ts; no PII; TTL 7 days) + pg_cron scoring ~3 min → `session_flagged` audit events; staff clear/escalate writes `session_flag_cleared`/`session_flag_escalated` in the same transaction. Geography drift (MaxMind) alert-only, permanently. Ships **with the first authenticated API surface**, not Sprint 1.
- **Honest bound:** a scraper exceeding the per-session rate limit is bounded to ~90 requests by automatic session revoke; a scraper staying under it is bounded only by the rate limit until staff act on flags (accepted residual of flags-only).

## 5. AI containment (Slice 0.5.1 §AI — stands as drafted, with §2.1 naming and §3.5 signal deletions applied)

Per-invocation caps · per-org monthly budgets (`ai_org_budgets`) · threshold alerts · global ceiling (`ai_platform_budget`) · `AI_KILL_SWITCH_ENABLED` env var · CloudWatch alarms · app-side cost tracker + `ai_provenance` on every call. Prompt-injection defence layers 1–6 stand; summaries render as plain text only.

---

## Sprint 2 amendments (2026-07-04)

Appended during CPD Sprint 2 design (`docs/plans/2026-07-04-cpd-sprint-2-design.md`). Two findings; **no frozen decision above is changed** — both strengthen existing residuals.

**Finding 1 — strengthens §3.4 (Residual 4a): audit enforcement is a database-function shape, not a wrapper convention.**

> Every PostgREST RPC executes as its own transaction. An application-layer wrapper calling `write_audit_event` after a mutation therefore runs the audit write in a separate transaction from the mutation. This violates the "audit-insert-last, same transaction" rule at the layer we thought would enforce it. Audited mutations must be `SECURITY DEFINER` database functions ending with the audit write. `pseudonymise_user` is the canonical shape.

Consequence (§2 custom-auth cut / §4): `write_audit_event`'s `EXECUTE` grant is revoked from `authenticated`; only `service_role` and definer-owner paths call it.

> **LANDED, with a correction (2026-07-08).** `authenticated` and bare `PUBLIC` were closed as designed (`5611599`, `5e82ffb`), but the fix was incomplete: `anon` retained `EXECUTE` the whole time — this project's schema-wide default ACL grants `anon`/`authenticated`/`service_role` on every new function at `CREATE` time, and D1's own negative test only ever exercised `authenticated`. Any unauthenticated caller holding the public anon key could forge an arbitrary, correctly-chained audit event until this was caught at the Sprint 2 exit gate and closed (`1ed8b72`). `verify_audit_chain()` had the identical gap from Sprint 1, closed in the same pass. **Revised guidance for every future SECURITY DEFINER function in this codebase: query `pg_proc.proacl` directly and confirm `anon`/`authenticated`/`PUBLIC` are each explicitly accounted for — do not assume revoking one role closes the others, and do not trust `has_function_privilege` on only the roles you expect to matter.**

**Finding 2 — §4 residual: the Turnstile-deferral window on unauthenticated endpoints.**

Sprint 2 defers the Turnstile + escalating IP strike ladder (no Cloudflare keys yet). During that window:

> During the Turnstile deferral window, unauthenticated endpoints have flat per-IP rate limits only. No escalating block, no bot challenge, no strike ladder. A persistent attacker can hammer `/login` and `/otp/*` at just-under-rate-limit indefinitely. Acceptable only while the platform is not publicly exposed. Public exposure gates on Turnstile provisioning.

Re-entry criterion tracked in `docs/DEFERRED.md`. **Status: still deferred, unchanged by Sprint 2** — no Cloudflare keys provisioned yet.

**Finding 3 (new, found at the Sprint 2 exit gate, 2026-07-08) — the per-IP→per-event self-check-in conversion silently dropped brute-force protection on the guessing path.**

> Converting self-check-in to a per-event rate limit (fixing the venue-NAT false-positive problem) had an undocumented side effect: an invalid/guessed registration code returns before the rate-limit check is ever reached, since per-event keying requires a resolved event. Guessing therefore had no rate limit at all — contradicting `lib/registrationCode.ts`'s own stated security model ("887M codes — resists brute-force search ... paired with rate-limiting").

Fixed (`3653a9a`): the guessing path now has its own independent per-IP limit (10/min), applied only when a code fails to resolve — legitimate attendees' codes always resolve, so they never touch it. Verified this doesn't reintroduce the venue-NAT problem (200 legitimate check-ins sharing one IP still all succeed).
