# Design → Implementation Gap Review — 2026-06-10

Audit of the 13 locked surface mockups against the shipped backend (schema, Server Actions, derived data). Done at the close of the mockup phase, before production implementation.

**Legend:** 🔴 schema/migration · 🟠 new backend feature · 🟡 copy/data mismatch (cheap fix, pick a side) · 🟢 frontend-only (no backend gap)

---

## Confirmed ALIGNED (mockup assumption already shipped — no gap)

| Surface | Mockup assumption | Backend reality |
|---|---|---|
| EE | Timezone auto-derived from venue, no picker | ✅ `app/events/new/actions.ts:70` already calls `tzFromCoords(lat, lng)` — the EE-D3 removal matches shipped behavior exactly |
| TC | Manual check-in by code | ✅ `markAttended(code, method)` exists with `check_in_method` column |
| TC | Roster search + status filter chips | ✅ `RosterClient.tsx` has `search` state + `statusFilter` |
| TC | Live roster updates | ✅ Realtime `postgres_changes` subscription shipped (Phase 4) |
| ED | Registration window stat | ✅ `registration_close_at` column exists |
| ED/AN | Show rate, attended counts, funnel | ✅ all derivable from `registrations.status` + `check_in_at` |
| DB | Lifecycle bands (Live/Draft/Completed) | ✅ `computeLifecycle` shipped (Q17, 5-state) |
| EM | Subject "You're registered: {title}" | ✅ matches shipped `<Preview>` and resend facade |
| EM | QR-at-−60-min + survey-at-+10-min promises | ✅ matches PRD; sends are Phase 9 (pg_cron) as planned |
| SV | One response per registration | ✅ `survey_responses.registration_id` UNIQUE |

---

## 🔴 Schema / migration changes (must be deliberate tasks, not drive-bys)

### G1. Survey Q2 free-text → MC from schedule
The big one (already flagged in design-patterns §11, restated here with full surface area):
- `survey_responses.key_highlights text` → needs a new column, e.g. `valuable_block_id uuid null references agenda_blocks(id)` + a `general_overall boolean` or sentinel for the fallback option.
- `survey_session_format_ck`-style CHECK can't pin dynamic options — validation moves to the action (verify block belongs to event).
- `lib/surveyTemplate.ts` `KEY_HIGHLIGHTS_MAX` + Zod schema + `SurveyForm.tsx` textarea all go.
- **AN page**: `HighlightCommentSlice` (latest quote) is deleted; new "Most valuable session" distribution joins `survey_responses → agenda_blocks` for labels.
- **ED Section C**: "Latest highlight" stat must be replaced (suggest: leading session, or response count only).
- Decide: keep `key_highlights` column for historical rows or drop (no prod data yet — drop is clean since Phase 8 hasn't deployed).

### G2. Survey Q3 4th option
- `survey_value_proposition_ck` CHECK pins 3 slugs — needs `event_format` added.
- Same addition in `VALUE_PROPOSITION_VALUES`/`_OPTIONS` + Zod.

### G3. Speaker/host check-in (TC-SPEAKERS card)
The mockup shows per-speaker check-in status with toggle. **Nothing in the schema tracks speaker attendance.** Speakers live inside `agenda_blocks` topics (`speaker_name` per topic) — they are not registrants.
- Minimal: `speaker_checkins` table (event_id, block_id?, speaker_name, checked_in_at, by_staff_id) or a jsonb status column on `agenda_blocks`.
- OR descope: drop the TC-SPEAKERS card from v1 of the redesign. **Recommend asking the user** — this is the only mockup element that invents a whole feature.

---

## 🟠 New backend features (action/route work, no schema change)

### G4. Real edit form (EE in edit mode)
`/events/[id]/edit` is **read-only + Publish** (Q19; page says "Editing event details isn't available yet"). The EE mockup presents a full editable form for both create and edit. A real update action needs: field updates + agenda-blocks reconciliation (add/remove/reorder) + Q18 patterns + owner-only RLS. This was explicitly out-of-scope during Phase 8 — the redesign makes it real work to schedule. **Decision needed: ship redesign with read-only /edit (restyle only) or build the editor.**

### G5. EE autosave ("Draft saved · just now")
`createEvent` is one-shot submit; there is no draft persistence before first save. Either build autosave (debounced server action writing a draft row) or drop the indicator from the design. **Recommend: drop for v1** — the stepper already saves on "Save draft."

### G6. Email delivery tracking (ED "100% delivered")
`email_log.status` is `queued|sent|failed` — **no `delivered`**. "Delivered" requires Resend webhooks (new `/api` route + status column + signature verification). Phase 9 territory. **For now reword the ED stat to "58 sent."**

### G7. Poster short URL (`eventar.app/e/K7M2`)
No short-link route exists; QR encodes the full event URL via `buildEventQrPng`. Either add a `/e/[shortCode]` redirect route (events table would need a short code column → makes this 🔴) or print the real URL path. **Recommend: print full URL on poster footer; short links deferred.**

---

## 🟡 Copy/data mismatches (pick a side during implementation)

| # | Surface | Mockup | Reality | Suggested fix |
|---|---|---|---|---|
| G8 | DB | "Welcome back, Jane." | `staff.full_name` is **nullable** | Greet with first word of `full_name`, fall back to plain "Welcome back." |
| G9 | EM/SV | "Hi Marcus" / "Thank you … Marcus" | `registrations.full_name` is the full name | Derive first name at call site (split on space); keep full name fallback |
| G10 | TC | "doors opened 08:00" | No doors-open field | Derive as `start_time − 60 min` (= reminder-email moment) or drop the phrase |
| G11 | TC/ED | Live-pill during pre-start scanning window | `computeLifecycle` says `live` starts at `start_time` | Open ruling from Page 9 review: does green pill mean "event in progress" or "check-in in progress"? Affects pill + scanning-indicator timing |
| G12 | PO | "Free · 60 seats" | No pricing concept in schema | Drop "Free ·" or hardcode—events are internal/free by definition; "60 seats" = `max_attendees` (nullable → hide when null) |
| G13 | DB | Pagination "Showing 6 of 12 · show all" | Query is `limit(200)`, no pagination UI | Frontend-only if kept under 200 events; fine |
| G14 | ED | "Latest check-in: Marcus Tan 09:14" | Derivable from regs | 🟢 fine — staff-facing, no PII rule violation (PII rule is logs-only) |

---

## 🟢 Frontend-only work (no backend gap, listed for the implementation plan)

- All Geist/palette/dark-mode swaps (layout.tsx, globals.css).
- NAV 3-part shared component (staff pages).
- Status-pill + color-system sweep (incl. moving ED's "Scanning live" to top-left per pattern §9).
- Ring gauges, funnel, stacked bar on AN (pure presentation over existing aggregates).
- Scan-square + manual-entry layout on TC (markAttended already exists).
- Poster v2 layout (data all present: blocks, topics, speakers, venue, max_attendees).
- Email-safe rebuild of `emails/confirmation.tsx` (Page 13 is the spec; props unchanged except first-name derivation G9).
- Survey chip/segmented controls (pending G1/G2 schema for Q2/Q3 data).
- EE stepper restyle of the existing accordion (create flow only, pending G4 decision for edit).

---

## Decisions — RESOLVED 2026-06-11 (user)

1. **G3 — BUILD minimal speaker check-in.** New `speaker_checkins` tracking + staff toggle action. TC-SPEAKERS card ships.
2. **G4 — BUILD the real editor now.** Full update action with agenda-blocks reconciliation, owner-only, Q18 patterns. `/edit` stops being read-only.
3. **G11 — Green pill = live ops window.** `computeLifecycle` change: `live` begins at check-in open (start − 60 min) and runs through event end. Green pill and green "Scanning live" indicator can never disagree.
4. Defaults locked: **G5** autosave dropped from design · **G6** ED stat reads "58 sent" (delivered tracking waits for Phase 9 webhooks) · **G7** poster footer prints the real event URL (no short-link route) · **G12** "Free ·" dropped, seats shown only when `max_attendees` set.

All gaps now have owners; see the implementation plan (same date) for sequencing.
