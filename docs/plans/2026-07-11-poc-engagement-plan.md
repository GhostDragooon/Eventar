# POC + Engagement Plan — from working code to a body pilot

_Written 2026-07-11. Direction per Ivan: build the POC/demo pack first, trial the function with NGOs + internal meetings, then engage the accrediting body — never walk in empty-handed. This plan slots UNDER `docs/plans/roadmap-to-mvp.md` (it does not replace the milestone spine): it is the concrete path to the "external body review" that gates Sprint 3b/M2._

**Standing gates this plan respects (unchanged):**
- **Frontend freeze holds.** Trials run on the existing 19 routes. Friction fixes = bug fixes only; feature/restyle requests get *captured* in a triage list for the M2 unfreeze, not built.
- **Q26 / 3b gate holds.** The ledger demo is a *driver script* calling already-shipped functions with hand-picked values — no new schema, no config-referencing anything in `credit_ledger`, no 3b SQL.
- **Never deploy by momentum.** Phase-8 deploy is PAUSED; Task D0 below is the explicit go decision.

---

## Phase P1 — POC / demo-ready (engineering-led, ~2–3 weeks wall clock)

### Workstream D — Production deployment (prerequisite for any external trial)

| # | Task | Owner | Detail / exit check |
|---|---|---|---|
| D0 | **Deploy go/no-go decision** | **Ivan** | **DECIDED 2026-07-11: HOLD — demo pack first.** D1 alone proceeds (deploy-neutral: it gates Singapore whenever that happens); D2–D7 stay parked until Ivan flips this. Internal demos/trials run on the local stack + LAN per `demo-run-sheet.md`. Revisit before NGO trials — external attendees need a hosted URL. Build order confirmed: demo pack scripts → D1 → collateral drafts. |
| D1 | CI harness: replay-from-zero + chain/tamper (parked task #3) | agent | DEFERRED's own re-entry criterion: *before Singapore provisioning*. Local script + CI job: spin local stack → `supabase db reset` (63 migrations + seed) → assert `verify_audit_chain()`/`verify_ledger_chain()` green → owner-level tamper attempt caught. |
| D2 | **Provision Singapore project** (`ap-southeast-1`) as canonical prod | Ivan (create) + agent (migrate/verify) | Fresh replay of the full migration chain — the real-world validation of the 2026-07-10 portability fixes. Seoul becomes dev/staging per the standing 2026-07-04 decision. Trials collect real PII → they should land on Singapore, not Seoul (PDPO posture). |
| D3 | Vercel project + env vars | agent + Ivan (accounts) | `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (hard-required by `lib/origin.ts` in prod), `RESEND_*`, `NEXT_PUBLIC_MAPBOX_TOKEN`. |
| D4 | **Resend cutover** | agent + Ivan (domain) | The DEFERRED re-entry criterion ("before any real attendee cohort") fires with the first NGO trial. Domain verification → key in env → remove `devEmailStub` per the Phase-7 removal protocol (**3 call sites**: `registerForEvent` + both email actions) → smoke registration proves the real path. |
| D5 | **Turnstile keys + wiring** on public registration/login | Ivan (Cloudflare account) + agent (wiring) | DEFERRED: "gates public exposure (ADR Finding 2)". If Ivan prefers, the *documented interim alternative* for invite-only trials is: accept the risk explicitly (existing per-IP rate limits stay the only bot control) — but keys are cheap; provisioning is the recommended path. |
| D6 | **Minimal privacy notice** for trial attendees | Ivan (+ light counsel if possible) | `docs/legal/` drafts are v0.1/0.2 and explicitly *not for publication*. Real NGO attendees on a public URL need at least a minimal, honest notice (what's collected, why, retention, contact). This is a launch blocker for external trials — internal meetings can proceed without it. |
| D7 | Full prod backtest | agent | Register → confirmation email received → QR self-check-in → staff scan → survey, on the prod URL; all 19 routes; the standing curl/route matrix from PROJECT_STATE. |

### Workstream P — Demo pack (the "something to show")

| # | Task | Owner | Detail / exit check |
|---|---|---|---|
| P1 | Demo event fixture + 15-min run sheet | agent | A realistic CPD-flavoured event (e.g. "Clinical Update Seminar", 2 agenda blocks, 3 speakers) + a written minute-by-minute demo script: create → publish → poster/QR → register live from a phone → tablet check-in → attendance appears. Rehearsable, resettable (teardown script). |
| P2 | **Ledger demo driver** | agent | Script (not app code): take the demo check-in → `record_credit_entry` → show the chained row + `verify_ledger_chain()` = valid → attempt a direct tamper (owner UPDATE) → show it *rejected* (42501) and a simulated post-hoc edit caught by the chain. Presentable output (formatted SQL view). This is the differentiator moment: "records that cannot be silently altered." |
| P3 | Certificate + wallet **mockups (slides/Figma — not product code)** | agent (draft) + Ivan (approve) | Freeze-safe. Certificate PDF mock with signature/hash block; wallet screen mock. If Ivan later wants ONE live demo screen, that is an explicit freeze-exception decision, not a drift. |
| P4 | One-pager: product + pilot offer | agent (draft) + Ivan (approve) | What it is (1 para), the loop diagram, the integrity story (3 bullets), pilot structure (scope, duration, what the body gets), **a price**. |
| P5 | **Pricing decision** | **Ivan** | Pulled forward from "before M4" — walking in with a number reframes the meeting from research to vendor-pilot. Invoice-first = zero code. |
| P6 | Security/trust one-pager | agent | Assembled from existing material: audit chain design, RLS + grant matrix (Hard Rule 11), per-body retention citations (Q24), replay/CI posture. Doubles as the answer sheet for "who can change what, and is it logged?" |
| P7 | `set_staff_role()` audited fn + grant-hygiene batch (parked tasks #4, #5) | agent | The two items a body security review would hit first; both survive any review outcome. Small design decision on #4 (column-level revoke vs trigger) taken at task start. |

**Milestone A — "Demo-ready" (end P1).** Exit criteria, all observable:
- Prod URL live on Singapore, real emails sending, Turnstile (or explicit interim acceptance) in place, privacy notice up.
- Run sheet rehearsed end-to-end under 15 minutes, twice, with reset between.
- Ledger demo shows chain + tamper rejection live.
- One-pager + trust one-pager + price approved by Ivan.

---

## Phase P2 — Engagement (validation-led; starts the moment Milestone A lands)

Sequencing per Ivan: **internal → NGO → body.** One lever to keep in mind: body scheduling latency is weeks — the outreach email (E4) *can* be sent during the NGO trials rather than after, proposing a meeting date that lands post-trials. Ivan's call at E4.

| # | Stage | Owner | Detail / exit check |
|---|---|---|---|
| E1 | **Internal-meeting trials** (week 1 of P2) | Ivan runs, agent supports | 2–3 real internal sessions through the platform end-to-end (create → register → check-in → survey). Purpose: operational shakedown with a forgiving audience. Output: friction log, every issue tagged `bug` (fix now) vs `feature/restyle` (M2 triage list). |
| E2 | **NGO trials** (weeks 2–4) | Ivan (relationships) + agent (support/fixes) | 2–3 NGOs running real events as organisers. They exercise the *organiser journey* — the persona the pilot body will care about. Success per event: registrations flow, ≥80% of attendance captured via QR, survey responses land, zero manual DB interventions. Ask each NGO for a referenceable quote. NGOs don't need credits — the trial validates the event/attendance backbone; the credit story stays in the scripted demo. |
| E3 | **Proxy dry-run** (parallel, any week) | Ivan | Rehearse the demo + the 7 review-prep questions (`2026-07-10-cpd-sprint-3b-review-prep.md`) with a friendly professional who files CPD returns or sits near a committee. Fix the script where it stumbles. |
| E4 | **Body outreach** | Ivan (send) + agent (draft) | Target the CPD/education committee **secretariat** (the administrator, not the president). Email: 5 sentences + one-pager attached + "we're launching with one founding body partner; 30 minutes to show you a working system and confirm how your scheme is configured." **Parallel-track rule: if HKCP is silent for 2 weeks, send MCHK (the documented fallback) — never single-thread the long pole.** |
| E5 | **The demo meeting** | Ivan | Run sheet: 10 min live demo (loop + ledger moment) → 15 min "configuration questions" = the 7 review-prep questions, behavioural framing (Q5 rule: ask what happens to earned credits when rules change — never mention hash architecture) → close: pilot offer with price. Outputs to capture verbatim: the Q26 behavioural fact, PDF format, roster mechanics, reviewer workflow reality, interest level. |
| E6 | **Post-meeting close-out** | agent | Same week: answers → vault Decisions Log (Q26 resolved or explicitly still open), review-prep doc statuses updated, 3b design outlines annotated with the real answers → **3b detail-into-SQL unlocks** → pilot proposal/MoU draft for the body. |

**Milestone B — "Function proven in the field."** ≥3 real events (internal + NGO) run end-to-end on prod, ≥50 real check-ins, zero data-integrity incidents, friction list fully triaged (bugs fixed, features parked), ≥1 NGO referenceable.

**Milestone C — "Body engaged."** Meeting held (HKCP or MCHK), all 7 questions answered, Q26 resolvable, pilot proposal delivered with a price.

**Milestone D — "Pilot agreed."** Pilot terms accepted (scope, events, price, timeline) → Sprint 3b executes with real answers → rejoins the roadmap spine at M2. (If D stalls: the pre-committed re-evaluation below.)

---

## Timeline sketch (wall clock, assumes D0 go this week)

| Week | Track |
|---|---|
| 1 | D1 CI harness → D2 Singapore → D3–D6 deploy stack · P1–P2 demo scripts start |
| 2 | D7 backtest · P3–P6 collateral · **Milestone A** · E1 internal trials begin |
| 3–4 | E2 NGO trials · E3 proxy dry-run · E4 outreach sent (Ivan's timing call) |
| 5–6 | E2 wraps (**Milestone B**) · E5 meeting lands (body latency) · **Milestone C** |
| 7+ | E6 close-out → 3b execution → M2 path resumes per `roadmap-to-mvp.md` |

## Pre-committed re-evaluation trigger

If, after Milestone B plus **4 weeks of active outreach** (both HKCP and MCHK contacted, follow-ups sent), no body will take the meeting: that is data, not a delay. The response is a wedge review with Ivan — organiser-first commercial entry, or white-label to an existing CME provider — **not** more speculative backend. (Same discipline as DEFERRED's re-entry criteria: the "when would we admit the plan must change" answer is written down while morale is high.)

## What this plan deliberately does NOT contain

- No 3b SQL, no evaluator, no `body_rules` schema — all gated on E5's answers (Q26).
- No new frontend surfaces — certificate/wallet are mockups; the M2 unfreeze stays a decision, not a drift.
- No AI features, no detection pipeline, no auditor portal — Sprint 5 material, absent from the pilot's critical path per the lean cut.
