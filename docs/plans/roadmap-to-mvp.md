# Roadmap to MVP — CPD Platform

> Grounded in the vault `20 — Roadmap/CPD Roadmap — Backend First.md` milestone spine, updated 2026-07-10 with what the Sprint 3a session revealed. **MVP = a runnable paid pilot with one real accrediting body**: HKCP onboarded with its real rules, one real accredited event, real practitioners earning credits *evaluated against those rules*, and a signed, audit-ready credit record a regulator would accept. Everything is scoped against that bar, not "the app runs."

## Where we are (2026-07-10)
- **M1 (end S1)** ✅ multi-tenant foundations. **Sprint 2** ✅ auth/security shell. **Sprint 3a** ✅ (this session) — but 3a was deliberately only the *ungated foundation*: identity/tenancy tables, append-only `credit_ledger` + writer, licence functions, body seed. The CPD *domain logic* is still ahead.

## Milestone spine (vault, updated)
| # | When | What | Status |
|---|---|---|---|
| M1 | end S1 | Multi-tenant foundations; existing app unbroken | ✅ |
| M2 | end S3 | CPD domain proven end-to-end; **frontend-freeze review with Ivan** | S3a done; S3b gated on body review |
| M3 | end S4 | First KMS-signed certificate verifies; real email live | not started |
| M4 | end S5 | Backend feature-complete for pilot; **deploy decision** | not started |
| — | post-M4 | Scoped frontend unfreeze: organiser accreditation UI, attendee wallet, auditor portal | not started |

## Remaining sprints (with what this session changed)

**Sprint 3b — the real CPD domain → M2.** Two halves, both gated:
- *Governance* (`2026-07-09-cpd-sprint-3b-design.md`) — reviewer workflow, accreditation confirmation, PDF format, cross-body mechanics. 4 tasks, review-ready, two collapse to near-nothing if defaults hold.
- *Engine* (`2026-07-10-cpd-sprint-3b-engine-design.md`) — **the previously-missing core**: versioned `body_rules`/`body_cycles`, the **deterministic evaluator** (attendance × versioned rules → floor met/cap breached), issuance wiring, roster ingestion, the retroactive-trust-upgrade model. This is the actual CPD value engine and it's **double-gated on Q26 + the body review**.
- HKCP rules seed (Ivan sources the manual — non-code dependency).

**Sprint 4 — certificates + signing → M3.** AWS/KMS (ECC_P256, ap-east-1), `sign-certificate` (deterministic payload → SHA-256 → `kms.Sign` → signed PDF + hash registry), **TOTP MFA mandatory** (the one permitted freeze exception), email cron (absorbs old Phase 9, real Resend cutover).

**Sprint 5 — auditor + AI + detection → M4.** First authenticated API surface (auditor evidence retrieval), evidence-pack generator, the AI tagging/summarisation slice (Bedrock Haiku + full cost-containment), the detection pipeline (`request_events` + scoring job).

**Post-M4 — scoped frontend unfreeze.** Organiser accreditation UI + attendee wallet + auditor portal.

## Three things this session changed
1. **Q26 (config-hash fork) is on 3b's critical path, not a side quest** — you can't issue a "compliant" verdict without evaluating credits against *versioned* body rules, and Q26 decides the schema those rules hash into. Gated on a real body / the review. `credit_ledger` was correctly left config-reference-free until then.
2. **"KMS vs RFC 3161" was a false fork** — they're complementary at different phases: **KMS is the planned MVP signing mechanism (Sprint 4)**; **RFC 3161 TSA is a Phase-2 external tamper-anchor** (deferred). Signing for MVP is decided (KMS); Q28 just needs to *formalise* the choice.
3. **Singapore provisioning is now unblocked on the migration-replay front** — the two portability fixes (`rls_auto_enable` guard, stale seed) made the history replayable from zero, which a fresh Singapore project needs. That was a hidden blocker until this session.

## The honest critical path — it isn't engineering weeks
Raw backend effort ≈ **6–9 weeks** (3b + S4 + S5, ~2–3 wk each) + the frontend unfreeze. **But wall-clock is gated on two external things, not code:**
- **The external body review is the long pole.** Most of 3b's shape is a *design outline* precisely because the review informs it, and MVP *needs* a real body to pilot. The path to MVP runs **through the body conversation**, which isn't scheduled. Engineering can't shorten it.
- **The HKCP CPD manual** (Ivan sources) gates the rules seed.

## Decisions that gate sprints
| Decision | Gates | Status |
|---|---|---|
| Q26 config-hash fork | 3b engine (E1 versioning, E2 evaluator, E5 retro-trust) | **Open — one behavioural fact from the body resolves it** |
| M2 frontend-unfreeze scope | post-M2 UI | Decided *at* M2 with Ivan |
| Pricing/billing (invoice-first = zero code) | M4 / first paid pilot | **Absent from the whole build pack** — decide before M4 |
| Singapore provisioning | real PII | Standing (now technically unblocked) |
| HKCP manual sourcing | rules seed | On Ivan |

## Two MVP cuts
- **Lean first-pilot** (fastest to one paying body): 3b + Sprint 4 (signing) + a *thin* organiser/attendee UI slice. Auditor self-serve portal, AI tagging, detection pipeline (all Sprint 5) → **manual/deferred** for pilot #1 (hand-generate the first evidence pack). Gets a signed, verifiable credit record in front of a real body soonest.
- **Full M4** (roadmap's "backend feature-complete for pilot"): everything through Sprint 5 + full unfreeze. The real product; want it before onboarding bodies #2/#3 unattended.

**Recommendation:** aim for the lean cut, and let the body review reshape 3b before detailing it. The single highest-leverage move — bigger than any sprint — is **scheduling the review**: it unblocks 3b's design, resolves Q26, and produces the pilot body, in one conversation.

> **2026-07-11 — the concrete path to that review now exists:** `docs/plans/2026-07-11-poc-engagement-plan.md` — Phase P1 (POC/demo pack + deploy track, Milestone A "demo-ready") then Phase P2 (internal → NGO trials → body outreach → the review meeting, Milestones B–D), per Ivan's direction to trial with NGOs/internal meetings first and never engage empty-handed. That plan feeds E5/E6 outputs (Q26 + governance answers) back into 3b here.
