# Handoff 2026-11-20: coherence pass S2/T2/M2 applied, mobile sheets, one shared nav, trimmed auth pages, hero pill fixed

Prior handoff: `handoff_20261119-coherence-ui-guides.md` (parent; it planned the three guides and built none of them). Plan file: `docs/plans/2026-11-19-coherence-and-ui-guides-plan.md`.

## §0 Ivan's action list

**STATUS 2026-11-21 (phase closed locally):** committed as `139d904` (133 files), NOT pushed. Rulings made: landing anchors off; landing reads the session server-side (`/` dynamic); toast `action` kept; header icon-only brand at 375px; `/login` wrong-door copy + Sign up link; "Organisers" keeps a name containing its visible text; step names kept for screen readers; `.tap-44` hit areas; `/events` footer self-link removed. Phase checks done: dev-lens and user-lens reviews (reports `review-coherence-dev-20261120.md`, `review-coherence-user-20261120.md`; no blockers, 3 majors fixed), backtest with a real signed-in attendee on :3100 (user deleted), gates tsc 0 / eslint 0 errors / `next build` ok / vitest 126 files 907 tests / `test:rls` green. The Decide items 1 to 3 and 6 below are settled; the list under them is the original handoff and is kept for history.
**Now Ivan decides:** push `139d904` (give the go naming the SHA); which unapplied review minors to do (Register-disabled reason, inline bad-email message, `/login` tab title, landing Organiser-mode inconsistencies, event hero band height, tab-row clip at 375px).
**Still unverified:** sheet swipe-down dismiss, toast enter/exit, StepPanel slide timing, reduced motion behaviour, 1280px and dark baselines. Dev specimen routes under `app/dev-preview-uiport/` untracked, not deleted. Load-flaky tests (`MagicLinkSignInForm`, four RLS tests under full parallel vitest) are not yet in `docs/DEFERRED.md`.

**Decide (recommendation first)**
1. **DECIDED 2026-11-20 (Ivan): short "Organisers" label below `sm`, full "Organiser log in" from `sm` up; done in `SiteNav.tsx` (aria-label keeps the full name). Still to measure at 375 and 640px.** Original question: how does a phone visitor reach `/login`? The shared header hides "Organiser log in" below `sm` (640px) so it fits. Today a phone visitor has no path to the organiser door. Options:
   - **A (recommend): show "Organisers" (short label) at all widths.** One word, fits at 375px, keeps the door in the header. Cost: a second pill-like item in a tight bar; measure at 375.
   - **B: footer link "Organiser log in" on every public page.** Zero header cost; slower to find. Cost: footer is below the fold on long pages.
   - **C: show the full "Organiser log in" at all widths.** Cost: overflows at 375px beside the Log in pill and brand mark (measured clip at 640 before the hide).
   Skill `eventar-login-door-labels` says to ask you before the sign-up footer link goes, so nothing was removed.
2. **Landing lost its in-page nav anchors and "Start an Event".** The shared `SiteNav` has no "How it works / Platform / For organisers" anchors. The old landing nav did. Recommend: leave them off (one nav on every page was your ask; the hero already carries the organiser CTA pair). Say if you want anchors back as a landing-only second row.
3. **Signed-in visitor on the landing page sees "Organiser log in" for a moment.** The landing does not know the session until hydration. Recommend: accept (flash is ~100 ms, only on `/`), or pass `signedIn` from the server page. Say which.
4. **Push the local commits?** `2772610` (and this session's work, uncommitted) is not on `origin/main` (`8505306`). Recommend: commit this session as one group after you look at it live, then push by SHA. Give the go naming the SHA.
5. **Eight walk copy decisions, M1 consent copy, vitest flake debt, F1 window gate, deploy PAUSED:** unchanged from `PROJECT_STATE.md` "Waiting on Ivan".
6. **Unused `action` option on the toast** (link button inside a toast). No product caller yet. Ponytail says delete it. Recommend: keep until the roster toast migration (Queued item 3) uses it, delete if that is dropped.
7. **Dark mode on public pages:** they stay light, with no toggle (locked rule: white ground, dark is a toggle only, no toggle exists on public shells). Not changed. Say if you want a toggle.

**Execute (only you)**
- Open `/` , `/events`, `/account/sign-in`, `/account/sign-up`, `/login` at 375px and 1280px on the :3100 server and look at the header, the hero pill and the four menus (sheet on phone). You have seen the renders in chat; you have not touched them.

**Queued for Claude**
1. Live-verify what was never observed: shake (banner on error), StepPanel direction slide, toast enter and exit, sheet swipe-down dismiss, reduced-motion behaviour, event page at 1280px, 375px and dark baselines.
2. 640px landing overflow: the HowItWorks row overflows sideways at 640 (pre-existing, found while measuring the header). Fix and re-measure.
3. Migrate the roster toast (`app/events/[id]/checkin/RosterClient.tsx`) to the shared toast with an `action`, or delete the unused `action`.
4. Tap targets: register form inputs and button are 32px, event category tabs 41px, header and footer links 17 to 39px. Disabled "Register" button gives no reason (skill `disabled-control-explains-why`). "Invalid email" is terse. Show before and after first.
5. Progress bars (scaleX): `rounded-full` distorts at low fill. Needs a render and a pick.
6. Delete dev specimen routes at close: `app/dev-preview-uiport/{styling,typography,motion,batch3}`. Untracked and permanent until deleted; not deleted because Ivan may still want them.
7. Batches 4 and 5, Step 6 security, Step 7 close (full gates, dev review, user review, backtest), walk fixture cleanup.
8. `/sign-up` returns 404; the real path is `/account/sign-up`. Add a redirect only if Ivan wants it (not requested).

**Other sessions**
- Peer RAG session idle at last check. Its files stay unstaged: `.claude/skills/`, `docs/plans/.claude`, `graphify-out/` scratch, repo-root `GATES.md` (an old MVP-close working file, not this session's).
- Run `ListAgents` and `git status` before staging anything. Stage only your own paths.

---

## Goal

Finish the frontend coherence pass Ivan started 2026-11-19. This session had three layers of ask.

1. **Apply the approved guides**: styling (S2), typography (T2), motion (M2), layer by layer, with Batch 3 rows 3 to 6 inside them.
2. **Mobile menus** (Ivan, "all four"): AccountMenu, WorkspaceSwitcher, RecordActionsMenu, SplitActionButton become bottom sheets below 768px.
3. **New asks 2026-11-20:**
   - Login and sign-up pages carry too much instruction text.
   - No circular site paths.
   - One consistent top nav on every page.
   - Fix the "Attendee / Organiser" pill in the landing hero (the sliding thumb "in the middle is off").
4. Ivan's process instruction: "will go ahead stop stopping m8". Do not pause for confirmation on approved work.

## Where We Are

### Done and gate-verified this session

| Area | State | Evidence |
|---|---|---|
| Styling S2 (ink tokens, alpha `--outline-variant`, `--popover` dark, concentric menu radius) | applied | `app/globals.test.ts` dark parity passes |
| Typography T2 (`--text-hero`, fluid `headline-lg`, curly quotes, `<abbr>` semantic only) | applied | tsc 0, vitest |
| Motion M2 (overlay-in, accordion, shake, scaleX bars, icon swap 0.8 + blur 4px 200ms, toast enter/leave) | applied | not observed live (see Not verified) |
| Four menus as bottom sheets <768px | applied | tried live earlier in session |
| One shared nav `components/shell/SiteNav.tsx` | applied | gates, tests |
| Auth pages trimmed, in-card cross-door links removed | applied | tests updated |
| Hero Attendee/Organiser pill thumb | fixed | measured |

### Last gate runs (local stack only)

- `tsc --noEmit` 0 errors at the end of the session.
- `eslint` 0 errors.
- `check:ui-primitives`: 4 hits in 3 files, **all four verified on HEAD** (pre-existing, untouched). One new hit at `AgendaSection.tsx:418` was fixed by restoring the `// ui-primitive-allow:` comment.
- `check:ui-colours` pass.
- Vitest: affected files pass. One flake appeared once and passed on rerun. Known `PublishDraftButton` and `EventsHome` flakes remain in `docs/DEFERRED.md`.
- `next build` ran earlier and again after the final edits: OK.
- `test:rls` ran earlier (passed, before the final UI-only edits, which do not touch the DB). Run order was `next build` first, then `test:rls`, never together (memory: heavy gates sequential).

### Not verified

- Shake on error, StepPanel direction slide, toast enter and exit, sheet swipe-down dismiss, reduced-motion: written to spec, not observed in a browser.
- 640px landing overflow: seen, not fixed.
- Dark baselines and 375px baselines for every page: never captured.
- The phase-completion protocol (dev review agent, separate user-lens review agent, backtest) has NOT been run on the whole phase. Reviews ran on the sheet and on S2/T2 earlier and their findings were fixed. No mutation surface was touched, so backtest is mostly UI.

## What We Tried

### Chronological

1. **Picks recorded first (AskUserQuestion):**
   - Small caps: **semantic only** (`<abbr>` + `title`, no `small-caps` CSS). Rejected: visual small-caps.
   - Icon swap: **keep scale 0.8 with blur(4px), 200ms**.
   - Select popup outer radius: **12px**, concentric rows.
   - Tooltips: skip swaps, **disabled reasons shown as visible text** (not tooltips).
   - Menus: **all four** are sheets below 768px.
2. **Styling and typography application:** ink hex retunes, `--outline-variant` alpha, `--popover` dark = `surface-container-high`. Vault `Frontend Design Standard.md` got the new ink hexes, recomputed ratios and an "Update 2026-11-20" section.
3. **Motion application:** `app/globals.css` M2 block (overlay-in, accordion keyframes, `.theme-switching`, `interpolate-size`, details-content, reduced-motion). Shake in RegisterCard, NewEventForm, AuthStatusMessage, ScanAndManual (`lib/motion/shake.ts`). Progress bars to `scaleX` (Scoreboard, LiveScoreboard, RegistrationSection, DateTimeSection). Seven pills got `transition-[translate,scale] active:scale-[.97]`.
4. **Sheet:** built on base-ui 1.4.1 Drawer. Swipe-down dismiss is built in; no `motion` import in product code (only the dev specimen imports it).
5. **Navigation:** an agent built `SiteNav.tsx`; `SiteShell`, `PublicShell`, `LandingNav` all render it.
6. **Auth trim:** white card in `SiteShell`, one sentence, one toggle line.
7. **Hero pill:** thumb rebuilt (see Key Decisions).

### Failed approaches and bugs (most expensive to rediscover)

| Symptom | Cause | Fix |
|---|---|---|
| Hydration mismatch on `/events` and dev pages | stale dev server after restructure | restart the server; not a code bug |
| "All" tab unreachable at 375px | pre-existing `justify-center` on a scroller clips the left overflow | `justify-center-safe` (CSS `safe center`) |
| Scroll-fade desktop opt-out ignored | unlayered CSS beats `@layer utilities` | wrap `.reserve-bold/.prose-hyphen/.scroll-fade/.icon-swap` in `@layer components` |
| Toast with action link never went away | link click did not dismiss | `onClick={() => onDismiss(t.id)}` on the `Link` |
| Two vitest failures after Batch 3 row 3 | tests asserted the removed audit-trail copy | tests updated |
| `check:ui-primitives` new hit | edit dropped an allow-comment on a menuitem button | restored `// ui-primitive-allow:` |
| `sed -i` with `?:` | macOS sed | redone with python |
| color.ts OKLab junk term, eslint set-state-in-effect, jsdom ResizeObserver, `text-hero` not registered in `lib/utils` | earlier session | all fixed |
| One vitest flake | known debt | passed on rerun |
| Review agent refused by hook | missing `Budget:` line in dispatch | add it |
| Browser navigate denied when run in parallel | pane permission | retry alone |

## Key Decisions

1. **Hero pill thumb** (`components/landing/LandingHero.tsx:119-123`): `aud-thumb absolute inset-y-[3px] left-[3px] z-0 w-[calc(50%-3px)] rounded-full bg-primary`, with `transform: translateX(100%)` for organiser. Why: the old thumb had no left inset on the second position, so the slice looked off-centre. Rule: thumb is inset 3px on top, bottom and left; width is half minus 3px. `translateX(100%)` moves by its own width, which lands it 3px short of the right edge, matching the left gap because the container has a 1px border.
2. **Shared nav** (`SiteNav.tsx`): BrandMark | Upcoming events (label "Events" on narrow) | Organiser log in (hidden below `sm`; omitted when `signedIn` or `loginHref` set) | Log in pill / AccountMenu / StaffProgrammePill. No "Home" item. The current-page item renders as `<span aria-current="page">`, not a link, so no path points at itself (this is the "no circular path" rule).
3. **Auth pages:** no eyebrow, no guest paragraph, no expiry sentence, no cross-door link inside the card (skill `eventar-login-door-labels` rewritten by a peer to match). `AuthBackdropCard.tsx` and `ControlledAccessNotice.tsx` are now unused and untouched (see Open Questions).
4. **Bottom sheet:** `max-h-[85dvh]`, `rounded-t-[20px]`, backdrop `bg-on-surface/60`, 250ms `cubic-bezier(0.32,0.72,0,1)`, `data-[starting-style]:translate-y-full`, `translate-y-[var(--drawer-swipe-movement-y,0px)]`, `motion-reduce` none, safe-area bottom padding. `useIsMobile` is `useSyncExternalStore` on `(max-width: 767.98px)`, false on the server and in jsdom so there is no hydration mismatch. `aria-haspopup` is `dialog` on mobile, `menu` or `listbox` on desktop.
5. **Tailwind v4 layering rule:** helper classes that must be overridable by utilities go inside `@layer components`. Unlayered CSS beats `@layer utilities`.
6. **Tabs underline** uses `scaleX/translateX` (compositor only) on a `w-px` element, `origin-left`, rather than animating `left/width`.
7. **Toast:** enter `translateY(100%)`, 200ms leave, optional `action {label, href}`; a toast with an action stays until dismissed.
8. **404 page:** Home first, buttons `min-h-11`. `error.tsx` same shape.
9. **EditRegistration dialog (Batch 3 row 3):** note "Email can't change after check-in." replaces the audit-trail description; footer order Cancel then Save. The removed audit sentence was approved for deletion by Ivan in Batch 3.
10. **Dark token parity:** every new token has a dark value; `app/globals.test.ts` fails if one is missing.

### Rejected alternatives

- Visual small caps (CSS). Rejected by Ivan: semantic only.
- Tooltips for disabled controls. Rejected: show the reason as text.
- A separate landing nav with anchors. Rejected implicitly by "one consistent nav".
- `framer-motion` / `motion` in product code for the sheet. Rejected: base-ui Drawer has swipe built in; zero extra bundle.

## Evidence & Data

### Files changed (grouped; tracked modified ~125 files in app/components/lib/emails/docs/supabase/tests; 1039 insertions, 1001 deletions at last count)

**New (untracked):**
- `components/shell/SiteNav.tsx`
- `components/ui/Sheet.tsx`
- `lib/useIsMobile.ts`
- `lib/useScrollFade.ts`
- `lib/motion/shake.ts`
- dev specimens `app/dev-preview-uiport/{styling,typography}/` (motion and batch3 exist from the prior session)
- repo-root `GATES.md` is an old MVP-close file, not mine

**Menus:** `components/ui/AccountMenu.tsx`, `components/navigation/WorkspaceSwitcher.tsx`, `components/actions/RecordActionsMenu.tsx`, `components/actions/SplitActionButton.tsx` (each: `useIsMobile`, hoisted `menu`, popover with `animate-overlay-in` and origin class on desktop, `Sheet` on mobile). AccountMenu pill has `active:scale-[.97]`.

**CSS:** `app/globals.css` (M2 block, layered helpers, `--text-hero`, fluid `headline-lg`, alpha `--outline-variant`, ink retunes, `animate-overlay-in` theme animation).

**Landing and public:** `components/landing/LandingHero.tsx`, `LandingNav` (renders `SiteNav`), `app/(public)/events/EventsListClient.tsx` (tablist `justify-center-safe`, scaleX underline, `useScrollFade`), `components/shell/SiteShell.tsx`, `PublicShell`, `app/not-found.tsx`, `app/pricing/page.tsx` (both lost `active="home"`), `app/error.tsx`.

**Auth:** `app/login/page.tsx`, `app/account/sign-in/page.tsx`, `app/account/sign-up/page.tsx`, `components/auth/MagicLinkSignInForm.tsx` and their tests.

**Organiser surfaces:** `app/events/[id]/registrations/RegistrationsClient.tsx` (+test: role-lock visible note, edit dialog row 3), `app/events/[id]/details/page.tsx` ("Analytics (after the event)"), `app/events/[id]/checkin/RosterClient.tsx` (title removed, shake), `components/event-form/AgendaSection.tsx` (MoreKindsMenu z-30, `rounded-[12px]`, rows `rounded-lg px-sm py-sm`, focus ring-inset, overlay-in).

**Shake wired:** RegisterCard, NewEventForm, AuthStatusMessage (now `'use client'`), ScanAndManual. **StepPanel direction slide:** CompleteClient. **ScaleX bars:** Scoreboard, LiveScoreboard, RegistrationSection, DateTimeSection. **Overlay motion:** ConfirmDialog, `select.tsx`, VenueSearchBox.

**Vault:** `30 — Reference/Frontend Design Standard.md` (ink hexes, ratios, "Update 2026-11-20").

### Git state at handoff

- Local HEAD `2772610` (not pushed). `origin/main` is `8505306`.
- This session's edits are uncommitted in the working tree. About 135 changed paths show in `git status -s` outside `.claude/skills` and `graphify-out`.
- Nothing staged by this session. No commit, no push.

### Working files

- Scratchpad `GATES.md`: `/private/tmp/claude-501/-Users-ivan--claude-spares-spare-jDNwMw/c685a4c0-d568-4bfa-9c48-a0e3b5ce770e/scratchpad/GATES.md` (M2 gates, all met except the live-observed ones).
- Scratchpad `headcheck/`: a HEAD copy used to prove the 4 `check:ui-primitives` hits pre-exist.
- Session transcript: `/Users/ivan/.claude/projects/-Users-ivan-Eventar/c685a4c0-d568-4bfa-9c48-a0e3b5ce770e.jsonl`.

## Measurements worth keeping

| What | Value |
|---|---|
| Sheet backdrop | `bg-on-surface/60` |
| Sheet radius, max height | 20px top corners, 85dvh |
| Sheet motion | 250ms, `cubic-bezier(0.32,0.72,0,1)` |
| Menu breakpoint | below 768px (`max-width: 767.98px`) |
| Header "Organiser log in" visible from | `sm` = 640px |
| Select popup radius | 12px outer; rows concentric (outer minus padding) |
| Icon swap | scale 0.8, blur 4px, 200ms |
| Shake | 7px, 300ms, keyframes `[0,-7,7,-4,4,0]`, banner only |
| Toast | enter 250ms, leave 200ms, auto-dismiss 4500ms unless it has an action |
| Register inputs and button | 32px tall (below 44px target) |
| Event category tabs | 41px tall |
| Header and footer link heights | 17 to 39px |
| Pill thumb | inset 3px top, bottom, left; width `calc(50% - 3px)` |
| Landing overflow | 640px, HowItWorks row, pre-existing |

## Contrast and tokens

- Brand blue is a highlight, not a ground (memory `eventar-white-ground-color-as-highlight`).
- `text-on-primary`, never `text-white` on `--primary` (dark mode: 7.59:1 vs 2.23:1).
- New ink hexes and recomputed ratios live in vault `Frontend Design Standard.md` "Update 2026-11-20". Do not recompute from memory.
- `--popover` dark = `surface-container-high`. Dark menus and dialogs step up one container level.

## User Feedback & Preferences

- "will go ahead stop stopping m8": stop asking between approved steps. Ask only for real forks.
- "show me" means render it in chat first (widget or screenshot), then act. Memory `frontend-changes-show-render-first`.
- Login and sign-up pages: far too much text. Less is the rule; one sentence, one toggle line.
- "make sure no site path is circular": a link must never point at the page you are on.
- "ensure the top nav is consistent across all pages": one nav component.
- Before and after for any visual change; give diagnosis, evidence and cost with each option (CLAUDE.md standing rule 2026-10-14).
- 3 or more options when skills or agents disagree (standing rule 2026-08-04).
- Explanations in STE (short, active, one idea per sentence).
- Never push without an explicit go naming the SHA. Push is per session (memory `push-go-does-not-carry-across-sessions`).

## Where We're Going

**Next session, in order:**

1. Read `PROJECT_STATE.md` and this file's §0. Run `git status`, `ListAgents`, and check ports with `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200) '`.
2. Start the local app on :3100 (`scripts/demo/dev-local.sh`). Never :3000 (Seoul).
3. Get Ivan's rulings on §0 Decide 1 to 3 (phone path to `/login` first).
4. Live-verify the unobserved motion list (Queued 1), with screenshots at 375 and 1280 and in dark.
5. Fix the 640px landing overflow and re-measure (skill `rendered-alignment-measurement`).
6. Show before and after for tap targets, then apply.
7. Batches 4 and 5, Step 6 (security), Step 7 close: full static gates sequentially (`tsc`, `eslint`, `vitest`, then `next build`, then `test:rls`), dev-lens review agent, a separate user-lens review agent, backtest. Delete the four dev specimen routes at the close. Then commit as groups and ask for the push go.

**Time estimates:** items 4 to 5 about 45 minutes; item 6 about 30; Batches 4 and 5 are unscoped here (read the plan file first).

## Risks

- **Nothing committed.** About 135 paths of work sit in the tree. A peer session editing shared files can overwrite or entangle. Commit around peer-staged files with a temp `GIT_INDEX_FILE` (memory `commit-around-peer-staged-files`); verify the tree is clean of your paths afterwards.
- **Hydration:** `useIsMobile` is false on first render, so mobile users see the desktop popover markup for one frame before the sheet. The popover only mounts on open, so users do not see it, but test an open-on-load case.
- **Landing audience state** lives in `AudienceExperience`; any change to the pill must keep `aria-selected` and the thumb transform in step.
- **`SiteNav` is now load-bearing for three shells.** Any change to it changes every public page. The skill `eventar-login-door-labels` lists the label and link rules; tests anchor role names and assert hrefs.
- **Public pages have no dark toggle**, so a dark user sees light pages while the staff shell goes dark. Locked rule, not a bug.
- **Phase-completion protocol not run** for the whole phase. Do not claim the phase done until it is.
- **Specimen routes are untracked.** Production 404s them (`app/dev-preview-uiport/layout.tsx`), but they ship in the tree until deleted.

## Open Questions

1. Phone path to `/login` (§0 Decide 1).
2. Anchors on the landing (§0 Decide 2).
3. Delete or reuse `AuthBackdropCard.tsx` and `ControlledAccessNotice.tsx`? Both now unused. Do not delete: the unimported UI-port library is deliberate (memory `eventar-ui-port-library-not-dead`). Propose a replacement, never a deletion.
4. Should `/sign-up` redirect to `/account/sign-up`? Not asked for.
5. Does the toast `action` stay?
6. Are the progress bars acceptable at low fill (`rounded-full` plus `scaleX` distortion)? Needs a render.

## Quick Start

```bash
cd /Users/ivan/Eventar
git status -s | grep -v -E '(\.claude/skills|graphify-out)' | head -40
supabase status
scripts/demo/dev-local.sh        # app on :3100, local stack only
pnpm exec tsc --noEmit
pnpm exec vitest run components/shell components/ui app/login app/account
```

Key files to open first:

- `components/shell/SiteNav.tsx` (the one nav)
- `components/ui/Sheet.tsx` and `lib/useIsMobile.ts` (mobile menus)
- `components/landing/LandingHero.tsx:114-149` (the pill)
- `app/globals.css` (M2 block, `@layer components` helpers)
- `docs/plans/2026-11-19-coherence-and-ui-guides-plan.md` (status sections)

Skills that apply on resume: `eventar-login-door-labels` (nav and auth), `rendered-alignment-measurement` (overflow, tap targets), `disabled-control-explains-why` (register button), `eventar-frontend-detail-patterns`, `frontend-consistency-sweep`.

## Component notes (what the next editor must not break)

- **`Sheet.tsx`**: props are `open, onOpenChange, title, children, className`. The title is `sr-only`; callers pass an accessible name, not a visible heading. The popup uses `overscroll-contain` so a scrolled menu list does not drag the page. Bottom padding is `max(0.5rem, env(safe-area-inset-bottom))`.
- **`useIsMobile`**: returns false on the server and in jsdom. Tests that need the sheet path must mock `matchMedia` to match `(max-width: 767.98px)`. Tests without the mock always see the desktop popover.
- **`AccountMenu`**: the trigger pill keeps `active:scale-[.97]`. The menu body is hoisted into one `menu` node reused by both branches, so item order and labels cannot drift between phone and desktop.
- **`WorkspaceSwitcher`**: `aria-haspopup` is `listbox` on desktop, `dialog` on mobile. Keep the role in sync if you change the item markup.
- **`RecordActionsMenu` and `SplitActionButton`**: same pattern. The split button's primary action stays outside the sheet; only the caret opens it.
- **`SiteNav`**: `active` prop names the current item; that item renders as a non-link span with `aria-current="page"`. Do not add `Home`. `loginHref` swaps the Log in pill target and hides the separate organiser link.
- **`LandingHero`**: the `<h1>` is `text-hero font-bold text-on-surface`. Duplicate class strings were removed. `min-h` on the sub-copy reserves three lines so the CTAs do not jump when the audience toggles.
- **`EventsListClient`**: `tabRefs` and `listRef` feed one measured indicator. It re-measures on `cat` change and window resize, not on font load. If a web font swaps late, the underline can sit a few px off until the next resize.
- **`toast.tsx`**: `ToastItem` mounts hidden, flips `entered` in a `requestAnimationFrame`, and leaves with `leaving`. `TOAST_MS` 4500, `LEAVE_MS` 200. The list keeps the last 3 plus the new one.
- **`globals.css`**: `.theme-switching` suppresses transitions during a theme flip. `interpolate-size` is set so `details` can animate height. Reduced-motion rules sit at the end of the M2 block and must stay last.

## Review findings already fixed this session

| Review | Finding | Fix |
|---|---|---|
| Dev lens on Sheet | hydration risk from matchMedia on first render | `useSyncExternalStore` with a `false` server snapshot |
| Dev lens | toast action link left the toast on screen | dismiss on click |
| User lens on menus | popover and sheet had different item order risk | single hoisted `menu` node |
| User lens on tabs | "All" tab unreachable at 375px | `justify-center-safe` |
| User lens on scroll fade | desktop opt-out ignored | `@layer components` wrap |
| Primitives gate | missing allow-comment on a menuitem | restored |
| Tests | two asserted removed copy | updated |

Findings NOT fixed (listed in §0 and Queued): tap targets, disabled-button reason, terse "Invalid email", 640px overflow, progress-bar distortion.

## Memory notes that apply to the next session

- `frontend-changes-show-render-first`: render before any visual change.
- `eventar-theme-live-verification-recipe`: on :3100 set `eventar-theme` in localStorage and read the CSS variables.
- `browser-pane-hidden-wake` and `browser-pane-frozen-animation-timeline`: a hidden pane returns empty reads, and a timeline stuck at 0 fakes colours. Finish transitions before measuring.
- `eventar-heavy-gates-sequential`: never run `test:rls` and `next build` together.
- `eventar-peer-sessions-contend-local-stack`: check `ListAgents` before blaming a `test:rls` failure.
- `eventar-ui-port-library-not-dead`: unimported UI-port components are deliberate.

## Graph state

Repo graph and vault graph were refreshed as the last step of this handoff; see the closing line for dates. The repo graph refresh is a code-only AST merge: changed docs get no semantic pass and stay out of the manifest. See `eventar-graph-refresh` step 6.

Closing: repo graph done (2026-11-21) · vault note done (/Users/ivan/Desktop/Eventar/20 — Roadmap/Frontend Coherence — M2, Nav, Auth (2026-11-20).md) · vault graph done (2026-11-21)
