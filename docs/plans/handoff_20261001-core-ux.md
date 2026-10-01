# Handoff — 2026-10-01 — Core-UX instruction: validation + live baseline (Step 0)

Work instruction: "Eventar — Core UX Failure Fix Instruction" (pasted 2026-10-01): seven failures (A–G), two-portal doctrine, "passes the intuitive test".
**This is a pre-implementation baseline.** No application code was changed. What this document is: (1) a verdict on each claim, (2) live evidence, (3) corrections to earlier records.
The execution plan Ivan approved is at `~/.claude/plans/pasted-content-id-c1b3-eventar-buzzing-pretzel.md`.

Evidence tags — **[X]** executed against the local stack this session · **[V]** read in code at `d66daa8` · **[I]** inferred.

## 1. Environment for this baseline (read before reproducing)

- Local Supabase stack on Docker, app on **:3100** via the `eventar-noreview` launch config (`EVENTAR_REVIEW_MODE=false`), so the real `proxy.ts` / `requireStaff` gates run. Verified local-only: client bundles embed `http://127.0.0.1:54321`, zero occurrences of the Seoul project ref.
- **The local DB started 2 migrations behind the repo (141/143).** `20260919010000` (realtime publication) and `20260924000000` (source `walk_in` rename) had been applied by raw SQL in an earlier session, so their effects existed but their history rows did not, and replay failed (`alter publication … add table` is not idempotent; the constraint already existed). Fixed by dropping the local publication membership / the CHECK constraint and running `supabase migration up --local` → **143/143**. `PROJECT_STATE.md`'s "local in lockstep" line was wrong at session start. **Seoul was not re-verified** (see §6).
- Personas (local only, `@eventar-review.invalid`): `ux-admin` organiser_admin · `ux-member` organiser_member · `ux-body` body_admin (all Default Organisation) · `ux-prac-1` practitioner (signed up through the real `/account/sign-up` magic link; completeness set by fixture SQL, the wizard itself was not re-walked — it was verified end to end on 09-25).
- Sign-in recipe: submit the email in the real form (so the PKCE verifier cookie is set), fetch the newest message from Mailpit (`GET http://127.0.0.1:54324/api/v1/search?query=to:<email>` then `/api/v1/message/<id>`), open the `…/auth/v1/verify?token=…` link in the same browser. Staff sign-out exists only in `/settings`; to switch persona clear the JS-visible `sb-127-auth-token` cookie.
- Fixtures left in the local DB (fixture-accumulation convention; evidence and audit rows are append-only and cannot be removed): event `d52537d1-b234-4793-b835-fc20d1187420` "UX Baseline Event A" (published, 3 registrations, one early check-in) and `22222222-2222-4222-8222-222222222222` "UX Draft B"; the three staff rows and the practitioner above.

## 2. Findings log — persona × flow × result

| # | Persona | Flow | Result | Evidence |
|---|---|---|---|---|
| A1 | Visitor | Landing, practitioner mode | **FAIL** | One hero CTA "Get started" → `/events`; 14 links; **0 links to `/account/sign-up`**; the only door to the attendee side is the "Sign in" pill [X] |
| A2 | Visitor | `/events` | **FAIL** | No practitioner band or sign-up link; marketing shell + footer [X] |
| A3 | Visitor | `/account/sign-in`, `/account/sign-up` | PASS (copy) / FAIL (reachability) | Public shell; sign-up copy is clear but reachable only by typing the URL [X] |
| A4 | Practitioner (new) | Sign-up → magic link → | PASS | Redirects to the `/account/complete` wizard (4 steps) [X] |
| A5 | Practitioner (complete) | `/account/record` ("home") | **FAIL** | Bare page in the public marketing shell (Home · Upcoming events · Account▾ + marketing footer). Empty state: "Register for an event" is plain text. Only navigation is the Account dropdown (My record / Profile & memberships / Account settings / Sign out), no "Find events" [X] |
| A6 | Guest | Register for a published event | **FAIL** (funnel) | Success state ("YOU'RE REGISTERED … this browser tab is your proof of registration") has **no account/record prompt**; the registration code is not shown [X] |
| B1 | Organiser | `/events/new` | **FAIL** | 7 sections at once, progress strip lists 6 and shows ✓ on untouched optional sections; single `Date` (no end date); **Publish event is the filled primary while the copy says "Save draft first"** [X] |
| B2 | Organiser | Save draft | PARTIAL | Lands on `/events/<id>/edit`; no "saved" confirmation or next-step cue; **three blue primaries** (CPD Save, Publish event, Save changes) [X] |
| B3 | organiser_admin | Create **and publish** | **Root cause proven** | Same `create_event_with_blocks(status='published')`: real JWT → **succeeds**; service-role/no-email JWT (what review mode uses) → `require_active_staff: caller is not active staff in {organiser_admin,organiser_member,eventar_staff}` → the action shows "this account is not allowed to publish". `dev-local.sh` defaults review mode **on** [X] |
| B4 | organiser_admin | Publish an existing draft (real session) | PASS (works) / FAIL (UX) | Succeeds; DB `status=published`, audit `event_published` (chain_seq 10273). **No preview, no confirm**; the page then flips to the read-only layout with "Editing event details isn't available yet… Ask an admin" [X] |
| B5 | body_admin | Publish | **FAIL** | "Publish event" is visible and enabled; pressing it throws → **full-screen crash page** ("We hit an unexpected error… tell the organiser and quote error 3517149521"; "Home" → public landing). The DB denial is correct; the UI never said why [X] |
| C1 | Organiser | Programme `/dashboard` | **FAIL** | A row opens a modal with title/date/venue only — **zero links** [X] |
| C2 | Organiser | Manage `/dashboard/manage` | PASS (functions) | Tabs, search, sort, bulk actions, per-row Details/Edit/Check-in/Analytics/Delete; Check-in button clipped at ~800px; subtitle still says "export, archive" [X] |
| D1 | Organiser | Preview a draft | **FAIL** | `/events/<draft>` redirects same-org staff to `/edit` (server log: `GET /events/<id>` then `GET …/edit`); "Save & Preview" saves then bounces [X] |
| E1 | Organiser | "Roster" | **FAIL** | Hub toolbar "Roster" → `/checkin`; four names, one route [X] |
| E2 | Organiser | Check-in 5 days early | **FAIL** | Scoreboard says "NOT OPEN YET · Starts in 5d" while every control is active; clicking "Check in →" → "Marked Gus Guest attended". DB: `registrations.status=attended`, `registration_checkins` row, **immutable `participation_evidence` row, 120.8 h before start** [X] |
| E3 | Staff | `mark_attended` after the event ended | **FAIL** | Event ended 3 days ago → `ok` (rolled-back SQL) [X] |
| E4 | Organiser | Roster live-update | **OPEN** | After a successful check-in the row kept "Check in →" and the counter stayed 0/1 until reload. Local Realtime works (service-key and authenticated-organiser Node subscribers both received the UPDATE/INSERT using the roster's exact filters) and the browser can open the socket, yet the open page never received 2 INSERTs + 1 UPDATE. **Root cause not isolated.** `RosterClient` subscribes with no status callback, so a dead subscription is invisible [X] |
| F1 | Organiser | Multi-day | **FAIL** | UI is single-day; a 3-calendar-day event created through the real RPC produced **1** `event_occurrences` row [X] |
| F2 | Organiser | Agenda edit | **FAIL** (latent data loss) | An identical-content `update_event_with_blocks` regenerated every block id (`022c3702,b4a8850d` → `c919b1dc,7fdb1368`) [X] |
| G1 | Organiser | Mobile 375×812, check-in desk | **FAIL** | Scan badge 327×64 @ y=788 and Enter code @ y=868 (fold 812); "+ Walk-in" 32 px; the first screen is chrome [X] |
| G2 | Organiser | Leaving the app | **FAIL** | Sign-out exists only inside `/settings`; the sidebar account chip does nothing [X] |

## 3. Verdicts on the instruction's claims

- **A** partly valid: a portal exists but is unreachable and shell-less; the 09-25 premise that accounts get created at register/claim/walk-in is false (A6).
- **B** symptom valid, **diagnosis wrong**: not an account permission, a review-mode actor bug (B3). Real organiser roles can publish; only body_admin/auditor cannot, and the UI never says so (B5).
- **C** symptom valid, **diagnosis wrong**: not duplicates; commit `16dadaa` removed Programme's row links (C1) and Manage is where actions live (C2).
- **D, E, G** valid. **F** valid and larger: it is backend work (F1, F2), not only UI.

## 4. Corrections to earlier records

- The 2026-09-06 note that a backtest "was blocked from publishing by the review-mode fixture's own role limits" is **wrong** (B3): the fixture is `eventar_staff`, which may publish; the nested publish carries no actor under the service role.
- `PROJECT_STATE.md` "Local + Seoul in lockstep" — local was 141/143 at session start (§1).
- The 2026-09-25 review's B1/B2/I1–I7 remain open and untouched; the approved plan sequences them first.

## 5. Decisions locked this session (Ivan, AskUserQuestion)

WP1–WP5 (the 09-25 plan) run first · funnels into the attendee portal: hero pair + `/events` band + post-registration prompt + record empty state · **two portals, one per audience, each with its own shell** · agenda modal on existing data only, **multi-day via ADR-0002 per-day occurrences** · audited roster edit, edit of published events, **strict server check-in gate** (reverses the documented "trusted actor" design, `seed-demo.ts:330`, `DEFERRED.md:58`) · published-event logistics editable until check-in opens, **with an "event updated" email**.

## 6. Not done / open

- **Seoul read-only occurrence-staleness count: not run.** The Supabase MCP returned `28P01 password authentication failed` for the project; not retried and no workaround attempted. Local result: 33 events, 2 with a stale single occurrence, both already carrying attendance rows. Run on Seoul when the MCP is re-authorised:
  `select count(*) events, count(*) filter (where o.cnt=1 and (o.s<>e.start_time or o.e<>e.end_time)) single_occ_stale, count(*) filter (where o.cnt>1) multi_occurrence from public.events e left join lateral (select count(*) cnt, min(starts_at) s, max(ends_at) e from public.event_occurrences where event_id=e.id) o on true where e.deleted_at is null;`
- The review-mode **UI** copy for B3 was not walked (the dev server was not restarted in review mode); the mechanism is proven in SQL under both identities and the message mapping is `app/events/new/actions.ts:110-111`.
- E4 (roster live-update) is unresolved; the fix that does not depend on it is to update the row from the server action's result.
- The `graphify-out/` graph is dated 2026-09-11 (39 commits stale for the account/portal area). Used for structure only; refresh needs Ivan's go-ahead (cost). Spec-kit is scaffolded (`.specify/`) but unused: `constitution.md` is still the blank template and there is no `specs/`.
- The two-persona review's cross-org question (global Check-in/Reports pickers, `/events/[id]/analytics`) was spun off as a separate session; check `ListAgents` before editing those files.
