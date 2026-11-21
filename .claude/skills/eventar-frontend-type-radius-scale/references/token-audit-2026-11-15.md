# Eventar token audit, 2026-11-15 (read-only, not browser-verified)

Source: Explore subagent audit of `app/` and `components/` (tests and `app/dev-preview-uiport/` excluded).

## Defined tokens
- Single source: `app/globals.css`, `@theme inline` block.
- Type: `display` 48px, `headline-lg` 39px, `headline-md` 31px, `headline-sm` 25px, `title-lg` 20px, `body-lg` 16px, `body-md` 14px, `body-sm` 13px, `label-md` 12px, `label-sm` 11px. Each scales by `--text-scale` (0.875, 1, 1.125).
- Spacing: `xs` 4, `sm` 8, `base` 8, `md` 16, `grid-gutter` 16, `lg` 24, `grid-margin` 24, `xl` 32, `xxl` 48.
- Radius: `--radius` 10px; derived `sm` 6, `md` 8, `lg` 10, `xl` 14, `2xl` 18, `3xl` 22, `4xl` 26.
- No shadow tokens. Named shadows are hard-coded in `.glass-nav` and `.ledger-window`.

## Findings
- Undefined classes used: `text-title-md` and `text-title-sm` and `text-label-lg` (21 uses), `rounded-xxl` (5 cards), `py-2xl` and `gap-2xl`. The audit says these emit no CSS. Confirm by grep before relying on it.
- About 191 hand-written `calc()` text sizes sit outside the tokens. Page `<h1>` has 5 styles.
- Real card radius is 20px (58 uses) with no token. `ConfirmDialog` uses 16px, `Dialog` 20px.
- Shared `EmptyState` is imported nowhere. No shared kebab menu (5 hand-rolled). 3 toast recipes. About 8 inline-error recipes.
- Modal button order and alignment differ across 5 sites.

## Open ruling
- Frontend Design Standard (vault) sets no type, spacing or radius scale.
- `Design Language.md` (vault) scale disagrees with `globals.css`. Ivan decides which wins.