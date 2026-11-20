# Dev-lens review: coherence pass (uncommitted diff + 2772610), 2026-11-20

Scope: `git diff HEAD` over app/, components/, lib/, emails/, tests/ (126 files) plus 2772610. Peer paths excluded.
Legend: **[RUN]** = verified by executing something. **[READ]** = rests on reading code or vendor source.

## Gates [RUN]

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit` | exit 0, no errors |
| `pnpm exec eslint .` | exit 0; 0 errors, 11 warnings (2 `no-img-element`, 5 unused `eslint-disable` in lib/devEmailStub*, rest pre-existing) |
| `pnpm exec vitest run components "app/(public)" app/account app/login` | 125 files, 905 tests passed, exit 0 |

`next build` and `test:rls` not run (per instructions).

## BLOCKER

None.

## MAJOR

### M1. /login wrong-door message names controls that no longer exist
- **Where:** `components/auth/auth-error-messages.ts:15-17` (`ORGANISER_WRONG_DOOR`), `app/login/page.tsx:23-34` and `:131-136`.
- **Evidence [READ]:** /login moved from `AuthBackdropCard door="organiser"` to `SiteShell active="organiser"`. `AuthBackdropCard` was the component that drew the "Attendee log in" and "Sign up" links (`AuthBackdropCard.tsx:40`). The page body also lost its "Attendee sign up" link. `grep "Attendee log in"` now matches only the unused `AuthBackdropCard` and the message itself. The comment at line 15 ("The door page carries the Attendee log in and Sign up links next to it") is now false.
- **Failure scenario:** proxy.ts sends a practitioner to `/login?error=not_authorized`. The page tells them to "use Attendee log in or Sign up instead". Neither label is on the page. The only way to the attendee door is the nav pill, which says "Log in". Q47's two doors are still reachable, but the error copy points at nothing.
- **Options (show Ivan before applying):**
  1. Change the copy to the current labels: "...use Log in at the top, or Sign up." Add a `Sign up` link to /account/sign-up under the error. Cost: one string and one link. Tests in `auth-error-messages.test.ts` need updating.
  2. Put back a single line under the /login form: "Attend events? Log in or Sign up." This was removed in this pass. Cost: it reverses part of the copy cut Ivan approved.
  3. Keep the copy, and give the nav pill the label "Attendee log in" on /login only. Cost: the nav item set drifts per page, which is what SiteNav was built to stop.

### M2. Below `sm`, the onboarding step list is empty to screen readers
- **Where:** `app/account/complete/CompleteClient.tsx:689-695`.
- **Evidence [READ]:** the label span is now `hidden sm:inline`, which is `display:none` below 640px. A completed step's dot holds only an `aria-hidden` check icon. Below sm, AT reads "Progress, list, 4 items": item 1 is empty, item 2 is "2, current step", items 3 and 4 are "3" and "4". `aria-current="step"` still sits on the dot, so the current step is announced. Done steps and step names are not. The visible "Step N of 4: Label" line is outside the list.
- **Fix options:**
  1. Recommended: use `sr-only sm:not-sr-only` on the label span instead of `hidden sm:inline`. Phones look the same, and AT gets all four names. Optionally add `aria-hidden` to the "Step N of 4" `<p>` to avoid a double read. Cost: one class swap.
  2. Leave the list as it is and add `aria-live="polite"` to the "Step N of 4" line. Cost: done steps still read as empty items.
  3. Add a visually-hidden "completed" to each done dot. Cost: more markup, and the step names are still missing.

### M3. Phone "Organisers" link fails WCAG 2.5.3 Label in Name (Level A)
- **Where:** `components/shell/SiteNav.tsx:90-96`.
- **Evidence [READ]:** below sm the visible text is "Organisers", but `aria-label="Organiser log in"` overrides it. The accessible name does not contain the visible word "Organisers". A voice-control user who says "click Organisers" may get no match. On the active `<span>` (line 90), `aria-label` sits on a generic element. ARIA 1.2 prohibits that, and AT ignores it.
- **Options:**
  1. Change the short visible label to "Organiser". "Organiser log in" contains it, so the aria-label can stay. Cost: one character, but it changes a label Ivan decided on today.
  2. Drop the aria-label and add `<span className="sr-only"> log in</span>` after "Organisers". The name becomes "Organisers log in". Cost: slightly odd wording for AT.
  3. Keep the aria-label but make it "Organisers log in". Cost: the desktop name is no longer exactly the visible "Organiser log in".
  In every option, remove `aria-label` from the active `<span>`.

## MINOR

- **m1. LandingNav's client-island branch is unreachable in production** (`components/landing/LandingNav.tsx:15-17, 32`) [READ]. `app/page.tsx` always passes a boolean `signedIn`, so `<LandingAuthPill />` never renders from `/`. Only `LandingNav.test.tsx:62-68` uses that path. The docblock still says the page "stays a static prerender". Do not delete the pill. Options: (a) correct the docblock and keep the fallback; (b) make `signedIn` required and move the island test into a `LandingAuthPill` test. LandingNav's default `accountComplete = true` also disagrees with SiteNav's `false`.
- **m2. `MagicLinkSignInForm` `audience` prop does nothing now** (`components/auth/MagicLinkSignInForm.tsx`, callers `app/account/sign-in/page.tsx:78`, `sign-up/page.tsx:108`) [READ]. It is a dead prop. Remove it, or bring back its effect. Also: /login's non-invite copy ("Organiser emails only. No access? Contact an admin.") no longer says a link is emailed. The "Next" button lost its `aria-describedby` too. The invite path lost "use the address you want for your organiser account".
- **m3. `SiteShell` is now `'use client'` but has no hooks or handlers** (`components/shell/SiteShell.tsx:1`) [READ]. SiteNav is already a client boundary. The directive only pulls `SiteFooter` into the client bundle. Remove it.
- **m4. Landing is force-dynamic and has no test** (`app/page.tsx:70-85`). [RUN] `auth.getUser()` against an unreachable host *returns* `AuthRetryableFetchError` with `user: null` and does not throw (auth-js 2.105.4). `getAccountMenuState` is wrapped in try/catch, so a Supabase outage degrades to the signed-out nav and does not 500. `supabaseAnonServer`'s `setAll` is try-wrapped. [READ] A visitor whose access token has expired goes through the refresh path. During an auth outage, auth-js retries the refresh with backoff, so the render can stall for seconds. /events has the same exposure. There is no `app/page.test.tsx`; add one with `getUser` returning an error and `getAccountMenuState` throwing. The cost of dynamic `/` (no CDN prerender, plus 1 to 4 auth/DB round trips per hit) is accepted in the code comment.
- **m5. Hit areas are inconsistent across auth states** [READ]. The signed-out "Log in" pill gets `tap-44`. The signed-in `AccountMenu` trigger (`TRIGGER_CLASS`) and the `StaffProgrammePill` button do not, so they stay about 33px tall. Sheet menu rows (`py-sm`) are about 36px. Add `tap-44` to both triggers. Show the rendered result first.
- **m6. `tap-44` overlap check** [READ, arithmetic from tokens, not rendered]. In SiteNav, `inset-inline:0` means no horizontal overlap. The vertical spill of about 5.25px fits the group's `-my-[5px] py-[5px]`; about 0.25px is clipped at text-scale 1. Footer links spill about 12.6px into a 24px row gap, so they do not reach a neighbour's text. The StaffShell BrandMark spills 5px into a 16px gap. **Conclusion: no click stealing found.** The `href={null}` BrandMark in AccountShell has a `::after` on a plain `<div>`. That is harmless, because the header is `min-h-14 items-center` with nothing within 7px, but it does nothing. Gate `tap-44` on `href !== null`. Separately, SiteNav points BrandMark at `/events` for attendees under `aria-label="Eventar home"`. That predates this pass (old PublicShell).
- **m7. `useScrollFade` misses some content-width changes** (`lib/useScrollFade.ts:19`) [READ]. It observes only the scroller. If the content width changes but the scroller's box does not (late webfont swap, item set change), the fade flags stay stale until the next scroll. Fix: also `ro.observe(el.firstElementChild)`, or observe each child.
- **m8. Hydration** [READ]. `useIsMobile` uses `useSyncExternalStore` with a `false` server snapshot, so it cannot cause a mismatch. React re-renders after hydrate. `useScrollFade` writes `data-*` in an effect on attributes React does not own, so this is safe. AccountMenu's outside-click effect correctly lists `mobile` in its dependencies. No stale closures found in the new effects (StepPanelInner rAF, ToastItem rAF, RegisterCard shake on `[state]`).
- **m9. Hard rules** [READ]. StaffShell renders no SiteNav and gained no `/events` link. Attendee shells send the auth CTA to `/account/sign-in`. `/login` appears only as the organiser door item (doctrine §1, decided in the handoff) and in the LandingHero organiser CTAs. No staff Server Action, RLS, or service-role code is in scope. The curly-apostrophe edits in server-action strings (`invite/[token]/actions.ts`, `eventLifecycle.ts`) have no exact-string consumers. Grep across app, components, lib, tests, specs and scripts found none.

## Not findings (checked)
- `export const dynamic = 'force-dynamic'` is valid. `cacheComponents` is off (next.config.ts) and 9 other routes use it. Next 16.4.5.
- `justify-center-safe` and `duration-250` are valid in the installed Tailwind 4.3.0.
- `--popover` has a light value (`globals.css:399`), so the Sheet's `bg-popover` resolves in both themes.
