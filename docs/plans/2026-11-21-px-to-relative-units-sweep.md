# Plan: px to relative units sweep (2026-11-21)

**Status 2026-11-21:** Batches 0 and 1 DONE, uncommitted. Ivan picked radii option (a) (rem tokens) and the recommended order; Batch 2 (radii) DONE, uncommitted: `--radius-card` 1.25rem (20px) and `--radius-control` 0.75rem (12px) added to `@theme inline` and registered in `lib/utils.ts` twMerge; 90 files codemodded (20px card, 12px control, 14px xl, 18px 2xl, 22px 3xl, 10px lg, 16px and 2px to rem). Zero computed border-radius diffs on 6 routes at 1280px and 2 at 375px. Ratchet baseline 346 to 319. Token names were Ivan's "Start Batch 2" on the recommended names.
- Batch 0: `scripts/check-ui-units.mjs` + `check:ui-units` script + `scripts/ui-units-baseline.json` (was 649 px, now 346 px). Planted px made it fail; removed.
- Batch 1: 19 `--text-*` tokens in `globals.css` and 295 `text-[calc(Npx*...)]` sites in 82 files now `rem`. Zero computed-style diffs on 6 routes at 1280px and 3 routes at 375px (181, 175, 52, 43, 45, 39 elements at 1280). At root font size 20px a 12px label computes to 15px: rem works.
- Correction to the Batch 1 text above: swapping to the token classes (`text-body-sm` etc.) is NOT zero-diff, because those tokens carry their own line-height, letter-spacing and weight. Sites got a rem `calc` instead. The 89 px calc sites left are all under `app/dev-preview-uiport/` (out of scope).
- Half sizes (12.5px x21 etc.) were converted exactly (0.78125rem), not rounded; rounding was the only diff the first run found (12.4992px).
- Left in Batch 5: non-text px in `globals.css`.
**Rule (Ivan, 2026-11-21):** text in `rem`; layouts in `%`; full-screen sections in viewport units (`dvh`, `vw`); `px` for borders only. Why: pinned px values caused the nav, tap-target and 640px overflow breakage in the coherence pass. New and edited lines already follow it (memory `frontend-units-rem-percent-vw-px-borders`).

## 1. What exists today (measured 2026-11-21, `app/ components/ lib/`, tsx/ts/css)

| Pattern | Count | Kind of change |
|---|---|---|
| `text-[calc(Npx*var(--text-scale))]` | 386 | Sizes used: 18px x70, 16 x51, 13 x45, 12 x38, 20 x34, 11 x33, 12.5 x21, 14 x17, 22 x13, 15 x11, the rest under 8 each. 11, 12, 13, 14 and 16px equal an existing token (`label-sm`, `label-md`, `body-sm`, `body-md`, `body-lg`): swap to the token class (~184 sites). Other sizes: `calc(N/16 rem * var(--text-scale))`. Half sizes (10.5, 11.5, 12.5, 13.5, 17px, 34 sites) need Ivan's row-by-row call. Root font size is the 16px default, so default rendering is identical. |
| `rounded-[Npx]` (20px x90, 12px x62, 14px x23, 16px x12, 5 others) | 193 | Radius tokens already exist (`--radius-sm` to `4xl`, all derived from `--radius`, which is px in `:root`). 20px and 12px match none. Skill `eventar-frontend-type-radius-scale` rules 5 and 6: no new radius without a ruling, and the scale is an open ruling. Needs a pick (§5 Q1). |
| `mt-[..]`, `py-`, `px-`, `gap-`, `top-`, `pl-`... | ~150 | Mapping to spacing tokens or rem. Judgement per site. |
| `h-`, `w-`, `size-`, `min-h-`, `min-w-`, `max-w-` arbitrary px | ~140 | Layout: `%`, `rem` or `dvh`. Judgement per site. |
| `app/globals.css` px lines (token font sizes, fluid `clamp`, `scroll-padding-top: 72px`) | 103 lines | Mechanical for sizes; borders stay. |
| Inline `style={{ ... px }}` | 5 | Judgement. |
| Total px tokens | 1328 across ~175 files | |

Biggest directories: `components/event-form` 12 files, `components/details` 10, `components/ui` 9, `components/shell` 8, `components/analytics` 8.

## 2. What stays px (allowlist)
- `border`, `border-*` widths, `ring`, `outline`, hairlines 1px and 2px.
- `box-shadow` offsets and blur (not layout).
- Out of scope: `emails/` and any HTML email template (email clients need px), PDF, QR and poster print code, test files, `app/dev-preview-uiport/`.
- `.tap-44`: 44px target becomes `2.75rem`.

## 3. Batches (each: renders before and after, measured values, uncommitted until Ivan says commit)

| # | Batch | Visual change | Check | Est. |
|---|---|---|---|---|
| 0 | Ratchet checker `scripts/check-ui-units.mjs` (same shape as `check-ui-colours.mjs`): fails when a px outside the allowlist is added or the baseline count rises. Wire into `package.json` as `check:ui-units`. | none | runs green at baseline, red on a planted px | 30 min |
| 1 | Text sizes: the `--text-*` tokens in `globals.css` to `rem` (fixes every token user at once), then the 386 hand-written `calc(Npx*...)` sites: exact matches to the token class, others to a rem `calc`, half sizes held for Ivan. Codemod, not hand edits. | none at default | computed font-size equal on every route at 375, 640 and 1280 (script over a route list); 3 page renders | 45 min |
| 2 | Radii: 193 sites to tokens (`rounded-card` etc.) per the §5 Q1 pick. | none if tokens equal old values | computed `border-radius` equality; 3 renders | 40 min |
| 3 | Spacing: arbitrary px in `mt/py/px/gap/top/pl` to spacing tokens or rem. Rows listed per file first (`Where / Before / After`). | small, listed | per-file table; renders of event form, details, shell | 60 min |
| 4 | Sizes and layout: `h/w/min-h/max-w` arbitrary px. Widths to `%` or `max-w` in rem; full-screen hero and `min-h-[560px]` style blocks to `dvh`. | real, per site | per-site render at 375, 640, 1280; no horizontal scroll | 90 min |
| 5 | `globals.css` remainder: fluid `clamp` px to rem, `scroll-padding-top`, nav and sheet sizes. Borders stay. | none to small | `app/globals.test.ts` dark parity passes; renders | 30 min |
| 6 | Close: full static gates in order (tsc, eslint, vitest, then `next build`, then `test:rls`), dev-lens review, separate user-lens review, backtest at text size 100% and 125%. | none | per phase protocol | 40 min |

Total about 5 hours of agent time, best split over 2 or 3 sessions at batch boundaries. Batches 1, 2 and 5 are codemod-safe and can use a cheaper model on disjoint file sets (CLAUDE.md sweep rule 5). Batches 3 and 4 need renders per row and run in the main session.

## 4. Verification harness (built in Batch 0, reused after)
One script walks a route list (`/`, `/events`, an event page, `/login`, `/account/sign-in`, `/account/sign-up`, a staff page on the local stack) at 375, 640 and 1280. It records computed `font-size`, `border-radius`, `padding`, `margin`, `gap`, element width and height for a fixed selector set, then diffs against a saved baseline. Batches 1, 2 and 5 must diff to zero. Batches 3 and 4 must diff only on the rows Ivan approved.

## 5. Decisions needed from Ivan
1. **Radii: rem or px, and which tokens?** A radius is a corner, not a border width. Options: (a, recommend) convert `--radius` to `0.625rem` so the existing `sm` to `4xl` tokens scale, and name two new tokens for the 20px and 12px that 152 sites use; (b) leave radii in px as "borders"; (c) map every site to the nearest existing token, which changes corners by up to 2px at 155 sites. Cost of (a): it needs the radius-scale ruling that skill rule 6 says is still open.
2. **Go order.** Recommend 0, 1, 5 first (no visual change, biggest count), then 2, then 3 and 4 with renders.
3. **Half text sizes (10.5, 11.5, 12.5, 13.5, 17px; 34 sites):** round to the nearest token size, or keep as rem. Recommend round to the token: fewer one-off sizes. Shown as before and after rows first.
4. **Scope of "full-screen sections".** Recommend `dvh` for the landing hero and auth pages only; everything else stays content-sized with `rem` min-heights.

## 6. Risks
- A user who sets a larger browser font size will see every `rem` value grow. That is the goal, but layouts that were tuned only at 16px can overflow. Batch 6 checks 125%.
- Codemod must not touch `border`, `ring`, `shadow`, email and print code. The allowlist in the checker is the guard.
- Peers edit files in the same tree. Run `ListAgents` and `git status` before each batch and stage only this sweep's paths.
