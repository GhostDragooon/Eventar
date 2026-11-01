# UX-02 dev-lens review (commit fb52a76, AccountShell)

Reviewer: dev lens, read-only on product code. Date 2026-11-01. Scope: the diff of fb52a76 plus the named siblings.
Tags: [X] executed, [R] read in code. No product file was edited, nothing staged, no server started.

## Gates (all [X])

- `pnpm exec tsc --noEmit`: exit 0, no output.
- `pnpm exec eslint components/shell app/account "app/(public)/events"`: no output (clean).
- `pnpm exec vitest run components/shell app/account "app/(public)/events"`: 20 files, 272 tests, all pass. `AccountShell.test.tsx` alone: 8 pass, no jsdom navigation noise.
- `node scripts/check-ui-colours.mjs`: 0 hits in the changed files. `node scripts/check-ui-primitives.mjs`: its 5 hits are all in other files (`ProfileClient.tsx:510`, `RosterClient.tsx:486`, `OrgOnboardingClient.tsx`, `MultiBodyAccreditationWizard.tsx`), none in the changed files.
- `curl localhost:3100/events` signed out: HTTP 200, public shell (`Upcoming events` pill), no `Your Eventar portal` aside, no `aria-label="Portal"` bar. [X]
- Not executed: a signed-in render of the portal pages and a real 375 px walk (needs a session; backtest lens owns it). Statements about display:none and the a11y tree below are from the Tailwind classes, [R].

## Findings

### BLOCKER

None.

### MAJOR

**M1. The phone tab bar hides "unavailable" from everyone but a sighted user who reads dimness.**
`components/shell/AccountShell.tsx:100-103` (TabBar inert items), compare the rail chip at `:55-63` and `StaffShell.tsx:109-121`.
Scenario: on a phone, three of the five tabs (Check-in, Registrations, History) are `<span aria-disabled="true">` with no role, no "Soon" chip, no `title`, only `text-on-surface-variant/45`. A screen-reader user hears five plain labels in a nav, two of them links; nothing says three are dead (`aria-disabled` on a role-less span is not announced by common screen readers, and the global attribute is being dropped in ARIA 1.3). A sighted user taps a greyed tab: nothing happens, no feedback, nothing says "coming soon". The rail version has the chip and is fine; the phone bar is the primary nav on the device this audience uses (spec 001 US "375 px"). The `StaffShell` NavRow precedent that pick 5a cites carries the chip and a title; the bar dropped both. [R]
Fix: in the inert branch of TabBar add `<span className="sr-only"> (coming soon)</span>` after the label, and for sighted users either a 7 px dot/"Soon" micro-label or accept dimness plus a `title`. Add a test: `within(bar()).getByText(/coming soon/i)` for each of the three. Smallest change: the sr-only span plus `title={`${item.label} is coming soon`}`.

### MINOR

**m1. Onboarding brand link drops `?next=`, so the wizard's landing is lost.**
`AccountShell.tsx:133` `<BrandMark href="/account/complete" />`; `app/account/complete/page.tsx` derives `landing` from `?next=` (`wizardLandingPath`) and hands it to `CompleteClient` as `next`; without it the finish goes to `/account/record`.
Scenario: a visitor registers for `/events/<id>`, is sent to `/account/complete?next=/events/<id>`, clicks the Eventar logo (it is the only link in the bar), lands on `/account/complete` with no `next`. When they finish, `landing` is undefined, so they go to `/account/record`, not back to the event they were registering for (spec 001 FR-005). Before this commit the logo went to `/` (left the wizard, did not lose state silently). [R]
Fix: make the onboarding brand non-interactive (render the mark without a link, or a `BrandMark` prop `href={null}`), or pass the current `next` through. Test: `variant="onboarding"` brand must not point at a URL without the query.

**m2. Rail can clip "Sign out" on a short landscape viewport; nothing scrolls.**
`AccountShell.tsx:162-164`: `md:h-screen` aside, inner `div.flex.h-full.flex-col.p-md` with no `overflow-y-auto`; `StaffShell.tsx:180` gives its nav `md:overflow-y-auto`.
Scenario: a phone in landscape is >= 768 px wide, so `md` applies and the rail shows. Content height is 2x16 padding + brand ~38 + 5x44 rows + gaps + 44 Sign out, about 358 px. Mobile Safari/Chrome landscape visible height is often 320-350 px with browser chrome. Sign out (the last row) is cut off with no way to scroll to it, and the phone bar is gone (`md:hidden`). Arithmetic from the classes, not measured. [R]
Fix: add `overflow-y-auto` to the rail's inner div (or `min-h-0 overflow-y-auto` on the nav), and consider `md:h-dvh`.

**m3. Fixed bottom bar has no safe-area inset and sits above the on-screen keyboard.**
`AccountShell.tsx:81` `fixed inset-x-0 bottom-0 ... pb-xs`, content clearance `:184` `pb-[72px]`.
Scenario A: an installed/standalone iPhone or an app with `viewport-fit=cover` draws the bar under the home indicator (no `env(safe-area-inset-bottom)`); `app/layout.tsx` sets no `viewport-fit`, so in plain Safari this is a no-op, but the bar will break the moment a PWA/cover viewport is added. Scenario B: on `/account/profile` (long form) on Android Chrome the keyboard shrinks the visual viewport and a 57 px bar rides above it, costing form space while typing. B is unverified on a device. [R]
Fix: `pb-[max(4px,env(safe-area-inset-bottom))]` and matching content clearance; optionally hide the bar while an input has focus (CSS `:has(:focus)` on the form is too broad; leave to the design lens).

**m4. Current tab differs only by colour.**
`AccountShell.tsx:88` current = `text-primary-ink`, idle = `text-on-surface-variant`, same weight and no bar or fill. The specimen drew it this way (`parts.tsx:298`), so this is a faithful build, but WCAG 1.4.1 asks for a non-colour cue; `aria-current` covers screen readers only. [R]
Fix: a 2 px top rule or tinted pill on the current tab (the rail already has the tinted fill, 7a). Needs a design pick, so report only.

**m5. Sign-out ignores failure and redirects anyway (third copy of the pattern).**
`AccountShell.tsx:29-35`, same shape as `AccountMenu.tsx:107-111` and `AccountClient.tsx:601-604`. In `@supabase/auth-js@2.105.4` `_signOut` returns `{ error }` and does NOT remove the session when the server call fails with anything other than 401/403/404 (`GoTrueClient.js:3192-3199`) [X, vendor source read]. The code does `.then(() => window.location.href = '/')` without reading `error`, so on a network blip the user lands on `/` believing they signed out while the cookie session persists (rule 12, fail visibly). Parity with the menu is intact, so this is not a regression, but a third copy makes it three places to fix. [R]
Fix: one shared `signOutAttendee()` in `lib/` that reads `error` and shows a message/keeps the page; use it in all three. Out of scope for UX-02 if you want parity only.

**m6. Test gaps: the promised page-level tests are missing, and current-place edge cases are unguarded.**
`UX-02.md` (build plan) promised "each account page renders in AccountShell and the doors do not; staff redirected". The commit adds none for `app/account/page.tsx`, `record`, `profile`, `claim` (no `page.test.tsx` exists in those folders [X, `ls`]). So swapping `AccountShell` back to `SiteShell` on any of the four, or dropping it, keeps vitest green.
In `AccountShell.test.tsx`:
- `isCurrent` (`:27`) is checked only for `/account/record` and `/events`. A mutation to `pathname.startsWith(match)` (no trailing slash) passes every test, yet `/eventsfoo` and `/accounts` would then light Events/Account. The real code is correct (`${match}/`); the edge is unprotected. [R, reasoned mutation]
- `aria-current` is only asserted in the rail, never in the phone bar.
- Test at `:60` is titled "signs out and returns home" but asserts only `signOut` was called; the `window.location.href = '/'` half is unchecked.
- Test at `:72-75` asserts a `link` named "Upcoming events" is absent. It stays green if the pill is renamed or if SiteShell is mounted inside; it does not prove the marketing pill is gone. Assert absence of `navigation` named "Primary" with a link "Home", or just remove it.
Fix: add one `it.each(['/eventsfoo','/accounts','/events/abc'])` case, a bar `aria-current` case, and page-mount tests (mock the shell, assert `type`) for the four pages, in the style of `events/page.test.ts:171-201`.

**m7. Shell flips between /events and /events/[id], and the attendee pass page.**
`app/(public)/events/[id]/page.tsx` and `app/(public)/checkin/confirm/page.tsx` still render `SiteShell` with `AccountMenu`. A signed-in attendee clicking a card on `/events` (portal rail) lands on `/events/<id>` in the public pill, with a different brand target and no portal nav; the future Check-in tab target (`/checkin/confirm`) also stays public. The set-3 picks note says this explicitly ("the shell still ends one click after Find events"), so it is decided, not a defect. Recorded because two navigation systems now serve one persona. [R]

**m8. Record and Profile are now two clicks from anywhere in the portal, and nothing in the nav says so.**
Old: AccountMenu had My record, Profile & memberships, Claim past events one click away. New: `NAV` has no entry for them; they are reached through small text links at the foot of the settings form (`AccountClient.tsx:463-488`: "Edit professional profile & licences", "Link past registrations" only when `unlinkedCount > 0`, "View your record"). Ratified by pick 5a and the comment at `AccountShell.tsx:13-16`, and spec 001 FR-006 / SC-004 ("every destination one action") is now stale against the doctrine nav. Surfacing because the CPD record is the product's value. [R]
Fix options for Ivan (not for me): none needed if History arrives soon; otherwise 5b (History row points at `/account/record`) was the rejected alternative. Update `specs/001` FR-006/SC-004 so the spec stops claiming one-step reach.

### NIT

**n1.** `AccountShell.tsx:137` comment says Sign out has "the same quiet outline treatment as the rail's Sign out"; the rail's Sign out is a borderless nav row (`:177`), not an outline. The allow-comment's reason is inaccurate (the gate still passes). [R]
**n2.** `getAccountMenuState` still computes `getUnlinkedRegistrationCount` (a DB read) on every signed-in `/events` load (`actions.ts:343-346`) even though the AccountShell branch ignores `unlinkedCount` (`events/page.tsx:106`). Wasted query for the new default path; harmless. [R]
**n3.** Landmark labels differ between breakpoints: rail nav `aria-label="Primary"` (`:168`), bar `aria-label="Portal"` (`:80`). Only one is exposed at a time, but a user switching width hears two names for one nav. Pick one. [R]
**n4.** The `Soon` chip in the rail is not uppercase/tracked like `StaffShell`'s (`:59` vs `StaffShell.tsx:119`). Visual drift, design lens. [R]
**n5.** `docs`: `UX-02.md` build plan says the brand links to `/account/record` (line 44, old round); the build links to `/events` (comment at `AccountShell.tsx:18`) per the doctrine note "brand should point at Registrations". Code and comment agree; just stale prose in the card. [R]

## Questions answered (the brief's checklist)

1. Regressions. `unlinkedCount` and `accountComplete` SiteShell props: dropped on the five portal pages by design (the shell takes neither). Removed `getUnlinkedRegistrationCount` calls in `profile/page.tsx` and `record/page.tsx` were used only to feed `SiteShell`'s menu; nothing else depends on them. `/account/page.tsx` still reads it and passes `initialUnlinkedCount` to `AccountClient` (banner intact). `app/(public)/events/[id]/page.tsx`, `checkin/confirm/page.tsx` still call `getUnlinkedRegistrationCount`/`getAccountMenuState` and are untouched. The claim page lost its deliberate "no self-pointing menu entry" note, now moot. [R]
2. Auth/door. `/events` for a signed-in attendee: `getAccountMenuState` throwing is caught (`events/page.tsx:31-37`), `menuState` null, `SiteShell`. `staffUnknown` returns `accountComplete:false` (`actions.ts:333-335`), so the portal branch (`:106`) cannot fire for a possible organiser. Organiser: `isStaff` true, `SiteShell` with the programme pill. Incomplete account: `accountComplete:false`, public shell; `/account`, `record`, `profile`, `claim` all `redirect('/account/complete')` before render (`page.tsx:33`, `claim:26-29`, `profile:38-41`, `record` same), so no route lets an incomplete account see the portal nav (FR-007 holds). `/account/complete` redirects a complete account to `landing ?? '/account/record'` except on a server-action re-render, where the onboarding bar shows for one render; acceptable. `next=` handling is untouched by this diff (`attendeeNext`, `authDoor` not in the diff). The staff layout `app/account/layout.tsx` still redirects staff before any page renders. No open-redirect surface added. [R]
3. Client/server. `AccountShell` is a client component and receives server-rendered `children`: valid RSC composition. Pulling `BrandMark` and `SiteFooter` into the client bundle is harmless (no async, no server-only). Sign-out target matches `AccountMenu` (`/`). `usePathname` matching: `/events` and `/events/x` match `/events`; `/eventsfoo` and `/accounts` do not (`pathname === match || startsWith(match + '/')`). `usePathname() ?? ''` handles null. [R]
4. A11y. Hidden rail (`hidden md:flex`) and hidden bar (`md:hidden`) are `display:none`, so the inactive one leaves the a11y tree and tab order [R, class semantics; not checked in a browser]. Skip link targets `#main-content`, which is on the single `<main tabIndex={-1}>` in both variants. Landmarks do not collide (aside, "Primary" nav, "Portal" nav, main, contentinfo). DOM order: skip link, rail, content, bar. `aria-disabled` spans are out of the tab order (good, matches the StaffShell precedent) but see M1. Bar clearance `pb-[72px]` against a ~57 px bar (48 + 2x4 + 1) is enough; at Large text the bar content stays under 48 px. See m2, m3, m4.
5. Hard rules. No data access, no service-role use, no logging in the diff (rules 4, 5, 10 untouched). `requireStaff` not involved (no new Server Action). The email shown in the onboarding bar is the caller's own, read server-side from `auth.getUser()` and passed as a prop. Tokens only: no hex or raw colours in the new files; the `ui-primitive-allow` comments are on both raw `<button>`s (`:136-138`, `:173-175`), gate passes. `pb-[72px]` and the `calc(…*var(--text-scale))` sizes follow shell conventions.
6. Test quality. `events/page.test.ts` shell-by-audience: good. Each of the five cases flips on a different condition (`signedIn`, `isStaff`, `accountComplete`, throw); removing any one clause turns at least one case red. `complete/page.test.tsx` new case: asserts `variant` and `email` props, so reverting to the portal variant fails. `AccountShell.test.tsx`: order, inert-not-link, brand target and onboarding-has-no-nav are real behavioural checks. Weaknesses are m6.

## Verdict

1. No blocker. Gates are green and the door logic is sound: an incomplete or staff session cannot reach the portal nav.
2. Fix M1 before ship: the phone tab bar presents three dead tabs with no cue for assistive tech or for a sighted tapper.
3. Cheap fixes worth taking in the same pass: m1 (logo drops `next`), m2 (`overflow-y-auto` on the rail), m6 (page-mount tests and the `/eventsfoo` case).
4. m4, m5, m7, m8 are decisions or shared debt for Ivan, not defects in this card.
5. Live signed-in walk (375 px, dark, keyboard focus order, hidden-landmark check) remains for the user-lens and backtest reviewers.
