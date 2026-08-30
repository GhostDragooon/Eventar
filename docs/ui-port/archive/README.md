# Archived: superseded by existing shell components

`FloatingNavigation.tsx` and `CollapsibleSidebar.tsx` were ported from the
Category 03 vanilla source before checking whether the job they do already
exists in production. It does:

- `FloatingNavigation.tsx` duplicates `components/shell/SiteShell.tsx` — the
  same sticky floating pill nav, same audience (public/attendee).
- `CollapsibleSidebar.tsx` duplicates `components/shell/StaffShell.tsx` — the
  organiser left sidebar, which the vault's `Frontend Design Standard.md`
  (§4, locked 2026-08-09) already specifies as the canonical pattern.

Both also hand-copied the "Eventar" wordmark instead of using
`components/shell/BrandMark.tsx`, which that same vault note explicitly
warns against.

Kept here for reference only — not part of the active component tree, not
type-checked or linted (see the `docs/ui-port/archive/**` exclusion in
`tsconfig.json` and `eslint.config.mjs`). Do not import from here.
