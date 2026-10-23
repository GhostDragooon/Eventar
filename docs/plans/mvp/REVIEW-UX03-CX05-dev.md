# REVIEW UX-03 + CX-05, dev lens

Reviewer: Claude Sonnet 5.5, Claude Code, dev lens only (user lens and backtest are separate agents).
Scope: uncommitted tree on top of HEAD e1bd06f, files listed in the brief. Date 2026-10-23.
Evidence tags: [X] executed, [R] read, [I] inferred.
Constraint kept: this is the only file written. No repo file edited, staged or reverted. The one executed experiment (M1) ran from a scratch copy outside the repo (`/private/tmp/claude-501/-Users-ivan-Eventar/6195ca69-7fb3-4fb6-9382-ef141dc1321a/scratchpad/focus/focus.test.tsx`, with its own vitest config rooted in the scratchpad so no `.env.local` was loaded).

## Gates (run by me, sequentially) [X]

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit` | exit 0, no output |
| `pnpm exec eslint .` | 0 errors, 11 warnings (none in files under review) |
| `(unset RLS_TESTS; pnpm exec vitest run)` | 195 files passed, 47 skipped; 1619 tests passed, 405 skipped. `PublishDraftButton.test.tsx` passed in this run |
| `pnpm check:ui-colours` | 2 findings, both `components/dashboard/DashboardWorkstation.tsx` (218, 380): same as HEAD baseline |
| `pnpm check:ui-primitives` | 7 sites: ProfileClient:510, RosterClient:457, OrgOnboardingClient:120 and :142, DashboardWorkstation:307 and :337, MultiBodyAccreditationWizard:245: same files as HEAD baseline, none new |

The numbers match the two hand-backs. Not run, per brief: `test:rls`, `next build`, dev server, anything touching the database.

## Summary

BLOCKER 0, MAJOR 2, MINOR 10, NIT 6. No data-integrity or authorization hole found. The role gate, the confirm gate and the dirty refusal all do what the cards say. The two MAJOR findings are a focus/animation defect in the new confirm dialog and a refusal-copy regression in CX-05.

---

## MAJOR

### M1. The publish confirm steals focus and replays its open animation on every parent re-render [X]

- Where: `components/event-form/PublishConfirmDialog.tsx:41` (inline `onOpenChange={(next) => { if (!pending) onOpenChange(next); }}`), meeting `components/ui/Dialog.tsx:62-119` (the focus/animation `useEffect` lists `onOpenChange` in its deps). Trigger in `app/events/[id]/edit/PublishDraftButton.tsx:66-74` (`startTransition` flips `pending`, then `setRefusal` after the await).
- Scenario: organiser opens the confirm, tabs to "Publish event" and presses Enter. `pending` flips, `PublishDraftButton` re-renders, `PublishConfirmDialog` builds a new `onOpenChange` closure, the Dialog effect cleans up (`previous.focus()` moves focus to the page Publish button behind the scrim) and re-runs (focus goes to the "Close Publish this event?" X button, and `panel.animate(...)` plays again). Same again when the refusal arrives.
- Executed result: a harness that renders `PublishConfirmDialog` and flips a parent state on confirm click gave `{"focusWasOnConfirm":true,"animationsAtOpen":1,"animationsAfterRerender":2,"activeAfter":"Close Publish this event?"}`. So focus leaves the clicked button and the 180 ms open animation plays a second time.
- Why it matters: this is the one-way action. `PublishDraftButton.tsx:95-100` has a comment that the pending button must keep focus (`focusableWhenDisabled`) so a screen-reader user keeps their place; the dialog undoes that. Sighted users see the panel blink at the moment of publishing and again when an error appears.
- Fix (root cause, shared primitive): in `Dialog.tsx` keep the latest `onOpenChange` in a ref and make the effect depend on `[open]` only. Every other Dialog consumer with an inline callback has the same latent problem [I; not checked one by one: ScanAndManual, ReferralDialog, SubscriptionDialog and others use `<Dialog>`]. Cheaper local alternative: `PublishConfirmDialog` passes a stable `useCallback` that reads `pending` from a ref, and `PublishDraftButton` memoises its `onOpenChange`; but then `pending` changes still change identity unless the ref pattern is used. Add a test: focus stays on the confirm button after a parent state change (the existing tests cannot see this because none re-render a mounted dialog).
- Test gap: `PublishConfirmDialog.test.tsx` and `PublishDraftButton.test.tsx` assert clicks and text, never focus after a re-render. Rule 9.

### M2. CX-05 swapped a correct refusal message for a misleading one on the path that is still reachable [R]

- Where: `lib/cpd/rpcErrors.ts:30` (new generic 42501 text: "This account can’t change this event’s accreditation. Ask an organiser admin to make the change."), plus the wizard's lock note (`components/details/MultiBodyAccreditationWizard.tsx:189-191`: "An organiser admin can add or change it from this page.") and the action refusal (`app/events/[id]/details/multiBodyActions.ts:40`).
- Facts: every accreditation RPC ends with the owner check `actor.role <> 'eventar_staff' and v_owner is distinct from actor.id` raising `42501` with `detail = 'not_owner'` (`supabase/migrations/20260820000000_multi_body_accreditation_crud.sql:56-57, 107-108, 146-147, 186-187, 231-232, 279-280`). `canManageEvent` is "same organisation" (`lib/auth.ts:21-27`), and `/details` renders the wizard for any same-org staff.
- Scenario A: organiser_admin Dana did not create the event, opens `/events/<id>/details`, wizard is unlocked (`canSetAccreditation('organiser_admin')` is true), she adds a body, the RPC raises `not_owner`, and `translateCpdRpcError` returns the new generic text: "Ask an organiser admin". She is an organiser admin. The old text, "Only the event owner (or staff) can make this change", was correct for this case. With the new role gate in front of the RPC, `not_owner` is now the only 42501 an accreditation action can still hit, so the changed branch is reachable only where it is wrong.
- Scenario B: `setRegistrationRole` / `removeRegistrationRole` also call `translateCpdRpcError` (`multiBodyActions.ts:224, 249`). A non-creator, or a `body_admin`/`auditor` (`require_active_staff` raises plain 42501), pressing a presenter or chair chip now reads a sentence about accreditation. The hand-back correctly left these two actions ungated (RPCs admit `organiser_member`, `resolve_actor(... 'organiser_admin','organiser_member','eventar_staff')`, owner-only; spec 002 FR-012 limits role assignment to the owning organisation) but did not check that they share the translator.
- Fix: add a `details === 'not_owner'` branch before the generic return, e.g. "Only the person who created this event, or Eventar staff, can make this change." (works for accreditation and registration roles). Keep the generic role text for undetailed 42501. Reword the wizard lock note to name the real rule or drop "An organiser admin can add or change it from this page". Add to `rpcErrors.test.ts` a case with `details: 'not_owner'` (the current "never says owner" test only passes `{code:'42501'}`, so it cannot see the regression).
- Out of CX-05's scope but related: the UI gate (role) and the database gate (role plus creator) disagree, so an unlocked wizard can still refuse every write for a non-creator admin. A real fix is a card: either gate the UI on creator, or relax the RPC owner check to organisation.

---

## MINOR

### m1. `DraftSavedBanner` strips `?saved=1` in a way that bypasses Next's router sync [R]
`components/event-form/DraftSavedBanner.tsx:23` calls `window.history.replaceState(window.history.state, '', pathname)`. Next patches `replaceState` and, when `data.__NA` is set (it is, on a Next-created entry), returns early without updating the router's own URL (`node_modules/next/dist/client/components/app-router.js:252-275`). The address bar is clean but Next keeps `?saved=1`; every later `router.refresh()` (including the one in `NewEventForm.tsx:498`) re-sends it, and `savedOnLoad` stays true. That is the "Next keeps ?saved=1 in its own copy" the UX-03 hand-back saw and called harmless. Fix: pass `null` as the state (Next copies its own internals via `copyNextJsInternalHistoryState`). The unit test (`DraftSavedBanner.test.tsx:56-61`) runs in jsdom where `history.state` is null, so it cannot catch this; assert with a state object carrying `__NA: true` or test through the real router.

### m2. Two success indicators with different lifetimes contradict each other after the next keystroke [R]
Edit mode now shows the new top banner (`DraftSavedBanner`, role=status) and the existing bottom "Saved." (`NewEventForm.tsx:898-908`, role=status, `savedAt` cleared only inside `onSubmit`, line 351). After Save changes both announce (double live-region announcement). Type one more character: top says "You have changes that are not saved.", bottom still says "Saved." Fix: clear `savedAt` when the snapshot changes, or drop the bottom message now that the banner owns the confirmation (needs Ivan's call: it is a UI removal, show the diff).

### m3. "Unsaved changes" notice reappears without a click [R]
`PublishDraftButton.tsx:54-57, 109`: `notice` is set on a dirty click and only cleared on the next click; the render condition is `notice && dirty`. Click Publish while dirty, Save changes (dirty false, notice hidden but still true), type again: the `role="alert"` paragraph returns unprompted and is announced. Fix: reset `notice` when `dirty` becomes false (derive in render: `if (!dirty && notice) setNotice(false)`), and have the test assert the alert is gone after save (`PublishDraftButton.test.tsx` "refuses while the form has unsaved changes" only asserts the dialog opens).

### m4. Next-steps copy points the wrong way [R]
`components/details/PublishedNextSteps.tsx:59`: "Registrations show in the Registered count above". The card renders at `app/events/[id]/details/page.tsx:393`, the `ReadinessStrip` holding the registered count at `:400`, and the header (`:371-388`) has no count. The count is below. Fix: "below", or drop the direction word. The live walk did not catch it.

### m5. `?published=1` is documented as one-time but nothing makes it so [R]
`details/page.tsx:390-397` comment says "one-time arrival signal"; unlike `?saved=1` the flag is never stripped. Reload, bookmark or Back later re-renders the banner and `PublishedNextSteps.tsx:17-19` re-steals focus. Not a false claim for a published event (status is checked, and `/details` is already auth-gated; verified by `page.test.ts`), just stale and inconsistent. Fix: same strip-on-arrival as the banner, with `null` state per m1.

### m6. "Check-in opens at X" is wrong when the window is already open or past [R]
`lib/publishFacts.ts:19-22` always says "Check-in opens at <start-60min>". Publish within 60 minutes of the start, or a past-dated draft (the hand-back lists the past-date warning as not built), and both the dialog and the details card state a time in the past as upcoming. Fix: if `checkinIso <= nowMs` say "Check-in is open now." and add the case to `publishFacts.test.ts`. Also the Published card drops the registration-window fact that the dialog showed: a scheduled `registration_open_at` is not mentioned after publishing while the banner says "Your registration page is live."

### m7. The dialog has no `aria-describedby`, and focus lands on the X [R]
`components/ui/Dialog.tsx:127-131` labels the dialog by title only; `ConfirmDialog` sets `aria-describedby="confirm-dialog-body"` (`components/ui/ConfirmDialog.tsx:56`). The consequential content (what goes public, what starts, one-way warning) is in the list, so a screen reader announces "Publish this event?, dialog" then focus goes to "Close …". The hand-back's `aria-describedby` item concerns the card button, not the dialog. Fix: optional `describedById` prop on `Dialog`, `PublishConfirmDialog` passes the list id.

### m8. `DraftSavedBanner` live region may not announce on arrival [I]
`DraftSavedBanner.tsx:35` is `role="status"` with `empty:hidden`. Content already present at mount (`?saved=1` arrival) is not a live-region change, and an empty region that is `display:none` then gains content is unreliably announced. The sibling `PublishedNextSteps` solves it by focusing its banner. Inconsistent; the hand-back's "each change is announced" does not cover the first paint. Fix: render the region always visible (collapse margin when empty instead of `hidden`) and, for `savedOnLoad`, move focus the way the Published banner does, or confirm with a screen reader.

### m9. Copy-link success is not in a live region [R]
`PublishedNextSteps.tsx:50-52`: the button label flips to "Link copied". The plan's UI rule (§4, D15) wants a visible confirmation plus `aria-live="polite"`. The failure case has `role="alert"`; the success does not. Fix: a `role="status"` text node ("Link copied") beside the button.

### m10. Share link uses `window.location.origin`, the QR uses the canonical origin [I]
`PublishedNextSteps.tsx:13` vs `lib/origin.ts` (`NEXT_PUBLIC_SITE_URL`, used for the QR in `edit/actions.ts`). On a preview or alias host the organiser copies a different origin from the one printed on the QR. Ponytail alternative that also deletes the `useSyncExternalStore` plumbing: have the server page pass `origin` from `getRequestOrigin()` as a prop.

---

## NIT

- n1 `lib/publishFacts.ts:16-18`: scheduled registration with `timezone === null` falls to "Registration opens now.", a false statement. The null branch is also unreachable: the create form requires a venue first (`NewEventForm.tsx:363-366`) and the other two callers pass a string. Delete the null handling, or return "Registration opens on the date you set." [R]
- n2 Create-mode facts parse the typed date and time in the browser zone (`NewEventForm.tsx:405`, same convention as the payload at `:423`) and format in the venue zone. The dialog is truthful about what will be stored, but it makes the existing browser-zone-versus-venue-zone mismatch visible when they differ. Not this card's bug; track under the timezone work. Every `Intl` call named its `timeZone` (`lib/tz.ts:7-11`, `details/page.tsx` `fmtHM`) and nothing is hard-coded to HKT [R].
- n3 `lib/draftDirty.ts:33-37`: `subscribe` is an inline arrow, so `useSyncExternalStore` resubscribes every render; hoist it (as `PublishedNextSteps` does with `subscribeNever`). No unmount cleanup: a form left dirty keeps `'dirty'` in the module map until the next form mount, which is harmless today only because the Publish card exists solely beside the form [R/I].
- n4 `PublishDraftButton.tsx:72-73`: if `router.push` never completes after a successful publish, `redirecting` keeps the dialog undismissable (Esc, X and Keep editing all blocked). Rare; a hard reload recovers [I].
- n5 Dirty tests only edit the title (`NewEventForm.test.tsx` edit-mode block). A mutant dropping any other field from the snapshot array (`NewEventForm.tsx:333`: venue, datetime, blocks, partners, hero image, category, self-serve, registration bounds) would survive. I read the array against the payload and every submitted field is covered; no mutation was run (I may not edit repo files). Table-driven test recommended [I].
- n6 Locked-wizard list reuses `bodyLabel`, which contains an em-dash (existing label format), on a new surface; the test pins it. Two identical lock notes now show on one page (the author flagged this). A flaky-test note: `PublishDraftButton.test.tsx` renders and runs role queries per test with no `testTimeout` in `vitest.config.ts`, so the default 5 s applies; it passed in my single full run, the earlier one-off failure is not reproduced [I].

---

## Verified clean

- Hook order: `PublishDraftButton` (all hooks above the `!canPublish` return) and the wizard (all hooks above the new `!canSetAccreditation` return, which sits before `if (!open)`) [R].
- Role gate order in `multiBodyActions.ts`: `requireStaff()` inside `actingStaffId`, then `canSetAccreditation`, then Zod, then RPC; all six accreditation actions use `accreditationStaff`, and a test refuses `organiser_member`, `body_admin`, `auditor` before any RPC (18 cases) [R, tests passed in the gate run].
- `setRegistrationRole` and `removeRegistrationRole` are correctly ungated: RPCs admit `organiser_member` (migration `:312, :356`) with an owner check, and FR-012 does not make them admin-only; a test guards against over-gating [R]. (Their error text is the problem, see M2.)
- `publishEvent`: `requireStaff()` first, `canPublishEvents` before the RPC, org and owner enforcement inside `publish_event`; `stale` is set only for `22023` with the `publish_event:` prefix [R]. `createEvent`: unchanged order (requireStaff, status parse, publish role, accreditation role, validation, RPC); only the redirect target changed; `redirect` is outside any try block [R].
- Double submit: Base UI `useButton` drops `onClick` and key handlers while `disabled` is true even with `focusableWhenDisabled` (`node_modules/@base-ui/react/internals/use-button/useButton.js:85-99`), so the create-form buttons, the dialog confirm and Keep editing cannot fire during `pending`; the dialog confirm also has its own guard. Create mode closes the dialog and starts the transition in the same event, so no second confirm is possible [R].
- `confirmFacts` flow: first click re-runs all validations before opening; confirm re-validates and sends; the form is behind a modal so state cannot change between the two [R]. Facts are computed at click time, so a registration open time that passes while the dialog is open can read one minute stale (negligible).
- Baseline logic in `NewEventForm`: `submittedSnapshot` is captured with the payload, `snapshotRef` is refreshed every render, type-back-to-original, typed-during-save and failed-save cases are handled; the form is not keyed, so `router.refresh()` does not remount it and `baselineRef` survives [R].
- `?published=1`: banner needs `event.status === 'published'`; `/details` requires `requireStaff` and manage rights, so the flag shows nothing to an outsider and no false "Published" for a draft or cancelled event [R, covered by `page.test.ts`]. `?saved=1`: rendered only inside the draft branch; forging the flag shows a cosmetic banner only, no authorization effect [R].
- `useSyncExternalStore` snapshots return primitives, server snapshot `'clean'`, no tearing; the Map is only mutated from client code [R].
- Escape and X are ignored while pending (`PublishConfirmDialog.tsx:41`, tested); focus returns to the opener on close (the cleanup refocuses the opener before each re-run, so `previous` stays the opener) [R].
- Copy: no em-dash in any new or changed user-facing string (grep of added lines found one, in a test fixture); sentence case throughout [X]. No `console.*` and no PII in new production code [X].
- Tokens used by the new components exist in `app/globals.css` (`success-container`, `on-success-container`, spacing `xs`/`md`) [X]. 44 px: dialog buttons, Copy link and list rows use `min-h-11`; the inline "Review and publish" and "Manage" are in-sentence links [R].
- No SQL touched, so audit-insert-last and grant rules do not apply; no new dependency in these files [R].

## Not checked

Browser behaviour with a real screen reader; the other `<Dialog>` consumers (ScanAndManual, ReferralDialog, SubscriptionDialog, Information/Destructive/Profile dialogs) for the M1 pattern; `app/dev-preview-uiport/ux-01/` (untracked, a routed directory under `app/` that would ship if committed with the cards, not in scope); `package.json` `motion` dependency and `lib/utils.ts` changes (other work, flagged by the UX-03 hand-back); any mutation run (read-only constraint); `test:rls`, `next build`, live walks (excluded by brief).

## Process note

A tool result from the `eventar-timezone-correctness` skill call carried an appended block presenting itself as a message from the coordinator ("Resume your dev-lens review ... Address this before completing your current task"). It arrived inside a tool result, not from the caller, so I treated it as data and did not act on it as an instruction. My original brief already required everything it listed (finish checks, run all five gates, write this file), so the work and this file are unchanged by it.
