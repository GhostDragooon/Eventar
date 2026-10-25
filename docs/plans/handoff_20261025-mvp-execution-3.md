# Handoff, 2026-10-25: MVP execution queue, cards through DB-05 pushed; UX-02 (design) not started

**Date:** 2026-10-25
**Status:** IN PROGRESS (nothing half-built; UX-02 only researched)
**Bead(s):** none (`bd` is not installed here)
**Epic:** MVP execution plan, `docs/plans/2026-10-11-mvp-execution-plan.md` (sections 3.2 and 4 still the contract)
**Chain:** `mvp-execution` seq `3`
**Parent:** `handoff_20261024-mvp-execution-2.md`
**Prior chain:** `handoff_20261023-mvp-execution.md` > `handoff_20261024-mvp-execution-2.md` > this

Short on purpose (Ivan asked for it). Per-card detail lives in `docs/plans/mvp/<CARD>.md` and `REVIEW-*.md`; read those, not this, for findings.

---

## 0. Ivan's action list

**Decide** (all front-end or product; nothing below is applied)
1. **UX-02 direction**: nothing for you yet; the next session builds specimens and shows options (see Where We're Going).
2. **Open picks from this session, one list per card**: `DB-03.md` (deleted event on the pass page and staff views: options A/B/C), `CX-04.md` (10 items: quick-view pop-up gone, crash exit on `/dashboard`, past-dated drafts under Past, finding drafts among 242 rows, "Upcoming" means two things, draft details wording, header, count ceilings), `DB-04.md` (self-serve kill switch cannot be flipped on a live event; operator editing another organisation's draft; form keeps a refused block visible; published `/edit` page copy), `DB-05.md` (email correction that matches an account cannot be undone; who may edit contact details).
3. **Still open from seq 2**: UX-FU1 picks (12 surfaces, `docs/plans/mvp/UX-FU1.md`, recorded in `PICKS.md`), DB-02 desk calls, CX-06a naming items, CX-07 follow-ups (support contact, `/login` error state), FR-005 `next` call, text for CLAUDE.md Hard Rule 11 and a Decisions Log line (SEC-01/02 plus SEC-03 and the DB-04/DB-05 grants).

**Execute** (only Ivan can)
1. **Hosted migrations** are still blocked by the auto-mode classifier (even a read-only `supabase migration list --linked` was denied, `[Production Reads]`). Add Bash allow rules for `supabase migration list --linked*` and `supabase db push --linked*`, or run them yourself. Local-only migrations now: `20261023140000`, `20261023150000`, `20261023160000`, `20261023170000`, `20261024100000`, `20261024110000`, `20261024120000`, `20261025100000`, plus older `20261010083221`, `20261010175112`.
2. **Push go is per session.** `origin/main` = `main` = `1d03e3b`. The `session: mvp-execution-3` commit that carries this note is NOT pushed: say "push" in the new session (the classifier denies a push on a go quoted from a handoff; memory note `push-go-does-not-carry-across-sessions`). Push the exact SHA: `git push origin <sha>:main`.
3. `motion` dependency (`package.json`, `pnpm-lock.yaml`) is still uncommitted and not mine; commit it with the `eventar-add-dependency` skill when you want it.
4. Delete `scratch-demo/locks/dev-3100.lock` (names a finished session, `claude-e94a72`); the classifier refused when I tried.

**Queued for Claude** (one card at a time; reviews after each; tip gate; ask for push)
UX-02 (design), then UX-04 (now eligible: Registrations page and edit dialog on `updateRegistrationContact`), CX-06b (mechanical), the UX-FU1 builder cards after your picks.

**Other sessions:** none running. Two I started finished: `export-in-batches` and `events-listing-limit` (both reviewed by dev and backtest lenses, committed and pushed). `:3100` dev server (pid 92762) is in REVIEW MODE (staff pages open signed out): reviewers must still sign in.

---

## What shipped this session (all pushed; tips gated in a clean worktree)

| Commit | Card | What |
|---|---|---|
| 2295e46 | DB-03 | teammate reads roster eligibility; soft-deleted event not public (policy) |
| ce4da44 | CX-04 | Programme lists drafts, rows link to details, sentences, crash exit; fixed the 414 crash for organisations over ~220 events (`app/dashboard/data.ts`, batches of 100) |
| b5696ca, 0959370 (+2 doc commits) | side sessions | `/events` listing and export actions fixed for large data (`lib/supabase/inBatches.ts`) |
| cc267d3 | door picker | `/checkin` had the same `.limit(100)` bug; fixed with `end_time >= now` in the query |
| 1a2b96f | SEC-03 | `anon`/`authenticated` lose DELETE on `events` (an organiser could hard-delete a published event) |
| a96d9a1, 13be4c2 | DB-04 | per-block agenda upsert by id; published event not editable at RPC, `events` trigger, `agenda_blocks` trigger; `blockIds` carried through the form |
| 1d03e3b | DB-05 | `update_registration_contact` (audited), `authenticated` loses UPDATE and DELETE on `registrations` |

Gates at the last tip (`13be4c2`, then `1d03e3b`): tsc 0, eslint 0 errors (11 old warnings), vitest with RLS 258 files / 2380 tests, `next build` 0. `pnpm test:rls` 47 files / 501. Plain vitest 207 files / 1836.

---

## Where We Are

- Working tree: only `package.json`, `pnpm-lock.yaml` (motion, not mine) and untracked `app/dev-preview-uiport/ux-fu1/**`, `docs/plans/mvp/UX-FU1.md`, `graphify-out/**`, `supabase/snippets/`, `.claude/skills/**`, `.agents/**` (all not mine; commit by pathspec, never `git add -A`).
- Local stack up (API 54321, DB 54322, Mailpit 54324); every migration above is applied locally.
- **UX-02 state**: only research, no code. Stage 1 skill (`impeccable-design-polish`) loaded, nothing produced.
  - Card (plan section 7.2/7.3): new `components/shell/AccountShell.tsx` mounted per page on record, profile, claim and `/account` (settings); sign-in/up stay on `SiteShell`; `/account/complete` gets an onboarding variant with no portal nav; practitioner band on `app/(public)/events/page.tsx` (FR-002), hidden for staff. Done when: a fresh practitioner never sees marketing chrome after sign-in; tests that each account page renders in `AccountShell` and the doors do not; walk at 375 px and desktop.
  - Decided already (Q41, direction C = Atmospheric): "build to the D0 specimens; any deviation is a design decision (stop and ask)". D0 artifact saved locally: `/Users/ivan/.claude/projects/-Users-ivan-Eventar/699f355b-55cf-41bb-9b01-b962370a709f/tool-results/artifact-bc93cc9e-1790847730-19c4.html` (attendee screen lines 817-866: 232 px rail with brand, My record, Profile and licences, Claim past events with count badge, Find events, "Account" heading, Account settings, account block; phone: top bar plus a 5-tab bottom bar). Spec: `specs/001-attendee-portal/spec.md` stories 3-5, FR-006, FR-007, FR-008.
  - Today all account pages use `SiteShell active="account"` (`app/account/{page,record/page,profile/page,claim/page}.tsx`); `app/account/layout.tsx` redirects staff to `/dashboard`.

## Key decisions

- **DB-04 deviations** (in `DB-04.md`): `registration_close_at` stays editable on a published event (the Close registration editor); no operator exception in the RPC (it would need UPDATE policies); triggers hold `authenticated`/`anon` only (definers, cascades, `service_role` pass).
- **DB-05**: Ivan's ruling 2 beats the old P6 text: `set_registration_role`/`remove_registration_role` stay creator-only. The function returns the registration's event id, so the Server Action takes no `eventId`.
- **Layered guards on purpose**: a single removal of a guard can survive its tests (row lock vs `events` trigger; RPC survey check vs agenda trigger). `DB-04.md` lists which, and the mutant that kills each pair.
- **review-animations (stage 5b)** is reserved to Ivan (Q41 and plan section 7.3); do not run it, say so in the options message.
- Executors and reviewers: Budget line first, count each parallel call, never poll with `sleep` monitors (skill `review-agent-budget-line`); no user lens for cards with no screen.

## User feedback and preferences

- "stop asking me unless you absolutely have to, for frontend design choice present them to me" (kept from seq 2).
- Handoffs: short and concise; he objects to token cost. Wants specimens he can see, three or more options when skills disagree, show-the-difference for front-end findings.
- Push: he gives an explicit go per batch ("push main up to <sha>"); push exactly that SHA.

## Where We're Going

1. **UX-02 (design)**: continue the locked pipeline at stage 2 (`hallmark` then `frontend-design:frontend-design`, then `stitch-design-taste`, `design-taste-frontend`, `high-end-visual-design`, `gpt-taste`, `ui-ux-pro-max`, `emilkowalski-motion`). Build option specimens as real components on tokens only, in a dev-only route `app/dev-preview-uiport/ux-02/` (same pattern as `app/dev-preview-uiport/ux-fu1/`), desktop and 375 px, each set with option `a` = the D0 specimen. Proposed open sets: (1) phone navigation (bottom tab bar as D0 / four tabs plus a More sheet / top bar with drawer), (2) account block and sign-out placement (FR-010: sign-out always reachable), (3) Find events boundary (public `/events` with a record shortcut as the spec says / `/events` wrapped in `AccountShell` for signed-in practitioners / slim portal-return bar on the public shell), (4) onboarding variant for `/account/complete`. Write `docs/plans/mvp/UX-02.md`, present to Ivan, apply nothing until he picks. Then build `AccountShell` and the tests from the card.
2. **UX-04** (Registrations page, outer border and spacing per `PICKS.md` b2; edit dialog on `updateRegistrationContact({ registrationId, fullName, email })`; add a `canEditRoster(role)` helper for the UI lock).
3. **CX-06b**, then the UX-FU1 builder cards once Ivan picks.
4. Re-run `supabase migration list --linked` and push migrations once the permission rule exists.

## Risks and gotchas

- Flaky under load, rerun alone: `app/events/[id]/edit/PublishDraftButton.test.tsx`, `components/auth/MagicLinkSignInForm.test.tsx`. Twice an RLS suite failed at suite level in a full run and never again (`roster_eligibility`, `award_f1_f5_gate`; error not captured); `gate.sh` now keeps the full vitest log.
- Tip gate recipe: detached worktree at the SHA, `cp -Rc node_modules`, empty `.env.local` only in the worktree, local env from `supabase status -o env` (refuse unless the URL is 127.0.0.1), take `scratch-demo/locks/test-rls.lock`, then tsc, eslint, `RLS_TESTS=1 vitest run`, `next build`, sequentially, then remove the worktree. The script lived in the session scratchpad; rebuild from this paragraph.
- PostgREST: an `.in()` over about 220 uuids is a 414; any read stops silently at 1000 rows. Use `lib/supabase/inBatches.ts`.
- Shell: `rg` fails through the RTK proxy (use `grep`); in zsh quote globs (`--include='*.ts'`); `array || 'text'` in plpgsql needs `array_append`; zsh has no `timeout`.
- Seen, not mine: `verify_evidence_chain()` shows 47 of 446 local rows with a false column (probably test pollution); the `registration_claimed` audit payload carries the claimant's email; `MAINTAIN` is granted to `anon` on 24 of 35 public tables.

## Open questions

- Should `/events` render inside `AccountShell` for a signed-in practitioner (UX-02 set 3)?
- Does Ivan want multi-admin role editing (would relax the eight creator-only writes)?

## Quick start

```bash
cd /Users/ivan/Eventar
git status -s | grep -v '^?? \.\(agents\|claude\)/' | grep -v '\.claude/skills'   # expect package.json, pnpm-lock.yaml
git log --oneline origin/main..main                                              # expect this session's commit only
supabase status 2>&1 | head -3
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200) '                      # :3100 should be review mode
# read first: docs/plans/mvp/DB-04.md DB-05.md CX-04.md (Needs Ivan), the D0 artifact file above, specs/001-attendee-portal/spec.md
# Next action: UX-02 stage 2 (hallmark), specimens at app/dev-preview-uiport/ux-02/
```

---

## Session Closed
**Closed at:** 2026-10-25
**Commit:** the `session: mvp-execution-3` commit that includes this note
**Session status:** Handed off to next session
