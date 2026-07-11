# Organiser IA + data-design spec — v1 (2026-07-12)

_Drill-down on the organiser web app: navigation, per-module contents, meaningful data, presentation rules, and input/output flows. Grounded in Ivan's 8 reference screenshots + his proposed IA (this doc adds/subtracts from it explicitly) + the block architecture. Feeds task #8 (design implementation) and the M2 unfreeze scope. "CPD Passport" here = licences + credits + compliance (Ivan's "CPR passport")._

## Layout decision

**Left sidebar for the organiser web app** (witan/Cadre pattern — both references use it; 8 nav areas outgrow the shipped 3-part top bar), plus a slim top context bar (org name, global search, user menu). **Per-event detail uses pill-tabs WITH COUNTS** (witan's `Overview · Tickets · Attendees · Earnings`, Cadre's `FREELANCER 12 · INTERVIEW 2 · CONTRACTS 3`) — two-level nav: sidebar = global areas, tabs = within-event. Mobile: bottom nav `Home · Events · [Scan] · People · More` with **Scan as the prominent center action** (Evently pattern; check-in is the time-critical mobile job). Attendee-facing surfaces stay mobile-first web.

## Main nav — Ivan's 8 areas, with add/subtract calls

| # | Area | Verdict | Why / what changed |
|---|---|---|---|
| 1 | Dashboard | ✅ keep | Cross-event operational glance only (Q16 heritage: general vs event-specific separation stays) |
| 2 | Events | ✅ keep | The workhorse; owns per-event tabs |
| 3 | Attendees → **Participants** | ⚠️ keep, reshaped | NOT a marketing CRM. PDPO purpose-limitation: registration data was collected to run events, not for cold outreach. v1 = person-level view **derived from event participation** (registration + attendance + credit history, search/filter/tags). No cold-contact imports, no campaign lists. |
| 4 | CPD Passport → **Accreditation & Compliance** | ⚠️ keep, split by audience | The *wallet* (mocked) is attendee-side. The **organiser-side** module is: event accreditations (body, points, category, status), body relationships, and roster eligibility signals ("licence lapsed — credits blocked"). Practitioner licence *verification* is body/platform-staff work, not organiser work — organisers see outcomes, never edit licences. |
| 5 | Check-in | ✅ keep top-level | Time-critical, tablet-mode entry point (shipped). Session-level check-in = post-M4. |
| 6 | Communications | ✅ keep, v1 scoped | v1 = transactional visibility: the 3 shipped emails (confirmation / reminder-with-pass / survey), send log from `email_log`, preview + manual send per event, **scheduled sends shown on a mini calendar** (witan's email-schedule motif — best idea in the references for this module). Segmented blasts = post-M4 + consent check. |
| 7 | Reports / Analytics | ✅ keep | Shipped per-event analytics + adds CPD layer (below) |
| 8 | Settings / Admin | ✅ keep | Roles (5-role model shipped), org details, **audit-log read surface** (chain exists; needs org-scoped RLS read design), branding. **Subtract: payment settings (Q21: invoice-first, zero payment code), custom fields (3-layer validation cost — post-M4), integrations (post-M4).** |

**Net additions to Ivan's list:** per-event readiness strip; "Needs attention" queue; eligibility signals woven into rosters/check-in (not siloed in the passport area). **Net subtractions:** CRM-style contact imports, payment settings, custom registration fields (v1), campaign messaging (v1).

## What each area contains (fine detail, with screenshot provenance)

### Dashboard — "is anything on fire, what's next"
- **Stat row** (witan/Sequence): Registered (open events) + Δ7d · Checked-in today + capture % · **Credits pending → blocked → issued** (the CPD pulse) · Events this week (live pill).
- **Needs-attention queue** (LoopAI's priority tasks — the single best dashboard motif in the references): each row = icon + item + progress fraction + due date + deep link. Feed sources: accreditations awaiting body confirmation, reminder sends failing, licence-blocked registrants for imminent events, open disputes, survey closing soon. Rule: **every row is actionable and deep-links to the fix**; nothing informational-only.
- Upcoming events mini-list (date, capacity meter, status pill).
- Live check-in feed when an event is live (witan's check-in log: avatar, name, method pill, tabular timestamp).

### Events
- List view = the mockup table: name+date, venue, **capacity meter + fraction**, CPD chip (body · points), status pill, Details. Filter chips with counts (`All 12 · Draft 2 · Registering 4 · Live 1 …` — Cadre's counted tabs).
- **Per-event detail tabs:** Overview · Registrations · Agenda · Check-in · Communications · CPD & Accreditation · Analytics.
- **Overview tab opens with a readiness strip** (Cadre's `2/3 CONTRACTED · 0 UNPAID · 4 MISSING ITINERARIES` motif): `148/180 registered · 3 speakers confirmed · accreditation ✓ HKCP 3.5 · reminder scheduled T-60m · survey armed`. One glance = is this event ready to run.
- Setup = the numbered-section form (mocked): basics, when/where, agenda blocks, speakers, CPD accreditation section.

### Participants (person-level)
- Table: avatar, name, licence badge (body + status pill), events attended count, credits earned, last activity. Search + filters (body, licence status, event, tag).
- Person drawer (progressive disclosure, not a page jump): registration/attendance timeline, credit history (chain refs), notes, consent status, per-person email log.
- **Eligibility surfaced as state, not buried** (Cadre's "May not be available" red inline text): `Licence lapsed — credits will not post` shown wherever the person appears (roster, check-in, participant list). Same fact, every context.
- Import/export: CSV export shipped; import limited to *event registration* lists (not contacts).

### Accreditation & Compliance (organiser view)
- Event accreditations table: event, body, category, points, status (`draft → submitted → confirmed`), confirmation reference, lead-time indicator.
- Body directory (8 seeded): per-body rules summary, retention window, contact.
- Compliance snapshot: how many registrants of upcoming events are licence-verified vs pending vs lapsed (stacked meter per event).
- **Not here:** licence editing (practitioner self-declares; body/staff verifies), certificate issuance (B4, post-signing).

### Check-in
- Shipped tablet flow stays the spine: scanner + roster + manual code + self-check-in. Add from references: live capture-rate meter on the header, method pill per row (scan/self/manual), and the offline-tolerance note (venue wifi — nice-to-have that's worth more than most of the list).

### Communications
- Per-event: the 3 transactional templates with **rendered previews** (the demo render script becomes a product feature), send/schedule state on a mini calendar (witan), and the send log (from `email_log`: purpose, recipient, sent/queued/failed — failures are red pills with a retry affordance, insert-first rule preserved).
- Global: template gallery (post-M4: editing), suppression/bounce visibility.

### Reports / Analytics
- Per-event (shipped): registration funnel, survey distributions, attendance.
- Adds: **capture rate, no-show rate, registration velocity curve, time-to-fill, credits issued/pending/blocked, survey response rate, email deliverability, accreditation lead time**.
- Cross-event trends (Sequence's period chips: `1D · 1W · 1M · 1Y`): registrations over time (LoopAI dot-matrix works), repeat-attendance.
- Export: CSV per table (shipped pattern); body-facing **evidence pack stays B6** (auditor surface, not organiser reports).

### Settings / Admin
- Team & roles (5-role model; **role changes audited via `set_staff_role()`** — task #4 becomes user-visible here), org profile/branding, audit-log read surface (org-scoped), consent text versions (`lib/legalVersions.ts` surfaces here), data-retention info per body (Q24 citations).

## Data presentation rules (the intuition layer)

1. **Counts live in the chrome** — tabs and filter chips carry numbers (Cadre); nobody should click to learn "how many".
2. **Meters for capacity/progress, deltas for change, pills for state** — never a raw number where a shape tells the story faster (witan/Sequence). Deltas always carry comparison context ("▲16% vs last week").
3. **One-color-one-meaning holds everywhere** (§7a, shipped): green=live/verified, teal=brand/active, amber=pending/draft, red=error/blocked, neutral=done/off. A licence pill and an event pill with the same color mean the same *kind* of thing.
4. **Timestamps: relative in feeds ("2m ago"), absolute+tabular in tables** (witan's check-in log vs registration table).
5. **Progressive disclosure: row → drawer → page.** Tables answer "who/how many"; drawers answer "tell me about this one"; pages only for editing workflows.
6. **Every empty state names the next action** ("No events yet → Create your first event" — shipped pattern, keep).
7. **Numbers that align: `tabular-nums`, right-aligned columns, fixed decimals for points** (credit values are regulatory data — 3.5 never renders as 3.50 in one place and 3.5 in another).
8. **Compliance facts repeat wherever the person/event appears** — eligibility is a property of the row, not a report you run.

## Input → output map (where data enters, what leaves)

| Module | Inputs (who/where) | Outputs (what/where) |
|---|---|---|
| Events | Organiser forms (3-layer validation); agenda/speakers | Public event page, poster+QR, accreditation submission (manual v1), readiness state |
| Registration | Public form (anon, rate-limited; Turnstile pending keys); per-event CSV import | Roster rows, confirmation email (`email_log` insert-first), capacity metrics |
| Check-in | Tablet QR scan / manual code / attendee self-check-in (audited definer fns, shipped) | Attendance rows → **credit engine (3b, gated)** → wallet + analytics; realtime roster |
| Passport/Accreditation | Practitioner self-declared licences; body roster files (3b); staff verification decisions | Eligibility flags on rosters; `record_credit_entry` (service-role only); renewal reminders (B5); certificates (B4, post-M3) |
| Communications | Templates + event lifecycle triggers + cron schedule (S4 absorbs Phase 9) | Resend sends; `email_log` status; failure alerts to dashboard queue |
| Reports | Derived only — no new writes | CSV exports; dashboards; evidence *summaries* (full packs = B6 auditor surface) |
| Settings | Org-admin edits; role changes via audited fn | `audit_events` chain; RLS effects; consent versions |

**Two systemic input rules:** every mutation path stays three-layer validated + audited (kernel discipline, non-negotiable), and inference (B7/B8) never becomes an input to any of the above — flags only.

## Version cut (against Ivan's must/nice lists)

- **Must-have list: agreed**, with two amendments — custom registration fields move to post-M4 (validation + purpose-limitation cost), and "audit trail" is satisfied by exposing the existing chain (read surface), not building anew.
- **Nice-to-have list: agreed**, with re-ranking — **offline check-in mode moves up** (venue wifi is the #1 live-demo/ops risk), certificate PDF generation is already M3 roadmap (not optional), payments stay out entirely (Q21), and multi-event organiser views are post-M4 with the auditor portal.
- Bottom nav: adopt Ivan's 5-item set as proposed; Scan gets the accent treatment.
