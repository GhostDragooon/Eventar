# M2 frontend unfreeze — plan and scope

_Written 2026-08-01. **Ivan lifted the frontend freeze this session**, with the framing correction that the design-exploration artifact is not a mockup exercise: it is the real frontend, and it now has to fuse with the shipped backend. This doc is the record of that decision, the scope it admits, and the staging._

## The decision being recorded

The frontend freeze has held since the 2026-07-03 pivot. It is written into three places that all now need to agree:

- `CLAUDE.md` — pivot-era hard rule: *"Frontend freeze. While it holds: backend, migrations, Server Actions, and tests only."*
- `docs/architecture/BLOCK-ARCHITECTURE.md` — Tier 2: *"S-Organiser is frozen until the M2 review"*; change-control table: surfaces are *"the cheapest — but frozen until M2."*
- `docs/plans/roadmap-to-mvp.md` — M2 row: *"frontend-freeze review → scoped unfreeze"*, with **"M2 unfreeze scope call"** listed as Ivan-critical.

**Status: the scope call is made. The freeze is lifted for S-Organiser only.** Everything else the freeze covered stays covered, for reasons below that are *not* the freeze.

## What the unfreeze does and does not admit

The roadmap bundles two independent halves into M2. They must not be conflated:

| M2 half | Gate | Status |
|---|---|---|
| **Frontend-freeze review → scoped unfreeze** | Ivan's scope call | ✅ **made — this doc** |
| CPD **evaluator** vs versioned `body_rules` | Q26 + Milestone C (the accrediting-body review) | 🔒 **still gated — untouched** |

The unfreeze does not open the Q26 gate. Concretely, in scope vs out:

**In scope (S-Organiser).** The 19 shipped routes, their tokens/shell/components, and organiser-facing reads of data that already exists.

**Out of scope, and why — each for its own reason, none of them "the freeze":**
- **Practitioner compliance math** (the cycle ring, category-threshold bars, "on track" verdicts) — needs B3's evaluator + versioned `body_rules`. **Q26-gated.** Building it now would guess at a design the body's answers determine.
- **The practitioner app as a whole (S-Attendee)** — post-M4 per the block map; K1 self-serve attendee accounts are substrate-only today.
- **Evidence locker / share-and-verify (B6)** — planned S5, no table, no share-link.
- **Multi-track schedule** — needs a genuinely richer schema (sessions, parallel tracks, role-typed people); a deliberate data-model decision, not a surface one (CLAUDE.md rule 13).

The artifact already contains all four. They stay design targets until their own gate opens — the unfreeze does not promote them.

## Admission checklist (BLOCK-ARCHITECTURE.md §"New-work admission checklist")

Run for the one piece of this work that is not purely Tier 2 — the **roster/participant licence-eligibility read** (Stage 3):

1. **Which block owns it?** A read that composes B1 (`registrations`) with B2 (`practitioner_licences`). Cross-block *reads* are explicitly permitted and RLS-scoped (fitting rule 2). It writes nothing, owns no table, and adds no function to either block's contract — so it needs no ownership assignment. **If it turns out to need a persisted view or a definer function, that is a block-contract change and gets flagged before code, not during.**
2. **Audited writes / RLS reads?** Read-only. RLS-scoped. No audit surface required (reads are not audited events).
3. **Dependency direction?** Tier 2 → Tier 1. No kernel edit.
4. **Kill/rollback?** It is a read; removing it orphans nothing.
5. **Re-entry criterion if partial?** n/a — either the eligibility column renders or it does not.
6. **On the milestone's critical path?** Yes — `handoff_01082026.md`'s frontend↔backend map named it the single non-gated, high-leverage backend gap, and every organiser eligibility feature in the artifact depends on it.

Stages 1, 2 and 4 are pure Tier 2 (surfaces), the cheapest change tier, requiring no checklist run.

## Staging

Each stage is independently shippable, independently reviewable, and leaves the app green. **Not one commit — the milestone is multi-session and saying otherwise would be dishonest.**

| Stage | What | Risk | Backend? | Status |
|---|---|---|---|---|
| **1** | **Design-language fusion.** Remap `app/globals.css` token *values* to the locked blue ramp + serif headings + white-ground default. | Low — values-only | none | ✅ shipped `046b21c` |
| **2** | **Shell fusion.** `StaffShell` → the locked global shell (top bar + 248px sidebar that IS the navigation). | Medium — touches every staff route's chrome | none | ✅ shipped `c291bce` |
| **3** | **CPD accreditation, front to back.** Make the shipped CPD backend reachable: `set_event_cpd_config()` + organiser UI. **Not in the original plan** — inserted once a grep proved no UI read or wrote the CPD columns at all, which made it the highest-value gap by a distance. | Medium — new audited definer fn | write (audited) | ✅ shipped `c291bce` |
| **4** | **Roster eligibility read.** Resolve registration → user → verified licence at read time, so the check-in roster shows whose credit will actually post. | Medium — new query, RLS-scoped | read-only | ← **next** |
| **5** | **New organiser surfaces.** Participants directory + Audit log viewer onto Stage 4's data. | Medium | reads only | pending |

> **Numbering note:** an earlier revision of this doc used "Stage 3" for the roster-eligibility read. The CPD-accreditation work took that number when it was inserted ahead of it; roster eligibility is now Stage 4 and the new surfaces Stage 5. Recorded rather than quietly renumbered, because the commit message for `c291bce` refers to "Stage 3" meaning the CPD work.

### Why Stage 1 first

The 2026-06-11 redesign already proved the load-bearing property: **the M3 token names are stable and the values are swappable.** That redesign remapped an entire palette to Vercel-canonical without touching a single component classname. The same lever applies now — so the whole shipped app adopts the locked design language in one atomic, revertible commit with zero component churn. Highest leverage, lowest risk, and it makes Stages 2–4 visibly consistent as they land rather than leaving a half-restyled app between commits.

### Stage 1 — the actual mapping

Locked source: design-exploration §4b v3 (2026-07-16, "replaces teal — closes the open M2 colour decision") + memory `eventar-white-ground-color-as-highlight`.

| Role | Was (Vercel-canonical) | Becomes (locked ramp) |
|---|---|---|
| Primary actions, key headings, active nav | `#0a0a0a` neutral near-black | **`#1C3C94`** (only blue safe for small text, ~10:1) |
| Links, highlight CTAs | `#0070f3` | **`#0E79EC`** (~3.9:1 — never small text) |
| Icons, borders, selected states | — | **`#4494BC`** (~3:1, non-text only) |
| Hover fills, informational tints | `#e8f1fe` | **`#6CAAEF`** tints |
| Inks | `#0a0a0a / #525252 / #8f8f8f` | `#1A1A1A / #565656 / #8C8C8C` |
| Status | `#16a34a / #d97706 / #dc2626` | `#1E874B / #B26B00 / #C0362C` (contrast-tuned; **stays semantic — blue never signals verification**) |
| Surfaces | `#ffffff / #fafafa / #f4f4f5` | **unchanged** — the v2 white-ground correction already converged these |
| Headings | Geist (serif var aliased to sans) | system serif stack (Iowan / Palatino / Georgia) — matches the artifact exactly, **adds no webfont request** |

### One decision taken, not asked

The locked rule is *"loads light always; dark = explicit toggle only."* But `lib/theme.ts` ships a **`'system'` mode that is the current default**, and simply deleting the `prefers-color-scheme` block would leave `/settings` offering a mode that silently no longer works — a user-facing lie (CLAUDE.md rule 12).

**Resolution: change the _default_ from `'system'` to `'light'`; keep all three modes working.** That satisfies the rule (every first-time visitor gets white, no OS inheritance) without removing a capability or making the settings UI lie. Reversible in one line, and the app is not deployed (D0 unflipped), so blast radius today is zero — decided and noted rather than blocking, per `DECISION_PROTOCOL.md` §1.2.

## What this unblocks in `docs/DEFERRED.md`

Five tracked entries name the frontend freeze or the M2 unfreeze as their re-entry criterion. They become actionable — **as candidates, not as automatic scope**:

- UX/perf polish (skeleton loaders, caching, optimistic rendering, tooltips) — all four already have a native/installed target picked, no new dependency.
- `WK-` registration-code prefix branding leak.
- `is_manager()` role parity — 4 app-layer TS checks still gate on `eventar_staff` only (blocked on a real `organiser_admin` account existing, so *not* unblocked by the unfreeze alone — noted so it is not mistaken for ready).
- `creditIssued` in the attendance API response — needs an unfrozen *attendee* surface, so still blocked.
- Task 1b `Staff.role` TS union widen.

## Stage 1 — SHIPPED 2026-08-01

Gates: tsc clean · eslint 0 errors (5 pre-existing `devEmailStub` warnings) · vitest **471 passed | 120 skipped** (+1: a new test pinning that an explicit `system` pick still works) · `next build` clean, **19 routes** — invariant held.

**Live verification found three things static gates could not.** This is the CPD MVP build's lesson repeating exactly: every stage touching a user-facing flow found a real bug live.

### 1. An accessibility regression I introduced — caught, fixed, and now better than baseline

Adopting `#0E79EC` for filled CTAs looked right and was wrong. Measured, white-on-blue:

| | contrast | WCAG AA (4.5:1, normal text) |
|---|---|---|
| Before (`#0070F3`) | 4.55:1 | **passed** |
| Naive remap (`#0E79EC`) | 4.23:1 | **FAILED** |
| Fixed (`#1C3C94`) | **9.89:1** | **passes** |

The trap: the shipped app used **one** blue for everything, the locked design uses a **ramp with roles**, and taking the ramp's *values* without its *role separation* silently downgrades every primary button in the app. The locked spec says it outright — `#0E79EC` is "~3.9:1, **not small text**" — so the shipped usage was violating the design it was adopting.

Fixed at the usage layer, not by bending a token: 22 filled-CTA class pairs + 2 hover variants + 6 `text-tertiary` small-text uses moved to `--primary`. `--tertiary` keeps its ramp value and is now correctly reserved for large accents and tints. Verified in-browser on the real button: **9.89:1 at 12px**.

### 2. A hydration mismatch I introduced — caught, fixed

Stamping `.light` pre-paint made the client's `<html class>` diverge from the server's on **every first load**, throwing a React hydration error each time. Fixed by making light the *server-rendered* default so the common case hydrates byte-identically, leaving the pre-paint script work to do only for a stored `dark`/`system` pick, and marking those two intentional divergences with `suppressHydrationWarning`. Verified: **zero console errors**.

Theme behaviour proven on a genuinely dark OS — no stored pick → white; explicit `system` → dark ramp engages; explicit `dark` → dark ramp; round-trip back to white.

### 3. The serif reaches only two-thirds of headings — logged, not fixed

37 headings use the typography tokens and are now serif; **22 hand-roll `text-[Npx] font-extrabold` and bypass the token system entirely**, so they stay sans. Same family of problem as the CTA sweep: the token layer can only reach components that use it. Deliberately left for Stage 2, where it belongs with the component pass — noted rather than silently half-applied.

**Not claimed:** the three-lens phase-completion protocol has **not** run. That is a phase-boundary obligation, owed when M2's four stages are complete, not per-commit; and no review subagents were dispatched, per this session's standing instruction not to use them unless asked.

## Stage 2 — BUILT, full-stack reviewed, awaiting Ivan's go to commit

Shell fusion: the three-column top NAV becomes a persistent top bar + persistent 248px sidebar, where the sidebar IS the navigation. Diff is deliberately tiny — `components/shell/StaffShell.tsx` plus two test files. **No server, DB, RLS, Server Action or auth code is touched**, which is what "surfaces are the cheapest change tier" is supposed to mean in practice.

Gates: tsc clean · eslint 0 errors (5 pre-existing) · vitest **472 passed | 120 skipped** · build clean, **19 routes**. Verified live against the **local Supabase stack** as a real signed-in staff user (magic-link flow through Mailpit), desktop + mobile + light + dark.

### What was deliberately NOT built

The artifact's shell shows a workspace switcher, a venue-status pill, a notification bell and ⌘K search. None were built: staff belong to exactly one organisation, there is no venue-link subsystem, no needs-attention queue, and no search backend. **Each would have rendered convincing chrome for a capability that does not exist** — and a shell that lies about the product is worse than a plain one. They land with the surfaces that make them real. Same reasoning for the sidebar's contents: it lists only routes that exist, because Participants/Accreditation/Communications/Reports would have been links to 404s.

### Five defects found and fixed during the review

| # | Found by | Defect | Fix |
|---|---|---|---|
| 1 | Full-suite run | **The long-tracked `NewEventForm` flake — root-caused and fixed.** The test's own comment claimed it waited for the submit button to re-enable; `findByRole` does no such thing — it resolves as soon as the element *exists*, and the button exists throughout, merely `disabled={pending}` mid-transition. Under load the second click hit a dead button. Adding a test elsewhere shifted timing enough to make it **fail deterministically**. | Wait on the *enabled* state, assert the clear with `waitFor`. Two consecutive clean full runs. Closes an item tracked across **7 occurrences**. |
| 2 | Live, mobile | "Check-in" wrapped mid-word to two lines in the mobile nav strip. | `whitespace-nowrap` + `shrink-0`; the strip already scrolls. |
| 3 | Live, desktop | **Settings rendered at y≈1459px — off-screen.** Pinning it to the "bottom of the sidebar" pinned it to the bottom of the *page*, since the aside grew to full document height. | Sidebar is now `sticky` at viewport height, so every nav item stays visible at any scroll position. |
| 4 | Live + test | On `/settings` **no sidebar item was active**, so the nav read as broken — Settings was reachable only via a top-bar gear. | Settings added to the sidebar foot; the top-bar gear removed (two links to one destination is a duplicate nav entry and made the accessible name ambiguous). New regression test pins `aria-current`. |
| 5 | A11y audit | `aria-label="Primary"` sat on the `<aside>` — a *complementary* landmark — leaving the real navigation landmark anonymous. Introduced by this stage. | Moved to `<nav>`. Verified live: exactly one nav landmark, labelled, 5 links. |

Also added, because the sidebar made it materially worse rather than because it was in scope: a **skip link** (WCAG 2.4.1). Five nav links now precede page content on every staff route; without it a keyboard user tabs the whole nav on every navigation. Verified visible-on-focus.

### Open findings NOT fixed — these need Ivan's call

1. **The sidebar's "Events" link ejects the user out of the staff shell.** `/events` is `app/(public)/events/page.tsx` and renders `SiteShell`, not `StaffShell` — so clicking Events in the staff sidebar loads the *public* events list and the entire sidebar vanishes. This is pre-existing (the old top nav pointed there too) but far more jarring now that navigation lives in a persistent sidebar: it reads as the app breaking. Fixing it properly means a **staff events list inside the shell**, which is Stage 4 scope, not a nav tweak. Flagged rather than patched.
2. **The top bar is sparse on root pages** — page context on the left is empty when a page passes no `backHref`, leaving just an email on the right. Honest (nothing fabricated to fill it) but thin; Stage 4's surfaces are what legitimately populate it.
3. **`staff.role` is accepted by the shell and never used.** Pre-existing dead prop. The artifact shows a role badge; that is real data and would be a genuine use, but it is a design decision, not a cleanup.
4. **22 headings still bypass the type tokens** (carried from Stage 1) — the serif reaches 37 of 59. Belongs with the component pass.

## Stage 3 — the CPD backend becomes reachable (2026-08-02)

**The hole this closes is the headline of the whole unfreeze.** A grep of `app/` + `components/` + `lib/` for `accrediting_body_id` / `cpd_hours` returned **nothing**. Eventar is a CPD platform in which no organiser could make an event CPD-accredited through the product: `award_attendance_credit()`, the freeze trigger, `credit_ledger` and the whole issuance path were live, tested and **unreachable**. Every credit that has ever existed was written by a seed script.

Front↔back mapping as found:

| Backend capability | Frontend before | Now |
|---|---|---|
| `events.accrediting_body_id` / `cpd_hours` | **nothing reads or writes them** | organiser sets them on the event page |
| `award_attendance_credit()` (fires on check-in) | wired, but only ever on seeded events | fires on events an organiser accredited |
| `freeze_cpd_config_if_credited()` (Stage 8) | **no live caller could reach it** | reached; surfaced as a locked form with the reason |
| `credit_ledger` | invisible | issued-credit count on the event page |
| `accrediting_bodies` (6 active) | invisible | the picker |

### Why a definer function rather than re-granting the columns

The 2026-07-25 review (HIGH-1b) revoked UPDATE on exactly these two columns from `authenticated`, because an organiser could otherwise PATCH their own event to bind **any** body with **any** hours and mint permanent, regulator-facing credits that body never authorised. Re-granting would have reopened that verbatim. Instead `set_event_cpd_config()` follows the block-architecture rule for trusted mutations: SECURITY DEFINER, role-gated (`organiser_admin`/`eventar_staff` — `organiser_member` excluded), **owner-exclusive check inside the body** (a definer bypasses RLS, so ownership must be re-checked or any admin could accredit any tenant's event), active-body check, the existing `<= 24` ceiling, freeze trigger left to fire, audit written last.

**It does not establish that the body approved anything.** An organiser still self-asserts. This makes the act role-gated, bounded, audited and reversible-until-credited instead of impossible. The approval workflow is B3 / Milestone C.

Proven live on the local stack before any UI existed: non-staff → `42501`; half-config → `22023`; 999 hours → `23514`; unknown/inactive body → `P0002`; positive write + audit row; clearing works.

### Correction to a prior migration's comment

`20260725144446`'s comment asserts the organiser edit path is "the `update_event_with_blocks` **SECURITY DEFINER** RPC (runs as the owner)". Verified live: both `create_event_with_blocks` and `update_event_with_blocks` are **SECURITY INVOKER**. Its conclusion still holds — but because the migration re-granted column-level UPDATE on every *other* column, not because of definer rights. Trusting that comment would lead the next session to build a broken feature.

### Four defects found by live verification

1. **Wrong column name** (`name` vs `full_name`) made the bodies query fail — **and my own "degrade gracefully" swallow hid it**, rendering an empty dropdown that looked exactly like "this deployment has no accrediting bodies." Rule 12 violation in my own error handling. Now logged (code only, no PII) and surfaced as an explicit failure state that disables the form.
2. **An event bound to a non-`active` body silently displayed as "Not accredited"** and would have had its accreditation cleared on the next save. Real on the seeded data — it is bound to HKAM, which is `deferred`. The current binding is now shown as its own option.
3. **Pre-hydration clicks did a native GET**, leaking every field into the URL as a query string and silently doing nothing. Rewired to `useActionState` + `<form action={…}>` so submission works with or without client JS.
4. One false alarm worth recording: a fiber-key probe suggested the component had not hydrated. It had — the countdown was ticking. The probe was the unreliable instrument, and "fixing" the non-bug would have been wasted work.

**End-to-end proof:** through the real UI, changed the event to HKICPA / 4.5h → DB row updated → `event_cpd_config_set` audit row written with `actor_role = eventar_staff`. Gates: tsc clean · eslint 0 errors · vitest **479 passed | 120 skipped** · build clean, 19 routes. Migration applied to **local and Seoul** (filename reconciled to Seoul's recorded version `20260802022345`, per the known `apply_migration` drift trap).

### Patched immediately after (2026-08-02), clearing the way for Stage 4

- **The sidebar's ejecting "Events" link is gone.** It pointed at `app/(public)/events` — a `SiteShell` page — so from the staff sidebar it loaded the public listing and the sidebar vanished. `/dashboard` is already the staff events list (lifecycle filter tabs, search, sort, per-event edit/delete), so the link was both broken *and* redundant. Removed, with a regression test asserting no shell link points at `/events`. A dedicated staff events route can earn the slot back when it exists.
- **The CPD card now also renders on `/events/[id]/edit`.** Creating an event redirects to `/edit`, so a brand-new event's accreditation was only reachable if you knew to navigate on to `/details`. Same component, same audited action; the action now revalidates both paths so a save on one never leaves the other stale.

### Still not functional — the honest list

- **Check-in roster shows no licence eligibility** — an operator cannot see that a registrant's credit will not post. This is Stage 4 and the largest remaining front↔back gap.
- **The event *creation* form still has no CPD fields.** `create_event_with_blocks`' column whitelist omits both, so CPD is set immediately after creation on the page you land on, not during it. Acceptable because the redirect target now carries the card; worth closing when the create form is next touched.
- 22 headings still bypass the type tokens (Stage 1).
- The three-lens phase-completion protocol is still owed at the M2 boundary.

## Verification bar (every stage)

Static gates: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build`. Running invariants: **19 routes**, vitest **470 passed | 119 skipped** at session start. Plus the three-lens phase-completion protocol before anything is called done, and live verification in a browser — the CPD MVP build's own load-bearing lesson was that every stage touching a user-facing flow found a real bug that static gates missed.
