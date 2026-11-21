# Handoff 2026-11-22: door separation, wrong-door helper, web nav

Prior handoffs: `handoff_20261121-mvp-walk-r4.md`, `handoff_20261121-coherence-batches-3-5-close.md`. Gap-walk evidence: `docs/plans/mvp/REVIEW-FINAL-gaps.md` (untracked, not committed).

## §0 Ivan's action list

**STATUS 2026-11-22:** committed and pushed. Code: `95f7913` on `origin/main` (fast-forward from `b948806`). Handoff, state and graph commit follows.

**Decide (recommendation first)**
1. **`/about` copy.** It reuses the landing's "Why Eventar" text, no new claims. Recommend: rewrite it when the About message is settled.
2. **Input-border contrast** (`--input` #707070 dark, `--outline` #8c8c8c light). Locked palette, so your call. Recommend: apply after a before/after artifact.
3. **Server error wording** ("Could not send link right now. Try again."). If "casual" meant these, say so and Claude rewords them.
4. **Deploy** stays PAUSED. Needs your explicit go.
5. **Real sales email** for Talk to sales is still a dummy address.

**Execute (only you):** nothing blocks Claude.

**Queued for Claude**
1. `/pricing` metadata title doubles the "Eventar" suffix (`title: 'Pricing — Eventar'` plus the template).
2. Phone-width check of the door cards with the helper line and error banner (only 1024px was measured).
3. Walk gaps not run: `auditor` role, staff-side check-in writers, member publish path.
4. `staff.id` vs auth uuid vs Hard Rule 1 drift (flagged earlier, unresolved).

**Other sessions:** other sessions' `.claude/skills/*` edits and `.ledger.jsonl` files are still uncommitted and were left alone.

---

## What happened

- Ruling recorded: the landing pill is the only attendee/organiser separator. Written into `CLAUDE.md` ("Two paths, one separator"), doctrine section 1, skill `eventar-login-door-labels`, vault Q47. My earlier claim that doctrine section 1 was "overruled" was wrong; its text already agreed. The wrong reading was the 2026-11-01 gloss (`1bab723`).
- Phone bottom bar: `Events | Log in`, two equal halves (375px: 160.5px each, 9px insets), no tint, 320px padding fix. Organiser item removed from the nav everywhere; tests flipped to absence.
- Wrong-door helper: shows only after two failed submits, counted in `MagicLinkSignInForm` (`failures` state, reset on success). Parallel copy on both doors, identical markup, left-aligned. No DB lookup, no email in the line. The old DB-driven `not_organiser` line on `/login` is gone.
- Error banner moved above the field (success note stays below the button).
- Web nav at md (768px) up: How it works, Platform, About, Plan beside Upcoming events. Measured pill content 667px, so sm to md would scroll; hidden below 768px and on phone. New `/about`; `/pricing` marked active.
- Check-in confirm: `final: true` refusals disable the button and hide the hint (`ConfirmButton.test.tsx`, 3 tests).
- Gap walk: passed; three role-leak minors fixed earlier (`b948806`).

## Gates

`vitest run components app/about app/pricing app/login app/account`: 116 files, 827 tests pass. `tsc --noEmit`: 0 errors. eslint on touched paths: 0 errors, 1 old warning (`WhyEventar.tsx` img). The full `vitest run`, `next build`, `check:ui-*` were NOT re-run on the final tree.

## Gotchas

- Two new tests raced under load (button still "Sending…"); fixed with `findByRole`. Run the suites together at least twice.
- Dev compile on :3100 took 10 to 20 s per route; a blank card is not a bug.
- Frames: Next dev badge hidden by injected CSS only; banner looked 3px inset mid-animation, settled rect matched the field (337 to 687px).
- Peers share the tree: commit with explicit pathspecs; push the pinned SHA (`git push origin <sha>:main`).

## Where we're going

Next: ask Ivan the five Decide items, then the phone-width check of the door cards.

Closing: repo graph done (2026-11-22) · vault note done (/Users/ivan/Desktop/Eventar/20 — Roadmap/Door Separation + Wrong-Door Helper + Web Nav (2026-11-22).md) · vault graph done (2026-11-22)
