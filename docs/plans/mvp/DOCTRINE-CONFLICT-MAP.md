# Doctrine conflict map: 2026-10-30 two-persona doctrine vs code, plans and vault

**Date:** 2026-10-31
**Authority:** [`DOCTRINE-two-persona-2026-10-30.md`](../DOCTRINE-two-persona-2026-10-30.md) (locked by Ivan, commit `8380f2c`). Vault record: Decisions Log **Q47**.
**Method:** three read-only explorers (code, plan docs and handoffs, vault and hard rules), one per source family, each reporting `path:line` evidence; the load-bearing claims were then re-read by hand (staff key `supabase/migrations/20260514164414_init_staff.sql:39-47`, proxy gate `proxy.ts:78-121`, shell nav `components/shell/StaffShell.tsx:69-77`, login action `app/login/actions.ts:29-36`).
**Status of this file:** reference for builders. It changes no code. The doctrine file and `DOCTRINE-POINTER.md` are untouched.

Verdicts: **C** conflicts, **S** superseded (older wording loses), **OK** consistent, **OK\*** consistent once amended.

---

## 1. Rulings taken 2026-10-31 (Ivan)

- **R1. Wrong door.** Every failed Organiser log in shows one message: "The email or password you entered is not correct." Then Forgot email, Forgot password, and a link to the Attendee log in. The same text covers an unknown email, a wrong password, not staff, and suspended or removed staff, so the staff list never leaks.
  - Consequence (Ivan's wording implies it; confirm as OPEN-9, Decide 1 in handoff seq 5): the organiser door becomes **email + password**. Today it is a magic link (`app/login/actions.ts:29`, `shouldCreateUser` left at its default).
  - Build rules: the check never replaces or signs out an existing attendee session (finding I1, `proxy.ts:111-120`); an invitee arriving at `/login?next=/invite/<token>` gets a set-password step, not the generic error; existing staff have no password, so their first log in is through Forgot password. Two things to design: the staff check must run before a password sign-in is accepted, because a successful `signInWithPassword` issues a session cookie that would replace an attendee's; and `/login?error=multiple_organisations` (`proxy.ts:105`) is a second, different failure text (OPEN-1).
- **R2. Hard Rule 1 vs the email-keyed `staff` table.** `staff` has no `user_id`; every helper matches on email. Recorded as **debt**. Adding `staff.user_id` is a precondition of the organiser Sign Up card. The rule's text is unchanged.
- **R3. Organiser History parts 2 and 3** (as speaker, as audience) are **org-level aggregates**: the people who spoke at or attended our events, read through a column-limited definer function (Q43). Registrations never carry a staff identity, so Q32, A7 and finding B2 stand.
- **R4. Edit scope** for this pass: repo and vault. CLAUDE.md gets proposed text only (in the seq 5 handoff).

## 2. Open for Ivan (also in handoff seq 5, section 0, recommendation first)

| Id | Question | Recommendation |
|---|---|---|
| OPEN-1 | One email on two organisations locks the person out of both (`.maybeSingle()` PGRST116, `proxy.ts:103-106`, `lib/auth.ts:165-167`); `UNIQUE (email, organisation_id)` (`supabase/migrations/20260704130200_staff_org_scope.sql:14-16`) is what allows the second row. Org Sign Up and `accept_invite_token` can both create the second row. | Refuse an email that is already active staff elsewhere, until multi-org is carded. |
| OPEN-2 | Staff MFA. Vault Auth Flow locks password + mandatory TOTP; nothing is built. R1 makes the password half live. | Decide inside the doors card; ship password first only if Ivan accepts the gap in writing. |
| OPEN-3 | Does the attendee door stay a magic link behind the same Email, Next shape? | Yes for MVP. |
| OPEN-4 | Glossary: "Account admin" means `organiser_admin`; "Registrations" (nav label) clashes with licence "registration" in `CONTEXT.md`. | Add both entries; the nav label wins in the UI. |
| OPEN-5 | Sign Up safeguards: name impersonation (an org called "HKCP"), whether an `organisers` row is created, slug generation (`organisations.slug` is NOT NULL UNIQUE), and rate limiting or Turnstile for an unauthenticated write that creates a tenant. | Decide when the Sign Up card is written. |
| OPEN-6 | "Pay-as-you-go out of scope forever" vs the per-event price anchor (Q40, HKD 6,000 per event). | Read it as self-serve payments onboarding only. |
| OPEN-7 | Shareable-link team invites already ship (`app/settings/team/TeamClient.tsx`, `20260911000000_invite_tokens.sql`) and are not email-bound; the doctrine says email + role. | Leave them, record it, build the email version when carded. |
| OPEN-8 | UX-04 heading: "Participants" (doctrine) or "Registrations" (pick b2). | Registrations inside the event; Participants stays the roster word in the doctrine's event tabs. Ask. |
| OPEN-9 | Is the organiser door email + password? R1 implies it; today it is a magic link (`app/login/actions.ts:29`). | Yes: it matches the password + TOTP design locked in the vault Auth Flow. Copy that names a password is used only if yes. |
| OPEN-10 | R3 narrows a Q43 rejection: Q43 call 1 refused "registrants at my organisation" as an org read of people's data (an organisation can manufacture that link, Q42). R3's column-limited definer function reads the same kind of link. | Accept only aggregates (no names, no contact fields), on their own card; otherwise drop History parts 2 and 3 from MVP. |
| OPEN-11 | Does Ivan accept Q47 as the K1 sign-off for organiser Sign Up, the overrides it lists, and the Q32 boundary exception (the landing's Organiser pill may link `/login`)? These are the author's reading of the 2026-10-30 lock. | Yes; if no, Q47 is edited before anything builds. |
| OPEN-12 | The doctrine calls History a "points log"; Q26 and Milestone C forbid compliance totals and cycle figures, and `/account/record` shows points today. May points or counts show? | A dated log with no totals and no counts until Q26 is decided. |

## 3. Code vs doctrine

| Area | Today (file:line) | Verdict | Change |
|---|---|---|---|
| Landing pill | `components/landing/LandingHero.tsx:114-149`: "Practitioner \| Organiser or training provider", swaps copy and the CTA pair only | C | Rename Attendee \| Organiser; choosing a side = choosing the door |
| Landing CTAs | `LandingHero.tsx:64-81`: attendee "Get started" `/account/sign-up`, "Log in" `/account/sign-in`; organiser "Start an Event" `/login?next=/events/new`, "Organiser log in" `/login` | OK\* | Add Organiser Sign Up target once built |
| Landing nav pill | `components/shell/StaffProgrammePill.tsx:31`: label "Programme" (`LandingAuthPill.tsx:53-66` is the sign-in and account part) | C | Label Events |
| Attendee door | `app/account/sign-in/page.tsx:113-132`, `app/account/sign-up/page.tsx:91-120`: one field plus magic-link button; sign-in has no Sign Up link; eyebrow "Sign in · Account" | C | Email, Next, or Sign Up; label the side "Attendee" |
| Attendee success home | `app/account/sign-in/actions.ts:34`: `/account/record` (attendance and points) | C | A Registrations surface that does not exist yet; the record page is History |
| Organiser door | `app/login/page.tsx:217-239`: "Welcome back", "Organizer access only", "Send magic link"; no Sign Up, no Attendee link | C | R1 form and copy; label the side "Organiser" |
| Not staff after login | `proxy.ts:111-121` keeps the session and redirects to `/login?error=not_organiser`; panel copy at `app/login/page.tsx:199-213,337-348` | C | The limbo the doctrine forbids; replace with R1 message (session kept) |
| Staff identity | `staff` keyed on email, no `user_id`; `status` in invited, active, suspended, removed; roles organiser_admin, organiser_member, body_admin, auditor, eventar_staff | OK\* (R2 debt) | Account admin = `organiser_admin` (shown "Admin" in `TeamClient.tsx:25`) |
| Org creation | Nothing public. `provisionOrganisation` (`app/settings/orgActions.ts:15-58`) is eventar_staff only and has no caller in the UI | C | New public action: email, name, org name, creator `organiser_admin`, generated slug; K1 change (see section 6) |
| Team and invites | `/settings/team` link invites, 7 days, max 10, no email (`app/settings/team/actions.ts:22-44`) | OK\* | OPEN-7 |
| Organiser sidebar | `components/shell/StaffShell.tsx:69-77`: Programme, Manage, Participants, Accreditation (inert), Check-in, Communications (inert), Reports; Settings at line 204 | C | Check-in, Events, History, Settings |
| `/dashboard` | Title "Programme", Upcoming \| Past switch (`app/dashboard/page.tsx:18`, `DashboardWorkstation.tsx:52,243,636-650`) | C | Events; Drafts and Create visible; no Past tab |
| `/dashboard/manage` | "Manage events", filters All, Draft, Deleted (`ManageWorkstation.tsx:32-39,282-284`) | C | Fold into Events |
| `/participants` | Org-wide list (`app/participants/page.tsx:21-31`) | C | Off the sidebar; participants stay per event |
| `/checkin` | Org-wide desk (`app/checkin/page.tsx:82`) | OK | Becomes sidebar item 1 |
| `/analytics` | "Pick a completed event" (`app/analytics/page.tsx:83`) | OK\* | Candidate for History part 1 (what we ran) |
| Per-event tabs | `/events/[id]/edit`, `/details`, `/checkin`, `/analytics`; roster behind "Roster" (`app/events/[id]/details/page.tsx:626-633`) | OK | none |
| "Programme" and "Manage" text | `backLabel="Programme"` in `app/settings/page.tsx:67`, `app/participants/page.tsx:24`, `app/events/[id]/details/page.tsx:350`, `app/events/[id]/edit/page.tsx:192`, `app/events/new/page.tsx:51`; `app/error.tsx:66`; "Manage" links `DashboardWorkstation.tsx:483` ("Manage all events") and `:497`, `app/events/[id]/edit/PublishDraftButton.tsx:132` | C | Relabel |
| Attendee shell | No sidebar. `SiteShell.tsx:111-143` Home, Upcoming events; `components/ui/AccountMenu.tsx:57-64` My record, Profile & memberships, Account settings, Claim past events | C | Five-item attendee nav |
| Attendee Check-in | No attendee route; `/checkin` belongs to organisers (`proxy.ts:147`) | C | New route, for example `/account/checkin`, pass and status only |
| UX-02 specimens | `app/dev-preview-uiport/ux-02/parts.tsx:128-136`, `app/dev-preview-uiport/ux-02/page.tsx:34-35`: the D0 labels | C | Redraw |
| Tests asserting old labels | `components/shell/StaffShell.test.tsx:33,34,75,138,188`; `app/error.test.tsx:33,35,45,69,78,167`; `components/dashboard/DashboardWorkstation.test.tsx:297-334`; `ManageWorkstation.test.tsx:68`; `PublishDraftButton.test.tsx:117`; `SiteShell.test.tsx:80`; `PublicShell.test.tsx:55` | C | Change with the relabel |

## 4. Plans and cards vs doctrine

`Plan` = `docs/plans/2026-10-11-mvp-execution-plan.md`.

| Where | Quote (short) | Verdict | Amendment |
|---|---|---|---|
| Plan l.25 O1 | "land on Programme (`/dashboard`)" | C | Events (`/dashboard`) |
| Plan l.29 O5 | "Programme / Manage without confusion" | S | One Events home; drafts visible; filters inside |
| Plan l.30-32 O6-O8 | roster, check-in window, walk-in | OK | none |
| Plan l.33 O9 | post-event path | OK\* | Reached through History, what we ran |
| Plan l.41 A1 | sign-up and sign-in reachable from landing | OK\* | Pill picks the door; door = Email, Next, or Sign Up |
| Plan l.42, 45 A2, A5 | "`/account/record` or equivalent"; record shows registrations and attendance | C | Registrations (upcoming, live) and History (past) |
| Plan l.46 A6 | never bounced into organiser rejection copy | OK | R1 keeps the session |
| Plan l.74 A7 | `StaffProgrammePill` hidden on mobile | OK\* | Label Events |
| Plan l.108 | CX-04 owns `DashboardWorkstation.tsx`, `app/dashboard/**` | OK\* | Redo also owns `StaffShell.tsx`, `app/participants/**`, `PublishDraftButton.tsx:131` |
| Plan l.155, 297 | "Programme and Manage explain themselves" | S | Delete |
| Plan l.179 rule 10 | attendee chrome never links `/login` or `/dashboard` | OK\* | Exempt the landing's Organiser pill |
| Plan l.240 | P7b (merge Manage into Programme) out of MVP | C | Pull a minimal P7b into the redo card |
| Plan l.298 | "Back to Programme" | C | "Back to Events" (`app/error.tsx:66`) |
| Plan l.314-315 CX-06a | "Get started", "My record" | C | "Sign Up"; "Registrations" |
| Plan l.385-387 UX-02 | "build to the D0 specimens", nav per FR-006 | C | Doctrine nav; D0 stays the visual language |
| Plan l.393 UX-03 | "Manage" link | C | Link to Events, Drafts |
| Plan l.399 UX-04 | `/events/[id]/registrations` | OK\* | OPEN-8 |
| Plan l.415-426 section 8 | "lands on Programme", "reachable from Programme in two clicks" | C | Events; from History |
| `mvp/CX-04.md` | 10 Needs Ivan items | mixed | 1, 6, 8, 10 survive; 2, 5, 7 re-ask; 3, 4 superseded; 9 closed `0959370` |
| `mvp/UX-02.md` | 7 sets, 21 options | mixed | Set 1 re-ask (re-measure the longer "Registrations" label in the 73 px tab); 2 narrowed (sign out lives under Account); 3 re-ask (Events is a nav item, leans 3b); 4 and 7 survive; 5 superseded (Claim moves under History); 6 likely superseded |
| `mvp/UX-FU1.md` | 12 surfaces | OK | Surfaces 1-9, 11, 12 survive; 10 (Manage row) re-ask after the redo; no old attendee labels |
| `mvp/CX-06a.md` | U-03, U-10 | S | Survive: U-02, U-04, U-05, U-06, D-04, D-05, D-10 |
| `mvp/DB-02..DB-05.md` | all items | OK | Doctrine does not touch them |
| `PROJECT_STATE.md` l.9-15 | Attendee homes `/events`, `/account`; organiser `/dashboard` (Programme), `/dashboard/manage` (Manage); "never links to `/login`" | C | Rewrite table to the doctrine |
| `2026-07-12-organiser-ia-spec.md` l.11-20 | eight areas: Dashboard, Events, Participants, Accreditation, Check-in, Communications, Reports, Settings; mobile Home, Events, Scan, People, More | C | Superseded banner; History is a gap in the spec |
| `specs/001-attendee-portal/spec.md:124` FR-006 | nav My record, Profile, Account settings, Find events | C | Superseded note |

## 5. Vault and rules vs doctrine

| Source | Says | Verdict | Handled |
|---|---|---|---|
| Decisions Log Q32 call 5 | Organiser "Events" row deleted (it pointed at the public directory) | C in part | Q32 marked superseded in part; label Events returns, route stays `/dashboard` |
| Frontend Design Standard sections 3, 4 | `/login` listed as attendee/public; organiser nav per IA spec | C | Banner |
| Auth Flow "Two auth modes" | Organisation accounts invite-only, no public registration | C | Banner; Sign Up needs its own card |
| Auth Flow anti-enumeration (l.69, 218) | Identical response whether or not the account exists | OK | R1 keeps it |
| Hard Rule 1, Q23 item 1 | Identity keyed on UUID | C | R2 debt |
| BLOCK-ARCHITECTURE K1 | Organisations, staff, 5 roles are kernel; changes are constitutional | C | Q47 authorises in principle; a note in K1; the build still needs its card and admission checklist |
| CLAUDE.md pivot rule and Tier 2 | Practitioner app (S-Attendee) off-limits until post-M4 | C | The MVP plan already built UX-02 against it; proposed CLAUDE.md text in the handoff |
| Q26 + Milestone C | No compliance math or cycle figures | Risk | History is a log; the doctrine says "points log", so whether points or counts may show is OPEN-12 |
| Q19 matrix | `/checkin` and `markAttended` owner-only | C | Check where DB-03 landed before the desk is opened to every staff role |
| Q43 (call 1) | Org admins read their own org's staff only; people's data readable only by the person and the platform operator; "registrants at my organisation" refused | Risk | R3 narrows this rejection: OPEN-10 |
| Out of Scope register | no row for Team invite UI | OK\* | Row added |
| Roadmap notes "Dashboard Route Split", "Programme Home" | Programme + Manage described as shipped | S | Banners (historical) |
| `CONTEXT.md` | No entries for Account admin, Attendee, Registrations, History | gap | OPEN-4 |

## 6. Doctrine-internal issues

1. **"Not staff, not in" cannot be built without breaking something** unless it is R1: telling the person before the link is sent leaks staff membership; refusing after the click creates the forbidden limbo; signing out a practitioner breaks A6. R1 resolves it (generic message, session kept).
2. **The failure path points to Organiser Sign Up**, which the doctrine says is built only when carded. Until then that link is hidden, not dead.
3. **Multiple organisations** are unaddressed (OPEN-1).
4. **Organiser History parts 2 and 3** crossed the Q32 split and A7 as worded; R3 fixes the reading.
5. **History vs `/analytics`**: the doctrine drops Reports without naming it; this map treats `/analytics` as History part 1.
6. **The authority clause is narrower than the effect.** It overrides Hard Rule 1, Auth Flow invite-only, K1 change control, the S-Attendee freeze and the IA spec without naming them. Q47 names them (and, after review, the S-Attendee freeze and Q19 in its Consequences).
7. **"Pay-as-you-go" is undefined** (OPEN-6).
8. **Attendee Check-in** must stay a pass and status view, never a remote "check me in" button (a venue scan is the model; O7 limits check-in to the live window).
9. **Sign Up has no safeguards** (OPEN-5).
10. **"Account" means two things** (attendee profile, organiser role Account admin); OPEN-4.
11. **Registrations vs History** is unmapped to today's `/account/record`; the redo cards split it.

## 7. Constraints the door design must keep (from `handoff_20260925-two-persona-review.md`)

1. Invitees are the exception to "only staff log in" (B1, D3): keep the `?next=/invite/<token>` path (`app/login/page.tsx:110-113`) and the practitioner-data prompt.
2. "Not in" never signs anyone out (I1, D1, A6). Only the no-email branch (`proxy.ts:82`) signs out.
3. No attendee identity for staff (B2, A7, Q32): the staff `/account/*` to `/dashboard` redirect and FR-008 stay.
4. One door classifier (I4, I5): every new route goes into `lib/authDoor.ts` and the `proxy.ts` matcher, and the sync test enforces they agree. Fix the dot-segment bug first (CX-06a D-05). Gate every new `next` sink with `safeNextPath`.
5. Org Sign Up must not create the two-row state (OPEN-1).
6. Landing (M9, M13): the pill must reflect a staff session, and the organiser view must stop showing the practitioner ledger card.
7. Staff framing on public pages (I7, M3): the "You're viewing the public page" caption must show on mobile (CX-06b).
8. Wizard destination (I6): `next` must survive the wizard (FR-005, still open).

## 8. Cards this opens

- **CX-04R** (PROPOSED, design decision, runs the locked pipeline): nav Check-in, Events, History, Settings; Manage's filters, Drafts and Create fold into `/dashboard`; Past tab dropped; Participants off the nav; relabel Programme to Events everywhere in the table above; change the listed tests.
- **UX-02 re-cut** under the doctrine nav (five items), then picks.
- **Attendee surfaces card** (PROPOSED, not written): builds Registrations, the History split of `/account/record`, and the attendee Check-in route. Until it is carded, today's `/account/record` meets A2, A5 and the plan's practitioner walk.
- **Doors card** (CX-06a and CX-06b merged scope): landing pill, both doors, R1 copy, side labels.
- **Later, only if carded:** organiser Sign Up (needs `staff.user_id`, OPEN-1, OPEN-5), Team invite by email, organiser History parts 2 and 3.

## 9. Open items merged from handoffs seq 1 to 4

Sources: s1 `handoff_20261023-mvp-execution.md`, s2 `handoff_20261024-mvp-execution-2.md`, s3 `handoff_20261025-mvp-execution-3.md`, s4 `handoff_20261031-mvp-execution-4.md`.

| # | Item | Source | Status |
|---|---|---|---|
| 1 | Hosted migrations (10 local-only; needs allow rules for `supabase migration list --linked*` and `db push --linked*`) | s1-s4 | OPEN |
| 2 | Push go for the seq 3 and 4 handoff commits | s3, s4 | CLOSED (`origin/main` = `757a7e8`) |
| 3 | `motion` dependency | s1-s3 | CLOSED `97c3889` |
| 4 | `invite_tokens` service_role writes | s1 | CLOSED `2b28418` |
| 5 | CX-07 commit and review | s1 | CLOSED `27c8e2d`, `3c147d0` |
| 6 | SEC card, anon DML | s1 | CLOSED `2b28418`, `df07380`, `1a2b96f` |
| 7a | UPD Server Action rule and DB-04 rule | s1 | CLOSED `6fac051`, `f56c0e1`, `a96d9a1` |
| 7b | UPD creator predicate in the UI (accreditation field, wizard, roster chips) | s2 | OPEN, rides on UX-FU1 surface 5 |
| 8 | UX-FU1 surfaces 10-12 defect card | s1, s2 | OPEN; 10 re-ask |
| 9 | UX-FU1 picks (12 surfaces) | s1-s4 | OPEN |
| 10 | REVIEW-ROUND-1 "Deferred" (8 test and comment items) | s1 | OPEN, not blocking |
| 11 | DB-02 desk calls 1-5 | s2 | OPEN |
| 12 | CX-06a copy items | s2 | Names SUPERSEDED; U-02, U-04, U-05, U-06, D-10 OPEN |
| 13 | CX-07 follow-ups: (a) "Ask Eventar support" has no destination; (b) `/login` error state looks signed out | s2 | (a) OPEN; (b) folded into the doors card |
| 14 | FR-005: sign-in door and four guard redirects drop `next` | s2 | OPEN |
| 15 | Hard Rule 11 text (SEC-01/02 wording) and a Decisions Log line for the 2026-10-23 rulings | s2, s3 | OPEN (`CLAUDE.md` has no SEC text) |
| 16 | DB-03 Needs Ivan 1 (deleted event on pass page: A banner, B pass page only, C notFound) | s3 | OPEN |
| 16b | DB-03 Needs Ivan 3, `/events` limit | s3 | CLOSED `b5696ca` |
| 17 | CX-04 Needs Ivan 1-10 | s3, s4 | See section 4 |
| 18 | DB-04 Needs Ivan 1-5 | s3 | OPEN |
| 19 | DB-05 Needs Ivan 1-4 | s3 | OPEN |
| 20 | Multi-admin role editing | s3 | OPEN |
| 21 | `/events` inside AccountShell | s3 | Re-ask (UX-02 set 3) |
| 22 | UX-02 re-cut or relabel | s4 | OPEN; recommend re-cut |
| 23 | Email stub-vs-real switch (`04fdc9c`, droppable fix `fb49ac1`; Hard Rule 7 text, three-state `emailMode()`, `NODE_ENV` signal, confirmation retry) | s4 | OPEN (neither SHA is on main; `CLAUDE.md` Hard Rule 7 unchanged) |
| 24 | CX-04 minimal redo | s4 | OPEN, now CX-04R |
| 25 | `epic-cannon` (96 UI-port deletions) | s4 | OPEN, HOLD; propose Replace, never delete |
| 26 | Node leftovers; `scripts/demo/dev-local.sh:11` still `v24.6.0` | s4 | OPEN |
| 27 | PHP, GitLab, NGINX | s4 | CLOSED (none used) |
| 28 | Stale `scratch-demo/locks/dev-3100.lock` | s3, s4 | OPEN |
| 29 | Prune worktrees competent-shannon, interesting-kepler, quirky-lederberg | s4 | OPEN |
| 30 | Cards DB-03, CX-04, DB-04, DB-05 built | s2 | CLOSED `2295e46`, `ce4da44`, `a96d9a1`, `13be4c2`, `1d03e3b` |
| 31 | UX-02 builder, UX-04, CX-06b, UX-FU1 builders | s1-s4 | OPEN; UX-02 and CX-06b need the amendments above |
| 32 | Idle sessions | s1, s2, s4 | Dashboard landing DONE (`b5be91c`, `55abe53`); email landing OPEN; others idle and stale |
| 33 | Plan section 11: decisions 1-8, unmerged `gifted-proskuriakova` `3b7742f`, verification owed | plan | OPEN |
