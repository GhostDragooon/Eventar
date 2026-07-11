# Demo Run Sheet — 15 minutes, live, resettable (DRAFT v1 for Ivan)

_P1 deliverable of `2026-07-11-poc-engagement-plan.md`. Status: DRAFT — Ivan edits beats/wording; the fixture + reset scripts and the ledger driver (P2) land next session. D0 is HOLD, so this runs entirely on the local stack + LAN — no deploy required._

## Audience variants
- **Internal / NGO (E1–E2):** Beats 1–4 only (the event loop). Skip the ledger + certificate beats — they're CPD-specific.
- **Accrediting body (E5):** all beats.

## Pre-demo setup (30 min, scripted)
1. Local Supabase stack up (`supabase start`) → `db reset` replays 63 migrations + seed (proven 2026-07-10).
2. Run `scripts/demo/seed-demo.ts` (to build): org **"Demo CPD Alliance"**, event **"Clinical Update Seminar 2026"** (2 agenda blocks, 3 speakers, **pre-created as a draft** so Beat 2 demos the *publish* moment, not form-filling), 6 plausibly-named fake attendees, one pre-registered. **Fixture timing rule:** event start ≈ now + 45 min, so the registration window (Beat 3) and the check-in window (Beat 4, opens `start − CHECKIN_OPEN_MINUTES`) are BOTH open mid-demo.
3. Dev server on LAN: `next dev -H 0.0.0.0` (the default `pnpm dev` binds localhost only — phones can't reach it) with **`NEXT_PUBLIC_SITE_URL=http://<laptop-LAN-IP>:3000` set BEFORE server start** (read at startup) so `lib/origin.ts` mints reachable QR URLs. Allow the macOS firewall prompt in prep, not live.
4. **Pre-authenticate staff sessions on laptop + tablet** — login is email-OTP (`signInWithOtp`); on the local stack the OTP mail lands in the local mail catcher, fine in prep, embarrassing live. Sessions persist through the demo.
5. Email beat prep — **two rendered templates**, pre-opened: `emails/confirmation.tsx` in a laptop tab (Beat 3 — deliberately carries NO code/QR; that's a talking point, see Beat 3), and `emails/reminder.tsx` rendered *for the pre-registered attendee* on the **demo phone** (Beat 4 — this is the pass: personal QR + manual code). The reminder's QR ships as a `cid:` mail attachment in production, so the demo render script must substitute a **data-URI QR** or the image won't display in a browser. devEmailStub stays — no cutover while D0 holds.
6. Tablet on the check-in roster page; phone with the rendered pass ready; poster PDF on screen or printed.
7. Backup for demo-day failures: screen recording of Beats 2–5 on the laptop, ready to play if wifi/hardware dies (Beat 2's Mapbox geocoding and any live typing are the fragile bits).

## The beats

| # | Min | Beat | What they see | Line to land |
|---|---|---|---|---|
| 1 | 0–2 | The problem | Nothing yet — talk | "CPD evidence today is paper, spreadsheets, and trust. When your auditor asks 'prove this doctor attended,' it's a filing-cabinet answer. We made it a cryptographic one." |
| 2 | 2–5 | Organiser side | Open the pre-created draft → walk the agenda/speakers → **publish live**; poster + event QR appear | "An organiser sets this up in minutes — agenda, speakers, one QR for the room. Publishing it just now made it live." |
| 3 | 5–8 | Attendee side | Volunteer (or demo phone) scans poster QR → registers → confirmation email shown in laptop tab | "Registration is one screen. Notice the confirmation deliberately carries no pass — the personal QR arrives by email closer to the event, so a forwarded confirmation can't be used to check in." |
| 4 | 8–11 | Attendance capture | Demo phone shows the rendered **reminder pass** (personal QR + manual code) → staff tablet **scans the phone**; a second attendee self-checks-in by typing their manual code; roster ticks over live | "Attendance is captured at the door, per person, timestamped — no sign-in sheet." |
| 4.5 | (+2, optional — lead with it for NGO/internal) | Feedback loop | Submit the 5-question survey on the phone → per-event analytics page (ring gauges, funnel, per-session distribution) | "Ten minutes after the event, attendees get this survey; organisers see the picture the same evening." |
| 5 | 11–14 | **The trust moment** (body only) | `scripts/demo/ledger-demo` (P2, to build): check-in → credit entry appears with its chain hash → live `UPDATE` attempt **rejected (42501)** → simulated tamper → `verify_ledger_chain()` flags the exact row | "Nobody — including us — can silently alter an earned credit. Not edit, not delete, not backdate. Your auditors can verify that mathematically, not take our word." |
| 6 | 14–15 | Where it goes | Certificate + wallet **mockups** (slides, P3) | "Signed certificates and a practitioner wallet are the next release — configured to your scheme, which is exactly what I'd like to confirm with you today." |

→ Body meetings continue into the 7 configuration questions (`2026-07-10-cpd-sprint-3b-review-prep.md`), then the pilot offer + price (P4/P5).

## Reset procedure (between rehearsals/meetings)
`scripts/demo/reset-demo.ts` (to build): local stack only — tear down the demo org's rows, re-seed, verify chains green. **Never run demo flows against the live Seoul/Singapore projects: `credit_ledger` is append-only by design; demo rows there would be permanent residue in a regulator-facing table.**

## Open items for Ivan (edit this doc directly or dictate)
1. Beat-1 problem line — resonate or rewrite? (You know the HK CPD pain phrasing better.)
2. Demo language: English only, or prepare zh-HK lines for Beats 1/5/6?
3. Fixture flavour: medical seminar as drafted, or match it to whichever body/NGO is in the room?
4. Rehearsal target: twice under 15 min before the first internal trial (Milestone A criterion) — when do you want the first rehearsal?
5. Hardware + venue logistics (only you can settle): which tablet, which phone, projector/HDMI at the likely venues, and whether we assume venue wifi or bring a hotspot (the LAN setup needs laptop + phone + tablet on the same network).
