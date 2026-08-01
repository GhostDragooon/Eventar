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

| Stage | What | Risk | Backend? |
|---|---|---|---|
| **1** | **Design-language fusion.** Remap `app/globals.css` token *values* to the locked blue ramp + serif headings + white-ground default. | Low — values-only | none |
| **2** | **Shell fusion.** `StaffShell` → the locked global shell (60px top bar, 248px sidebar, section labels). | Medium — touches every staff route's chrome | none |
| **3** | **Roster eligibility read.** The one non-gated backend gap: resolve registration → user → active licence at read time. | Medium — new query, RLS-scoped | read-only |
| **4** | **New organiser surfaces.** Participants directory + Audit log viewer onto Stage 3's data. | Medium | reads only |

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

## Verification bar (every stage)

Static gates: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build`. Running invariants: **19 routes**, vitest **470 passed | 119 skipped** at session start. Plus the three-lens phase-completion protocol before anything is called done, and live verification in a browser — the CPD MVP build's own load-bearing lesson was that every stage touching a user-facing flow found a real bug that static gates missed.
