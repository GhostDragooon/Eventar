# Handoff — 2026-09-25 — Two-persona boundary & funnel review

Work instruction: "Eventar — Two-Persona Boundary & Funnel Review Instruction" (pasted 2026-09-25). Full re-review of the practitioner/organiser split shipped at `d8ac14b` + `3a8c279` + `e6c2dc0`, which Ivan reported still faulty. **Review-only pass — no code edits.** A fix plan for other agents is at `~/.claude/plans/pasted-content-id-0093-eventar-graceful-treasure.md` (also summarized in §5 below).

Method: code + architecture review, then a mandatory live walkthrough on the local stack (`:3100`, `EVENTAR_REVIEW_MODE=false` so the real `proxy.ts`/`requireStaff` gates run, not the review bypass). Every BLOCKER/IMPORTANT finding below has a live repro, not just a code citation.

## 1. Executive summary

**Fit for use: No.** The two-persona boundary has two live BLOCKERs (a staff invite link cannot be accepted without detouring through the practitioner wizard and losing the token; a signed-in organiser's own account can be attached to a public event registration as an attendee) and five live IMPORTANTs, several of which contradict claims in the prior handoff (`handoff_23092026.md`) and `PROJECT_STATE.md`.

**Top 3 faults, plain language:**
1. **Staff invite links are broken for anyone not already signed in as a practitioner.** Clicking an invite link while signed out offers no way to sign in — the only sign-in control on the page goes to the wrong door and drops the invite token entirely.
2. **A signed-in organiser's own account can end up on an attendee's registration.** Visiting their own event's public page and registering (e.g. to add a colleague) attaches the organiser's account ID to that registration — live-verified by reading the row back from the database.
3. **The practitioner "Start an Event" fix from `3a8c279`/`e6c2dc0` didn't fix the sign-out hazard — it delayed it by two clicks.** A signed-in practitioner clicking "Start an Event" still ends up signed out of their own account with "Your email is not on the organizer list," confirmed by watching the session cookie disappear.

## 2. Live walkthrough results

Local stack (`supabase status` — Docker containers up throughout), `:3100` with `EVENTAR_REVIEW_MODE=false`. Both peer Claude Desktop sessions (`Landing CTA correction`, `Two-persona funnels and attendee IA`) were idle throughout (checked via `ListAgents`), so no contention.

Fixtures created and later cleaned up: staff row `review-organiser-20260925@eventar-review.invalid` (organiser_admin, Default Organisation), practitioner account `review-practitioner-20260925@eventar-review.invalid` (completed the full wizard), one invite-link token, one test registration on event `AAA` (`37e37c81-b10a-4077-8f7d-5b5d247b1adc`). All removed from the local DB after the walkthrough (registration row, invite token, staff row, licence/profile/consent rows) — see §7 for what was deliberately left (the two `auth.users`/`public.users` identity rows, consistent with this stack's existing fixture-accumulation convention, and the 3 `audit_events` rows those accounts wrote, left untouched per the append-only doctrine).

| # | Flow × persona | Pass/Fail | Evidence |
|---|---|---|---|
| 1 | Cold landing, signed out, 375px | Pass | Screenshot: brand + "Start an Event" + "Sign in" all fit, no clipping. Practitioner CTA → `/events`, not `/login`. |
| 2 | Organiser magic-link sign-in, no `next=` | Pass | Mailpit link had `redirect_to=…/auth/callback` (no `next`); landed on `/dashboard`. |
| 3 | Organiser on `/`, `/events`, `/account/sign-in`, `/account/sign-up` | Pass (with one transient flash) | `/account/sign-in` and `/account/sign-up` both server-redirected to `/dashboard` (the `app/account/layout.tsx` gate works). `/events` (server-rendered) shows StaffProgrammePill immediately, no flash. `/` (client island) shows a plain "Account" → `/account` link for roughly one render before flipping to StaffProgrammePill — **M3, confirmed live.** |
| 4 | Organiser registers on own event's public page (`/events/[id]`), own email | **Fail — B2** | Chrome correct ("You're viewing the public page" · Programme pill), form fully live, submitted, succeeded. DB read-back: `registrations.user_id = d0845e7e-131b-…` = the organiser's own `auth.users.id`. See §3 B2. |
| 5 | Organiser on `/events/[id]`, 375px | Fail (framing) — **I7** | Screenshot: only the "Programme" pill renders; "You're viewing the public page" caption is entirely absent below `sm`. |
| 6 | Organiser deep link while signed out (`/dashboard/manage`) | **Fail — I5** | Redirected to bare `/login` (no `?next=`). After signing back in, landed on `/dashboard`, not `/dashboard/manage`. |
| 7 | Organiser visits `/login` while already signed in | **Fail — I2** | Full "Welcome back" / "Organizer access only" form rendered, zero acknowledgment of the existing session. |
| 8 | Organiser generates invite link, signs out, opens it | **Fail — B1** | "You must be signed in to accept an invite." Only nav control is "Sign in" → `/account/sign-in` (confirmed via `read_page`: `href="/account/sign-in"`, no `next`). Token confirmed **not consumed** (`invite_tokens.accepted_at` still null after the failed attempt) — DB-verified. |
| 9 | Fresh practitioner sign-up → wizard → "Done" | Pass (for the fix) | Landed on `/account/record` per the 2026-09-21 default — as documented. |
| 10 | Incomplete practitioner hits a gated page (`/account/claim`) | **Fail — I6** | Redirected to `/account/complete` with no `next`. After completing all 4 steps and clicking "Done," landed on `/account/record`, **not** `/account/claim` — the original destination was silently dropped. |
| 11 | Complete practitioner clicks "Start an Event" | **Fail — I1** | `/login?next=/events/new` shows the organizer form with zero mention of the existing session. Submitted own email; magic link → `proxy.ts` → session cookie confirmed empty (`document.cookie` → `[]`) → landed on `/login?error=not_authorized`, "Your email is not on the organizer list." `/account/record` then demanded sign-in again. |
| 12 | Organiser path with a failed OTP (`?next=/events/<id>/checkin`, no code) | **Fail — I4** | `/auth/callback?next=%2Fevents%2F…%2Fcheckin` (no `code`) → `/account/sign-in?error=missing_code` — the **practitioner** door, for an organiser-only path. |
| 13 | Organiser-mode landing sample card | Fail (pre-existing, not new) | Toggling to Organiser still shows the practitioner's personal ledger mock. Already flagged in the 2026-09-23 handoff; confirmed still present, not fixed by this review. |

Every path that crosses doors without honest framing is #4, #6 (destination only, not framing), #8, #11 above.

## 3. Code / architecture findings

### BLOCKER

**B1 — Staff invite links cannot be accepted without detouring through the practitioner wizard, and the invite is lost on the way.**
- **Location:** `app/invite/[token]/page.tsx:29-63`, `app/invite/[token]/actions.ts:5-21`.
- **Expected:** a signed-out invitee can sign in from the invite page and return to accept.
- **Actual:** the page's only sign-in affordance is `SiteShell`'s generic "Sign in" pill (`/account/sign-in`), which is the practitioner door. There is no `?next=` carrying the invite path. `acceptInvite` returns "You must be signed in" with no link at all.
- **Root cause:** the invite page was built as an attendee-shell page (`SiteShell`) with no awareness that its own primary action needs the *organiser* door.
- **Live-reproduced:** yes (§2 row 8), including confirming the token isn't burned by the failed attempt.
- **Proposed fix shape:** see WP3 in §5 / the fix plan's D3.

**B2 — A staff session's account ID can be attached to a public event registration.**
- **Location:** `app/(public)/events/[id]/actions.ts:69-70,219-220` (write layer); `app/(public)/events/[id]/page.tsx:345` (passes `signedIn=true` for staff, so the form stays live).
- **Expected (Q32):** "organisers have no attendee identity by design... must not accumulate practitioner data under a staff UUID."
- **Actual:** the only staff guard is UI prefill suppression, one layer above the write. `canAttachUserId` only checks that the typed email matches the session email — it does not check staff status at all.
- **Live-reproduced:** yes (§2 row 4). `registrations.user_id` = the organiser's own `auth.users.id`, `profile_snapshot` null (staff has no `professional_profiles` row, so the snapshot RPC returned null, but the identity attach itself is unconditional).
- **Proposed fix shape:** see WP4 in §5 / the fix plan's D2.

### IMPORTANT

**I1 — The organiser-door sign-out hazard was deferred, not fixed.**
- `app/login/page.tsx` (the whole file — no session read at all) + `proxy.ts:89-92`.
- PROJECT_STATE and `handoff_23092026.md` both mark the "Start an Event" sign-out hazard "resolved" by the `3a8c279`/`e6c2dc0` CTA retarget to `/login?next=/events/new`. That retarget is real, but it only inserted the `/login` form between the click and the sign-out — the terminal outcome (session destroyed, "not on the organizer list") is unchanged and fully live-reproduced (§2 row 11).
- **This claim does not hold.**

**I2 — A signed-in organiser is offered the sign-in form again with no shortcut.**
- `app/login/page.tsx`. No `getSession()` call anywhere in the file. Confirmed the page is `○ Static` in the `next build` output (§7), which is architecturally consistent with having no server-side or client-side session check at all.
- Live-reproduced, §2 row 7.

**I4 — The callback's door-selection logic is a path-prefix heuristic with one hand-carved exception, and the exception doesn't generalize.**
- `app/auth/callback/route.ts:24-28`. `/events/new` is carved out as the one non-attendee path under `/events/`; every other organiser sub-route under `/events/<id>/...` (edit, checkin, details, analytics) still classifies as attendee.
- Live-reproduced with `/events/<id>/checkin`, §2 row 12. `route.test.ts` has 4 cases; none cover this.

**I5 — Organiser deep links through `proxy.ts` lose their destination.**
- `proxy.ts:64-66`: `redirectWithCookies(new URL('/login', req.url))` — no `?next=`.
- Live-reproduced, §2 row 6.

**I6 — The practitioner's destination is lost through the completion wizard.**
- The completeness gates (`app/account/record/page.tsx:36`, `app/account/claim/page.tsx:28`, `app/account/profile/page.tsx:40`, `app/account/page.tsx:34`) all `redirect('/account/complete')` with no `next`. `CompleteClient.tsx:255` hard-codes `router.push('/account/record')`.
- Live-reproduced end-to-end (§2 row 10): a real incomplete practitioner hit `/account/claim`, was gated to the wizard, completed all 4 steps for real (licence declared against HKCP), clicked "Done," and landed on `/account/record` — not `/account/claim`, the page that sent them there.

**I7 — The organiser framing on mobile is invisible.**
- `components/shell/StaffProgrammePill.tsx:21-26`: the caption is `hidden sm:inline` **and** `aria-hidden`.
- Live-reproduced at 375px (§2 row 5): only the "Programme" pill renders. An organiser on a phone sees a button that could be any nav link, with nothing telling them they're on the public page.

### MINOR (confirmed live, not independently re-tested to the same depth)
- **M3** — `LandingAuthPill.tsx` briefly renders a plain "Account" → `/account` link for a staff session before `getAccountMenuState()` resolves. Confirmed by screenshot in §2 row 3. `getAccountMenuState()` is awaited with no catch, so a rejected promise would leave the pill on that state permanently rather than falling back.
- **M9** — a signed-in organiser on `/` still gets the practitioner-mode hero by default (the audience toggle has no relationship to session state). Confirmed by screenshot in §2 row 3.
- **M13 (new, not in the original code-read list)** — the organiser-mode landing sample card still shows the practitioner's personal ledger regardless of the audience toggle. This is a re-confirmation of an already-logged, already-flagged, pre-existing gap (`handoff_23092026.md` §3 user-lens) — listed here only because the live walkthrough touched it in passing (§2 row 13); not a new defect and not re-scoped.

### Prior-handoff claims that did not hold (confirmed against live behaviour, not just code)
1. **"A practitioner keeps their session"** (the `3a8c279` framing of the "Start an Event" fix) — the session survives the click and the form submission, but not the magic link that follows, which is the only thing the page offers to do next. See I1.
2. **`PROJECT_STATE.md:15`, "organizer flows never set [next]"** — false since `3a8c279`; `/login?next=/events/new` is exactly an organiser flow setting `next`. The comment predates that commit and was never updated.
3. **"Attendee decoration suppressed for staff"** (`handoff_23092026.md` §8, the 2026-09-24 addendum) — true for the *UI* (prefill, nudge), false for the *write* (B2). The addendum's own description ("the register-card prefill is left empty so the form doesn't try to register the organiser as an attendee under their staff identity") states the intended outcome accurately but the implementation doesn't deliver it — the form still can, and did.
4. **The staff `/account/*` → `/dashboard` redirect "was NOT executed this session"** (`handoff_23092026.md` §8, honestly flagged as untested) — now live-verified in this session (§2 row 3) and confirmed working correctly for `/account/sign-in`, `/account/sign-up`, and the `/events/[id]` chrome branch (not the write path, which is B2).

## 4. UI/UX findings

Covered inline in §2/§3 above (I2, I5, I6, I7, M3, M9 all have a UX dimension as well as a code one — the instruction's dev-lens/user-lens split doesn't cleanly separate here because most of these bugs are simultaneously "wrong redirect" and "confusing moment," which is the instruction's own point about boundary-contact framing). Two purely-copy/framing items not already covered:
- `/login`'s "Organizer access only... Contact an admin to be added" copy, shown to a signed-in practitioner with no context, reads as an accusation rather than a routing message (feeds directly into D1's panel design in the fix plan).
- The wizard's step-3 "Department is silently required" and the walk-in error-handling gaps flagged in the 2026-09-24 addendum's open list were not re-tested this session (out of this instruction's scope) — still open, unchanged.

## 5. Recommended fix order

Full detail, decided shapes (D1–D4), and per-WP file lists are in `~/.claude/plans/pasted-content-id-0093-eventar-graceful-treasure.md`. Summary:

**Band 1 (do first, two agents in parallel, no file overlap):**
- Agent A, serial: **WP1** (`lib/authDoor.ts` — explicit door classifier, replaces the prefix heuristic; fixes I4, I5) → **WP2** (session-aware `/login`, implements D1; fixes I1, I2, M1) → **WP3** (invite flow through the organiser door, implements D3; fixes B1).
- Agent B, serial: **WP4** (staff guard on the public register write, implements D2; fixes B2) → **WP5** (fail-closed staff guard on `/account/*` Server Actions — hardening beyond the layout UI gate; addresses N1/N3).

**Band 2 (after Band 1 is green):** WP6 (carry the practitioner's destination through the wizard; fixes I6), WP7 (organiser framing visibility; fixes I7, M3, M6).

**Band 3 (can wait):** WP8, the minor batch (M2, M4, M5, M7, M8, M9, N4; N5 and the missing organisation-onboarding portal are residuals for Ivan, not code fixes).

## 6. Open product questions for Ivan

All four were resolved live during this session via `AskUserQuestion` before the fix plan was finalized — recorded here for the record, not as open questions:
- **D1** (practitioner at the organiser door): explain on `/login`, keep the session — no implicit sign-out.
- **D2** (staff registering on their own public event page): keep the form, guest-only — never attach the staff account.
- **D3** (an invitee whose email already has practitioner data): prompt to sign up again with a different email; if they decline, let them accept anyway.
- **D4** (no self-serve path to become an organiser): logged as a residual — Eventar has no organisation-onboarding portal. Not fixed in this plan.

Nothing new surfaced during the live walkthrough that isn't already covered by D1–D4.

## 7. Gates run

```
tsc --noEmit         clean
eslint .              5 errors / 11 warnings — all pre-existing (confirmed: this session made zero code edits)
vitest run            981 passed | 317 skipped (+3 from the 978 baseline — d66daa8's new LandingHero CTA tests, already committed before this session started)
next build            clean, 39 routes (unchanged from baseline). Notably /login is ○ Static — architectural confirmation of I2 (it cannot read session state without becoming dynamic, which is exactly what WP2 needs to change).
```

**Live-tested vs inferred:** every BLOCKER and IMPORTANT (B1, B2, I1, I2, I4, I5, I6, I7) was live-reproduced this session against the real `proxy.ts`/`requireStaff` gates (review mode off), most with a database read-back as evidence, not just a code citation. M3 and M9 were also directly observed. `test:rls` was not run — this review made no schema or RPC changes, so there is no DB/RPC/grant surface to test.

**Session hygiene:** the browser pane's cookie jar carried a stale session from a peer session sharing this local stack (per the known `browser-subagents-share-cookies` pattern) — caught and cleared before any walkthrough evidence was recorded, so every finding above reflects an intentional, controlled session state, not contamination.

**Local-stack fixtures:** the registration row, invite token, staff grant, and practitioner licence/profile/consent rows created for this walkthrough were deleted afterward. The two `auth.users`/`public.users` identity rows were deliberately left in place (consistent with this stack's existing fixture-accumulation convention, visible in the dozens of pre-existing `rls-test.invalid`/`example.com` rows already in `staff`), as were the 3 `audit_events` rows those two accounts wrote during the session, per Hard Rule 11's append-only doctrine for that table. Nothing touched Seoul.

**Tooling note:** `.claude/launch.json` gained a new `eventar-noreview` entry (env-wraps the existing `dev-local.sh` with `EVENTAR_REVIEW_MODE=false`) so this and future sessions can test the real auth gates instead of the review bypass. Currently uncommitted, tracked, and additive only (the original `eventar` entry is untouched). Worth keeping — it's the only way to test any of B1/B2/I1/I2/I4/I5 short of a production build.
