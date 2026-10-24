# REVIEW-CX06A-dev: dev-lens review of CX-06a (practitioner funnel)

Reviewer: dev lens only. Read the diff and the surrounding files; no browser, server, DB or fixtures. Only write: this file. Scratch copies live in `/private/tmp/claude-501/-Users-ivan-Eventar/547afdcb-1014-4bb0-a64e-6d7b404b53e8/scratchpad/` (`gate/` = pure-function runs, `mut/` = mutated mirror copies). Repo tree untouched by me.
Evidence tags: [X] executed, [R] read, [I] inferred.

Verdict: no BLOCKER. The `next` gate holds against everything I threw at it. Two MAJOR findings are about the registration success card telling the wrong thing in some states (poster host, and a claim of "on your record" that registerForEvent may not have honoured).

## Gates I ran [X]
- `pnpm exec vitest run components app/account`: 98 files, 574 passed, 0 failed (wider than the hand-back's 16 files / 244).
- `pnpm exec eslint` on every changed and new file in scope: no diagnostics printed.
- `pnpm check:ui-colours` / `pnpm check:ui-primitives`: no hit in any CX-06a file (the known other files are not mine).
- Added-line scan for em/en dash: none in user-facing copy (two hits are `describe(...)` titles in tests).

## Findings

| ID | Sev | file:line | Finding | Ev | Suggested fix |
|---|---|---|---|---|---|
| D-01 | MAJOR | `components/RegisterCard.tsx:184-190`; `app/(public)/events/[id]/poster/page.tsx:322-331` | The poster page renders `RegisterCard` with no `signedIn`, `isStaff` or `defaultEmail`, so both default to false. On `/events/<id>/poster` the success card therefore shows "Create your Eventar record" to every visitor: a signed-in practitioner (false, they have a record) and an organiser (FR-003: "an organiser nothing"; Q32). An organiser who clicks it goes `/account/sign-up` -> `app/account/layout.tsx` -> `/dashboard`. CX-06a made the default-false props load-bearing; before it they only gated nudges. The poster is not in the card's May-edit list, so the executor could not fix the host, but RegisterCard could have failed safe. | R (poster has no session read for the card; `isStaff`/`signedIn` defaults), R (layout redirect) | In RegisterCard make `signedIn` tri-state (`undefined` = unknown, show no account prompt) so an unaware host gets nothing, then a follow-up card passes the real session from the poster page. Or add the poster to a follow-up card now and accept the gap knowingly. |
| D-02 | MAJOR | `components/RegisterCard.tsx:192-194` vs `app/(public)/events/[id]/actions.ts:79-81` | "This is now on your record." is inferred, not reported. `RegisterResult` is `{ok:true; emailDelivery}` (no `linked`). The page decides staff with fail-open `isStaffSession` (`page.tsx:146`), the action decides attach with fail-closed `staffState === 'not_staff'` (`actions.ts:81`). When the staff read errors at submit time (any non-PGRST116 `staffErr`, or an identity-read failure) the action registers a plain guest row (`console.warn` only) while the page already rendered `isStaff=false` with the session email prefilled, so the card says "on your record" for a row with `user_id` null. That hits ordinary practitioners as well as organisers (hand-back open question 3 frames it as organiser-only). Same lie if the session changed between render and submit. Low frequency, but the claim is about CPD credit, and the card has no way to know. | R (traced both ends) | Return `linked: boolean` from `registerForEvent` (events/[id]/actions.ts + schema.ts, outside this card) and key the sentence on it. Needs a card. Until then this is the known residual risk. |
| D-03 | MINOR | `components/RegisterCard.tsx:192` | Deviates from FR-003 scenario 5 ("a signed-in practitioner who has just registered ... offers My record"). The email-match condition also hides the "My record" link, so a signed-in practitioner who registers a colleague gets no account path. The rule-12 concern only applies to the sentence, not the link. Disclosed in the hand-back deviations. | R | Show the "My record" link for every `!isStaff && signedIn`; keep only the sentence conditional on the email match. (Ivan's call: the hand-back asks.) |
| D-04 | MINOR | `app/account/sign-in/actions.ts:34`; guards `app/account/page.tsx:34`, `record/page.tsx:36`, `profile/page.tsx:40`, `claim/page.tsx:28` | FR-005 ("carry the destination through every step") holds only through the sign-up door. The sign-in door does not wrap in `/account/complete?next=`, and the four guard redirects to `/account/complete` drop `next`. Live example: `app/(public)/checkin/confirm/page.tsx:551` sends a signed-out attendee to `/account/sign-in?next=/account/claim`; a brand-new account created there lands on `/account/record`, not the claim page. Disclosed (deviation 2), guards are outside the card. The wrap in `sendAttendeeMagicLink` is inside `sign-in/**` and would fix it for all callers at the cost of one extra server hop for returning users; the executor's own mutation run shows the existing tests expect no wrap, so it is a product call. | R | Either wrap in the action (decision: extra hop for every sign-in) or a follow-up card for the four guards to pass `?next=<own path>`. |
| D-05 | MINOR | `app/auth/callback/route.ts:29`; `lib/authDoor.ts:42-50`; `app/account/sign-in/attendeeNext.ts:12-17` | Two sources of truth for "which door owns this path". `classifyPath` splits the raw string, so dot-segments mislabel: `classifyPath('/account/../dashboard')` = `attendee` while the callback's `new URL(...)` goes to `/dashboard`; reverse `/dashboard/../account/record` = `organiser` but lands on the record. Effect is only the failed-link bounce door (`errorBase`), crafted links only, no exposure. Executor routed round it with a second gate instead of fixing the shared one, so the audience rule now lives in two places. Disclosed (open question 1). | X (gate/run.ts classifyRaw column) | Resolve the pathname inside `classifyPath` (lib/authDoor.ts), then `attendeeNextPath` shrinks to `safeNextPath` + `classifyPath`. Needs a card (lib/ is not listed). |
| D-06 | NIT | `app/account/sign-in/attendeeNext.ts:24` | The wizard self-check compares the raw pathname to `'/account/complete'`. `/account/complete/` and `/account/%63omplete` pass as a landing path (X). No loop: the redirect re-enters the page without `next` and ends at `/account/record` (I). Cosmetic. | X + I | Compare the decoded, slash-trimmed pathname, or accept as is. |
| D-07 | NIT | `components/RegisterCard.tsx:184` | `!isStaff` on the create block is untested: removing it fails nothing (mutant B survives; the organiser test passes `signedIn`, which already hides the block). Redundant today on the event page; it matters on any host that omits `signedIn` (see D-01). | X | Add a test with `isStaff` and no `signedIn`, or fold into the D-01 fix. |
| D-08 | NIT | `app/account/complete/page.tsx:21-22`; `app/account/sign-in/actions.ts:43-44` | Stale comments next to changed code. Page header says a complete account "redirects to /account"; it now goes to `landing ?? '/account/record'`. Action comment says default `/account` and "the callback re-validates the param"; default is `/account/record`, and the callback applies only `safeNextPath` (open-redirect), not the attendee gate. | R | One-line edits. |
| D-09 | NIT | process | Scope: new tests `app/account/complete/{page,CompleteClient}.test.tsx` are not named by the card (its other entries say "+ test"); plan §4 rule 6 says stop and say so, the executor proceeded and disclosed. `attendeeNext.ts` is inside `app/account/sign-in/**` ("the `next` hand-off only"), in scope in letter and spirit. Everything else in the diff is on the May-edit list. Tree also shows `package.json` (+`motion`) and `pnpm-lock.yaml` modified, plus `app/dev-preview-uiport/ux-fu1/`: not CX-06a (UX-FU1 specimens). The commit must stage by path. | R | Stage only the CX-06a paths. |
| D-10 | NIT | `components/landing/LandingHero.tsx:~200` | Hero CTA pills are about 38 px tall (`py-[9px]`, 13 px text), under the 44 px rule. Pre-existing shared class on the organiser pair; the card says mirror it, so not new. | R | Leave to a design card. |
| D-11 | NIT | `app/account/sign-in/attendeeNext.ts` | No length cap: a 100 000-character `/account/aaaa...` passes (X) into `emailRedirectTo`; Supabase will reject it and the user sees the generic send error. Pre-existing in `safeNextPath`. | X | None needed now. |

## Q1 open redirect and audience boundary

Executed `attendeeNextPath` / `wizardLandingPath` / `classifyPath` / `safeNextPath` in a scratch copy of the two real files [X, `gate/run.ts`]. Result per hostile input (output of `attendeeNextPath`; `wizardLandingPath` is the same or stricter):

| Input | Out |
|---|---|
| `//evil.example`, `/\evil.example`, `/\/evil.example`, `/<TAB>/evil`, `/<LF>/evil`, `/<CR>/evil` | null |
| `/%09/evil.example`, `/%2f%2fevil.example`, `/%2F/evil.example` | null (path stays one literal segment; classifies neutral) |
| `/account/../dashboard`, `/account/./../login`, `/account/../../dashboard`, `/account/..\dashboard`, `/account/%2e%2e/dashboard`, `/account/%2E%2E/dashboard`, `/account/..` | null (resolved to organiser or neutral) |
| `/account/..%2fdashboard`, `/account/%252e%252e/dashboard`, `/account/..;/dashboard` | accepted as attendee: one literal same-origin segment, browser requests it as typed; no organiser page reachable (404 at worst) |
| `javascript:...`, `/javascript:...`, `data:...`, `https://evil.example`, `/@evil.example`, `/account@evil.example`, `/account:80` | null |
| `/account//evil.example` | accepted, same-origin path `/account//evil.example` (not a host; no redirect off-site) |
| `/account/?x=//evil.example`, `/account#//evil` | accepted, query/hash only |
| `/events/new`, `/events/<uuid>/edit`, `/events/<uuid>/checkin`, `/events/<uuid>/analytics`, `/dashboard`, `/login`, `/settings`, `/invite/abc` | null |
| `/events/<uuid>`, `/events/<uuid>/` | accepted (public event page) |
| `''`, `'   '`, `' /account'`, array values (`['/account/claim','/dashboard']`), object | null |
| `/account ` (trailing space) | `/account` |
| `/∕evil.example`, `/／evil.example`, `／／evil.example` (unicode slashes) | null (no unicode folding to `/`; second form is not an `/` start) |
| 100 001 chars | `/aaa...` null (neutral); `/account/aaa...` accepted (D-11) |
| `/account/complete?next=/dashboard` | attendee, but `wizardLandingPath` null (self) |
| `/account/complete/`, `/account/%63omplete` | `wizardLandingPath` passes them (D-06) |

Hops, each traced [R] and where possible tested [X]:
- Sign-up page: `next = attendeeNextPath(...)`; hidden field gets `emailedNext` (wrap) or `next`; the "Sign in" link and the already-signed-in `router.replace` use the gated `next`. No raw value reaches a sink.
- `sendAttendeeMagicLink` re-gates the posted field (the form field is attacker-controlled) and builds `emailRedirectTo = origin + /auth/callback?next=<encoded>`.
- `/auth/callback` applies only `safeNextPath` (same-origin), not the attendee gate: it is shared with the organiser door and cannot know the origin. It is reached with a gated value from the attendee doors; a hand-crafted callback URL with a valid `code` can still land on `/dashboard`, where `proxy.ts` handles non-staff. Its `errorBase` heuristic is a constant choice between two doors, so a wrong classification (D-05) is cosmetic.
- `/account/complete?next=`: `wizardLandingPath` gates before use; both sign-in redirects and the complete-account pass-through use the gated, encoded value; `CompleteClient` receives only the gated prop and pushes it on Done (the client does not re-gate; it trusts the server component that renders it, which is the only caller [R]).
- Reverse direction: an organiser session on any `/account/*` page is redirected to `/dashboard` by `app/account/layout.tsx` (fail-open on staff-read error, pre-existing). Attendee chrome added by this card links only to `/account/sign-up`, `/account/sign-in`, `/account/record`, `/events`, `/account` (no `/login` or `/dashboard`) [R, and asserted in RegisterCard/LandingHero tests]. The only way an organiser sees an attendee prompt is D-01 (poster) or a fail-open staff read (D-02). Not touched by this card: `/login`'s server action accepts any `safeNextPath` value including `/account/*` (`app/login/actions.ts:20`); the page forwarding step does gate by `classifyPath === 'organiser'`. Out of scope, noted.

## Q2 RegisterCard states

- Signed out (`!signedIn && !isStaff`): create prompt. Signed in, not staff, `defaultEmail.trim().toLowerCase() === state.email`: sentence + "My record". Staff: nothing. Conditions read [R]; tests run for all five combinations [X].
- Email comparison matches the server: card lowercases and trims both sides; action compares `authedEmail` (lowercased, trimmed) with `email.toLowerCase().trim()` [R]. Case difference does not drop the claim, and is not a false positive.
- Staff source: same helper family (`getStaffSessionState`), different collapse. Page: `isStaffSession` (=== 'staff', fail-open). Action: `staffState === 'not_staff'` (fail-closed on 'unknown'). A two-organisation member reads 'staff' on both [R, lib/auth.ts:84-86]. Divergence is D-02.
- False prompts found: D-01 (create prompt on poster for signed-in or staff) and D-02 ("on your record" for an unlinked row).

## Q3 Spec and scope map

| Requirement | Code | Test |
|---|---|---|
| FR-001 hero pair, organiser unchanged | `LandingHero.tsx` COPY.practitioner (+comment) | `LandingHero.test.tsx` pair, order, no `/login` `/dashboard`, organiser pair |
| FR-003 signed out / signed in / staff | `RegisterCard.tsx:184-197` | `RegisterCard.test.tsx` 5 new (D-03, D-07 caveats) |
| FR-004 empty record link | `RecordClient.tsx` | `RecordClient.test.tsx` 3 new (link, exact sentence, only in empty state) |
| FR-005 gate at all four sinks | `attendeeNext.ts`; `actions.ts`, sign-in page, sign-up page, complete page | `attendeeNext.test.ts`, `actions.test.ts`, `page.test.tsx` x2, `nextGate.test.tsx`, `complete/page.test.tsx` |
| FR-005 carried through sign-up -> wizard -> destination, default `/account/record` | sign-up `emailedNext`; complete page `landing`; `CompleteClient` `next` | sign-up tests, complete page + client tests |
| FR-002 (events list band) | not in this card (UX-02) | n/a |

Missing against the card: nothing in its four steps. Live walk ("Done when") not run; that is the other agents' job (Not reached).
Scope: see D-09.

## Q4 Test honesty

Tests are behavioural (real page functions and components run against mocked boundaries, real gate used everywhere). I re-ran nine mutations on mirror copies in `mut/` (baseline mirror: 9 files, 135 passed) [X]:

| Mutant (copy only) | Result |
|---|---|
| A. RegisterCard record block: email match -> `true` | 1 fail ("registering someone else") |
| B. RegisterCard create block: drop `!isStaff` | **0 fail (survives, D-07)** |
| C. RegisterCard record block: drop `!isStaff` | 1 fail (organiser test) |
| D. `attendeeNext`: classify `safe` (raw) instead of `resolved` | 8+ fail (every dot-segment case across 5 files) |
| E. sign-up: pass `next` instead of `emailedNext` | 2 fail |
| F. complete page: pass-through ignores landing | 1 fail |
| G. complete page: first sign-in redirect drops next | 1 fail |
| H. action: `emailRedirectTo` next unencoded | 1 fail |
| I. `wizardLandingPath`: drop self check | 4 fail across 3 files |

Not covered by any test: the page-to-card prop wiring that D-01/D-02 depend on (events page passes `signedIn`/`isStaff`/`defaultEmail`; poster does not).

## Q5 UI and copy [R unless tagged]
- 44 px: new RegisterCard links use `buttonVariants({variant:'outline'})` + `min-h-11 w-full` (same slot and class as "Register another guest"). "Browse events" is an inline link in a sentence, like the existing "Account" link. Hero: D-10.
- Tokens: no raw colour in the diff; `check:ui-*` clean for these files [X].
- No em-dash in new copy [X]. Empty-record sentence reads as one clear sentence: "No linked events yet. Browse events to register, or link past registrations from Account." (exact text asserted).
- Aria: the success heading takes focus (existing); the new sentence is a plain paragraph beside a link with a real name; no new live region needed (result already announced by heading focus).
- Hero order and variants: both CTAs come from the same `.map` with identical classes; order is primary-first like the organiser pair ("Get started", "Log in"); asserted in tests.

## Q6 Other
- Rule 7: the card reverses the 2026-09-25 single-CTA hero lock (e6c2dc0). Spec 001 FR-001 and the plan (newer, Ivan's D6/D9) direct it, the test and the comment record the reversal. Not a conflict.
- Next 16: `searchParams` is read as a `Promise` in the complete page, matching Next 16 [R]; I did not open `node_modules/next/dist/docs/` (the page already used `await headers()`). The prop type says `next?: string` but Next may hand a `string[]`; an array falls to the default (null), fail-closed (X, `gate/arr.ts`).
- Guard redirects dropping `next` and `classifyPath` dot-segments: D-04 and D-05.
- Hand-back claims checked and held: `classifyPath('/account/../dashboard')` = `attendee` [X]; gate classifies the resolved path [X]; mutations D, E, F, G, H, I reproduce.

## Verified OK
- No input I tried makes `attendeeNextPath` return an off-site, organiser or neutral path; output is the resolved pathname+search+hash, so what is classified is what the browser or `redirect()` loads.
- Gate is applied at the action (server-side re-check), both pages, and the complete page; hidden-field and Sign-in-link hops use the gated value.
- Wrapped link encodes once; callback decode + Next `searchParams` decode round-trips `/account/complete?next=%2Faccount%2Fclaim` [X action test, R].
- Organiser pair untouched; hero pair mirrors it.
- RegisterCard email-match logic equals the server's `emailMatchesSession` normalisation.
- vitest on both dirs and eslint clean; no `check:ui-*` hit in these files.

## Not reached
- Live end-to-end (landing -> sign-up -> email -> callback -> wizard -> destination; registration; record): other agent's walk. The per-hop unit proof is solid but is not an end-to-end proof.
- `node_modules/next/dist/docs/` verification of `searchParams` typing (relied on the existing Next 16 usage in the same file).
- Behaviour of a real browser/Vercel edge on `%2f` and `;` path segments (`/account/..%2fdashboard`, `/account/..;/dashboard`): reasoned only [I].
- `pnpm test:rls`, `next build`, any DB or hosted system (forbidden by the brief).
