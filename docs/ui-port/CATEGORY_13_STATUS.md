# Category 13 — Appearance and Display Preferences: status

**Not ported. Superseded by already-shipped, more capable production code.**

`app/settings/SettingsClient.tsx` already ships a full appearance preference
UI: `RadioCardGroup` driving `THEME_OPTIONS` (light/dark/system, via
`lib/theme.ts`) and `TEXT_OPTIONS` (small/default/large, via
`lib/textSize.ts`), both backed by real localStorage persistence, a FOUC
script in `app/layout.tsx` that applies the choice before hydration, and
`useSyncExternalStore` + a `storage` event for same-tab and cross-tab sync.

The source category's three components are each inferior to what's live:

- **`ThemePreferenceControl`** — the same 3-way radio-card shape as the real
  `RadioCardGroup`, but generic and unwired; its own default
  (`supportedPreferences = ['light']`) assumes no dark-mode adapter exists.
  Eventar already has one, shipped.
- **`ThemeToggle`** — a binary light/dark switch. Wiring it would be a
  regression from the real control's three options (light/dark/**system**).
- **`AppearancePreview`** — a decorative token-preview card with a fake
  "Example action" button. No live page has a use for it; the real settings
  page doesn't need a preview of itself.

Porting near-duplicate, strictly weaker versions of an already-shipped,
tested feature would be exactly the kind of drift the primitive-gate work
this session exists to prevent, so nothing was written to
`components/appearance/`. If a genuine gap shows up later (e.g. a *reusable*
appearance control for a context outside `/settings`), revisit from that
concrete need rather than this source package.
