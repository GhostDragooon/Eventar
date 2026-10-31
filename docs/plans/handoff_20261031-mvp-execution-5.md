# Handoff, 2026-10-31: the 2026-10-30 two-persona doctrine mapped against code, plans and vault; live docs amended; five rulings recorded; nothing built

**Date:** 2026-10-31
**Status:** IN PROGRESS (docs only; decisions open; no code changed)
**Bead(s):** none (`bd` is not installed here)
**Epic:** MVP execution plan, `docs/plans/2026-10-11-mvp-execution-plan.md`
**Chain:** `mvp-execution` seq `5`
**Parent:** `handoff_20261031-mvp-execution-4.md`
**Prior chain:** `handoff_20261023-mvp-execution.md` > `handoff_20261024-mvp-execution-2.md` > `handoff_20261025-mvp-execution-3.md` > `handoff_20261031-mvp-execution-4.md` > this

Evidence tags: [X] executed this session, [R] read in code or docs, [I] inferred from Ivan's wording, not confirmed. This note replaces the open-item sections of seq 1 to 4; the merged list is in `mvp/DOCTRINE-CONFLICT-MAP.md` section 9.

---

## 0. Ivan's action list

Terms: **R1** = your wrong-door ruling; **OPEN-n** = open questions in `mvp/DOCTRINE-CONFLICT-MAP.md` section 2; **K1** = the identity-and-access kernel block (changes to it need a Decisions Log entry); **TOTP** = the authenticator-app code; **PGRST116** = the database error when one email matches two staff rows; **carded** = written up as an MVP task card; **CX-04R** = the proposed redo of the shipped dashboard card CX-04. **R3** = your ruling that organiser History parts 2 and 3 (as speaker, as audience) are org-level aggregates; **R4** = your ruling that this pass edits repo and vault and leaves CLAUDE.md as proposed text; **History** = the organiser sidebar item with three parts (1 what we ran, 2 as speaker, 3 as audience); **Q26** = the vault gate against compliance totals; **five-item nav** = Check-in · Registrations · Events · History · Account. Items 1 to 9 are decisions (5 and 8 may need map section 8 and Q47 open); 10 is a carry-over list.

**Decide** (recommendation first)
1. **Organiser door is email + password? (OPEN-9)** Recommend: yes, confirm. Your R1 (every failed Organiser log in says "The email or password you entered is not correct", then Forgot email, Forgot password, Attendee log in link; same text for unknown, wrong password, not staff, suspended) implies a password door, and the vault Auth Flow already locks password + TOTP. Today the door is a magic link (`app/login/actions.ts:29`) [I]. Alternative: keep the magic link and show the same message without the word "password".
2. **Ship the password door without TOTP? (OPEN-2)** Recommend: no, build both in the doors card, because the vault locks password + mandatory TOTP and nothing of it is built [R]. Cost: a bigger card. Alternative: password first, TOTP later, which you accept in writing.
3. **One email on two organisations? (OPEN-1)** Recommend: refuse it until multi-org is carded. Today a second active staff row for the same email locks that person out of both organisations (PGRST116, `proxy.ts:103-106`) [R]; Organiser Sign Up and the invite-accept function can both create that row. I did not check whether such a row exists locally.
4. **Attendee door shape? (OPEN-3)** Recommend: keep what exists, Email, Next, then a magic link by email (`app/account/sign-in/page.tsx:113-132`). Alternative: a password at the attendee door as well, which adds a reset flow and a second set of copy.
5. **Which card first (one at a time)?** Recommend **CX-04R**: one Events home and the organiser sidebar Check-in · Events · History · Settings. It is organiser-only, it unblocks steps 1 and 2 of the organiser acceptance walk (sign in and land on Events; create a draft and find it), and its sidebar settles what History means before the attendee side is cut. It is a design decision, so the locked pipeline runs and you see before and after. Alternative: the **UX-02 re-cut** (the attendee portal shell redrawn with the five-item nav) first, as seq 4 recommended; cost: the organiser walk stays on Programme and Manage longer. For History, part 1 = the existing `/analytics` event analytics is my reading, not yours; parts 2 and 3 are item 8. After either comes an **attendee surfaces card** (builds Registrations, the History split of `/account/record` and the attendee Check-in route; not written yet) and a **doors card** (landing pill, both doors, R1 copy; the merged scope of CX-06a and CX-06b).
6. **Five smaller calls (OPEN-4 to OPEN-8).** Only OPEN-4, 6 and 7 need a yes or no now; OPEN-5 and OPEN-8 can wait for their cards.
   - OPEN-4: add "Account admin" and "Registrations" to `CONTEXT.md`. Recommend yes; the nav label wins in the UI.
   - OPEN-5 (later): Sign Up safeguards against a name like "HKCP", the `organisers` row, slug generation.
   - OPEN-6: read "pay-as-you-go out of scope" as self-serve payments onboarding only, so the per-event price (HKD 6,000, Q40) is not affected. Recommend yes.
   - OPEN-7: leave the shareable-link team invites as they are (7 days, not tied to an email) until the email + role version is carded. Recommend yes.
   - OPEN-8 (later): UX-04 heading, Registrations or Participants.
7. **Attendee History: may it show points or counts? (OPEN-12)** The doctrine calls History a "points log"; the vault gate Q26 forbids compliance totals and cycle figures, and `/account/record` shows points today. Recommend: a plain dated log with no totals and no counts until Q26 is decided.
8. **Does R3 reopen a Q43 rejection? (OPEN-10)** Q43 refused to let an organisation read "registrants at my organisation", because an organisation can manufacture that link. Your R3 (organiser speaker and audience history as aggregates through a definer function) reads the same kind of link. Recommend: accept only aggregates (no names, no contact fields), built on their own card. Alternative: drop History parts 2 and 3 from MVP.
9. **Accept Q47 as the K1 sign-off and its overrides? (OPEN-11)** Q47 says organiser Sign Up (a change to the identity-and-access kernel) is authorised in principle; it overrides Q32 call 5, Auth Flow's invite-only rule and the IA spec, and adds an exception to the Q32 boundary (the landing's Organiser pill may link to `/login`). These are my reading of your 2026-10-30 lock. Recommend: yes. If no, Q47 is edited before anything builds.
10. **Carry-overs, no action now; each is asked when its card starts** (merged list: map section 9): the four email stub-vs-real calls (`mvp/EMAIL-SWITCH-HANDOVER.md`), `epic-cannon` stays on HOLD (propose Replace, never delete), DB-03 A/B/C, DB-04, DB-05, UX-FU1 picks, DB-02 desk calls, FR-005, CX-06a naming, CX-07 follow-ups. **CLAUDE.md:** the proposed text below is not applied (your R4); items 1 to 3 are decidable now, item 4 is a pointer to carried text and can be skipped.

**Execute** (only Ivan can, in order)
1. Read Q47 at the end of vault `02 — Decisions Log.md` (about 3 minutes) before answering Decide. The vault is already edited (your R4); backups of the eight touched files are in `/private/tmp/claude-501/-Users-ivan-Eventar/ad018300-4210-4e8f-b19f-65c45487e2e8/scratchpad/vault-backup`.
2. Answer Decide 1 to 5, 6 (OPEN-4, 6 and 7 only), 7, 8 and 9.
3. Hosted migrations are still blocked by the auto-mode classifier: add allow rules for `supabase migration list --linked*` and `supabase db push --linked*`, or run them yourself. The 10 local-only migrations are listed in `handoff_20261025-mvp-execution-3.md` item 1.
4. Delete `scratch-demo/locks/dev-3100.lock`.
5. Push: I commit after both reviews finish, and this session's last message names the SHA. Then reply "push main up to <sha>". Push approval is per session.
6. Deferred by you, not an action now: Node leftovers; `scripts/demo/dev-local.sh:11` still `v24.6.0`.

**Queued for Claude** (one card at a time; reviews after each; tip gate; ask for push)
CX-04R (once you answer item 5), UX-02 re-cut, the attendee surfaces card (to be written), the doors card (CX-06a and CX-06b merged scope, R1 copy), UX-04, UX-FU1 builders after picks. Chores: land `fb49ac1`'s branch after the email calls; prune the three redundant worktrees with skill `git-worktree-consolidation`.

**Other sessions:** none running; all idle, state kept. This session is "Doctrine consolidation and validation". Peers: "Land the organiser-timezone dashboard fix" (done, landed as `b5be91c` and `55abe53`), "Land the email stub-vs-real switch" (branch not landed), "MVP execution handoff continuation". Older UX-02 and seq 3 sessions from seq 4 are unchanged.

---

## Since last handoff (seq 4 plan vs what happened)

- Seq 4 Decide 1 ("UX-02: re-cut before picking"): confirmed by the map. UX-02 sets 1, 2, 3, 5 and 6 are re-asked or superseded, sets 4 and 7 survive. No UX-02 work was done; the card is now amended.
- Seq 4 Decide 3 ("does CX-04 get a redo card"): answered by drafting **CX-04R** in the plan as PROPOSED. It is not carded until you say so.
- Seq 4 items 2, 4, 5 and the Execute list: untouched on purpose. This pass changed docs only.
- New and not in seq 4: five rulings (R1 to R4 and the Decide list), eight open questions (OPEN-1 to OPEN-8), the Q47 vault entry, and a finding that the doctrine overrides things its authority clause never names.
- Trajectory: on path. The MVP spine (create, publish, register, check-in) is unchanged by the doctrine.

## Reference documents

- `docs/plans/DOCTRINE-two-persona-2026-10-30.md` (locked, untouched) and `docs/plans/mvp/DOCTRINE-POINTER.md` (untouched).
- `docs/plans/mvp/DOCTRINE-CONFLICT-MAP.md`: the builders' reference (new, this session).
- Vault `02 — Decisions Log.md` Q47 (new) and Q32 (marked superseded in part).
- `CLAUDE.md` (project rules), `docs/architecture/BLOCK-ARCHITECTURE.md` (K1 note added).

## The goal

Ivan locked a PayPal-shaped entry (a landing pill picks the Attendee or Organiser door, both doors Email then Next or Sign Up) and two short sidebars (attendee Check-in, Registrations, Events, History, Account; organiser Check-in, Events, History, Settings). Self-serve organiser Sign Up makes the creator Account admin. The goal of this pass was to find every place the code, the MVP plan, the cards and the vault disagree, amend the live documents, and bring Ivan only the decisions that need him. No code was to change.

## Where we are

- Three read-only explorers (code, plans and handoffs, vault and rules) reported with `path:line` evidence; I re-read the four load-bearing claims myself [X]: `staff` is keyed on email with no `user_id` (`supabase/migrations/20260514164414_init_staff.sql:39-47`), the proxy keeps a non-staff session and redirects to `/login?error=not_organiser` (`proxy.ts:111-121`), the shell nav is Programme, Manage, Participants, Accreditation, Check-in, Communications, Reports (`components/shell/StaffShell.tsx:69-77`), and the login action leaves `shouldCreateUser` at its default (`app/login/actions.ts:29-36`).
- Code is unchanged [X]: `git status` shows only docs paths and the autoharness skill files.
- Written: `docs/plans/mvp/DOCTRINE-CONFLICT-MAP.md` (9 sections: rulings, open questions, code, plans, vault, doctrine-internal issues, door constraints, cards opened, merged open items).
- Amended in place with a "Doctrine 2026-10-30" marker: the MVP plan (24 line edits, a banner, a CX-04R card, a CX-04 title note, a UX-03 note), `PROJECT_STATE.md` (audience table and rules), `mvp/CX-04.md`, `mvp/UX-02.md`, `mvp/CX-06a.md`, `mvp/UX-FU1.md`, the organiser IA spec, `specs/001-attendee-portal/spec.md` (FR-006), `BLOCK-ARCHITECTURE.md` (K1).
- Vault: Q47 appended; Q32 marked superseded in part; banners on Frontend Design Standard, Auth Flow, the two September roadmap notes; an Index callout; a row in Out of Scope.
- Not done: CLAUDE.md (ruling R4), any code, the vault copy of the MVP plan (it says "do not edit this copy; re-copy from the repo", so it needs a re-copy once Ivan accepts the plan edits), the vault Index status line.
- The landing, doors and both shells in the running app still show the old labels. That is expected: CX-04R and the doors card carry the change.

## What we tried

- **Fan-out by source family** (skill `superseded-doctrine-conflict-map`): code, plans, vault, one explorer each, `path:line` evidence required. Result: 10 code areas, about 25 plan lines, 23 vault rows (9 outright conflicts). The vault explorer's list was the most useful; it found the authority-clause gap.
- **Asked Ivan three yes/no-shaped questions** (wrong door, Hard Rule 1, History) plus scope. Ivan answered the last three and asked a question back on the first ("elaborate ... under what circumstances will that happen"). Cost: one extra round. I traced the paths first (new person on the Organiser door, attendee clicking "Start an Event", removed staff with a live session; invitees excepted) and re-asked; Ivan then gave R1 in his own words.
- **Out of Scope row, first attempt placed it in the wrong table.** My insertion used the last pipe-line in the first 30 lines, which reached the Business development table. Caught by reading the result; moved into the Product features table and re-checked with a diff against the backup [X].
- **Gate ledger** (skill `unlazy`): eight gates in the session scratchpad, six runnable oracles in `verify.mjs`, two manual (dev-lens and user-lens agents).

## Key decisions

- **R1 generic organiser failure message** (Ivan). One text for every failure so the staff list never leaks; the attendee session is never signed out (finding I1). Chosen over "sign out after bounce" (reopens I1) and "check before sending" (leaks who is staff).
- **R2 Hard Rule 1 is recorded as debt, not amended.** `staff.user_id` becomes a precondition of the Sign Up card. Rejected: amending the rule (a staff member who changes email would lose access) and carding the migration now (a K1 kernel change mid-MVP).
- **R3 organiser History parts 2 and 3 are org-level aggregates** through a column-limited definer function (Q43). Rejected: the staff member's own record (reverses Q32 and reopens blocker B2).
- **R4 repo and vault edited, CLAUDE.md left as proposed text.**
- **Decisions Log number:** Q47. Q46 stays reserved because `mvp/UX-01.md:42` holds a template for "Q46: MVP core-UX picks".
- **Historical text is mostly not rewritten.** Dated handoff entries and old roadmap notes keep their wording; only banners and live tables changed. In the MVP plan, O1, O5, A2, A5 and section 8 were edited in place with a marker; the old wording is in git at `757a7e8`. The PROJECT_STATE audience table now says "Target ... Today ..." so the code and the target are both visible.
- **No Past tab on Events.** Past work lives under History (the doctrine). The map treats `/analytics` as History part 1; that is my reading, not Ivan's.

## Evidence & data

| Source family | Finding | Where |
|---|---|---|
| Code | 10 areas differ; worst: sidebar has 7 rows, 2 inert, doctrine wants 4 | map section 3 |
| Plan and cards | 24 plan lines edited; CX-04 items: 4 survive, 3 re-ask, 2 superseded, 1 closed | map section 4 |
| Vault and rules | 23 rows, 9 outright conflicts | map section 5 |
| Merged open items | 35 rows: 9 closed, 23 open, 2 re-ask, 1 mixed | map section 9 |
| Doctrine-internal | 11 issues, 3 of them collisions with a hard rule or locked decision | map section 6 |

| Collision | Doctrine says | Rule says | Resolution |
|---|---|---|---|
| Staff keying | "email on staff list" | Hard Rule 1: UUID identity | R2 debt |
| Org creation | Sign Up creates the organisation | K1 kernel change needs a Decisions Log entry and Ivan's sign-off | Q47 authorises in principle, pending Decide 9; build needs a card |
| Wrong door | "not staff, not in" | Auth Flow anti-enumeration; finding I1 | R1 generic message, session kept |
| History 2 and 3 | speaker and audience history | Q32 split, A7, Q43 | R3 aggregates |
| Attendee area | full portal | CLAUDE.md pivot rule: S-Attendee post-M4 | Proposed CLAUDE.md text |

Baseline facts [X]: `origin/main` and local `main` were both `757a7e8` at the start; the doctrine commit is `8380f2c`; `git status` was clean apart from autoharness files. Hard rules and Hard Rule 11 table are untouched.

## Code analysis (read, not changed)

- Proxy gate: `proxy.ts:78-121` lowercases the email, looks up `staff` by email and `status = 'active'` with `.maybeSingle()`; PGRST116 redirects to `?error=multiple_organisations`; no row redirects to `?error=not_organiser` and keeps the session.
- Door pages: `app/login/page.tsx:100-170` reads the browser session and routes staff to `next` or `/dashboard`, invitees to `next`, others to a panel. `app/account/sign-in/actions.ts:34` lands attendees on `/account/record`.
- Staff statuses: invited, active, suspended, removed (`20260704130200_staff_org_scope.sql:9-10`); roles organiser_admin, organiser_member, body_admin, auditor, eventar_staff. "Account admin" means `organiser_admin`.
- `provisionOrganisation` (`app/settings/orgActions.ts:15-58`) is the only org-creating path; eventar_staff only, no caller in the UI. `organisations.slug` is NOT NULL UNIQUE.
- Link invites: 7 days, at most 10 active, no email (`app/settings/team/actions.ts:22-44`).

## Files changed

### Docs (repo)
- `docs/plans/mvp/DOCTRINE-CONFLICT-MAP.md` (new), `docs/plans/handoff_20261031-mvp-execution-5.md` (new, this file)
- `docs/plans/2026-10-11-mvp-execution-plan.md`, `docs/plans/PROJECT_STATE.md`, `docs/plans/mvp/CX-04.md`, `UX-02.md`, `CX-06a.md`, `UX-FU1.md`, `docs/plans/2026-07-12-organiser-ia-spec.md`
- `specs/001-attendee-portal/spec.md`, `docs/architecture/BLOCK-ARCHITECTURE.md`

### Vault (`/Users/ivan/Desktop/Eventar`)
- `02 — Decisions Log.md` (Q47 appended, Q32 line), `00 — Index.md`, `10 — Architecture/Auth Flow.md`, `30 — Reference/Frontend Design Standard.md`, `30 — Reference/Out of Scope.md`, two September roadmap notes

### Not touched
- The doctrine, `DOCTRINE-POINTER.md`, CLAUDE.md, all source, tests, migrations, the vault copy of the MVP plan.

## User feedback & preferences

- "ensure ponytail and unlazy skill is in effect at all times" (mid-session). I loaded `unlazy` and wrote a gate ledger.
- "consolidate the handoff, review and validate": this pass reviews and validates; it does not build.
- On the wrong-door case Ivan wanted the circumstances explained before ruling, then ruled in his own words (R1). Explain the paths first next time.
- Choices: Hard Rule 1 as debt; org-level aggregates for History; repo and vault edits with CLAUDE.md proposed only.
- Standing, carried: show the difference for front-end findings and let Ivan decide; three or more options when skills disagree; short handoffs; commit by pathspec; push go names an exact SHA.

## Where we're going

1. Ivan answers Decide 1 to 9 (about 15 minutes to read this page and Q47).
2. CX-04R: run the frontend pipeline (stage 1 `impeccable-design-polish`, stage 2 `hallmark` then `frontend-design:frontend-design`, stage 3 four taste skills, stage 4 `ui-ux-pro-max`, stage 5 motion), show before and after, then build.
3. UX-02 re-cut under the five-item nav; then the doors card with R1 copy and `staff.user_id` only if Sign Up is carded.
4. Email calls, land `fb49ac1`, prune worktrees; push this handoff on Ivan's go.

## Risks & blockers

- The doctrine overrides locked decisions it does not name (Hard Rule 1, Auth Flow invite-only, K1 change control, the S-Attendee freeze, Q19). Q47 now names them; CLAUDE.md still does until Ivan applies the proposed text.
- The organiser door is a password door only if Decide 1 is confirmed; building R1 as a magic-link message would be wrong copy.
- Autoharness rewrites tracked skill files after each episode; commit by pathspec.
- Flaky under load, rerun alone: `app/events/[id]/edit/PublishDraftButton.test.tsx`, `components/auth/MagicLinkSignInForm.test.tsx`. Docker is off, so the local stack and :3100 are down [R].

## Open questions

- OPEN-1 to OPEN-8 in `mvp/DOCTRINE-CONFLICT-MAP.md` section 2: OPEN-1 is Decide 3, OPEN-2 is Decide 2, OPEN-3 is Decide 4, OPEN-4 to OPEN-8 are Decide 6, OPEN-9 is Decide 1, OPEN-10 is Decide 8, OPEN-11 is Decide 9, OPEN-12 is Decide 7.

## Proposed CLAUDE.md text (not applied)

1. Frontend row of the vault table: add "Then `docs/plans/DOCTRINE-two-persona-2026-10-30.md` for navigation labels, the two doors and organiser onboarding (Decisions Log Q47)."
2. Pivot-era rule on the practitioner app / S-Attendee (post-M4): "Lifted for the MVP attendee portal (UX-02) by the MVP plan and Q47; evidence locker, share-and-verify and compliance math stay gated."
3. Under Hard Rule 1: "Known debt (Q47, R2): `staff` is still keyed on email with no `user_id`. Add `staff.user_id` before any organiser Sign Up work."
4. Hard Rule 7 and Hard Rule 11 wording: carried unchanged from seq 4 (email switch) and seq 3 (SEC-01/02); text is in `mvp/EMAIL-SWITCH-HANDOVER.md` and `handoff_20261025-mvp-execution-3.md`.

## Quick start for next session

```bash
cd /Users/ivan/Eventar
git fetch && git status -s && git log --oneline origin/main..main   # expect this session's commit only
# read first: docs/plans/mvp/DOCTRINE-CONFLICT-MAP.md (sections 1, 2, 8), then this file's section 0
# vault: 02 — Decisions Log.md, Q47
# Next action: ask Ivan Decide 1 (organiser door = email + password), then Decide 5 (which card first)
```
