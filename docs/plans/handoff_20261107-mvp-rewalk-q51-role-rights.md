# Handoff, 2026-11-07: MVP re-walk passed, MINORs fixed, Q51 role rights built and live on Seoul; next is the security card

**Date:** 2026-11-07
**Status:** COMPLETE for this session's scope. Everything is committed, pushed and (for the migration) applied to Seoul. The MVP is still NOT declared closed: the items in §0 wait on you.
**Bead(s):** none (the repo does not use `bd`)
**Chain:** `mvp-execution` seq `16`
**Parent:** `handoff_20261106-consolidated.md` (entry point; replaced the seq 4–15 and email-switch action lists)
Evidence tags: [X] executed this session, [R] read in code or docs, [I] inferred.

---

## 0. Ivan's action list

**Decide** (recommendation first; frontend items need before/after shown, standing rule 2026-10-14)
1. **Security card (Q48 priority 2).** M3: no enforced anti-clickjacking header (`frame-ancestors` is only in the report-only CSP; no `X-Frame-Options`). M2: `consent_records` is writable and forgeable by any signed-in user. `zod` 4.4.3 → 4.6.6+ (last direct high advisory). **Recommend:** one card for all three now, about half a day with tests. The H1 SQL layer (`auth_email()` confirmed-email check) stays its own kernel card after your sign-off.
2. **Agenda blocks** (carried, still unruled): (a) a DB rule that blocks sit inside the event window; (b) `update_event_with_blocks` returns block ids. **Recommend:** one card for both. Cost: a migration that checks existing rows first.
3. **Email stub-vs-real branch** `origin/claude/distracted-haibt-18a25a` (`04fdc9c` + `fb49ac1`, unmerged) and the five calls in `handoff_20261031-email-switch-landing.md` §0. **Recommend:** merge both commits; leave the stub-copy and `NODE_ENV` questions to Stage 8.
4. **CLAUDE.md wording** (carried): Hard rule 1 says sign-in is "OTP/password+MFA"; it is an emailed link with no password or MFA. Hard rule 7 says sends are stubbed "regardless of stage". **Recommend:** let me correct both sentences (rules unchanged).
5. **Frontend design leftovers** (each runs your locked pipeline, with before/after first):
   - From the Q51 walk: the Check-in button stays primary blue on a colleague's event; the read-only Edit view still says "Edit" in its breadcrumb and tab title; the accreditation role sentence shows twice on that view.
   - Carried: the UX-04 items, phone navigation (strip clips Settings at 375 px), `AuthBackdropCard` hex gradient, public menu vocabulary.
   **Recommend:** phone navigation first (the only visible defect).
6. **Eventar staff from another organisation** cannot edit event details through the API (the events UPDATE policy is organisation-scoped) while they can publish and check in anywhere. Pre-existing, pinned in `tests/rls/role_rights_q51.rls.test.ts`. **Recommend:** leave until a real cross-organisation operator need exists.

**Execute** (only Ivan, in order)
1. Nothing pending. Everything below is on `origin/main` (`bdc87c4`) and Seoul is up to date (`supabase db push --linked --dry-run` → "Remote database is up to date" [X]).
2. Legal stays parked (`docs/DEFERRED.md` TODO row); send `docs/legal/README.md`'s solicitor list after the MVP closes.

**Queued for Claude** (no ruling needed)
- Fix the stale PublishDraftButton / NewEventForm / `award_f1_f5_gate` flakes only if a gate blocks (logged in `docs/DEFERRED.md`; each passes alone).
- One more clean-worktree gate chain at the final HEAD before the MVP done-when declaration; aim for a run with no flake.
- Local DB drift left undeleted (older than the cleanup cutoff): events `ZZ-FINAL admin before-window`, `ZZ-FINAL member c1`; user `prac01@final.invalid`; ~300 RLS test accrediting bodies; ~63 test users. Clean only on your go.
- After the MVP closes: the done-when declaration against `mvp/REVIEW-FINAL-summary-r2.md`, `PROJECT_STATE.md`, vault roadmap note, `/graphify --update`.

**Other sessions:** `ListAgents` at handoff: "Database organization review [818865]" (waiting), "Event accreditation product review [fa4aff]" (idle), "ivan-ac [e38748]" (idle). Untracked and not mine, left alone: `AGENTS.md` (modified), `.claude/skills/*`, `docs/plans/.claude/`.

---

## Since Last Handoff

- Seq 15 asked for the MVP re-walk and the queued fixes. All done: the live re-walk found no BLOCKER or MAJOR; four MINORs, one retracted (the 300-event footer was right: the local org holds 464 events).
- Role rights (seq 15 Decide 2) was ruled and built the same day as Q51.
- A peer session shipped Q49 (audit/evidence hash pins) and Q50 (audited evidence deletes) in between; both are on Seoul.
- Trajectory: on path. The MVP's remaining blockers are your decisions, not build work.

## Reference Documents

- `docs/plans/handoff_20261106-consolidated.md` (§2 re-walk table, §0 carried decisions)
- `docs/plans/2026-11-06-role-rights-card.md` (Q51 plan and ruling)
- Decisions Log Q51 (vault); `docs/architecture/BLOCK-ARCHITECTURE.md` K1 note
- `docs/plans/security-audit-20261104.md` "Still open"
- `docs/plans/mvp/REVIEW-FINAL-summary-r2.md` (checklist authority)
- `docs/DEFERRED.md` (flake row, legal TODO)

## The Goal

Close the MVP (Q48 priority 1), then verify the security set (priority 2), Stage 8 deploy (priority 3), first partner slice (priority 4). This stretch closed every build item that did not need a ruling and added the role rules the organiser surface was missing.

## Where We Are

- `origin/main` = `bdc87c4` [X]. Seoul migrations match local; newest `20261107100000` [X].
- Seoul read-only check of Q51 [X, via the Supabase MCP on your explicit "check"]: 9 `event_writer_guard` triggers, `anon` cannot execute `create_event_with_blocks`, 3 hero-image policies, 4 helper functions, migration recorded.
- Commits this stretch: `6818033` (Draft label, organiser spelling, three MINORs), `5e36388` (consolidated handoff, re-walk results, spec and DEFERRED), `b95a987` (Q51, 54 files), `bdc87c4` (docs: applied to Seoul).
- Last full gate chain on the Q51 tree [X]: tsc 0; eslint 0 errors (11 warnings); `check:ui-colours` clean; `check:ui-primitives` exit 1 with the same 4 hits as before (`ProfileClient.tsx:510`, `OrgOnboardingClient.tsx:120,142`, `MultiBodyAccreditationWizard.tsx:245`), none from this work; vitest 234 files / 2229 passed; `next build` 0; `test:rls` stage 1 457 passed + 1 known flake (`award_f1_f5_gate`, 7/7 alone ×3), stage 2 57 passed. Counted as NOT CLEAN by the flake rule.
- Nothing is running: no dev server on :3000–:3200, no locks in `scratch-demo/locks/` [X].

## What We Tried (Chronological)

1. Read the seq 4–15 handoffs, wrote one consolidated entry point; fixed the queued no-ruling items (`StatusPill` "Draft", organiser spelling, spec 001 labels, flake row in DEFERRED).
2. Live MVP re-walk on :3100 as `ux-member`, `ux-body` and a fresh practitioner, with a time-window helper (`.claude/skills/eventar-mvp-acceptance-walk/scripts/walk-window.sh`). All rows passed; four MINORs found; three fixed on your "Keep all three".
3. Gate chain in a clean detached worktree at `5e36388`; counted fixture cleanup (2 events, 7 registrations, 2 users, 0 ledger rows).
4. Role rights: an inventory agent listed 14 staff write paths and 7 surprises; I asked you two questions (role chips, read-only roles), then two more (mixed bulk, hero images); you ruled "admin all, member own", "both read-only", "refuse the whole batch", "hero images same rule".
5. Built one SQL predicate (`app_private.can_write_event`) plus a guard trigger on 9 tables, rewrote 10 RPCs by counted text replacement, tightened storage policies, then app helpers and gates on every action and page. A matrix RLS test written first failed on the old DB on every changed cell.
6. Dev-lens review (4 MAJOR, 3 MINOR): rows moved between events, staff claiming their own registration, email sends, test coverage. Fixed and proven (the old guard fails the new cells, mutation-checked).
7. User-lens walk (2 MAJOR, 5 MINOR): all frontend; you picked options; I built them (confirm refuses in the dialog, "View", read-only lines, desk copy, sticky bulk bar) and checked each live.
8. Committed, pushed exact SHAs, applied to Seoul on your run, verified read-only.

## Key Decisions

- **Q51 (you, 2026-11-06/07):** admin any org event; member own; body_admin and auditor read-only; eventar_staff all; mixed bulk refused whole; hero images same rule; new-event uploads under `pending/<auth uid>/`.
- **Enforcement at the write, not in screens:** a BEFORE trigger on the 9 event-owned tables; updates checked against both the event a row leaves and lands on; service_role and a staff account claiming its own practitioner registration are exempt.
- **Kept the sticky bulk bar as mechanical** (sticky already used in `app/page.tsx`), flagged for the design review.
- **Rejected:** per-row disabled checkboxes (would make your "refuse the whole batch" unreachable); a new "read-only" tag.

## Evidence & Data

- Q51 test: `tests/rls/role_rights_q51.rls.test.ts` (5 roles × own/other event × edit, publish, role chips, hero images, create, check-in, speaker, contact, bulk, claim). Old-rule tests rewritten: `publish_event`, `mark_attended`, `multi_body_accreditation_crud`, `event_agenda_integrity`, `audited_table_writes`, `registration_contact_edit`.
- Screenshots were inspected inline; none are on disk.
- The audit rows the walks wrote stay (append-only).

## Gotchas hit this session

- The auto-mode classifier blocked `git push origin main`-style pushes and `supabase db push --linked` once each; you ran the Seoul push yourself. Handoff-quoted push go does not carry across sessions.
- Empty `request.jwt.claims` (`''`) is invalid JSON in test probes; use `'{}'`.
- A staff JWT left set in a probe makes later fixture inserts trip the guard; reset claims before fixture writes.
- `revoke ... from anon` does nothing when `PUBLIC` still holds EXECUTE; revoke from `public` too, then regrant explicitly.
- A zsh `grep -E` with `$(...)` in quotes and `==== ` separators errors; use `printf`/plain markers.
- Browser pane returns empty reads when hidden (viewport 0x0): `tabs_select` first.

## Quick Start for Next Session

```bash
cd /Users/ivan/Eventar
git fetch -q origin && git log --oneline -6 && git status -s | head
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200) '
ls scratch-demo/locks/
```

**First action:** ask for your rulings on §0 Decide 1 (security card) and 2 (agenda blocks); while waiting, nothing is blocked on code.

Read first:
- this file §0
- `docs/plans/handoff_20261106-consolidated.md` §0 and §2
- `docs/plans/security-audit-20261104.md` "Still open"
- `docs/plans/PROJECT_STATE.md` top entries
