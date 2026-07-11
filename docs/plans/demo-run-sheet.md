# Demo Run Sheet — 15 minutes, live, resettable (DRAFT v1 for Ivan)

_P1 deliverable of `2026-07-11-poc-engagement-plan.md`. Status: DRAFT — Ivan edits beats/wording; the fixture + reset scripts and the ledger driver (P2) land next session. D0 is HOLD, so this runs entirely on the local stack + LAN — no deploy required._

## Audience variants
- **Internal / NGO (E1–E2):** Beats 1–4 only (the event loop). Skip the ledger + certificate beats — they're CPD-specific.
- **Accrediting body (E5):** all beats.

## Pre-demo setup (30 min, scripted)
1. Local Supabase stack up (`supabase start`) → `db reset` replays 63 migrations + seed (proven 2026-07-10).
2. Run `scripts/demo/seed-demo.ts` (to build): org **"Demo CPD Alliance"**, event **"Clinical Update Seminar 2026"** (2 agenda blocks, 3 speakers), 6 plausibly-named fake attendees, one pre-registered with a QR pass ready on the demo phone.
3. `pnpm dev` bound to LAN; **`NEXT_PUBLIC_SITE_URL=http://<laptop-LAN-IP>:3000`** so `lib/origin.ts` mints QR codes the audience's/demo phone can actually reach — this is the no-deploy workaround for live phone scanning.
4. Tablet on the check-in roster page; phone with camera ready; poster PDF on screen or printed.
5. Email beat prep: **the rendered `emails/confirmation.tsx` template open in a browser tab** (honest framing: "this is the email; production sends it via Resend"). devEmailStub stays — no cutover needed while D0 holds.
6. Backup for demo-day failures: screen recording of Beats 2–5 on the laptop, ready to play if wifi/hardware dies.

## The beats

| # | Min | Beat | What they see | Line to land |
|---|---|---|---|---|
| 1 | 0–2 | The problem | Nothing yet — talk | "CPD evidence today is paper, spreadsheets, and trust. When your auditor asks 'prove this doctor attended,' it's a filing-cabinet answer. We made it a cryptographic one." |
| 2 | 2–5 | Organiser side | Create → publish the seminar; poster + event QR appear | "An organiser sets this up in two minutes — agenda, speakers, one QR for the room." |
| 3 | 5–8 | Attendee side | Volunteer (or demo phone) scans poster QR → registers → confirmation email shown in tab | "Registration is one screen. The confirmation carries their personal check-in pass." |
| 4 | 8–11 | Attendance capture | Self-check-in with personal code on the phone; staff tablet scans another attendee; roster ticks over live | "Attendance is captured at the door, per person, timestamped — no sign-in sheet." |
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
