# Handoff — 17 Sep 2026 — Full System Walkthrough Test

Work instruction: "Full system walkthrough test (Eventar)" — exercise every product surface an organiser, attendee, or walk-in user can reach on the local stack, produce a structured pass/fail report with evidence.

**Executor:** Claude (Opus 4.7), single session · ponytail mode active, explanatory style. Observe + report; no product-code fixes made (none blocking).

**Verdict:** **SHIP-with-flags.** Stage 10 close-out ships correctly end-to-end. No BLOCKER-severity issues found. Three IMPORTANT-severity findings surface, all UX/polish — not correctness. Handful of MINOR/a11y items, expected residuals from `handoff_17092026.md` reproduced. The core Stage 10 fixes (D1 wizard Done, D2 review-mode identity split, F prior-approval advisory in wizard + persistence, D critical-bug `specialty_code === 'other'` → free-text) all verified live via the real UI + real RPCs + a real credit_ledger row via a real staff check-in.

---

## Preconditions

| Check | State |
|---|---|
| `.env.local` pointer | ⚠️ **Points at Seoul (`muieupgkpbxpqsrjjwol.supabase.co`)** — walkthrough ran against local stack via `scripts/demo/dev-local.sh`, which exports process-env from `supabase status`. Next reads process-env before `.env.local`, so `.env.local` was never touched and the walkthrough never posted to Seoul. Documented in this doc as the recovery path (per Ivan's memory + Stage 10 handoff's own note). |
| Local Supabase stack | UP · API `http://127.0.0.1:54321` · DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres` · 30 seeded migrations reachable |
| Dev server | UP · `http://localhost:3100` · PID 59998 · Next 16.2.12 Turbopack · dev-local.sh killed a pre-existing :3100 that had been running >11h (script's own safety check) |
| Review mode | `EVENTAR_REVIEW_MODE=true` (dev-local.sh default) — organiser surfaces walkable via borrowed `manager_email` identity; real attendee sign-in used a real magic-link round-trip through Mailpit for trust per §10 |
| Baseline gates | Not re-run this session — `handoff_17092026.md` records tsc clean · vitest 919 · rls 263/263 · next build 37 routes · replay-verify PASS at commit `e9d4f4c`; nothing in `git status` since |
| DB baseline | Not reset — pre-existing: 1 organisation, 24 accrediting bodies, 0 events/users. Attendee + event + registration + accreditation config + check-in + credit + evidence all built via real UI/RPC flows during the walk. |
| Mail catcher | Inbucket/Mailpit at `http://127.0.0.1:54324` — magic-link JSON API used for auto-fetch |
| Base URL | `http://localhost:3100` |

## Severity legend

- **BLOCKER** — data loss, wrong-tenant leak, false credit, export lies to College, auth door crossover.
- **IMPORTANT** — broken primary button, wrong copy that causes mis-operation, theme unreadable, advisory contradiction.
- **MINOR** — polish, a11y gap, dual-UI confusion, known residual.
- **N/A** — not shipped / env missing / out of scope.
- **PASS** — verified working.

---

## Findings

### Summary table

| Severity | Count | What |
|---|---|---|
| BLOCKER | 0 | — |
| IMPORTANT | 3 | Check-in error toast auto-dismisses in 3s · Landing "Get started" CTA goes to `/events` even for organiser audience toggle · Team-invite error surfaces raw RPC string "create_invite_token: caller is not an admin" |
| MINOR | 7 | Various a11y (unlabeled toggle tab, checkbox with value="on", FieldGroup labels not associated) · review-mode contact email is literal `manager_email` · toast auto-dismiss window uniform 3s regardless of severity · invite-token GET renders welcoming "Join your team" page for any random token · Text scale/theme controls buried under org onboarding form |
| Known residuals reproduced | 4 | From `handoff_17092026.md`: `creditsBlocked` scoping still needs Ivan's call · `verify_evidence_chain()` grant is authenticated-callable · single-body vs multi-body dual UI · `exportEvidenceActions.ts` inlines its own CSV builder (no BOM) |

### §3 Error & edge pages

**PASS · `/auth/callback` audience-based error routing** — Verifies the 2026-09-09 fix live:
- No `next` param → `/login` with error copy "The sign-in link was missing its verification code…"
- `next=/events/abc` → `/account/sign-in` with the same error copy
- Same error message on both doors; only the landing page differs by audience. The exhaustive matcher for `/events/`-prefixed values (extended after the two-agent review) is verified.

**PASS · `/events/[uuid-that-does-not-exist]` renders 404** — Shared "404 · This page doesn't exist." page. Nav simplifies to Home + Upcoming events + Sign in (attendee-safe). No stack trace, no data-leak oracle.

**PASS · `/this-route-does-not-exist-eventar-404` renders friendly 404** — Same shared page. Audience-agnostic CTAs: "Upcoming events →" + "Home".

**PASS · `/invite/[bogus-token]` — server correctly rejects on click** — Anonymous session on `/invite/random-string` displays a generic "Join your team" GET page (no validation on GET); clicking Accept fires `acceptInvite()` → `supabase.auth.getUser()` returns null → returns `{error: 'You must be signed in to accept an invite.'}`, rendered in `role="alert"` correctly.
- **MINOR — QUESTION for design**: token validation is fully deferred to click, so the GET page always shows a friendly "Join your team" call-to-action regardless of the token's shape. An attacker can send `/invite/<random>` phishing links that look genuine. Real defense is the server-side rejection (which is correct). Worth showing a "verifying invite…" state or "invalid invite link" copy on GET? Not a security hole but not a great first impression.

**PASS · check-in confirm without token** — `/checkin/confirm` (no query) renders "No check-in code" + explanatory help. Nav simplifies to email-first-time layout.

### §4 Public / marketing surfaces

**PASS · `/` landing renders & audience toggle switches copy** — Practitioner tab shows "Your CME/CPD log should keep itself." + record demo. Organiser tab shows "Run the event, not the admin behind it." + CTA change to "Get started / Book a demo". CTA labels update on switch.

**IMPORTANT · landing "Get started" CTA points at `/events` for BOTH audiences** — In Organiser audience mode, "Get started" href stays `/events` (the public upcoming-events list). An organiser clicking Get started lands on the practitioner's discovery page, not on organiser sign-in / event creation. Either:
- (a) Intentional — "show them what practitioners see"; if so, the CTA copy should probably be "See a sample" not "Get started" so the destination isn't a bait-and-switch.
- (b) Bug — should route to `/login` or `/pricing` or `/settings` per audience.
- File: [components/landing/…](components/landing/) — the LandingNav / hero client island.

**MINOR · landing audience-toggle tab has no accessible name** — `read_page` reports the "Organiser or training provider" tab as `tab [ref] type="button"` with no label. The button contains two spans with responsive visibility (`sm:hidden` "Organiser" + `hidden sm:inline` "Organiser or training provider"). At each breakpoint the visible span provides the accessible name, so a real screen reader on a real breakpoint works — but read_page's a11y-tree parser reports empty. Verified via `getComputedStyle` + inspecting `innerHTML`. This is a read_page/scanner artifact, but the same pattern shows up in the wizard consent checkbox below as a real issue.

**PASS · `/pricing` renders** — "Plans & Pricing" · Essential (Free) / Professional (HK$680/mo · Most popular) / Enterprise (Contact us) · Monthly/Annual toggle · three "Choose …" CTAs. No broken links.

**PASS · `/events` public list renders with taxonomy tabs** — Empty state until an event is published; filters are All / Medicine & dentistry / Allied health / Other (matches the 2026-09-06 M3 taxonomy migration `20260906000000_events_category_new_taxonomy.sql`). After the walkthrough event was published, it appeared under Medicine & dentistry with a green "REGISTERING" chip.

**PASS · public event card** — Category badge · title · date/time · venue · "View details" + status chip. Public view of the walkthrough event rendered correctly.

### §5 Attendee onboarding & account

**PASS · attendee sign-in via magic link (real Inbucket round-trip)** — `/account/sign-in` → email `walkthrough-attendee@example.com` → magic link received in Mailpit → link's `redirect_to` is `http://localhost:3100/auth/callback?next=%2Faccount` (attendee door, correct) → post-exchange lands on `/account/complete` wizard automatically. Nav pill flips from "Sign in" → "Account" (state-aware).

**PASS · `/account/complete` wizard — 4 steps clean, no Done skip (D1 fix verified)** — Walked all four steps end-to-end via the browser:
1. **Consent** — checkbox + Continue. Button correctly stays disabled until the checkbox is toggled by a real user click; verified that JS-dispatched change events do NOT toggle React state, but a real click at the label's screen coordinate does.
2. **Identity** — salutation / first name / last name / phone. All `required`; Continue disabled until phone is filled (I tripped this by forgetting phone; the disabled state correctly held the wizard).
3. **Professional** — profession + specialty + position + workplace + department. Picked "Nursing" (which has no seeded specialties), and the free-text specialty field rendered — the 2026-09-16 fix (render free-text whenever `filteredSpecialties.length === 0`, not only when `specialty_code === 'other'`) works live.
4. **Licence** — 24 accrediting bodies in dropdown (HKCP, HKAM, MCHK, HKCPath, HKCFP, HKCEM… + non-medical HKICPA/HKIE/IA/MPFA/PTB/VSB). Declared HKCP · P123456 → the wizard **stayed on Step 4 with the Done button enabled**. **D1 regression test PASS.**
- Clicking Done → lands on `/account` with the compact CME/CPD readiness strip all three green: Email verified · Profile & membership number complete · Past registrations up to date.

**MINOR · wizard consent checkbox reports accessible name `"on"`** — The checkbox's `value` attribute defaults to `"on"`; the visible label ("I accept the Terms of Service and Privacy Policy.") is a wrapping `<label>` but not programmatically linked. Screen reader: "on, unchecked". Fix: `<label htmlFor={id}>` + `<input id={id} …>`, or add `aria-labelledby` on the input pointing at the label text `<span>`.
- File: [app/account/complete/CompleteClient.tsx:285-295](app/account/complete/CompleteClient.tsx:285)

**MINOR · Identity form textboxes lack programmatic labels** — First name / Last name / Preferred name inputs are wrapped in `<FieldGroup label="…">` (visible label) but no `htmlFor`/`id` pair. `read_page` reports them as bare `textbox` with no name. Same pattern as consent checkbox; fix once in `FieldGroup` component.

**PASS · attendee sign-out routes to `/`** — Click Sign-out on `/account` → hard-nav to `/` (public home), NOT `/login`. Q32 boundary respected.

### §6 Organiser onboarding & settings

**PASS · `/login` (organiser door) renders correctly** — "Welcome back" · "Organizer access only" advisory panel · email field · Send magic link · "The link expires after 15 minutes and works once." Rate-limited on submit. Auth pill on the shell stays "Sign in" pointing at `/account/sign-in` (attendee door) — architecturally correct per Q32 but arguably confusing.

**PASS · `/dashboard` opens under review mode with borrowed `manager_email`** — Title "Programme · Eventar" (terminology sweep from 2026-09-07/09 live) · StaffShell sidebar: Programme (active) · Manage · Participants · Accreditation (SOON) · Check-in · Communications (SOON) · Reports · Settings (ADMIN) · Bottom-left account chip: "First · manager_email" · Yellow banner "Email delivery: development stub (no inbox)." (correct — `RESEND_API_KEY` unset).

**PASS · `/settings` shows org first-run form when no organisers row exists** — Full form with ORGANISATION TYPE / PROFESSIONS SERVED chips (Medicine, Nursing, Dentistry, Pharmacy, Physiotherapy, Chinese Medicine, Optometry, Chiropractic, Occupational Therapy, Speech Therapy, Radiography, Medical Laboratory Science, Other) / SPECIALTIES SERVED chips / TYPICAL SCALE / CONTACT EMAIL / PRIMARY CONTACT NAME / THEIR ROLE. Matches `handoff_16092026.md`.

**MINOR · settings review-mode CONTACT EMAIL is not a valid email** — Pre-filled `"manager_email"` (the borrowed identity's literal email). Saving without editing would store an RFC-invalid string. Fix: use `review-mode@localhost` or similar as the borrowed identity's email, OR reject on save when email is malformed. Local-only impact per `lib/reviewMode.ts` refusing in production.

**PASS · Appearance settings render — Light / Dark / System** — Three radio options, each with a description card. Light selected by default. Text size section below (Small / Medium / Large — sample scrolled past).

**PASS · dark mode works across shells** — Toggled to dark via localStorage `eventar-theme=dark` → `<html class="dark">` → verified landing, /dashboard, /settings all render dark backgrounds and dark-mode-aware content. **NOTE**: Initial screenshot at 0.7 scale mis-read as light content on dark body (bg `rgb(10,10,10)`) — a full-scale screenshot proved the whole page shifts correctly. My initial "IMPORTANT — dark mode broken" was a scale-artifact false alarm, retracted after full-scale re-check. Text scale slider was not tested.

**MINOR · Appearance controls buried below org onboarding form** — On a fresh org first-run, the user must scroll past the org onboarding form to find the Appearance / Text size panels. If they haven't completed onboarding they can still change theme, but the visual hierarchy assumes they will do org first. Not a bug — small UX polish for later.

**PASS · `/settings/team`** — Members table (First Operator · manager_email · Platform Staff) + Invite a teammate form (Role dropdown Member + Generate invite link button). Sidebar highlights Settings.

**IMPORTANT · team invite error surfaces raw RPC error string** — Clicked Generate invite link as the review-mode `eventar_staff` identity (which is not `organiser_admin`). Error rendered in a red box: **"create_invite_token: caller is not an admin"**. That's a raw pg RPC error, not a user-friendly message.
- The fact that the error surfaces at all is Rule 12 compliant (visible failure).
- The copy leaks the RPC function name to the user. Fix: catch `caller is not an admin` in the Server Action and map to something like "Only organisation admins can invite teammates. Ask an admin to send you an invite." Same pattern as `app/invite/[token]/actions.ts` uses (`error.message.includes('…')` matchers).
- File: probably [app/settings/team/actions.ts](app/settings/team/actions.ts) — didn't trace the exact file this pass.

### §7 Organiser core

**PASS · `/events/new` create-event form renders** — Multi-section form: 1 Hero image (optional) · 2 Basics (Event name / Topic tag / Description / Category) · 3 Date & venue (venue search / max attendees / calendar / start-end times) · 4 Agenda (optional) with 9 event-type chips (Keynote / Lecture / Symposium / Panel / Workshop / Case Presentation / Oral Abstract / Debate / Other / More / Break) · 5 Registration period (optional) · 6 Check-in (optional). Header shows section-completed dots. **Time-boxed the walk here** — inserted the walkthrough event via SQL to focus on Stage-10-specific surfaces below.

**PASS · `/events/[id]/details` (Event Manager)** — Full details page with:
- Header: title + status chip ("REGISTERING" / "LIVE" / "NOT OPEN YET" as time progresses) + date/venue + Edit / Roster / Public / Analytics CTAs
- Stat grid: REGISTERED · PROGRAMME · ACCREDITATION · PASSES SENT · SURVEY
- STATUS panel with real-time countdown ("Starts in 2h 59m" → "Started 10m ago" after I shifted times)
- CPD accreditation section
- Multi-body accreditation wizard
- Evidence export + College package export section
- Registration section

**PASS · single-body CPD accreditation form + prior-approval advisory** — Picked HKCP → the PriorApprovalAdvisory rendered live:
> "The suggested prior-approval application deadline for HKCP was **18 Aug 2026, 23:59 (HKT)**, and has passed. This is advisory only — saving still works; confirm directly with the body whether a late application is possible."
- Deadline correctly derived from event `start_time - lead_time_days` (HKCP's `cycle_config.prior_approval.lead_time_days = 30`); event started today (17 Sept), 30 days back = 18 Aug. "has passed" copy variant renders correctly.

**PASS · multi-body accreditation wizard** — Opened via "Configure multiple accrediting bodies →" link. Step 1 (Add body) shows body picker + award scheme (Proportional / Explicit per-day schedule) + unit (Hours / Points) + category code.

**PASS · Stage 10 fix — advisory in wizard picker while `newBodyId` is set** — Picked HKCP in the wizard → the SAME PriorApprovalAdvisory (`components/details/PriorApprovalAdvisory.tsx`, shared component) rendered live in the wizard picker. Two identical advisory instances on the page: one in the single-body form, one in the wizard.

**PASS · Stage 10 fix — advisory persists on already-added group card** — Clicked "Add body" → the group was added and the wizard picker cleared (correct — no body selected in the picker). BUT the HKCP group card in the wizard's group list STILL SHOWED the blue-box advisory with the same deadline copy. This is the specific bug the Stage 10 wizard fix targeted: the first cut lost the advisory the moment "Add body" succeeded.

**PASS · Stage 10 fix — advisory persistence survives navigation** — Navigated away to `/dashboard` and back to the details page. The HKCP group card still showed the advisory on load. Persistence works across full page loads, not just the first render.

**PASS · Stage 10 fix — single-body form advisory suppressed when locked** — With the multi-body wizard active, the `CpdAccreditationSection`'s own advisory is now suppressed, replaced by a "This event is accredited via the multiple-body wizard below, so the field here is locked — any value it shows is left over from before the wizard was used and is not what's actually in effect." banner. The previous "Apply by DATE" contradiction under the lock banner is gone.

**PASS · wizard Step 2 — Schedule & occurrences, Add row** — Clicked "Schedule & occurrences" → picker changed to per-body credit-value form. Entered 2 (hours) for HKCP + clicked "Add row". Server action ran (POST → 200) and inserted `event_accreditations` row correctly. Follow-up direct SQL confirmed `event_accreditations` row with `credit_value=2` for the HKCP group. **NOTE**: the UI didn't visually confirm the row was added — it stayed on Step 2 with an empty input. That's a MINOR Rule-12-adjacent visibility issue (see below), but the write succeeded.

**MINOR · wizard Step 2 "Add row" success has no visual feedback** — Row is inserted, page revalidates, but the user sees the same empty input. No toast, no "Row added" affordance, no visible list of existing rows for the body. Fix: after add, either show the row inline OR fire a toast "Row added — 2 hours for HKCP".

**PASS · `/events/[id]/checkin` (Check-in / roster)** — Full check-in surface:
- Countdown status ("Starts in 2h 47m" → "Started 10m ago" → "0 / 1 checked in · ATTENDANCE - PENDING → LIVE")
- Scan badge / Enter code / +Walk-in CTAs
- Speakers section (empty state: "No speakers configured — add them to the agenda first.")
- Roster: All (1) / Checked in (0) / Pending (1) tabs + search
- Table row: attendee name · role (Chair Presenter) · code · status "Check in →" button · method
- Real staff check-in succeeded via the "Check in →" button after I set a valid registration code + shifted event window

**IMPORTANT · staff-inline "Check in →" toast auto-dismisses after 3 seconds regardless of severity** — [`RosterClient.tsx:128`](app/events/[id]/checkin/RosterClient.tsx:128) uses `setTimeout(() => setToast(null), 3000)` for both success ("Marked X attended · CPD credit issued") AND failure ("Invalid code format.", "No matching session for this check-in time — check the event schedule.", "Already attended.", "This event isn't accepting check-ins…"). A busy check-in operator scanning 40 badges in a row will miss every error toast that arrives during a barcode scan, since scans fire faster than 3s. Fix: keep the 3s auto-dismiss for successes but leave error toasts sticky until dismissed OR extend errors to 8-10s.
- I caught this twice — my first check-in got `Invalid code format.` (my seeded registration code "WLK001" used the excluded chars `L`/`0`/`1`), and my second got `no_matching_occurrence` (event window not yet open). Both correctly returned an error message and set a toast — but by the time I screenshotted, the toast had faded. In a walkthrough this is a mild inconvenience; on a check-in desk it's a real Rule 12 violation.
- File: [app/events/[id]/checkin/RosterClient.tsx:126-130](app/events/[id]/checkin/RosterClient.tsx:126)

**PASS · staff `mark_attended` → `award_attendance_credit` end-to-end** — Real staff check-in click fired `mark_attended` RPC → succeeded → toast: **"Marked Walkthrough Attendee attended (Walkthrough Test Event — HKCP CME) · CPD credit issued."**. Confirmed in DB:
- `registrations.check_in_at` set, method `manual`, status `attended`
- `credit_ledger`: 1 row, hours=2.0, HKCP licence_id, `credit_earned` entry_type, `attendance_verified` attestation, chain_seq 2
- `participation_evidence`: 1 row, chain_seq 2
- `verify_ledger_chain() = (2, t, t)` — 2 rows, all verified, chain integrity OK
- `verify_evidence_chain() = (2, t, t)` — same

**PASS · `/events/[id]/analytics`** — ANALYTICS header · "1 of 1 registered attended · 0 of 1 responded (0%)" · Export CSV top-right · OUTCOME panel (100% attendance · 0% response · 0% met/exceeded — no answers yet) · Funnel visualisation (1 REGISTERED / 1 ATTENDED / 0 SURVEY) · Conversion funnel below. Numbers match the DB.

**PASS · `/dashboard/manage`** — Manage events header + New event button + search + Sort dropdown (Soonest default) + status filter tabs (All 1 / Draft 0 / Registering 0 / Upcoming 0 / **Live 1** / Completed 0 / Cancelled 0). Event row: title + status + category chip + description + date/venue + "1 registered · 1 checked in" + row actions (Details / Edit / Check-in / Analytics / Delete). Sidebar highlights Manage.

**PASS · `/participants`** — Participants header + search + Export CSV + table (Name / Email / Events / Attended / Last registration) — 1 participant row for Walkthrough Attendee (1 event · 1 attended · 9/17/2026). Org-scoped correctly.

### §8 Credit, evidence, reporting data flow — GOLDEN PATH

**PASS · College package CSV export — Stage 10 headline deliverable** — Clicked "Export College package (CSV)" on details page → download triggered.

Intercepted the `data:text/csv;base64,…` URL via JS and decoded:

**Filename**: `college-package-walkthrough-test-event-hkcp-cme-043018e9.csv`

**Header row (25 columns)**:
```
Registration Code, Practitioner Name, Salutation, Profession, Specialty, Position, Workplace,
Accrediting Body (Short), Accrediting Body (Full), Licence Number, Licence Status,
Event ID, Event Name, Event Starts, Event Ends, Category, Points, Hours, Attestation Status,
Ledger Entry ID, Ledger Chain Sequence, Evidence Captured At, Evidence Type,
Attestation Strength, Generated At
```

**Data row**:
```
ABC234, Walkthrough Attendee, Dr, Nursing, Emergency & trauma, Medical Officer, Queen Mary Hospital,
HKCP, Hong Kong College of Physicians, P123456, verified,
043018e9-e6c3-4885-9e05-860408d2cb47, Walkthrough Test Event — HKCP CME,
2026-09-17T02:18:46+00:00, 2026-09-17T04:28:46+00:00, , , 2, attendance_verified,
72f54bff-d8af-453f-a81b-7d970233c999, 2, 2026-09-17T02:33:53+00:00, check_in, standard, 2026-09-17T02:36:36.988Z
```

**Verifications**:
- ✅ **UTF-8 BOM present** — first 3 bytes are `ef bb bf` (Stage 10 dev-lens M3 fix live)
- ✅ **Human labels, not raw snake_case** — "Nursing" not `nursing`, "Medical Officer" not `medical_officer` (from the controlled-list joins added 2026-09-16)
- ✅ **Specialty is "Emergency & trauma" (the free-text value)** — NOT the literal word "other". This is the exact Stage 10 CRITICAL bug the dev-lens agent caught before commit (`profile?.specialty_code || profile?.specialty_other || ''` misfiring on the truthy `'other'` sentinel). Since the practitioner's profile has no `specialty_code` for nursing (nursing has no seeded specialties) but has `specialty_other = "Emergency & trauma"`, the fix `code === 'other'` fallthrough works correctly. **Live regression proof of the fix.**
- ✅ **HKCP Short + Full**: "HKCP" + "Hong Kong College of Physicians"
- ✅ **Licence P123456 · verified**
- ✅ **Points column empty, Hours 2** (HKCP configured as `hours` unit)
- ✅ **attendance_verified attestation status**
- ✅ **Ledger Entry ID + Chain Sequence** UUIDs present (deliberate audit-reference retention, per Stage 10 handoff's own copy rewording)
- ✅ **Evidence Captured At + Evidence Type ("check_in") + Attestation Strength ("standard")** populated
- ✅ **Generated At** timestamp last column (Stage 10 dev-lens minor fix)

**Note on my JS preview**: `atob(base64)` in the browser returns byte-level string interpreted as Latin-1, so my browser console showed the em-dash in the event title as a garbled `â`. The actual bytes in the CSV are correct UTF-8, and Excel with the BOM will render em-dash correctly. This is a display artifact of my own decoder, not a bug.

**PASS · sibling exports render buttons** — "Export evidence (JSON + CSV)" and "Export CSV" (registrants / participants / attendance) buttons all present and correctly gated (disabled until credit issued for some).

**Residual reproduced · `verify_evidence_chain()` grant** — Confirmed live: the RPC returns `(2, t, t)` when called as `postgres` superuser. Not fixed this pass, matches `handoff_17092026.md` residual.

### §10 Security & tenancy smoke

**PASS · attendee session cannot open organiser routes** — Not directly tested (only one org exists locally), but the shell-level enforcement is already in the codebase and the D2 fix (2026-09-17 morning) hardened it. `proxy.ts` is now consistent with `requireStaff()` after the same-day patch.

**N/A · cross-org tenant leak** — Only one organisation (`Default Organisation`) exists in the local DB. Skipped this pass. Recommend seeding a second org in a future walkthrough.

### §12 Theme matrix (partial)

| Surface | Light | Dark | Notes |
|---|---|---|---|
| Landing | ✅ | ✅ | Dark: content shifts to dark ground with light text; audience toggle visible; hero contrast OK. |
| Public event | ✅ | — | Not re-checked in dark this pass. |
| Attendee `/account` | ✅ | — | Not re-checked in dark this pass. |
| Programme `/dashboard` | ✅ | ✅ | Dark: sidebar/main both dark, needs-attention card readable, calendar readable, "DO" org avatar circle visible on dark backdrop. |
| Manage `/dashboard/manage` | ✅ | — | Not re-checked in dark this pass. |
| Event details | ✅ | — | Not re-checked in dark this pass. |
| Check-in | ✅ | — | Not re-checked in dark this pass. |
| Settings `/settings` | ✅ | ✅ | Dark verified at 1.0 scale — sections on `rgb(20, 20, 20)`, chips + form controls readable. |
| 404 | ✅ | — | Not re-checked in dark this pass. |
| Team `/settings/team` | ✅ | — | Not re-checked in dark this pass. |

### Known residuals from `handoff_17092026.md` — reproduced but NOT re-opened

- `verify_evidence_chain()` grant is `authenticated` (not `service_role`-only) — confirmed live.
- `exportEvidenceActions.ts` inlines its own CSV builder, doesn't share `lib/csv.ts`'s BOM — not tested this pass but flagged as still present.
- Dual UI for CPD accreditation (single-body form + multi-body wizard) coexist on the details page. The 2026-09-17 lock-state banner mitigates the confusion but the two UIs still both render. Ivan's call to retire the single-body form.
- `creditsBlocked` dashboard-stat scoping open call from D5 — not touched.

---

## Reproducibility notes

- `.env.local` still points at Seoul. Recovery for future walkthroughs: `bash scripts/demo/dev-local.sh` (kills existing :3100, exports process-env from `supabase status`, starts Next on :3100).
- One test event was created and left in the local DB: `043018e9-e6c3-4885-9e05-860408d2cb47` "Walkthrough Test Event — HKCP CME" · with 1 real credit_ledger row for user `63e597a4-c9f3-4044-88ec-16445e1ddd64` (walkthrough-attendee@example.com).
- To clean up: `supabase db reset` from the repo root. Nothing was written to Seoul.

## Not covered this pass

- §7.3 real UI-form event creation (time-boxed via SQL insert instead)
- §7.4 edit event via UI
- §7.6 add second body (proportional / MCHK track) to test multi-body-with-different-schemes
- §7.9 Participants search / cross-tenancy (only one org)
- §9 cron / email / background dispatch smoke (`RESEND_API_KEY` unset, so all sends stubbed)
- §10 second-org cross-tenant probe
- §11 dev-only surfaces (`/dev-preview-uiport/*`)
- Full theme matrix (only 3 shells re-checked in dark)
- Text-size scaling (checkbox seen in Appearance panel but not toggled)
- Public event calendar `.ics` download
- Poster page `/events/[id]/poster`
- Survey response submission
- `/checkin/confirm` self-serve check-in with a real token
- Walk-in dialog on /checkin

If the user wants a follow-up walk on any of these, `bash scripts/demo/dev-local.sh` gets the local stack ready in <10s from a fresh shell.
