# Eventar: MVP walk + frontend coherence pass

## Context

The MVP spine is closed on `main` (`7ca2e7d`). Ivan wants a full two-persona walk, a copy and instruction clean-up, one coherent visual language, and a security hygiene check. No new features, nav items or settings pages. Three read-only audits (code only, nothing executed) found:

- **Silent CSS bugs:** 28 classes emit no CSS (`text-title-md`, `text-title-sm`, `text-label-lg`, `rounded-xxl`, `py-2xl`, `gap-2xl`).
- **Type:** 4 sizes dominate; about 191 hand-written `calc()` text sizes; page `<h1>` has 5 styles.
- **Structure:** `ConfirmDialog` and `Dialog` differ (radius, scrim, buttons); 5 hand-rolled menus; 3 toast recipes; about 8 inline-error recipes; shared `EmptyState` is imported nowhere; modal button order differs at 5 sites.
- **Copy:** dead ends and contradictions (list in Batch 2).
- **Security:** no confirmed IDOR; web storage holds no credentials or PII; two sign-out paths skip `lib/signOut.ts`.

## Ivan's rulings (2026-11-16, this session)

1. **Type scale:** keep `globals.css` tokens. App surfaces use 4 levels only: `body-md` 14, `label-md` 12, `title-lg` 20, `headline-lg` 39. Landing hero and scoreboard numerals are exempt.
2. **Radius:** cards and modals `rounded-[20px]` (no new token); popovers and notices `rounded-[12px]`; inputs and menu rows `rounded-lg`; buttons `rounded-full`.
3. **Apply mode:** nothing is applied until Ivan sees that batch as before and after and approves it.
4. **Skills:** `design-taste-frontend` → `emil-design-eng` → `impeccable-design-polish`, in that order. Not the five-stage pipeline. Also follow `instruction-surface-copy` and `eventar-frontend-type-radius-scale`.

## Rules for the executing session

- Local stack only: app on :3100 via `scripts/demo/dev-local.sh`, DB `127.0.0.1:54322`. Never `.env.local`, never :3000, never Supabase MCP.
- Check `ListAgents` and `git status` first. Stage only own paths. No commit and no push without Ivan's go.
- Write `GATES.md` (unlazy) in the scratchpad before Batch 1; one gate per batch outcome below.
- Unimported UI-port components are not dead code. Do not delete them.
- Do not touch `.claude/skills/` (peer-managed).

## Steps

### Step 0: live walk (read-only, about 45 min)
Use skills `eventar-live-verify-worktree` and `eventar-mvp-acceptance-walk`. Walk both personas on :3100 at desktop and 375px.
- Organiser: `/` → `/login` → `/events/new` → agenda → publish → `/events/[id]/registrations` → `/events/[id]/checkin` → `/analytics`.
- Attendee: `/` → `/events` → `/events/[id]` register → confirmation → `/checkin/confirm` → `/account/record`.
- Per step record: next action obvious in under 3 s; state named Verb + Noun; dead ends, misalignment, unclear copy. Use `rendered-alignment-measurement` for alignment claims.
- Output: walk report + baseline screenshots (the "before" set for every batch).

### Batch 1: dead classes (mechanical, about 20 min)
Replace the 28 no-CSS classes with defined tokens under ruling 1 and 2.
- `text-title-md` / `text-title-sm` → `text-title-lg` or `text-body-md` by role; `text-label-lg` → `text-label-md`.
- `rounded-xxl` → `rounded-[20px]` (`app/events/[id]/analytics/page.tsx`, `components/analytics/*Card.tsx`).
- `py-2xl` / `gap-2xl` → `xxl` (`app/invite/[token]/page.tsx:244`, `components/auth/AuthBackdropCard.tsx:59`).

### Batch 2: copy and instructions (about 2 h)
Deliver a before → after table first. Rules: Verb + Noun actions; one context sentence max; delete before rewriting. Run `ui-label-rename-sweep` after each rename.
Fix in this batch (no decision needed):
- One name for one action: "Link past registrations" replaces "Claim past events" and "Link them".
- "Registration closed" shown before opening (`RegisterCard.tsx`) and "Starts soon" ambiguity (`EventsListClient.tsx`): separate "not open yet" wording.
- Pointers to missing controls: "retry from Details" (`NeedsAttention.tsx`), "Publish to begin registration." (Event Manager draft), "Contact an admin to be added" (login).
- Leaked internals: "RESEND_API_KEY is unset…" (`EmailDeliveryStrip.tsx`), "dev mode — check the operator console" (`RegisterCard.tsx`), "Legacy WK- codes", raw status and method strings in `RecordClient.tsx`, raw zod/DB error text in `app/events/new/actions.ts`.
- Off-brand or inconsistent words: "summit", "Workshop on TDD", "organizer"/"Organized" spelling, "membership number" vs "licence", the two contradicting registration-window hints, the two export-disabled wordings.
- Long copy cut to one sentence: login trouble list, published-lock paragraph (`edit/page.tsx`), evidence-export descriptions, `PractitionerPanel`, account header copy.
- Empty states with no next action get one link (existing routes only).

### Batch 3: modal, menu, toast structure (about 2 h)
Reuse, do not invent:
- `components/ui/ConfirmDialog.tsx`: match `components/ui/Dialog.tsx` (20px radius, same scrim, `<Button>` for actions). Keep order Cancel → destructive.
- Button order secondary → destructive, right-aligned: `NewEventForm.tsx:929-944` ("Keep editing" then "Discard changes", destructive styled); `RegistrationsClient.tsx:350-357` (move to `Dialog` footer, "Cancel" then "Save changes"); `app/error.tsx`, `app/not-found.tsx`.
- `AgendaSection.tsx:411-428` "+ More" menu: copy `AccountMenu` recipe (12px radius, `p-xs`, rows `rounded-lg px-sm py-sm`, `z-30`).
- `RosterClient.tsx:339-357` and `PricingClient.tsx:68` hand-rolled toasts → shared `components/ui/toast.tsx`. The "Log in" link must not sit in an auto-dismissing toast.
- Popover shadow: `shadow-lg` everywhere (`select.tsx:86`, `StickyLiveBar.tsx:73`).

### Batch 4: type and radius (about 3 h)
- Map every text `calc()` size and every non-level token class on app surfaces to the 4 levels. Icon sizes are out of scope.
- One page `<h1>` style: `font-headline-lg text-headline-lg` (fix the 30/34/28px variants).
- Radius outliers to ruling 2 (`rounded-xl` cards in `TeamClient`, `ParticipantsClient`, `details/page.tsx`, `CpdAccreditationSection`, `MultiBodyAccreditationWizard`; 16px in `EventsHome`, `EventCard`, `checkin/page.tsx`, `analytics/page.tsx`, `app/loading.tsx`). Fix the stale comment in `components/ui/button.tsx:6-10`.
- Card shadow: `shadow-sm` on all 20px cards or none; show both, Ivan picks.
- Check contrast and wrap at 375px after size changes (memory: token value vs role).

### Batch 5: states (about 2 h)
- Empty states → existing `components/help/EmptyState.tsx` (`RegistrationRows`, `RosterClient`, survey, History, Registrations).
- Inline errors → one recipe: `rounded-lg border bg-error-container px-md py-sm` with `text-error` (the most used boxed form). Plain field-level `text-error` stays.
- `app/loading.tsx`: align to the StaffShell column and ruling 2 radii.
- Spacing one-offs on spine pages to token values (`gap-[40px]`, `-ml-[8px]`, `gap-[6px]`). Landing one-offs: show before and after, Ivan decides.

### Step 6: security hygiene (about 1 h)
- Fix: `app/login/page.tsx:223-229` and `app/invite/[token]/page.tsx:107-109` call `signOutAndLeave` from `lib/signOut.ts` (skill `eventar-auth-session-guards`).
- Verify by execution on :3100 for both personas: sign in, sign out, then read `document.cookie`, `localStorage`, `sessionStorage`; repeat after forced expiry. Expect only `eventar-theme` and `eventar-text-size`.
- IDOR: spot-check by execution 3 endpoints the audit marked OK (cross-org `updateEvent`, another attendee's `deleteMyAppointment`, cross-org `exportRegistrantsCsv`), using the `eventar-backtest-recipe`. Delete test fixtures after.
- Report the four storages + IDOR result, each marked verified-by-execution or code-read.

### Step 7: close
Static gates in sequence (`eventar-static-gates`; never `test:rls` and `next build` together). Then the three phase-completion checks: dev review agent, separate user-walk agent, backtest. `ponytail:ponytail-review`. Then handoff with the three closing steps (repo graph, vault note, vault graph).

## Needs Ivan's decision (not fixed by this plan)
1. **Re-register loop:** desk and pass copy promise re-registration; no path exists. Fixing the path is a feature. Recommend: reword both lines.
2. **Accreditation promise:** landing says listings name body and points; public event page shows neither. Recommend: reword landing; showing them is a feature.
3. **Consent copy (M1):** names Terms and Privacy pages that 404. Legal is parked.
4. **Session cookie:** not `httpOnly`, 400 days (`@supabase/ssr` defaults; the browser client must read it). CSP is report-only (`next.config.ts:42`). Recommend: enforce CSP as a separate card.
5. **Survey page shows first name from a code** (`app/(public)/survey/page.tsx:66-91`); the confirm page removed the same leak.
6. **Duplicate-email reply** on public registration confirms an email is registered.
7. **Support links:** "Ask Eventar support" and "Contact support" have no destination.
8. **Wizard has no Done** (`MultiBodyAccreditationWizard`), agenda block "Remove" has no confirm, registrant export lives only on Edit: each is behaviour, not copy.

## Deliverables
1. Walk report (both personas, friction points).
2. Copy changes, before → after.
3. Coherence changes: what was random, what is now standard.
4. Security checklist: four storages + IDOR.
5. Open decisions (list above, updated).

## Verification
- Each batch: before and after screenshots on :3100 at desktop and 375px, light and dark.
- `grep` proves zero remaining dead classes and zero off-level text classes on app surfaces.
- Gates: `tsc`, `eslint`, `check:ui-colours`, `check:ui-primitives`, `vitest run` (two known flakes in `docs/DEFERRED.md`), `next build`.
- Re-walk both personas after Batch 5; every Step 0 friction point is closed or listed under decisions.

## Status at pause (2026-11-16) — read this first when picking up

- **Step 0 done**, desktop 1280px only. 375px and dark baselines NOT captured. Walk report is in the session transcript (`~/.claude/projects/-Users-ivan-Eventar/fc07455d-f690-40a6-9163-425f9a196d6c.jsonl`), not in a repo file.
- **Batch 1 done and approved by Ivan.** 16 files, 27 lines, class swaps only, uncommitted in the working tree. Mapping used: `<th>` title-sm → `font-label-md text-label-md`; list-row title-md → `text-body-md font-semibold`; details `<h2>` → `font-title-lg text-title-lg`; panel `<h3>` label-lg → `text-body-md font-semibold`; settings link → `font-label-md text-label-md`; `rounded-xxl` → `rounded-[20px]`; `lg:gap-2xl` → `lg:gap-xxl`. Grep gate clean, eslint clean on the 16 files. **Not seen live** (no after-screenshots); tsc, vitest and build not run.
- **Batches 2 to 5, Step 6, Step 7: not started.** Ruling 3 holds: show each batch before → after and wait for Ivan's approval. Batch 2 starts with a string sweep (file:line + exact current copy) for the items listed under Batch 2.
- **Security so far (executed, desktop):** after sign-out, both personas: cookies, localStorage, sessionStorage, indexedDB, Cache API all empty; protected routes redirect to the right door. Forced-expiry check and the 3 IDOR spot-checks NOT run. IDOR by code read: none found.
- **Ivan's standing ask:** delegate mechanical work to `model: "sonnet"` agents.
- **Dev server :3100 is down**, no lock held by this session. Restart with preview config `eventar-noreview` under `scratch-demo/locks/dev-3100.lock`.
- **Local fixtures still in the local DB (delete at close, child rows first, auth users via admin API):** event `94a86294-cd48-404a-83a4-d9a123fd8c5a` (registration code `7AXVP8`, its `registration_checkins`, `event_occurrences`, `agenda_blocks`); staff `zz-walk-organiser@example.test` (staff id `2bdcbf95-148e-4271-aa2e-d4de50a617fb`); org slug `zz-walk-org`; auth users `b22f9a6a-1628-4d77-b265-95dd8735fc00` (organiser) and `59c6d35f-cd0c-413c-985b-84891c903f57` (attendee, has consent and profile rows). Audit rows stay (permanent by design).
- Nothing staged, committed or pushed. Repo-root `GATES.md` belongs to a peer; do not touch.
- **Batch 2 string sweep is DONE (read-only, not yet reviewed by the main session):** `file:line | surface | exact string` tables for all 9 items, 56 KB, at `/Users/ivan/.claude/projects/-Users-ivan-Eventar/fc07455d-f690-40a6-9163-425f9a196d6c/tool-results/toolu_01DLkzRX2mSWrV9XzperyRBn.txt`. Build the Batch 2 before → after table from it; re-check line numbers before editing.

## Status at lock (2026-11-19, Ivan: "i will provide the behavior / animation for you later. lock for now")

- **Standing rule (new):** every visual frontend change is shown as a rendered before/after BEFORE any product edit (memory `frontend-changes-show-render-first`). Copy-only changes may stay a text table.
- **Batch 1:** applied (16 files). **Batch 2:** applied (52 rows, 60 files); tsc, eslint, 1155/1156 tests (one known `PublishDraftButton` flake). Neither seen live yet.
- **Batch 3 rows 1, 2, 7, 8 APPLIED:** `ConfirmDialog` (20px, `bg-on-surface/60`, shared `Button`), discard dialog order (Keep editing, then red Discard changes), pricing toast via `useToast`, select popover `shadow-lg`. eslint, tsc, 7 test files pass.
- **Batch 3 rows 3 to 6 NOT applied, on hold for Ivan's behaviour/animation input.** Rendered and measured, approved direction: (3) edit-registration dialog: delete description and default note; locked-email note `Email can't change after check-in.`; actions row `mt-md flex justify-end gap-sm`, order Cancel then Save changes (measured 24px title to field, 24px field to buttons, 25px padding all sides); (4) error page: Home then Try again; 404: Home then Upcoming events, both `min-h-11` (404 pills were 32px vs 44px elsewhere); (5) agenda "+ More" menu to the AccountMenu recipe (`z-30 rounded-[12px]`, rows `rounded-lg px-sm py-sm`, focus ring `ring-inset` because the panel scrolls); (6) roster toast: option B, shared toast takes an optional `{label, href}` action and a toast with an action stays until dismissed.
- **Render specimen (dev-only, uncommitted):** `app/dev-preview-uiport/batch3/page.tsx`. Keep until Batch 3 closes, then delete.
- **Not started:** Batches 4 and 5, Step 6 security, Step 7 close, 375px and dark baselines, live after-renders for Batches 1 to 3.
- Dev server stopped, lock released. Local fixtures from the walk still in the local DB (list above). Nothing staged, committed or pushed.

---

## Motion pass: 10-pattern guide (added 2026-11-19, does not replace anything above)

Ivan's UI Animation and Micro-Interaction guide is the behaviour and animation input that Batch 3 rows 3 to 6 were waiting for. Order: **assess (done), then mock up, then system-wide implement**. A pattern is applied in full wherever its interaction exists. Every animated surface no-ops, or fades only, under `prefers-reduced-motion: reduce`. Pipeline stage 5 (`emilkowalski-motion`, then `review-animations`) reviews the mock-up before any product edit.

### Assessment (read-only, 2026-11-19)
- `motion@^14.6.0` and `tw-animate-css` are already installed. No source file imports `motion`. `@base-ui/react` ships `tooltip`, `drawer` and `collapsible`.
- **Overlays:** `Dialog.tsx` uses the Web Animations API (WAAPI) with `translateY(8px) scale(0.98)` at 180ms. `ConfirmDialog` has no motion. `select.tsx:86` uses `zoom-in-95` at 100ms. Seven hand-rolled menus mount with `{open && …}` and have no motion: AccountMenu, MoreKindsMenu, RecordActionsMenu, SplitActionButton, WorkspaceSwitcher, TimePicker15, VenueSearchBox.
- **Button:** `button.tsx:12` has `transition-all` plus `active:not-aria-[haspopup]:translate-y-px`. Six pills use `hover:-translate-y-px`.
- **Errors:** about 25 `<p role="alert">` banners, each focused by a ref.
- **Steps:** only `account/complete/CompleteClient.tsx`. Its `StepPanel` (:625) fades up and does not know the direction.
- **Collapsibles:** `ui/accordion.tsx`, whose `animate-accordion-*` keyframes are not defined. Native `<details>` in login, sign-in and NeedsAttention have no motion.
- **Toast:** no enter or exit motion. The events tab underline animates `left,width`. Four progress bars animate `width`.
- **Theme:** `lib/theme.ts` `applyTheme` swaps the class, so every `transition-colors` fires on toggle.
- **Missing:** no tooltip, no sheet or drawer, no overscroll handling, no global reduced-motion rule.

### Ivan's rulings (2026-11-19)
1. **Shake:** shake the error banner only, not the field.
2. **Tooltips:** add a base-ui Tooltip (delay 600, skip 300) to icon buttons that use `title=` today.
3. **Sheets:** build a draggable bottom sheet (patterns 9 and 10) for mobile menus.
4. **Pattern 6:** the underline and the four progress bars move to transforms.

### Step M1: mock-up round (dev-only, render first)
Route: `app/dev-preview-uiport/motion/page.tsx`. It imports the real `components/ui` primitives, and the frames have before/after toggles plus a replay button. For each pattern, show before and after live, with `document.getAnimations()` names and durations read back. Check it at desktop, at 375px and in dark mode.
- **Frames:**
  - Dialog and ConfirmDialog enter
  - AccountMenu enter
  - Button press
  - RegisterCard banner shake
  - CompleteClient next and back
  - FAQ accordion and login `<details>`
  - Toast in and out
  - Events tab underline
  - Scoreboard bar
  - Theme toggle
  - Icon toolbar with tooltips
  - Mobile bottom sheet with drag-dismiss and overscroll
- **Sheet surfaces:** Ivan picks which menus become sheets below 768px (candidates: AccountMenu, WorkspaceSwitcher, RecordActionsMenu, SplitActionButton). The record goes to `docs/plans/mvp/PICKS.md`.
- **Tooltip surfaces:** list each of the ~18 icon-button `title=` sites, and Ivan confirms the set.
- **Review:** run `emilkowalski-motion`, then `review-animations` on the specimen. Any disagreement goes to Ivan as 3 options, never resolved on my own.
- **Batch 3 rows 3 to 6** are rendered in the same round with their motion: the edit dialog gets pattern 1, MoreKindsMenu pattern 1, the roster toast pattern 6, and the error/404 buttons pattern 2.
- **Stop:** wait for Ivan's pick. No product edit before it.

### Step M2: system-wide implement (after the pick)
Shared pieces first, then call sites. Reuse what already exists:
1. **`app/globals.css`:**
   - **Keyframes:** `@keyframes overlay-in` (opacity 0 and `scale(.97)` to 1, 250ms, `cubic-bezier(0.32,0.72,0,1)`) and `accordion-down`/`accordion-up`. The second pair fixes the missing keyframes.
   - **Theme switch:** a `.theme-switching *{transition:none!important}` rule.
   - **Collapsibles:** `interpolate-size: allow-keywords` on `:root`, plus a `details::details-content` height transition.
   - **Reduced motion:** one global `@media (prefers-reduced-motion: reduce)` rule that sets the new animations to opacity-only or none.
2. **Pattern 1:**
   - **`Dialog.tsx`:** the WAAPI keyframes become 0.97, 250ms, with the same easing.
   - **`ConfirmDialog.tsx` and the 7 `{open&&}` menus:** add `animate-[overlay-in…]` with a `transform-origin` at the trigger corner.
   - **`select.tsx`:** move to the same values.
3. **Pattern 2:** in `button.tsx`, replace `transition-all` and `translate-y-px` with `transition-[scale,background-color,color,border-color,box-shadow] duration-150 ease-out active:not-aria-[haspopup]:scale-[.97]`. The 6 pills get the same `active:` scale and keep their hover lift.
4. **Pattern 3:** add a `shake(el)` WAAPI helper in `lib/motion/shake.ts`: x `[0,-10,10,-6,6,-3,0]`, 360ms, a no-op under reduced motion. Call it where each banner's ref is already focused: RegisterCard, NewEventForm (both errors), AuthStatusMessage, ScanAndManual and RosterClient.
5. **Pattern 4:** `CompleteClient` `StepPanel` takes a `direction` (next or back) and slides with `translate` ±100%, 350ms, `cubic-bezier(0.77,0,0.175,1)`, inside an `overflow-clip` frame.
6. **Pattern 5:** `ui/accordion.tsx` gets the keyframes from step 1. The native `<details>` get `::details-content` transitions.
7. **Pattern 6:**
   - **Toast:** enters with `translateY(100%)` to 0. It exits with a fade and translate before removal: keep the item for 200ms with `leaving: true`.
   - **Underline:** moves to `translateX` and `scaleX`.
   - **Bars:** move to `scaleX` with `origin-left`.
8. **Pattern 7:** `lib/theme.ts` `applyTheme` adds `.theme-switching` to `<html>`, forces a reflow, swaps the class, then removes it on the next `requestAnimationFrame`.
9. **Pattern 8:** a new `components/ui/tooltip.tsx` wraps base-ui `Tooltip`. Mount a `Tooltip.Provider delay={600} timeout={300}` once in `app/layout.tsx`, and swap the approved `title=` sites. Keep `aria-label` on each button.
10. **Patterns 9 and 10:** a new `components/ui/sheet.tsx` uses base-ui `Drawer` for focus trap, scrim and Escape. Its panel is a `motion.div` with `drag="y"` and `dragConstraints={{top:0,bottom:0}}`, and `dragElastic` for the rubber band past the top. On release, dismiss if `offset>40%` or `velocity>500`. Otherwise spring back with `{type:'spring',bounce:0,velocity}`. Overscroll gets `overscroll-behavior:contain` and is draggable only when `scrollTop===0`. The picked menus render `Sheet` below 768px (`matchMedia`) and the popover above it. Motion is imported only in this client file.

### Gates (write to scratchpad `GATES.md` before M2)
- **M-G1:** the specimen shows all 12 frames. `getAnimations()` reports the specified duration and easing per frame. Under reduced-motion emulation each frame is opacity-only or none.
- **M-G2:** `grep -rn "translate-y-px\|zoom-in-95\|transition-\[left" components app` returns 0 hits on the touched surfaces. `grep -rn "from 'motion" app components` returns only `components/ui/sheet.tsx`.
- **M-G3:** on :3100, a real click and a read-back pass for each of: dialog open, button press, invalid register (banner shakes once), CompleteClient back/next direction, accordion, toast, theme toggle (no colour transition fires, checked via `getAnimations()` during the switch), tooltip on hover/focus with skip delay, and sheet drag-dismiss and spring-back at 375px.
- **M-G4:** static gates in sequence (`eventar-static-gates`), with updated tests for button, ConfirmDialog, toast leaving and the theme class.
- **M-G5:** the specimen route is deleted at close, and live after-screenshots are shown to Ivan.

### Risks
- The `scale` press on `aria-haspopup` buttons stays off, as it is today.
- The theme switch must not break the FOUC script in `app/layout.tsx:28`.
- Sheet a11y: base-ui Drawer owns focus. The drag handle needs a keyboard close (Escape), and the scrim click closes.
- A toast with an action (row 6) stays until dismissed and must still animate out.

### Motion pass: LOCKED picks (2026-11-19)
Ivan approved all 9 specimen rows (patterns 1 to 10) in `app/dev-preview-uiport/motion/page.tsx`. One change, now locked: **pattern 3 shake = peak 7px, 300ms, keyframes `[0,-7,7,-4,4,0]`** (2 cycles, 6.7 Hz, 20% lower than the original 8.3 Hz). Banner only. Rows 1, 2, 4 to 9 are locked as specimened. Nothing is built into the product yet (Step M2 waits). Ivan is sending 2 more motion sets. Workflow for each: **review, then plan, then render, then apply**, in that order. Dev server :3100 stays up under lock `aeec16`.

---

## Styling pass: 10-pattern design guide (set 1 of 2, added 2026-11-19, does not replace anything above)

The order is **review (done), then plan (this section), then render, then apply**. A pattern is applied in full where its situation exists. No parallel token system: changes go in `app/globals.css` tokens or the shared `components/ui` primitive. The locked motion picks above still hold, and pattern 7 composes with them.

### Review: assessment (read-only, 2026-11-19)
- **Radius:** AccountMenu is 12px with 4px padding and 10px rows, so the rows are 2px too large. The select popup is 10px with 4px padding and 8px items, also 2px too large. Agenda cards are fine. EventsHome tiles are exact.
- **Borders:** `--border` and `--input` both alias `--outline-variant`, which is `#eaeaea` in light and `#262626` in dark (316 usages). 11 alpha borders exist already (`border-white/10` etc.).
- **Colour:** every token is hex or `rgba()`, with 0 `oklch`. Status containers are `success`, `warning`, `error` and `primary` `-container`. There are 54 hex literals in components, already logged as FDS §6 debt.
- **Gradients:** 25 lines, none `in oklch`. Mostly in `globals.css` (hero, app atmosphere, dark variants), plus 3 scoreboard radials and `AuthBackdropCard` (`color-mix(in srgb)`).
- **Icons:** Material Symbols on 186 lines, with fixed `wght 400` (`globals.css:617-636`). lucide-react on 10 lines, at the default stroke 2.
- **Scroll rows:** EventsHome filter `:322`, EventsListClient tabs `:78`, StaffShell nav `:193` and SiteShell nav `:118`. None has an edge mask.
- **Icon swaps:**
  - Fill toggles: ToggleCountButton and SaveToggleButton.
  - State icons: ScanAndManual `:185`, AccountClient `:674` and ProfileClient `:376`.
  - Accordion chevron.
- **Dark elevation:** cards, dialogs, menus and the select popup all use `#141414` in dark, so a menu sitting on a card shows no step.
- **Viewport:** 7 `min-h-screen` and 2 `md:h-screen` in the shells, `error.tsx`, `page.tsx` and the poster. `dvh` is already used in AuthShell, Dialog and ExpandableEventCard.
- **Multiply:** no logo or illustration sits on a tint, so pattern 10 has **no surface**. Skip it and revisit when sponsor logos ship.
- **Conflicts surfaced:** FDS Q32 locks hex values and contrast tables. Ruling 2 said menu rows are `rounded-lg`. G1 (Q41, light-ground swap) is decided but not built.

### Ivan's rulings (2026-11-19)
1. **OKLCH:** "no need to copy the hex / color code, I want the behaviour / logic". Do not adopt the guide's sample values. Adopt the logic:
   - (a) Hues in one set (the status containers and their inks) share one perceived lightness, measured in OKLCH.
   - (b) Gradients interpolate `in oklch`.
   - (c) Any new scale is written in OKLCH.
2. **Borders:** change the token. `--outline-variant` becomes an alpha value tuned to read the same as today on the default ground, so all 316 usages follow.
3. **Dark depth:** step within existing tokens. Page `#0a0a0a`, then card `#141414`, then menus, popovers and dialogs on `surface-container-high` `#202020`. Light mode is unchanged.
4. **Radius:** concentric overrides ruling 2. Inner radius = outer radius minus padding: menu rows become 8px (`rounded-md`) and select items 6px (`rounded-sm`). Ruling 2 is amended to read "menu rows = outer minus padding".

### Step S1: render round (dev-only, before any product edit)
Route: `app/dev-preview-uiport/styling/page.tsx`. It uses the real primitives and tokens, and each row shows before and after. Check it in light and dark, and at 1280px and 375px.
1. **Concentric:** AccountMenu and the select popup, as they are now vs outer minus padding.
2. **Alpha border:** a card, an input and a table row on white, on `primary-container` and on `warning-container`, in both themes, solid vs alpha.
3. **OKLCH matched L:** a table of each status container and ink with its measured OKLCH L, C and H. Show the current spread, then a proposed set with matched L that keeps each hue's H and C. Contrast is recomputed for every pair in both themes (FDS §5: compute, never quote). Values change only where the spread is visible. Ivan picks before any FDS edit.
4. **Gradients:** the hero, the app atmosphere and the scoreboard radial in sRGB vs `in oklch`.
5. **Icon weight:** Material Symbols `wght` matched to the adjacent text weight (400 text gets `wght 400`, 600 labels get `wght 500`, verified by eye). lucide `strokeWidth` is tuned to Geist at 14px. Show nav, button and list-row samples.
6. **Masked edges:** each of the 4 scroll rows at 375px. The fade shows only on a side that has hidden content (scroll-aware), so the first and last items are never faded when they are already in view.
7. **Blurred icon swap:** the SaveToggle fill toggle and the ScanAndManual status icon. The outgoing state goes to `opacity 0; filter blur(4px)` and the incoming state does the reverse, about 200ms, using the locked motion easing. It is opacity-only under reduced motion.
8. **Dark depth:** a card with an AccountMenu open over it, in dark, with the menu at `#141414` vs `#202020`.
9. **Dynamic viewport:** the StaffShell and the landing hero at 375px, `min-h-screen` vs `min-h-dvh`. This is shown as a note, because a desktop pane cannot reproduce mobile browser chrome.

**Review:** run `design-taste-frontend`, then `emil-design-eng`, then `impeccable-design-polish` (ruling 4) on the render. If they disagree, give Ivan 3 options. Then **stop and wait for Ivan's picks.**

### Step S2: apply (after picks)
1. **`app/globals.css`:**
   - `--outline-variant` becomes alpha in light and dark.
   - The status containers and inks are rewritten as `oklch()`, with matched L only where picked.
   - Every gradient gets `in oklch`, and `AuthBackdropCard` moves `color-mix` to `in oklch`.
   - `.material-symbols-outlined` weight follows its context: the default stays 400, and a `wght 500` variant applies inside semibold labels and buttons.
   - Add a `.scroll-fade` utility: `mask-image` driven by `data-fade-start` and `data-fade-end`.
2. **Concentric radius:**
   - AccountMenu rows become `rounded-md`.
   - The select items become `rounded-sm`.
   - The other hand-rolled menus are checked with the same rule.
3. **Dark depth:** in dark only, `--popover` and the menu/dialog surfaces move to `surface-container-high`. Use the existing `:root.dark` block, with no new token.
4. **Masked edges:** one tiny client hook, `useScrollFade(ref)`, sets the data attributes on scroll and resize. It is used on the 4 rows.
5. **Icon swap:** one shared CSS class pair, `.icon-swap-in` and `.icon-swap-out`, applied at the 2 approved swap sites.
6. **Viewport:** the 7 `min-h-screen` become `min-h-dvh`, and the 2 `md:h-screen` become `md:h-dvh`.
7. **Lucide:** `strokeWidth` is set at the 10 import sites, or once through a shared default if one exists. Check before adding one.
8. **FDS and docs:**
   - Update the FDS §1 values and contrast tables if the OKLCH matched-L values change any hex.
   - Record ruling 2's amendment in this plan, and in the vault note at handoff.

### Gates (to the scratchpad `GATES.md` before S2)
- **S-G1:** the render shows all 9 rows. The OKLCH table gives L for each container in both themes. Every contrast pair is recomputed and is ≥ 4.5:1 for text.
- **S-G2:**
  - `grep -c "oklch" app/globals.css` is above 0.
  - `grep -rn "linear-gradient\|radial-gradient" app components | grep -v "in oklch"` returns 0 hits, except `mask-image`.
  - `grep -rn "min-h-screen\|h-screen" app components` returns 0 product hits.
- **S-G3:** on :3100, in light and dark, the borders on a tinted card are visible and on white they look unchanged, checked side by side as a screenshot pair. In dark, the menu over a card measures `rgb(32,32,32)`. The scroll fade is absent on a side with no hidden content.
- **S-G4:** `check:ui-colours`, `app/globals.test.ts` and the full static gates pass in sequence.
- **S-G5:** Ivan sees the live after-screenshots. The specimen route is deleted at close.

### Risks
- Alpha `outline-variant` also feeds `--input`. Inputs on tinted grounds may lose edge contrast, so check the 3:1 non-text contrast for input borders.
- Under G1 (pending), the light page ground becomes `#F9FAFB`. Tune the alpha border so it also passes on `#F9FAFB`.
- Any pill colour change must also check `livePillBgPulse`, because FDS §2 says the animation sets `background-color`.
- Set 2 of Ivan's guides is still to come and may touch the same surfaces. Apply S2 only after both sets are planned, unless Ivan says otherwise.

---

## Typography pass: 10-rule guide (set 2 of 2, added 2026-11-19, does not replace anything above)

The order is **review (done), then plan (this section), then render, then apply**. The styling set (set 1) and the motion picks compose with this pass on the same components. Where several guides match one component, all of them apply.

### Review: assessment (read-only, 2026-11-19)
- **Bold shift:** StaffShell `:109,135`, AccountShell `:67,78`, SiteShell `:38,40` (`NAV_ACTIVE`) and CompleteClient step labels `:672` change `font-medium` to `font-semibold` when active, so the width shifts. The landing persona pill, the EventsList tabs, the EventsHome filters and the toggle are already fixed-weight, so they need no change.
- **Text-box trim:** not used anywhere. Buttons centre text with flex and fixed heights. Chips use `py-*`.
- **Underlines:** 68 `underline` uses, 15 with an offset, 0 `text-underline-offset`, and no global `a` rule.
- **`<sup>`:** none and no footnote markers, so rule 4 has **no surface**. Skip it, and add the global `sup` rule only when a footnote ships.
- **Display type:** tokens are fixed `calc(Npx*--text-scale)`, with no `clamp()`. The landing hero h1 is fixed at 44px, and EventsHome h1 at 28px (already a Batch 4 outlier).
- **Acronyms:** about 125 CPD/CME/HKCP/HKAM/AHP/FCAA, 0 `<abbr>`. Geist has no true small caps, so the browser will synthesise them.
- **Quotes:** about 89 straight apostrophes in app and components (10 in JSX text, about 79 in literals), 20 in `lib/email/*`, 25 curly already and 46 HTML entities. The Next eslint `react/no-unescaped-entities` rule is active.
- **Filenames:** `MultiFileUpload.tsx:80` and `EvidenceFileList.tsx:34` truncate at the end, so the extension is lost.
- **Hyphens:** `lang="en"` is on `<html>` and no `hyphens` is set. Where the full event description renders is still not located; find it before applying the rule.
- **Card titles:** `EventCard.tsx:73` and `EventsHome.tsx:500` have no clamp. `line-clamp` is used 2× and `truncate` 23×.

### Ivan's rulings (2026-11-19)
1. **Curly quotes:** sweep every user-facing string in `app/`, `components/` and `lib/email/`, about 109 strings. Code comments, test fixtures and identifiers stay. Tests that assert exact strings are updated in the same change. In JSX text, write the `’` character directly in place of the `&apos;` entities.
2. **Small caps:** everywhere. Every user-facing CPD, CME, HKCP, HKAM, AHP, FCAA and CE gets `<abbr>` (with `title` on first use per surface), styled `font-variant-caps: all-small-caps`. This covers labels, chips and headings too. Risk to show on the render: synthesised small caps on Geist are thinner, and chips at 12px may drop under readable size. Measure the rendered x-height before applying.
3. **Fluid type:** the hero and `headline-lg` become `clamp()`, each multiplied by `--text-scale`. headline-lg is about 28px on phones and 39px on desktop. **This amends ruling 1:** headline-lg is fluid, and the other 3 levels stay fixed.
4. **Title clamp:** event-card titles are clamped to **3 lines**.

### Step T1: render round (dev-only, before any product edit)
Route: `app/dev-preview-uiport/typography/page.tsx`. It uses the real primitives, and each row shows before and after. Check it in light and dark, and at 1280px and 375px.
1. **Reserved bold:** the StaffShell nav and the CompleteClient steps. Show the measured width shift on activate, before vs after (expect 0px after).
2. **Text-box trim:** a Button, a StatusPill and a chip. Show the measured cap-centre offset, before vs after. Mark it as progressive (supported in Chromium and Safari, Firefox falls back).
3. **Underline offset:** links holding g, y, p, q and j, without and with `0.2em`.
4. **Fluid type:** the hero and a page h1 at 375, 768 and 1280px, fixed vs clamp, with each width measured.
5. **Small caps:** a paragraph, a chip, a heading and a label, plain caps vs `<abbr>` small caps, in both themes, with the measured glyph height.
6. **Curly quotes:** a before/after table of all strings (text only, as the render-first rule allows for copy-only changes), plus the email strings.
7. **Middle truncation:** a long `Agenda_final_v3_really_final.pdf` in the MultiFileUpload and EvidenceFileList rows at 375px. The name gets an ellipsis and `.pdf` stays visible.
8. **Hyphens:** the event description in its real column at 375px, without and with `hyphens: auto`.
9. **Title clamp:** an EventCard grid with short and long titles, without a clamp vs `line-clamp-3`, with the measured card heights.

**Review:** run `design-taste-frontend`, then `emil-design-eng`, then `impeccable-design-polish` (ruling 4). If they disagree, give Ivan 3 options. Then **stop and wait for picks.**

### Step T2: apply (after picks)
1. **`app/globals.css`:**
   - **Links:** `:where(a), .underline { text-underline-offset: 0.2em }`.
   - **Small caps:** `abbr { font-variant-caps: all-small-caps; text-decoration: none }`.
   - **Hyphens:** a `.prose-hyphen { hyphens: auto }` class.
   - **Text-box trim:** inside `@supports (text-box-trim: trim-both)`, apply `text-box-trim: trim-both; text-box-edge: cap alphabetic` to the button and chip labels.
   - **Fluid type:** `--text-headline-lg` becomes `clamp(...)*var(--text-scale)`, and the hero size becomes a fluid token.
2. **Reserved bold:** add `data-text={label}` to each nav label in StaffShell, AccountShell, SiteShell and CompleteClient. Use one shared `.reserve-bold` class (inline-grid plus a hidden `::after` at weight 600, matching `font-semibold`), with `aria-hidden` on the pseudo-content via CSS only.
3. **Text-box trim:** the `button.tsx` base string and the StatusPill and chip recipes get a `[text-box:trim-both_cap_alphabetic]` utility class.
4. **Middle truncation:** split the name into base and extension in `MultiFileUpload` and `EvidenceFileList` (`min-w-0 truncate` on the base, `shrink-0` on the extension). The full name stays in `title` and the accessible name.
5. **Hyphens:** `prose-hyphen` on the event description and on the long help or policy paragraphs.
6. **Title clamp:** `line-clamp-3` on `EventCard` and the EventsHome card titles. The link's accessible name stays the full title.
7. **Small caps:** a tiny `<Abbr>` helper, or plain `<abbr>`, wraps the acronyms. Run the sweep with `ui-label-rename-sweep`-style grep proof.
8. **Curly quotes:** the sweep covers string literals and JSX text in app, components and lib/email. Update the snapshot and string tests.

### Gates (to the scratchpad `GATES.md` before T2)
- **T-G1:** the render shows 9 rows with measured numbers: bold shift 0px after, clamp widths at 3 sizes, card heights equal per row.
- **T-G2:** `grep -rnE "[A-Za-z]'[a-z]" app components lib/email --include=*.tsx --include=*.ts` returns 0 user-facing hits (comments, tests and code excluded, list attached).
- **T-G3:** `grep -c "<abbr" -r app components` is at least the acronym count found. Every remaining bare acronym on a surface is listed and justified.
- **T-G4:** on :3100, at 375px and 1280px, toggling an active nav item shifts no sibling, `scrollWidth === innerWidth`, the filename row shows `.pdf`, and the event-card heights are equal per row.
- **T-G5:** the static gates pass in sequence, and the email tests pass with the curly strings.

### Risks
- **Small caps on 12px chips** may read as roughly 9px glyphs. Measure it, and flag it on the render if it is under the legible floor.
- **headline-lg clamp** changes every page `<h1>`, so wrapping at 375px must be re-checked (memory: token value vs role).
- **Curly quotes** break any test or code that matches strings exactly, including e2e selectors. Grep the tests for each changed string.
- **The three sets overlap** on Button, nav, chips and cards. Apply them in one ordered pass (motion, then styling, then typography) per component to avoid repeated edits.

---

## Combined execution order (all three guides, after picks)
1. Render rounds: S1 (styling) and T1 (typography). Motion M1 is already locked.
2. Ivan picks S1 and T1.
3. Apply M2, then S2, then T2, one component layer at a time: globals.css tokens, then `components/ui`, then the shells, then the call sites.
4. Run Batch 3 rows 3 to 6 inside this pass, since they share Dialog, menus and toast.
5. Batches 4 and 5, Step 6 and Step 7 continue as planned. Batch 4's type and radius mapping now uses the amended rulings: headline-lg is fluid, and menu rows are concentric.
