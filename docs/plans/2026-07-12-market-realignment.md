# Market realignment — what production-grade expects vs. what we're building

_2026-07-12. Inputs: competitor teardown (CPD Passport, 28 screens — vault `Competitor Analysis — CPD Passport.md`), 12 primary body documents (vault `CPD Source Documents — Body Manuals & Forms.md`), 21 UI/UX references incl. the new Schedule signal (vault `UI-UX Design References.md`), Ivan's organiser-IA proposal (`2026-07-12-organiser-ia-spec.md`), witan/ASPS/iCMECPD patterns, and the updated skill library. Method: vault `Agent Working Method` §6. **This maps expectations — it does not replicate any one product.**_

---

## A. What the market expects of a production-grade CPD/event platform

Synthesized across all sources, by persona:

**Practitioner** (the wallet owner)
1. A **complete cycle picture** — every point they hold, not just points earned on one platform. Every body form in the batch is dominated by *self-reported* activity types (self-study, publications, committee work, external courses); CPD Passport's entire product is manual entry + certificate upload.
2. **Evidence storage** — bodies demand documentary proof kept 2–6 years (Physio Board: 6yr explicit; HKIB: 3yr; sampling audits are the enforcement mechanism). A wallet without an evidence locker forces practitioners back to shoeboxes.
3. **Compliance projection against the requirement** — not raw totals (CPD Passport's weakness) but "34.5 of 50, Category A floor met, on track" (ASPS's "Required ✓" pattern; our evaluator's exact job).
4. **A way to hand the record to someone** — time-limited share links (competitor), or better: independently verifiable records.
5. Renewal/deadline reminders; 2FA; account deletion with grace period (competitor has all three).

**Organiser** (the operator)
6. The full event loop we already have (registration → comms → QR check-in → reporting) — witan-grade table stakes.
7. **Session-level structure** for real CME: multi-day, parallel tracks/rooms, per-session roles (chair/panelist/presenter — the Malaysian conference programme), per-hour points (HKCR's schedule is per-hour), and eventually per-session attendance.
8. Walk-in handling at the door (design-log open question; every real conference has them).
9. Calendar (.ics/Google/Outlook) on confirmation — pre-pivot TODO, never built, pure table stakes.
10. Paid ticketing/discounts/earnings (witan) — the one organiser expectation we've *deliberately* excluded (Q21).

**Body / auditor**
11. Audit-ready evidence on demand, verifiable independently (B6 — planned, and our chain makes it stronger than market norm).
12. Roster/member verification (3b E4 — gated, planned).
13. **Assessment gates for online CME** — HKAM's iCMECPD requires QR capture *plus* MCQ completion for e-learning points. If webinars ever count, points need an assessment mechanic, not just attendance.

**Platform / commercial**
14. Role-based access, org self-serve admin, audit log visibility, branding — IA spec covers all; competitor tellingly has *no* self-serve org surface at all.
15. Subscription billing/quotas (competitor: Stripe + caps) — ours is invoice-first by decision (Q21), correctly zero-code for pilot.
16. zh-HK localization eventually (columns exist, dead); support/help surface (founder-run for pilot is fine).

## B. Where we stand against that map

| # | Expectation | Status | Where |
|---|---|---|---|
| 1 | External/self-reported activities | ❌ **missing — biggest product gap** | no home; B3-adjacent |
| 2 | Evidence storage (certificates, proof) | ❌ missing (Supabase Storage unused) | B3/B6 |
| 3 | Compliance projection (floors/caps/cycles) | 🟡 designed & gated (the 3b evaluator — body docs *confirm* its bounded-grammar shape: HKCR ≤30 CatB of 90; HKIE per-category floors) | B3, gated on Q26 + review |
| 4 | Shareable/verifiable record | 🟡 partial — chain + signed certs (S4) planned; no share/verify URL deliverable named | B4/B6 |
| 5 | Reminders / 2FA / deletion | ✅ reminders shipped · 🟡 TOTP = S4 · ✅ DSR/pseudonymise shipped (ahead of market) | B5/K1 |
| 6 | Core event loop | ✅ shipped, demo-ready | B1 |
| 7 | Multi-track sessions, per-session points | ❌ missing (single-track agenda_blocks; event-level check-in) | B1/B3 |
| 8 | Walk-ins at door | ❌ missing (known open question) | B1 |
| 9 | Calendar links on confirmation | ❌ missing (designed 2026-06-20, never built) | B5 |
| 10 | Paid ticketing | ⛔ excluded by decision Q21 — hold | — |
| 11 | Evidence packs | 🟡 planned (S5/B6) | B6 |
| 12 | Roster ingestion | 🟡 gated (3b E4) | B3 |
| 13 | Online-CME assessment gate (MCQ) | ❌ missing — HK-specific, only bites when online events count | B1/B3 |
| 14 | Org admin/roles/audit-log UI | 🟡 IA spec'd, post-unfreeze; 5-role model + chain shipped underneath | K1/surfaces |
| 15 | Platform billing | ✅ decided (invoice-first, zero code) | B9 later |
| 16 | zh-HK / support surface | 🔶 deferred consciously | — |

**Where we're AHEAD of market** (say it in the pitch): tamper-evident append-only ledger (competitor: lock-flag + admin override), real-time first-party attendance (competitor: self-report + 30-working-day third-party verification), DSR/consent/pseudonymisation shipped, multi-tenant RLS, per-body retention modeling, and — per HKCR's own guidelines — QR-as-proof is already how HKAM's iCMECPD works, so our mechanism is *familiar* to the HK medical establishment, not exotic.

## C. The misses, ranked, with mitigations

1. **External activities + evidence locker** (exp. 1+2) — *the* gap between "event attendance tool" and "CPD platform." A practitioner whose HKU lecture and journal publication can't live in the wallet keeps their spreadsheet, and the wallet loses its reason to be opened.
   **Mitigation:** design as a B3 extension after the body review: manual entry (activity type taxonomy per body — the 12 forms give us real taxonomies), evidence upload (Supabase Storage; retention per `accrediting_bodies.retention_years`; PDPO), and a **verification-tier field on every ledger entry** — `attendance_verified` (ours, strongest) / `organiser_attested` / `self_declared` — so external entries coexist with scanned ones without diluting the chain's integrity story. Feeds the evaluator with the caps the body docs describe (e.g. HKCR self-study caps). **Sequencing: detail after Q26/body review (the review script should ASK how bodies treat self-reported evidence — proposed question below); build early post-3b. Not pilot-blocking if the pilot story is "attendance-verified credits first."** Ivan call: is manual entry in or out of the first pilot?
2. **Session-level model** (exp. 7) — matters *specifically if the pilot body event is a conference* (multi-room, per-hour points). Single-track seminars work today.
   **Mitigation:** two phases. (a) Cheap schema readiness whenever agenda is next touched: `agenda_blocks` gains optional `room/track` + per-block speaker roles; check-in gains an optional per-session mode flag (design only, no build). (b) Full multi-track UI + per-session scanning post-M4, trigger: first multi-track accredited event. **Ivan call now: what shape is the intended pilot event?** That answer decides whether this is post-M4 backlog or 3b-adjacent scope.
3. **"CPD Passport" naming collision** — ✅ **RESOLVED 2026-07-12 (vault Q29):** Eventar's module is the **"CPD Ledger"**; "CPD Passport" retired, reserved for the competitor. Collateral (task #7) unblocked.
4. **Verify-this-record URL** (exp. 4) — make it an explicit S4 deliverable: the hash-registry lookup page ("paste/scan a record ref → chain-verified ✓"). Nearly free given the registry; converts the integrity story into something a body clerk can *touch*. Add to S4 exit criteria.
5. **Calendar links** (exp. 9) — `lib/calendarLinks.ts` as designed pre-pivot; backend-only (email template addition), freeze-safe. Slot into B5 as a small task; candidate for demo-pack polish week.
6. **Walk-ins** (exp. 8) — small design (staff-created registration inside TC), needed by any real event with door traffic — likely *during the NGO trials*. Slot: design note now, build at first trial feedback. Trigger: first walk-in turned away.
7. **Online-CME MCQ gate** (exp. 13) — defer with a hard trigger: first online/hybrid accredited event in scope. Keep pilot in-person and this costs nothing; note it in the body-review script as a scope boundary to state out loud.
8. **Paid ticketing** (exp. 10) — stays excluded (Q21). Re-entry trigger: first organiser asks to charge attendees; then it's a payments decision, not a feature toggle.

## D. Plan adjustments

**The spine does not move.** Nothing above unblocks or outranks the critical path: demo pack → trials → body review → 3b. The market map's main effect is to *sharpen the review* and *stock the post-review backlog* — it must not become a reason to build ahead of validation (the review-gate discipline exists precisely for gap #1 and #2, whose right shapes depend on body answers).

**Two questions to ADD to the body-review script** (`2026-07-10-cpd-sprint-3b-review-prep.md`, behavioural per its Q5 rule — proposed, Ivan approves):
- *"When a member claims points for something you didn't run — a journal article, an overseas conference — what do you ask them for, and who checks it?"* → resolves external-activity verification tiers + evidence requirements (gap 1).
- *"For a multi-day conference with parallel rooms, do points attach to the event, the day, or the session/hour — and how do you know who sat in which room?"* → resolves session-model urgency (gap 2) with one behavioural fact.

**Proposed DEFERRED.md entries** (with re-entry triggers; added on Ivan's nod, not yet written):
| Item | Re-entry trigger | Earliest |
|---|---|---|
| External activities + evidence locker + verification tiers | Body review answers evidence question; Q26 resolved | post-3b |
| Session/track schema readiness (design note) | Next agenda_blocks migration, or pilot event confirmed multi-track | 3b-adjacent |
| Verify-record public URL | Ships WITH S4 hash registry | S4 |
| Calendar links (.ics + Google/Outlook) | Next B5/email touch; candidate demo polish | any time |
| Walk-in registration at TC | First trial event with door traffic | trials |
| Online-CME MCQ gate | First online/hybrid accredited event | post-M4 |
| zh-HK UI pass | Pilot body/audience requires it | post-M4 |

**Decisions now on Ivan (in order):** ① ~~naming~~ ✅ **resolved 2026-07-12 — "CPD Ledger" (Q29)** · ② pilot event shape (single-track seminar vs conference — decides gap 2's urgency) · ③ manual external entries in or out of pilot scope (decides gap 1's sequencing) · ④ approve the two review-script questions + DEFERRED entries above.

## E. Execution notes (skill-library adoption)

New library contents reviewed; concrete adoptions, not ceremony:
- **everything-claude-code:security-reviewer** — add as a *third lens* at phase-completion gates that touch auth/PII/ledger surfaces (complements, never replaces, the dev/user-lens pair).
- **everything-claude-code:e2e / e2e-runner (Playwright)** — the natural harness for the demo-loop regression (register → check-in → roster) and a future CI leg alongside task #3's replay/tamper job.
- **everything-claude-code:frontend-patterns + coding-standards** — bind them into the task #8 unfreeze implementation prompts.
- **awesome-design-md** — reference-grade token-doc structure for formalising the teal system when it graduates from mockup to `globals.css`; also brand-accurate mockups if we ever need "make it feel like Stripe/Linear" comparisons.
- **open-design**: downloaded (`open-design-main.zip`, 190MB) but **no loaded skill by that name is visible in this environment** — install/enable it if it's meant to be part of the toolkit, otherwise the zip is inert.
- Standing method unchanged: vault `Agent Working Method` governs process; ui-ux-pro-max stays the UI entry skill.
