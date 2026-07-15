# CPD frontend — design exploration (2026-07-13)

_Exploratory design study run in parallel with the backend build (Milestone A). **No repo frontend touched — the freeze holds.** Deliverable is a published mockup artifact + this record. Feeds the M2 unfreeze scope, not any current sprint._

**Artifact:** https://claude.ai/code/artifact/7b3633c5-67bb-4942-9727-e1ca21040fdb (private; seven surfaces, light + dark, interactive tabs)

> **v2 — 2026-07-15, Ivan's direction:** "too green — main colour/background white, the added colour as highlight." All neutrals (page, surfaces, borders, inks, shadows) moved from green-biased to true neutral (Pajamas-style scale: white page, `#FAFAFA/#F4F4F5` surfaces, `#EAEAEA` borders, `#1A1A1A` ink; dark = neutral near-black). Teal survives **only** as the highlight — active states, brand marks, CPD chips, one filled CTA per view. Three surfaces added the same pass: Landing, Organiser Dashboard, Create event (completing the reference-folder coverage).

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

## Related
- `docs/plans/2026-07-12-organiser-ia-spec.md` — the organiser IA this refines
- `30 — Reference/CPD Source Documents — Body Manuals & Forms.md` — the forms
- `30 — Reference/Competitor Analysis — CPD Passport.md` — the incumbent
- `30 — Reference/UI-UX Design References.md` — the visual references (13 now reviewed)
