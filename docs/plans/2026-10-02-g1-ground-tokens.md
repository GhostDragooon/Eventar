# G1: light-theme ground, an off-white page with white cards (investigation and plan)

**Status: investigation complete, revised 2026-10-02 after an independent read-only review. NO code changed.** The review found one blocker in the first draft (the original E3 assumed the organiser sidebar token was only the rail; it is also the organiser page ground, see E3) and two missed consumers; this version carries the corrections, each re-verified in code. Source decision: vault Decisions Log Q41 call 2 (Ivan, 2026-10-01), which supersedes Q31's "white stays the page ground" for the **light** theme only. Approved reference: the D0 specimens (published artifact `https://claude.ai/artifact/QHcECkb1SeLqPQH21QDzjy`, v6), whose "off" ground is `--ground:#f9fafb; --card-bg:#fff; --rail-bg:#fff` and whose new-form controls are `min-height:44px; border:1px solid var(--outline); background:var(--surface)`.

Evidence tags: **[X]** computed or scanned this session · **[V]** read in code · **[I]** inferred.

## 1. The finding, in one paragraph

G1 is not a 677-site migration. Today the light theme has a **white page and `#fafafa` cards**; the decision is an **`#f9fafb` page and white cards**: the page and the card swap roles (the new page value `#f9fafb` is not the old card value `#fafafa`). Almost every consumer already reads those values through tokens (`check:ui-colours` confines colour literals to `app/globals.css` and six allowlisted files; its baseline is two `rgba(` hits in `DashboardWorkstation`), so the change is **three token lines in the light `:root` block, one explicit pin in the two dark blocks, and a short list of exceptions (E1 to E4, E9)**, including two one-class edits in the organiser shell. Contrast on cards goes UP (cards are where almost all text sits); contrast on the bare page goes down by 0.2 to 0.75 and two pairs cross AA. The cost of G1 is visual QA, not code.

## 2. The token deltas (light `:root` in `app/globals.css`, nothing else)

| Token | Now | G1 | Who follows it |
|---|---|---|---|
| `--background` | `#ffffff` | `#f9fafb` | `body` (`@layer base`), `.app-atmo` (it paints `var(--background)` under its two washes), `bg-background` (4 real sites plus one comment at `app/page.tsx:72`) |
| `--surface-container-lowest` | `#fafafa` | `#ffffff` | the shadcn bridge `--card` and `--popover` (popovers become white, which is the better default), and 113 `bg-surface-container-lowest` sites |
| `--sidebar` | `var(--surface-container-low)` = `#fafafa` | `var(--surface-container-lowest)` = white | `bg-sidebar` (3 sites: the rail, the content column and a sticky header; **see E3, the content column must stop using it**). The specimens' organiser rail is `--rail-bg:#fff` |

**Unchanged:** `--surface` and `--surface-bright` (`#fff`), `--surface-container` and `-low` (`#fafafa`), `-high`, `-highest`, `--surface-variant`, `--surface-dim` (`#f4f4f5`), every ink, outline and tinted container, and **the rendered dark theme**. One subtlety the first draft got wrong: `--sidebar` is declared only in the light `:root` (as a `var()` reference to `--surface-container-low`) and the dark blocks do not redefine it, so re-pointing the light line to `-lowest` would also move the dark sidebar (`#181818` to `#141414`, 1.115 to 1.075 against the dark page). The two dark blocks therefore get an explicit `--sidebar: var(--surface-container-low)` so dark stays byte-identical; the parity test in `app/globals.test.ts` keeps the two blocks equal, so it needs no edit.

## 3. What the sweep found (677 hits for the surface/outline family) [X]

`bg-*` usage by token: `surface-container-lowest` 113 · `surface-container-high` 67 · `primary-container` 46 · `surface-container` 37 · `surface` 25 · `surface-container-low` 24 · `primary-fixed` 18 · `muted` 10 · `input` 10 · `background` 4 (+1 comment) · `popover` 3 · `sidebar` 3.

The 113 `bg-surface-container-lowest` sites, by role: **90 cards/panels** (rounded plus border or shadow: exactly what should turn white), 12 other (three date/time/agenda inputs, an avatar circle, a readiness strip, a hero-image footer, the landing ledger window, three pricing and landing cards), **5 select triggers/selects**, **5 table rows and lists** and 1 mono code-entry field. Nothing here needs a decision; they all become white, as intended.

**CSS consumers (the sweep above read `bg-*` classes in TS/TSX only, which is how E9 was missed) [V]:** `app/globals.css` is the only stylesheet. It reads the three tokens in six places: `.hero-ground` base layer `var(--surface-container-lowest, #fff)` (:716; **E9**), `.app-atmo` and its two dark variants `var(--background)` (:764, :777, :783; follow the ground, intended), the shadcn bridge `--card` and `--popover` (:394, :396; follow `-lowest`, intended) and `--sidebar` (:412).

## 4. Exceptions (the only places where a value swap is not enough)

| # | Site | Problem | Proposed handling |
|---|---|---|---|
| E1 | `components/auth/AuthShell.tsx:11`, `components/help/NotFoundState.tsx:27` (and the dev preview) | full-page grounds written as `bg-surface` (white), so they would stay white while every other page is `#f9fafb` | `bg-background`. Mechanical. |
| E2 | `components/ui/button.tsx:18`, outline variant `bg-background` | would turn `#f9fafb` on a white card (an inset grey button). The specimens' `.btn-outline` is transparent; only their filter chips are white with an `--outline` border | `bg-transparent` (matches the specimen's outline button and reads correctly on both grounds); `bg-surface` is the alternative but is invisible on a white card. Mechanical. |
| E3 | `--sidebar` and the organiser shell | **The first draft was wrong here.** `components/shell/StaffShell.tsx` uses `bg-sidebar` three times over: the rail (:168), the whole main content column that wraps every organiser page and its footer (:232), and the sticky header in `components/dashboard/DashboardWorkstation.tsx:360`. Today the organiser page ground IS `--sidebar` (`#fafafa`), sitting opaque over the `.app-atmo` wash. Making `--sidebar` white without touching those two consumers would turn every organiser page pure white: rail equal to ground, white cards on white | token line **plus two one-class edits**: `StaffShell.tsx:232` and `DashboardWorkstation.tsx:360` from `bg-sidebar` to `bg-background`, so the rail is white and the ground is `#f9fafb`, as in the specimens. Open design call: keep the column opaque (calm working surface, the washes stay hidden as today; the default here) or make it transparent so the atmospheric wash shows as in the specimens (decided with the unified organiser home, Lane C surface 4) |
| E4 | `text-primary` (the fill token) used as text on the bare page: `app/settings/page.tsx:88`; `text-success`/`text-warning` spans in `app/events/[id]/details/page.tsx:537,543`, and three more to check against their ground: `components/admin/TeamTabs.tsx:45`, `components/NotificationSignupButton.tsx:54`, `components/details/EmailDeliveryStrip.tsx:57` | `#0070f3` and `#1e874b` are 4.55:1 and 4.54:1 on white, so G1 pushes them to 4.36 and 4.35 on the page. They are already Frontend Design Standard violations (fill tokens are not ink) | switch the sites to `text-primary-ink` / `text-on-success-container` on `success-container`. Fold into the G1 sweep. |
| E5 | `.glass-nav` | translucent white (`rgba(255,255,255,.32→.06)`) over the page; over `#f9fafb` it reads slightly less distinct | visual QA only; retune the alpha if the specimens differ. |
| E6 | the check-in pass "ticket notches" (`bg-background`) | none: they must match the page ground behind the card, and they will | none. |
| E7 | poster page | has its own `--po-*` tokens and `print:bg-white` | none. |
| E8 | emails | inline hex by design | none. |
| E9 | `.hero-ground` base layer, `app/globals.css:716` (the landing page ROOT, `app/page.tsx:67`) | reads `--surface-container-lowest`, so after the swap the landing ground would be white while every other page is `#f9fafb`, and the landing cards (also `-lowest`) would be white on white | base layer to `var(--background)`. Mechanical. |

**Not G1 (pre-existing, already scheduled as "the existing-inputs sweep", your D16 call):** about 20 input-like controls (10 `bg-surface` inputs, 9 on `surface-container-lowest`; the shadcn `Input` itself is transparent) already have a boundary of `#eaeaea` against their ground, **1.15 to 1.2:1 today** against the 3:1 that WCAG 1.4.11 asks of an input boundary; they end up white on white cards (1.20:1), which is no worse. The specimens' answer for new forms is `border: 1px solid var(--outline)` (3.36:1 on white). Options for the sweep, later: (a) `--input` → `var(--outline)` globally (every field gets the heavier border), (b) per-form `border-outline` only where a form is rebuilt (the current plan), (c) a filled boundary instead (inputs `#f4f4f5` with no border). Not decided here.

## 5. WCAG recompute [X]

Ratios (ink on ground). "Page" is the bare ground, "card" is a card or panel. Before: page white, card `#fafafa`. After: page `#f9fafb`, card white.

| Ink | page before → after | card before → after |
|---|---|---|
| `on-surface #1a1a1a` | 17.40 → 16.65 | 16.67 → 17.40 |
| `on-surface-variant #565656` | 7.34 → 7.02 | 7.03 → 7.34 |
| `primary-ink #1c3c94` | 9.89 → 9.46 | 9.48 → 9.89 |
| `error #c0362c` (as text) | 5.52 → 5.28 | 5.29 → 5.52 |
| `success #1e874b` (as text) | 4.54 → **4.35** | 4.35 → 4.54 |
| `primary #0070f3` (as text) | 4.55 → **4.36** | 4.36 → 4.55 |
| `warning #b26b00` / `tertiary #0e79ec` (as text) | 4.20 / 4.23 → 4.02 / 4.05 | already below 4.5 today |
| `outline #8c8c8c` (UI boundary, needs 3:1) | 3.36 → 3.22 | 3.22 → 3.36 |

Surface steps stay quiet by design: white card on `#f9fafb` page 1.05, `#fafafa` block on white card 1.04, tinted containers 1.13 to 1.17. Cards therefore keep their `border-outline-variant` and shadow (they already carry them in 90 of 90 card sites). The only pairs that cross AA are the two fill-tokens-as-text on the bare page (E4); everything else stays above 4.5 and the 3:1 boundary token stays above 3:1.

## 6. Implementation plan (one package, small in code)

1. `app/globals.css`: the three light `:root` lines in §2, the explicit `--sidebar` pin in both dark blocks, and `.hero-ground` (E9). **Serial with any other `app/globals.css` edit**: the peer session's uncommitted `--primary-ink` dark fix (`app/globals.css` + untracked `app/globals.test.ts`) must be committed or merged first, or G1 edits on top of it with the peer's go.
2. Exceptions E1, E2, E3 (the two shell classes), E4 (a handful of one-class edits).
3. New test `app/globals.contrast.test.ts`, in the style of `app/globals.test.ts`: parse `app/globals.css` and assert (a) the role split (the page token is lighter-tinted than the card token, the card is white, the rail is white, the two dark blocks are unchanged), (b) AA (4.5) for the ink tokens in §5 on BOTH grounds except the three already-known fill tokens, (c) 3:1 for `--outline` on both. **No colour literal may appear in the test file**: `scripts/check-ui-colours.mjs` scans every `.ts` and `.tsx` file including tests and strips comments only (verified 2026-10-02 on a scratch root: a hex in code fails the check, a hex in a comment passes), so expectations are read from the parsed tokens and compared by relation and ratio. This encodes "recompute WCAG" so the next ground change cannot skip it.
4. `check:ui-colours` and `check:ui-primitives` must stay at their baselines (2 and 7); `app/globals.test.ts` stays green and unedited.
5. Docs: the vault Frontend Design Standard addendum (already written, marked "NOT built yet") loses that marker; Q41 consequences note; PROJECT_STATE entry.
6. Verification: live on the local stack, light theme, 1024 and 375, eight surfaces (landing, `/events`, `/login`, invite, `/dashboard`, `/events/<id>/details`, `/account/record`, a dialog), plus one dark pass to prove nothing moved; computed-colour read-backs for page, card, sidebar, outline button; compare against the specimens. Then the phase-completion protocol (dev-lens and user-lens as separate agents).

**Estimate:** about one working session including the review rounds. **Rollback:** revert the three token lines (the exceptions are individually harmless).

## 7. Open for Ivan

1. **E2** outline buttons transparent (recommended, matches the specimen's outline button) or leave them `#f9fafb`?
2. **E4** fix the three or four fill-tokens-as-text sites now (recommended; they are already violations) or leave them?
3. **Order:** G1 is small and independent of Band 2's SQL lanes. Do it before Lane A (so P1a/P7a are built on the final ground) or after? Recommended: before.
4. The existing-inputs boundary sweep (§4) stays separate; say if you want it folded in.
5. **Organiser content column (E3):** opaque `bg-background` (the default here) or transparent so the `.app-atmo` wash shows? Defaults to opaque; revisit with the unified organiser home.
6. **A divergence from the vault's wording, surfaced rather than averaged.** Q41 call 2 and Frontend Design Standard line 36 say G1 will "update `app/globals.test.ts` and `check:ui-colours`". This plan edits neither script: the dark-parity test needs no change (dark is byte-identical, pinned by the explicit `--sidebar`), the new contrast test is a new file that parses tokens instead of hard-coding them, and `check:ui-colours` stays at its baseline of 2. Say if you want the check scripts themselves extended instead (for example a rule that forbids `bg-surface` as a full-page ground, which is how E1 happened).
