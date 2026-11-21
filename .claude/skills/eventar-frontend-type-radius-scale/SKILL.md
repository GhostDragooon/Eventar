---
name: eventar-frontend-type-radius-scale
description: Use when editing Eventar font, radius or spacing classes, px/rem/%/vw/dvh sizing, adding a `--text-*` token, changing a colour value in `app/globals.css`, or writing user-facing apostrophes or acronyms.
category: frontend-design
---

# Eventar: use only defined type, radius and spacing tokens

Tokens live in one `@theme inline` block in `app/globals.css`. A Tailwind class that names no token emits no CSS and fails without error.

1. Before you ship a class, grep its name in `app/globals.css`. If it is not in the `@theme inline` block, do not use it.
2. Do not use `text-title-md`, `text-title-sm`, `text-label-lg`, `rounded-xxl`, `py-2xl` or `gap-2xl`. None is defined.
   Sweep for them with `grep -rnE '(text|font)-(title-md|title-sm|label-lg)\b|rounded-xxl\b|(py|gap)-2xl\b' app components --include='*.tsx' --include='*.ts'`. Single-quote the pattern and the globs: zsh expands an unquoted `--include=*.tsx` and fails with `no matches found`. Read each hit. A match inside a JSX comment (`py-2xl` in `app/invite/[token]/page.tsx`) is not a use.
3. Use the defined type scale: `display`, `headline-lg`, `headline-md`, `headline-sm`, `title-lg`, `body-lg`, `body-md`, `body-sm`, `label-md`, `label-sm`.
4. Use the defined spacing scale: `xs`, `sm`, `base`, `md`, `grid-gutter`, `lg`, `grid-margin`, `xl`, `xxl`. Radius: `sm` to `4xl`. Neither has `2xl` or `xxl` radius.
5. Do not add a new hand-written `calc()` text size or a new radius to a surface. Ask Ivan first. Ivan's 2026-11-19 typography pick approved two fluid sizes and nothing else: a `clamp()` on `--text-headline-lg` (28px at 375px, 39px from about 1320px) and the `--text-hero` token for the landing h1 only. Any further size needs its own pick.
6. The type and radius scale is an open ruling: `Design Language.md` and `globals.css` disagree, and the Frontend Design Standard sets none. Ivan ruled one swap set on 2026-11-16 (rule 7). Outside that set, do not align to either until Ivan rules. Show before and after for any change.
7. Replacement map for the dead classes, approved by Ivan on 2026-11-16 as Batch 1. Apply these as class-only swaps and keep every other class on the line:
   - `<th>` `font-title-sm text-title-sm` → `font-label-md text-label-md`
   - list-row title `font-title-md text-title-md` → `text-body-md font-semibold`. If the element already has a font-weight class, keep it and add none.
   - section `<h2>` `text-title-md font-semibold` → `font-title-lg text-title-lg`
   - panel `<h3>` `text-label-lg font-semibold` → `text-body-md font-semibold`
   - settings link `font-label-lg text-label-lg` → `font-label-md text-label-md`
   - `rounded-xxl` → `rounded-[20px]`. This is the one arbitrary radius and is approved only for this swap. Reuse it only with a new ruling.
   - `lg:gap-2xl` → `lg:gap-xxl`
   If a site's neighbouring classes differ from the pattern, leave it and report the line.
8. A new `--text-<name>` token in `app/globals.css` needs its name registered in two files: add it to `TYPE_SCALE` in `lib/utils.ts` and to the name list in `lib/utils.test.ts`. Without that, `text-<name>` is not treated as a size and `lib/utils.test.ts` fails with `text-<name> is not registered in lib/utils.ts`. Ivan's `--text-hero` (2026-11-19) needed both.

9. User-facing copy uses typographic quotes: apostrophes are U+2019, quoted phrases are U+201C and U+201D. Never straight quotes in JSX text, string literals, toasts or email subjects. Visible acronyms (CPD, CME, CE, HKCP, HKAM, AHP, FCAA) take `<abbr title="...">` on their first occurrence per rendered surface. Add no small-caps styling for acronyms: Ivan amended that ruling on 2026-11-20. Leave code comments, identifiers, test files, attributes (`title`, `aria-label`, `alt`) and email templates as written.

10. A colour value change in `app/globals.css`, light or dark, is also a role check. Recompute the WCAG contrast of every pair the token sits in, on both themes, with the relative-luminance formula (a short `node -e` script is enough). Then update that token's row in the vault `30 — Reference/Frontend Design Standard.md` and append a dated `## Update` section in the same run. The 2026-11-20 update recomputed only the light pairs and wrote "dark pairs not recomputed here". Do not leave a dark pair unchecked.

11. Units for every new or edited frontend line (Ivan, 2026-11-21): text in `rem` or a `--text-*` token, layouts in `%` or the rem-based spacing tokens, fullscreen sections in viewport units (`dvh`, `vw`), `px` for borders only. `vw` or `dvh` inside a text size is a violation, even inside a `clamp()`. A `clamp()` whose terms are all rem is allowed. The 2026-11-19 `--text-hero` and `--text-headline-lg` clamps use `vw` inside text, so they conflict with this rule. That conflict is open until Ivan picks an option: rule 5 stands until then, and the pick line must name the outcome. The ratchet `check:ui-units` counts px only, so it will not catch `vw` in text. Grep `vw` in `app/globals.css` and in text classes by hand. This overrides "match the surrounding convention" for new code. The existing-px sweep is now approved (Ivan, 2026-11-21: "A", then "stop using px for everything"). Run it in batches. Read the plan's status line (`docs/plans/2026-11-21-px-to-relative-units-sweep.md`) before starting a batch; it records which batches are done. Each batch needs the ratchet gate and a before/after no-diff check (see `check:ui-units` in `eventar-static-gates`, and `rendered-alignment-measurement`). Before a batch, grep the whole tree for every px form, not only the codemod's target list: `calc(...px)`, `grid-cols-[...px]`, `size-[calc(...)]`, `text-[11px]`. Do not trust a plan line that says all remaining px sites sit in one folder. Check the plan's out-of-scope list before editing a file: a file it names out of scope stays out of the batch, even when the edit is `print:hidden`.
12. Converting px to rem in a sweep: write px/16 as an exact fraction. 12.5px is `0.78125rem`, 11px is `0.6875rem`. Never round to four decimals: rounding gave `12.4992px` for 12.5px, and only the computed-style diff caught it. Swapping a site to a token class (`text-body-sm`) is not a no-op, because the token also sets line-height, letter-spacing and weight. Keep the site's `calc(... * var(--text-scale))` shape and put the rem value inside it. Correct any plan line that claims zero diff before measuring it.
14. A `calc()` never mixes px and rem. When a sweep converts one term, convert every term in that `calc()`: `w-[calc(50%-3px)]` beside `left-[0.1875rem]` drifts apart as the root size grows (the dev-lens check at a 20px root: gaps of about 3.75px and 2.25px). Verify at a non-default root or the 125% text scale. The default 16px root hides this class of bug.

Unit rule (Ivan, 2026-11-21, new frontend code): text sizes in `rem`, layout widths and gaps in `%`, full-screen sections in `vw`/`vh`, and borders stay in `px`. New code does not add `px` for text, spacing or layout. Check the surrounding siblings before you write a value, and say in the reply when an existing `px` value is kept on purpose.

13. A new `--radius-<name>` token (Batch 2, 2026-11-21: `--radius-card` 1.25rem, `--radius-control` 0.75rem) needs its name in `theme.radius` of the twMerge config in `lib/utils.ts`, and a case in `lib/utils.test.ts`. Without it, `cn()` does not know `rounded-<name>` and cannot merge it against `rounded-xl` or the other radius classes. Check a `cn()` call that mixes the new class with another `rounded-*` class and read the output.

15. A `--text-*` or radius token that a Tailwind utility reads through `@theme inline` copies its value when the CSS builds. Overriding or editing the `:root` value of that token alone can leave the rendered size unchanged. Keep the token as an indirection (`--text-hero: var(--text-hero-step)`) and change the step variable. Then reload and read `getComputedStyle(el).fontSize` at two widths before showing any frame. This does not approve a new size: rule 5 still applies.

Audit detail, with its limits: `references/token-audit-2026-11-15.md`.
