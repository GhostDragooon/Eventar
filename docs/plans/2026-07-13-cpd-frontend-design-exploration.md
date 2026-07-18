# CPD frontend — design exploration (2026-07-13)

_Exploratory design study run in parallel with the backend build (Milestone A). **No repo frontend touched — the freeze holds.** Deliverable is a published mockup artifact + this record. Feeds the M2 unfreeze scope, not any current sprint._

**Artifact:** https://claude.ai/code/artifact/7b3633c5-67bb-4942-9727-e1ca21040fdb (private; seven surfaces, light + dark, interactive tabs)

> **v2 — 2026-07-15, Ivan's direction:** "too green — main colour/background white, the added colour as highlight." All neutrals (page, surfaces, borders, inks, shadows) moved from green-biased to true neutral (Pajamas-style scale: white page, `#FAFAFA/#F4F4F5` surfaces, `#EAEAEA` borders, `#1A1A1A` ink; dark = neutral near-black). Teal survives **only** as the highlight — active states, brand marks, CPD chips, one filled CTA per view. Three surfaces added the same pass: Landing, Organiser Dashboard, Create event (completing the reference-folder coverage).
>
> **v2.1 — 2026-07-15, follow-up:** Ivan still saw dark ("not a hint of white") — the artifact had been theme-*aware*, so a dark OS or claude.ai's own dark stamp (`data-theme="dark"` on the root) flipped it. Fixed by **committing to light**: light tokens on `:root`; dark tokens scoped to `.cpd.dark`, which only the in-page toggle sets. Verified under emulated `prefers-color-scheme: dark` **and** a simulated host `data-theme="dark"` stamp — background stays `rgb(255,255,255)` in both; toggle→dark→toggle-back round-trip works. **Standing rule: Eventar surfaces load white for everyone; dark is an explicit user choice, never an OS/host inheritance.**

**Grounded in:** the 4 real HK body record forms now on file (`30 — Reference/CPD Source Documents — Body Manuals & Forms.md`), the CPD Passport competitor crawl (`30 — Reference/Competitor Analysis — CPD Passport.md`), the ASPS member portal (out-of-scope US, UX reference only), and the 13 previously-unreviewed images in `30 — Reference/UI-UX Design References.md` (now reviewed — see that note).

---

## 1. The synthesis — what the real forms told us

Every HK body form, despite different professions, computes the **same shape**:

| Layer | HKICPA | Law Society | HKIE | HKCR (radiology) | Physio Board |
|---|---|---|---|---|---|
| **Cycle** | 3-yr rolling | 1-yr (1 Nov–31 Oct) | member-selectable (cal / Apr–Mar) | 3-yr from 1 Jan | 3-yr |
| **Category split** | verifiable / non-verifiable | ~11 activity types | DSTM / BAS-GPM / H&S / Others | Category A / B | Core / non-core |
| **Thresholds** | — | — | 30h total, per-cat minima | 90 pts, ≥60 A, ≤30 B | 45 pts, ≥23 core, ≥5/yr |
| **Activity log** | activity · organiser · date · hours · **evidence ref** | same | same | same | same |
| **Evidence** | "cross-referenced with supporting documents" | deemed-accreditation self-cert | — | logsheet | 6-yr retention |
| **Declaration** | signature + relevancy statement (reflection prompts) | signature | annual signed compliance declaration | — | signature |

**Four cross-cutting truths that drove the design:**

1. **Cycle-with-deadline is the unit of meaning, not cumulative total.** The form asks "did you hit the minima *by the cycle end*?" The competitor (CPD Passport) shows only lifetime totals with no deadline framing — a structural weakness. → The practitioner surface leads with a **cycle progress ring + category-threshold bars**, deadline first.
2. **Category minima are per-body and asymmetric** (a *floor* on Cat A, a *cap* on Cat B). → Bars carry an explicit minimum marker and "X short" / "capped, would still count" copy.
3. **Evidence provenance is the whole trust game.** Forms demand supporting documents; the competitor makes members upload certificates it explicitly won't verify, then defers to a 30-working-day third party. → Eventar's **first-party "scanned at venue"** provenance is shown as a first-class column and a headline "% verified" — the one thing the incumbent structurally cannot show.
4. **The professional body's own vocabulary is load-bearing** (category, points, confirmation reference, lead time, retention). → The organiser accreditation cards mirror the paper submission's exact fields.

---

## 2. Design direction

**Conflict surfaced (not averaged):** shipped `app/globals.css` is still **Vercel-canonical (accent blue #0070F3)**; the 2026-07-11 design-direction artifact + Ivan's curated reference folder moved to **teal "Trust & Authority."** This exploration commits to **teal** as the forward direction for the M2 unfreeze. The shipped blue is the not-yet-updated present, not a competing choice. **Decision needed at unfreeze:** confirm teal, retire blue tokens.

- **Palette (v2, corrected per Ivan 2026-07-15).** **White ground; teal `#0F6E56` strictly as highlight** — active nav, brand mark, CPD chips, at most one filled CTA per view. All neutrals true-neutral (light: `#FFF` page, `#FAFAFA/#F4F4F5` surfaces, `#EAEAEA` borders, `#1A1A1A/#565656/#8C8C8C` inks; dark: `#0A0A0A/#141414/#181818`, `#262626` borders). Grounded in GitLab Pajamas' production neutral scale (via the `design-system-libraries` skill) + the `minimalist-ui` protocol (hairline borders, <0.05-opacity shadows, no coloured section grounds). Status ramp unchanged per §7a: verified green, pending amber, blocked red, always icon-paired. ~~Neutrals biased green~~ (v1 — rejected as "too green").
- **Type.** Humanist serif (Iowan/Palatino) for wordmark + compliance headlines (authority); system-sans for UI chrome (modern platform); tabular-nums everywhere points/hours align (regulatory data must not drift 3.5 → 3.50).
- **Both themes** designed to token parity; verified live.

---

## 3. Surfaces (approaches considered → chosen)

### 3a. Practitioner CPD Ledger (the lead)
- **Considered:** (A) compliance-cycle-first, (B) ledger/activity-feed-first like the competitor, (C) wallet/pass-first.
- **Chosen: A.** Ring (points vs cycle) + category-threshold bars + a verified-vs-self-reported banner, *then* the append-only ledger. Directly beats the competitor's no-deadline weakness and foregrounds the attendance differentiator. Multi-licence handled with a switcher (a practitioner may hold >1 body licence — HKICPA Part II reciprocity is real precedent).

### 3b. Organiser Accreditation & Compliance
- **Considered:** (A) event-accreditation-centric (matches shipped IA spec), (B) body-relationship-centric.
- **Chosen: A**, enriched with the forms' category/threshold vocabulary. Sidebar app-shell + per-event counted pill-tabs (witan/Cadre pattern from the IA spec). Key motif: **roster eligibility as a stacked meter** + the rule "eligibility is a property of the row, not a report you run" — a lapsed licence flag follows the person to roster and check-in, because a lapse discovered at the desk is a credit that silently never posts.

### 3c. Event Schedule — single + multi-track (both, per Ivan's call)
- **Single-track:** the shipped agenda-block model as a vertical timeline, each block carrying its own CPD points.
- **Multi-track:** day tabs + track filters + parallel room columns + role-based people (chairperson / panellist / operator / presenter), drawn from the real 22nd Malaysian Cardiovascular Interventional Symposium programme. Responsive: columns on desktop.
- **Scope flag (carried, not decided):** multi-track needs **sessions with start/end times, parallel tracks/rooms, and role-typed people** — a genuinely richer schema than the current single-track agenda-block model. Not in any sprint plan. This is a data-model decision to make deliberately before building toward it (CLAUDE.md rule 13).

### 3d. Practitioner wallet / QR pass (added 2026-07-13)
- The attendee-facing **mobile** surface (the IA spec keeps attendee surfaces mobile-first web) — a phone frame showing the practitioner's passes.
- **The other end of the ledger:** the personal QR is what turns "registered" into a first-party attendance fact when scanned at the door. Points show **pending** on the pass, then **posted** in the CPD Ledger the moment check-in happens — closing the loop the "scanned at venue" ledger column opens.
- Bottom nav with **Scan** as the prominent centre action (Evently reference + IA spec — check-in is the time-critical mobile job). Past passes show the checked-in / points-posted state.
- QR is rendered white-always (scannable regardless of theme) — authentic real-pass behaviour, not a dark-mode oversight.

### 3e. Landing page (added 2026-07-15)
- White-ground marketing surface at `eventar.hk`. Motifs mapped from the reference folder: glass pill nav (VELORA), serif two-tone headline with the product shown in a faux-OS frame (RelayAI), trust chip + feature rows (TrueBody) — "Attendance is a fact. *Your credits should be too.*"
- **Comparison strip is the competitor research verbatim:** self-report upload → ~30-working-day third-party verification → permanently self-declared, vs scan → real-time post → hash-chained. Structural claim, not marketing copy.
- Honesty guardrails: "Rule-aware for 8 Hong Kong accrediting bodies" refers to encoded rulebooks (real, seeded) — deliberately **not** phrased as endorsements; no invented client counts or testimonials.

### 3f. Organiser dashboard (added 2026-07-15)
- Straight implementation of the IA spec's Dashboard section: stat row (registered + Δ7d, capture rate, the **credits pending→blocked→issued pulse**, events-this-week live pill), needs-attention queue (LoopAI motif — every row actionable, deep-links to the fix), upcoming events with capacity meters, live check-in feed with method pills + tabular timestamps (witan motif).

### 3g. Create event (added 2026-07-15)
- Full-page setup with numbered step rail (Untitled UI reference, matching the shipped numbered-section form). The CPD accreditation section pulls the selected body's rulebook into helper text ("Rules loaded: 3-year cycle · Cat A/B · 90-point minimum") and an inline lead-time tip ("74 days out; HKCR needs ~60 days") — the annotated-form pattern flagged in the competitor analysis as worth borrowing. Agenda/speakers deliberately shown collapsed (unchanged from shipped).

---

## 4. Open decisions / next steps

1. **Teal vs shipped blue** — confirm at M2 unfreeze; retire the blue token set if teal is locked. *Narrowed by the v2 white-ground correction:* the neutral scales now effectively converge with the shipped Vercel-canonical neutrals, so the remaining decision is only **which accent hue** (teal replaces blue), not a whole-palette swap.
2. **Multi-track schema** — decide whether parallel-track scheduling is in scope before it drives any migration (the schedule references + the Malaysian programme photo suggest Ivan is leaning toward it; confirm).
3. **Naming** — surfaces use "Eventar" (platform) + "CPD Ledger" (practitioner module, per Q29). URLs are illustrative (`app.eventar.hk`, `organiser.eventar.hk`).
4. These mockups are **not** shippable code — they're a design target. The unfreeze build translates them onto the real M3 token grid + Geist, honouring the shipped component API.

---

## 4b. v3 — Aligned three-layer direction (2026-07-16, Ivan's brief, agreed before build)

**Reference layers (locked):** (1) **CPD Passport = structural baseline for the practitioner app only** — two-section sidebar (MAIN/ACCOUNT), record-list pages, annotated forms, share/verification area; it has no organiser or event concept, so (2) the **real body forms** supply the compliance logic it lacks — requirement tiles with target-vs-actual (HKICPA Part I / ASPS pattern), verifiable-vs-self-reported split, evidence linkage, declaration/export; (3) the **visual references** drive polish. Organiser app stays on the IA-spec baseline.

**Colour (locked, replaces teal — closes the open M2 colour decision):** white ground; one blue ramp with fixed roles — **`#1C3C94`** primary actions/key headings/active nav (only blue safe for small text, ~10:1), **`#0E79EC`** links/highlight CTAs (~3.9:1, not small text), **`#4494BC`** icons/borders/selected states (~3:1, non-text), **`#6CAAEF`** hover/informational tints (~2.3:1, surfaces only). **Status colours stay semantic** (green verified/live · amber pending/self-reported · red blocked/lapsed) — blue never signals verification. Track colours moved to a categorical set (violet/orange/cyan).

**Built (artifact label `blue-ramp-three-layers`):** practitioner app restructured to the competitor skeleton — Overview (requirement tiles + ring + category bars), Activity ledger (page header + year/category/provenance filters + add-external-activity), Evidence locker (linked documents, visibility chips), Passes (wallet), **Share & verification** (create-link with expiry + included/withheld checklist, active-shares list, live chain-verified view vs the competitor's 30-working-day model — the M3 verify-URL gap made visible). Organiser app gains **Settings as the split configuration workspace** (categories left, Team & roles table with audited-role note + consent versions right). System sheet gains the colour-system card, search/filter chrome, destructive-confirm modal, and profile menu (role as badge, not switcher). All navigation assertion-verified; zero console errors; loads white for everyone.

## 4c. Participants directory populated (2026-07-16, artifact label `participants-directory`)

First of the previously-stubbed organiser pages to be built out, per Ivan's "log this, we'll populate other pages, I'll let you know when" cadence. Matches his own brief's "Directory / List View" template verbatim (Data Table + Top Filter Bar + Bulk Action engine), grounded in the IA spec's Participants section (`docs/plans/2026-07-12-organiser-ia-spec.md`): avatar, name, licence badge (body + status pill), events attended, credits earned, last activity.

**What it adds, functionally (not just visually — every interaction wired and assertion-tested):**
- Counted status tabs (All 148 / Verified 123 / Pending 16 / Lapsed 9) that actually filter the table rows.
- Filter row (search, body, event) matching the layout-expectations list.
- Native checkboxes (brand-accent-coloured) with a working select-all and a **sticky bulk-action bar** that appears on selection, showing a live count — the exact component from Ivan's brief and the System sheet, now wired to a real table instead of only demoed in isolation.
- Row click opens the **same drawer pattern** already shipped on Accreditation, generalized to populate dynamically from `data-*` attributes on the clicked row (name, sub-line, events, credits, eligibility state) — demonstrates progressive disclosure (row → drawer → page) working from a second entry point, and reuses Dr. Tam Chi-ho (the lapsed-licence example) for continuity with the Accreditation drawer.
- The drawer-close handler was generalized from a single `querySelector` to `querySelectorAll`, since the page now has two independent drawer instances (Accreditation's + Participants') — a real bug that would have broken one of them silently if left singular.

**Not built:** dynamic per-row activity-history content in the drawer (kept representative, per-row credits/events are real but the "recent activity" list is a fixed example) — reasonable scope line for a design exploration, flagged rather than silently simplified.

## 4d. Landing aesthetic options A/B/C (2026-07-16, artifact label `landing-aesthetic-options`) — AWAITING IVAN'S PICK

Ivan's direction: layout/content are right, aesthetics missing — derive cosmetic treatments from the reference landings, offer options, lock one, then propagate to every page and lock the frontend. Three switchable options built into the Landing tab (segmented control, same layout/content/palette under all three; each traceable to exactly one reference):

- **A — Navy authority** (TrueBody): deep `#1C3C94` hero band, white serif headline with `#6CAAEF` italic line, glass nav on navy, inverted white primary CTA, white product card floating over the band and overlapping into the white body. The institutional-trust read.
- **B — Glass light** (VELORA): all-white hero with soft `#6CAAEF/#4494BC` radial washes, blurred glass nav, ink headline with `#0E79EC` italic, gradient CTA (`#0E79EC→#6CAAEF`), trusted-by avatar cluster. The lightest, most editorial read — closest to the pre-option landing.
- **C — Product stage** (RelayAI): `#0B1B3E→#1C3C94` gradient hero with masked dot-matrix texture and glow, **sans-bold + serif-italic** mixed headline, saturated `#0E79EC` CTA, product in a dark-bezel laptop-style frame overlapping the fold. The modern-SaaS product-forward read.

All three share the new micro-polish (staggered hero fade-up honouring reduced-motion, CTA hover lift). One real bug prevented during build: the new option switcher reuses `.seg`, whose buttons the schedule's view-toggle JS bound globally — scoped that selector to `[data-view]` before it broke both controls. Next step on Ivan's pick: propagate the chosen treatment's vocabulary (band/atmosphere/depth/type mix) to dashboard + all key screens, then map every page and lock.

**Update (same day):** Ivan's direction after seeing A/B/C — "something between B & C, white as the main color." Built as **D · White stage** (artifact label `option-d-white-stage`, now the default): B's white ground + glass nav + soft washes + avatar trust cluster, carrying C's drama translated onto white — masked dot-matrix accent in `#1C3C94`, **bold-sans + serif-italic** headline mix (`#0E79EC` italic line), solid `#0E79EC` primary CTA with blue hover glow, and the dark-bezel laptop-framed product with a blue-tinted shadow, overlapping into the body. Candidate for the lock — awaiting Ivan's confirmation before propagating to all pages.

## 5. App-shell architecture review (2026-07-15) — NOW BUILT INTO THE ARTIFACT

_Initially delivered as this review only; Ivan's correction: the ask was the shell **in the mockups**. First build bolted a shell copy onto each separate page mockup — Ivan's second correction: "global ones should be global, then the page-specific content." Final structure (artifact label `global-shell-pages-swap`): the artifact is organised by **context**, and within a context the shell renders **once** with pages swapping inside it. **Organiser app**: persistent top bar (workspace switcher, &#8984;K search, venue status with Connected/Syncing variants, notification bell whose badge = the needs-attention queue, quick action) + sidebar where **the sidebar itself is the navigation** — Dashboard / Events&rsaquo;New / Accreditation swap the content region in place (URL updates, shell never moves), the contextual drawer overlays the Accreditation page, and undesigned areas show an honest empty-state instead of a fake page. **Practitioner app**: persistent nav — Compliance (the ledger) and Passes (the mobile wallet incl. the bottom bar + Scan FAB) swap inside it. **Public event page** (single/multi-track), **Landing**, and the **System** component sheet (pill vocabulary, provenance/eligibility chips, field states with a body-rule error, toasts, skeleton, venue-status trio, empty states, consent-safe bulk bar) complete the set._

Ivan supplied a "production-ready architectural list" (global shell, component library, system states, page templates, minimum set) and asked for pushback. Verdict: **the skeleton is right and largely matches the organiser IA spec** — top bar + collapsible sidebar, mobile bottom nav with the Scan FAB (already Ivan's own call), breadcrumbs/tabs/metric tiles/data tables/status pills, sticky bulk-action bar, skeleton/empty/error/toast states, and the page templates are all adopted. The **venue status indicator (Connected/Offline/Syncing)** is a genuinely good addition — offline tolerance was already re-ranked up in the IA spec as the #1 live-ops risk; making network state a first-class shell element follows.

**Corrections applied (each grounded in a locked decision):**

| # | Item in the list | Correction | Grounding |
|---|---|---|---|
| 1 | "Attendees (Registry & **CPR Passport** verification sub-tier)" | Name is **CPD Ledger** ("CPD Passport" is the competitor's brand; "CPR" is a typo). And licence *verification* is body/platform-staff work — organisers see **outcomes** (eligibility signals), never a verification workspace | Q29 · IA spec §4 |
| 2 | "Attendees" as the nav area | **Participants** — person-level view *derived from event participation*; explicitly not a CRM (no cold-contact imports, no campaign lists) | IA spec §3, PDPO purpose-limitation |
| 3 | Sidebar omits two modules | Add **Accreditation & Compliance** (the differentiating module) and **Communications** (email-log visibility: insert-first, failures with retry) as top-level areas — 8 areas, not 6 | IA spec §§4, 6 |
| 4 | Bulk bar includes "**Email Blast**" | v1 Communications is transactional-only; segmented blasts are post-M4 **and** consent-gated. v1 bulk actions: Bulk check-in · Export CSV · Print badges | IA spec §6 · Q18/consent |
| 5 | "**Switch Role**" in profile menu | Roles are admin-granted per account (5-role enum, changes audited via `set_staff_role()`), not a user-switchable mode. Show a role badge; keep the *workspace* switcher (multi-tenancy is real) | Sprint 3a Task 2 · Q20 |
| 6 | "`VIP` [Purple]" badge example | §7a one-colour-one-meaning: colours map to concepts (green=live/verified, amber=pending/draft, red=error/blocked, teal=brand/active, neutral=done). VIP isn't a CPD concept; purple is currently a schedule-track colour. New colour meanings are a §7a amendment, not per-feature choices | eventar-design-patterns §7a |
| 7 | Drawers for "heavy inline creation or editing" | Progressive-disclosure rule: row → drawer → page. Drawers = quick-view + light edits; **full editing workflows get pages** (three-layer-validated forms need room and error surfaces) | IA spec presentation rule 5 |
| 8 | Wizard for event creation | Shipped create-event is a single page with numbered, jumpable sections (CPD section pulls body rules contextually) — keep it; reserve the linear stepper for genuinely linear flows (certificate/badge config, CSV import mapping) | Shipped form + §3g |
| 9 | Notification bell | Must open the **same needs-attention queue** the dashboard shows, not a second feed — every row actionable, deep-links to the fix. Two notification surfaces will drift | IA spec dashboard rule |
| 10 | Profile menu "eliminating the need for a global footer" | True for the organiser app; **attendee-facing web keeps a footer** — PDPO/consent-version links (`lib/legalVersions.ts`) must stay reachable on public surfaces | Consent versioning |
| 11 | Global search / command palette | Keep in the shell design, tag **post-M4** — not must-have for pilot | Out-of-scope discipline |

**Two primitives his minimum set is missing** (both are the product's spine, both repeat across roster/ledger/wallet/check-in per presentation rule 8):
- **Provenance chip** — `Scanned at venue` / `Self-reported` / evidence ref.
- **Eligibility flag** — `Licence lapsed — credits will not post`, rendered wherever the person appears.

**Revised minimum reusable system (his 7, amended):**
1. Global app shell — desktop top/left nav + mobile bottom bar with Scan FAB, **incl. venue status indicator**
2. Standard page header — title, breadcrumbs, one primary action
3. Data table container — filter row, **counted tabs/chips**, status pills, **provenance + eligibility chips**
4. Form field block — default/focus/error, where the error state surfaces **all three validation layers** (form, Zod, DB/RLS — a silent RLS failure must never read as success, Q18)
5. Sliding drawer — view + light edit; full edits are pages
6. Feedback set — skeleton loader, both empty-state variants, toasts, **inline rule-tip box** (the annotated-form pattern: "74 days out; HKCR needs ~60")
7. Split settings layout

## Related
- `docs/plans/2026-07-12-organiser-ia-spec.md` — the organiser IA this refines
- `30 — Reference/CPD Source Documents — Body Manuals & Forms.md` — the forms
- `30 — Reference/Competitor Analysis — CPD Passport.md` — the incumbent
- `30 — Reference/UI-UX Design References.md` — the visual references (13 now reviewed)
