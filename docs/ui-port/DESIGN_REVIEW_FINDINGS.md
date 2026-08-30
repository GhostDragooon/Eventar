# Design review findings — live walkthrough, 2026-08-20

Findings from Ivan's live browse of `:3100` after the Category 06–13 port.
Both flagged findings were fixed in the same working tree before this
review-and-commit pass; this doc records the closure and how they were
addressed.

## 1. Button pill vs. status-badge height mismatch — CLOSED

Visible on `/events`: the "View details" button and the "REGISTERING" status
pill sat side by side at different heights.

- `components/ui/button.tsx` — default size is `h-8` (32px fixed height).
- `components/lifecycle/StatusPill.tsx` — `base` class was
  `px-sm py-xs ... inline-flex items-center gap-sm`, no fixed height.

**Fix (working tree)**: `StatusPill`'s base class now carries `h-8` with an
inline comment explaining it matches `components/ui/button.tsx`'s default
size. Both pills and adjacent buttons render at 32px consistently.

## 2. Site-wide serif display font — CLOSED

`app/globals.css:136-141` had `--font-display: var(--font-source-serif), …`
across every heading token, giving every h1 in the product a serif typeface.

**Fix (working tree)**: `--font-heading`, `--font-display`, and
`--font-headline-{lg,md,sm}` all reverted to `var(--font-inter), system-ui,
sans-serif` at Ivan's explicit request (see the inline comment in
`app/globals.css` — "reverted 2026-08-20 at Ivan's explicit, repeated
request … same sans stack as body text, not a new font"). The Hero's own
italic accent word (`font-serif` Tailwind utility on its `<em>`) is a
different mechanism and was untouched — that isn't what Ivan was
complaining about.

This is a same-day mechanical revert of a token value, not a full
typography redesign. Any future serif re-introduction would go through the
frontend pipeline as originally noted here.
