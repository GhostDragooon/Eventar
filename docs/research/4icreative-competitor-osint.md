# 4iCreative Limited — competitor OSINT + event-collateral mechanism

_Researched 2026-08-07/08. Public sources only, plus three real event artefacts supplied by Ivan._

**Evidence legend:** ✅ verified by direct fetch/read · 🟡 third-party report, uncorroborated · ⚠️ inferred, NOT verified · ❌ found false.

> **Why this doc exists:** 4iCreative organises accredited CME events in Hong Kong under HKCP — Eventar's first accrediting body — and HKCR. The competitive question turned out to be less interesting than the **collateral production mechanism** their events run on, which is the actual subject of §5. §6 parks findings that are out of current scope.

---

## 1. Corporate identity ✅

| Field | Value |
|---|---|
| Legal name | 4iCreative Limited |
| HK CR number | **2336607** |
| Incorporated | 29 Jan 2016, private company limited by shares |
| Status | Live |
| Registered address | Unit 413B, 4/F, InnoCentre, 72 Tat Chee Avenue, Kowloon Tong |
| HKSTP status | Directory category **"Design"** — **Tenant** at InnoCentre, not an incubatee |
| Contact | `enquiry@4iCreative.com` · +852 9866 0571 (mobile, not landline) |
| Headcount | 🟡 LinkedIn ~10 · ZoomInfo 14 (sources disagree) |
| Revenue | ⚠️ ZoomInfo models USD 1.09M — **not filed**; HK private companies publish no accounts |

Domain registered 27 Jan 2016, two days before incorporation (GoDaddy, expires 2028, DNSSEC unsigned).

## 2. What they actually do — and what their site claims ❌

**Their website claims** medical-communications work: *"scientific integrity, ensuring every piece of material they create and every event they organise is accurate, evidence-based, and compliant."*

**That is not what they do.** Corrected by Ivan 2026-08-08 from first-hand attendance: they are an **event production company** — venue booking, PA/AV, photography, catering, on-site logistics, and design layout.

The public evidence supported the corrected read all along and was under-weighted on first pass:

- ✅ HKSTP — an independent third party — categorises them under **"Design"**, not health/biotech.
- ✅ Portfolio content is **poster design and photography** (HKSEMR, HKPGA symposium/webinar posters). No medical writing, no regulatory affairs.
- ✅ Job postings are Design/Graphics/Multimedia.
- ✅ Their own **services page never mentions events at all** — the copy is aspirational; delivery is production.
- ✅ The only metric the homepage reaches for is an unfilled **"+ Events Managed"** placeholder.

> **Standing lesson:** a company's self-description is evidence of *how they want to be bought*, never of what they do. Third-party categorisation, hiring, and portfolio artefacts are the reliable signals. When those disagree with the homepage, the homepage is the outlier.

## 3. Proven accredited-CME footprint ✅

- **HKCR 2026 activity list** (fetched, text-extracted): entry `2026-1174`, organiser **4iCreative Limited**, *"Clinical Case Sharing – CDK4/6i in HR+/HER2- EBC patients"*, 15 Jun 2026 19:00–20:35, applied **19.5.26**, approved **3.6.26**, **1 point (Cat. A)**, PP, Asso.
- **HKCP FCAA calendar** (Oct 2025 edition, since rotated): lunch symposium *"Redefining Obesity Beyond BMI…"*, 27 Oct 2025, The Langham TST, 1 CME point.
- 🟡 Also surfaced: *"Revolutionizing Treatment Approach in Prostate Cancer"* (27 Oct 2025), *"2025 ESC Updates of Heart Failure"* (15–16 Oct 2025).

**Market structure ✅** — organiser frequency in the HKCR 2026 list: Novartis 5 · Roche 4 · Bayer 4 · MSD 2 · GSK 2 · MIMS 2 · **4iCreative 1**. The named accreditation applicant is *usually the pharma company itself*, sometimes an agency, sometimes a society. Bearing on B2's `organisers` model and on the open "who pays" question.

**Accreditation lead time ✅** — apply ~4 weeks out, approve ~2 weeks out, returning a category + point value **before** the event. Confirms Stage 7's "CPD config at event creation" shape.

## 4. Digital footprint ✅

GoDaddy Managed WordPress behind Cloudflare · Google Workspace mail · Astra + Elementor + ElementsKit + Spectra + SureForms + **SureCart** + **ZipWP**.

- **The entire site was rebuilt in one week**: every page created **2026-01-29**, edited to 2026-02-03, Shop page added 2026-02-05.
- `zipwp/v1` in the REST namespace = **ZipWP, Astra's AI site generator**. The site was AI-generated, not designed.
- Homepage stat blocks still read **"+ Years Industry Experience"** / **"+ Events Managed"** — never filled in.
- A **DNS TXT record contains pasted HTML style markup** (`<span style="font-size: 14.6667px…`).
- **SureCart shop is live but empty** ("No products found") — e-commerce installed, nothing sold. The one productisation signal; nothing shipped.
- One WordPress user (`id:1`, shared admin). No sitemap. No social links anywhere. No named team on the site, HKSTP, or LinkedIn.

**Capability read ⚠️:** no evidence of any software engineering capacity — no product, no app, no technical hiring, no repos. This is a people-and-craft business scaling linearly with headcount.

---

## 5. The collateral mechanism — ICI Summit 2026 ✅

Three artefacts from one real event, supplied by Ivan. **Innovative Cardiovascular Initiative Summit 2026 — "Innovation in Calcium Management"**, 8–9 Aug 2026, Charles K. Kao Auditorium, HK Science Park. Hybrid (on-site + overseas live stream). ~30 speakers across HK, China, Japan, Singapore, UK, USA, Thailand, Indonesia, Taiwan. ~30 sponsor logos, ~9 supporting organisations.

### 5.1 Three documents, three sources, three production signatures

| Artefact | Rev | Signature | Source |
|---|---|---|---|
| Poster + agenda | `260804A` | Custom hero illustration, consistent type system, structured agenda table, 30-logo sponsor wall | **Production company** |
| CME/CNE accreditation | `260805` | Word-to-PDF, banner pasted on top, default table borders | **Organiser** |
| Transportation guide | `260730A` | 14-page slide deck, phone photo, red rectangles drawn over a screenshot, marker underlines, **"Innitiative" typo in the event name** | **Venue/organiser** |

**The production company touched one of three.** On that one, their contribution is **hero artwork + layout applied to organiser-supplied data** — the agenda, speakers, affiliations, sponsor list and session-level sponsorship attributions all originate with the organiser.

### 5.2 The mechanism as it runs today

```
organiser assembles content (agenda, speakers, sponsors, accreditation applications)
   → production company lays it out, produces hero art
   → frozen PDF, hand-versioned by filename (YYMMDD + revision letter)
   → email blast with N attachments
   → any change = new revision letter = new blast = two versions in the wild
```

### 5.3 Failure modes, all observable in these three files

1. **Stale by construction.** Poster frozen `260804`; accreditation issued `260805` — one day later, three days before the event. The attendee's most important information (what credit do I earn) **could not** be on the most-distributed artefact. Hence a second PDF.
2. **No single source of truth.** Three documents, three sources, three visual languages, one misspelling the event name.
3. **No personalisation.** Every attendee receives an identical file and must locate their own row in a 13-row table.
4. **Revision fan-out.** `260804A` / `260730A` — revision letters are hand-maintained. "A" implies B and C. One speaker change = one revision + one mass email + permanent ambiguity about which PDF is current.
5. **Dead-end artefacts.** A PDF cannot update, confirm, personalise, or check anyone in. The poster's QR points at *generic registration*, not the attendee's own record.
6. **Logistics as a 14-page deck.** Venue/parking/transit information is attendee-facing content trapped in a slide export.

### 5.4 Poster decomposition vs what Eventar already models

| Poster element | Eventar source |
|---|---|
| Title, subtitle, dates, times, venue, hybrid/streaming note | Event record ✅ |
| Register QR | `buildEventQrPng` ✅ already built |
| Agenda: sessions, durations, titles, speakers, affiliations, countries | `agenda_blocks` + `deriveSpeakerNames` ✅ mostly present |
| Per-session sponsor attribution *("Sponsored by Abbott")* | ❌ needs a field on agenda blocks |
| ~9 supporting-org + ~30 sponsor logos, tiered | ❌ needs an asset library |
| Accreditation table | ❌ needs to be event data (display only — see §6) |
| **Hero illustration** | **The only irreducibly bespoke element** |

✅ `app/(public)/events/[id]/poster/page.tsx` already exists — 351 lines, print-aware (light-always `--po-*` tokens because it prints on paper), embeds the event QR, derives speakers from the agenda, ships a print button. **This is a beachhead, not greenfield.**

**Conclusion:** ~90% of that poster is renderable from data Eventar holds or nearly holds. The displacement target is not "out-design them" — it is **reduce their design job to supplying one hero image**, i.e. an illustration commission rather than a retainer.

### 5.5 Why an agency cannot copy the replacement

Their revenue depends on revision being expensive. A mechanism where revision is free cannot be offered by a business that bills per revision. **That is a business-model constraint, not a competence gap** — the more durable kind of advantage.

---

## 6. Parked — accreditation modelling (logged, NOT in scope)

Ivan's call 2026-08-08: *"accrediting bodies and their calculation is not the focus here for now, but the mechanism."* Recorded here so it isn't rediscovered.

The ICI accreditation PDF ✅ awards credit from **one event to thirteen bodies**, differentiated per day:

| College | Both days | Day 1 | Day 2 | Sum |
|---|---|---|---|---|
| Anaesthesiologists | 10 | 4.5 | 5.5 | 10 |
| **Community Medicine** | **10** | 5 | 6 | 11 — capped |
| Emergency Medicine | 10 | 4.5 | 5.5 | 10 |
| Family Physicians | 10 | 5 | 5 | 10 |
| **Obstetricians & Gynaecologists** | **5** | 4.5 | 5 | 9.5 — capped by ~half |
| Otorhinolaryngologists | 5.5 | 2.5 | 3 | 5.5 |
| **Paediatricians** | **10** | 5 | 6 | 11 — capped |
| Pathologists | 11 | 5 | 6 | 11 |
| **Physicians** (Eventar's first body) | **9** | **4** | **5** | 9 |
| Radiologists | 10 | 4.5 | 5.5 | 10 |
| Surgeons | 11 | 5 | 6 | 11 |
| Medical Council | 10 | 5 | 5 | 10 |
| **Continuing Nursing Education** | 10.5 | 5 | 5.5 | 10.5 |

Candidate DEFERRED rows if/when this reopens — **not promoted, awaiting Ivan's call**:

1. **Credit is `(event, body, days_attended)`, not `(event, attendance)`.** The same two days yield 11 to a pathologist, 9 to a physician, 5 to an O&G. ⚠️ Whether `award_attendance_credit()` can express this is **inferred from PROJECT_STATE, not verified against the migration** — verify before relying on it.
2. **Three bodies apply a per-activity cap** (Community Medicine, O&G, Paediatricians). Caps live on the *body*, not the event — the structural justification for `body_rules` being versioned append-only and separate from event config. A live specification for B3's bounded grammar: per-body rate, per-segment award, per-activity ceiling. Notably, **nothing here needs a general rules engine.**
3. **Per-day attendance granularity is mandatory** for multi-day events. ⚠️ Unverified whether check-in models day 1 / day 2 as separate attendance records.
4. **Nurses are in scope** (CNE row; HK Cardiac Nursing Association is a supporting org). `practitioner_licences` would need nursing registration.
5. **Multi-college is the norm at conference scale**, not an edge case. "HKCP as first accrediting body" describes one row of thirteen on a real event. ⚠️ Stage 8 references six seeded bodies; scaling to thirteen is unverified.

---

## 7. Strategic read

**Not a product competitor.** Substitution fails in both directions: they cannot build an audit chain or credit ledger; Eventar cannot book a venue or run a PA system. Two businesses that cannot substitute are complements — but they **draw from the same event budget**, which is where friction is real.

**They own the door.** A production company staffs the registration desk — physically standing at the moment `award_attendance_credit()` fires. The relationship is a **handoff point**, not a contested market.

**Threat is commercial, not technical:** budget interposition (agency absorbs Eventar's value into an invisible line item) and channel lock-out (an agency white-labels a rival first). Neither involves them building anything.

**Ceiling of the displacement thesis:** photography, videography, physical print, backdrops, stage graphics, AV, catering, on-site crew stay theirs permanently. "Downsize to production and logistics" is the achievable ceiling — and they'd likely stay a willing partner at it, since it removes their lowest-margin work.

**Commercial argument to lead with:** Eventar currently sells compliance infrastructure — a slow, trust-heavy, hard-to-demo sale. Collateral generation is wanted within 30 seconds of being seen. **Design is the acquisition surface that pulls the integrity product in behind it.**

## 8. Not verified — do not treat as fact

- **Directors and shareholders.** webb-site.com has shut down (301s to Substack); free HK directories 403'd. Requires a paid ICRIS search.
- **Revenue** — modelled, not filed.
- **True event volume.** One HKCR 2026 entry plus three 2025 events via search index; HKCP rotates its calendar PDF and the Oct 2025 file now 404s. **Do not read "1 HKCR entry" as "1 event per year."**
- **Headcount** — 10 vs 14.
- **Site history** — Wayback rate-limited (429) and the domain appears sparsely archived; the pre-Jan-2026 site was not recovered.
- The **HA / HA Go app** claims are self-reported.
- Everything in §6 marked ⚠️ — inferred from docs, not read from migrations.
