# Eventar UI Port Foundation

## Purpose

This package is the controlling foundation for porting the 13 Eventar vanilla component categories into the production Next.js and Tailwind codebase.

The vanilla category packages are authoritative only for:

* structure
* layout
* interaction sequence
* responsive intent
* motion intent
* component states
* keyboard behaviour
* focus movement
* empty, loading, success and error states

They are not an authorised source for colours, theme architecture, production component conventions, routing, data contracts or service behaviour.

## Production sources of truth

Before modifying production code, read in this order:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/plans/PROJECT_STATE.md`
4. the relevant vault notes required by the repository rules
5. `app/globals.css`
6. the existing component and its adjacent siblings
7. the relevant category package

Production uses Next.js 16, Tailwind v4 and the tokens exposed through `app/globals.css`. Verify Next.js specific APIs against the repository installed documentation before implementation.

## Non-negotiable colour contract

* `app/globals.css` is the only colour source.
* Never copy colours or colour variables from the vanilla prototypes.
* Never add hexadecimal, RGB, HSL or named colours in a component file.
* Never introduce a new colour custom property during a component port.
* Primary fill and primary ink are separate roles.
* Use `bg-primary text-on-primary` for a filled primary control.
* Use `text-primary-ink` for small primary text on white, pale or container surfaces.
* Use semantic error, success and warning roles for status meaning.
* Do not use primary blue to imply verification, approval or success.
* Dark mode must work through the existing production tokens.
* Do not introduce `data-theme`, parallel dark palettes or component-owned theme colours.

See `docs/ui-port/COLOUR_CONTRACT.md` for the fixed mapping.

## Porting model

Each category package delivered after this foundation must contain code only:

```text
category-NN/
  components/
  data/
  tests/
  index.ts
  PORT_MANIFEST.json
```

The category package must not contain:

* a duplicate token file
* prototype CSS
* a second global stylesheet
* colour hex values
* new colour custom properties
* a replacement theme controller
* unapproved marketing claims
* simulated backend completion

Shared guidance lives here once. Category packages reference it through their manifest.

## Required implementation sequence

1. Inspect production tokens and existing components.
2. Identify which existing production primitives can be reused.
3. Record the source EV identifiers and behavioural invariants.
4. Strip the prototype colour layer.
5. Implement structure and interaction with production conventions.
6. Map every visual role to an existing production utility.
7. Preserve visible UI and UX behaviour unless a deviation is documented.
8. Add or update behavioural tests.
9. Run the no-new-colour check.
10. Review light mode, dark mode, keyboard operation, focus and reduced motion.

## Shared foundations

`lib/ui-port/foundation-contract.ts` defines permitted component states and event result shapes without defining colours.

This package deliberately does not recreate buttons, dialogs or fields in isolation. During each port the agent must reuse the production primitive where one already exists. A new shared primitive is allowed only when the production codebase has no suitable equivalent and the category requires repeated use.

## Completion standard

A port is complete only when:

* behaviour is preserved
* production token utilities are used
* no prototype colour survives
* light and dark mode are reviewed
* status meaning is semantic
* service completion comes from a real result contract
* tests verify behaviour rather than markup presence alone
* `pnpm check:ui-colours` (or `node scripts/check-ui-colours.mjs`) passes
* the pull request checklist is complete

## Related files

* `docs/ui-port/COLOUR_CONTRACT.md` — fixed role mapping
* `docs/ui-port/PORTING_GUIDE.md` — preserve / replace rules
* `docs/ui-port/PR_CHECKLIST.md` — PR gate
* `docs/ui-port/PORTING_TASK.md` — agent task brief template
* `docs/ui-port/CATEGORY_PACKAGE_PLAN.md` — the 13 categories
* `docs/ui-port/PORT_MANIFEST.template.json` — per-category manifest
* `scripts/check-ui-colours.mjs` — automated colour gate
* `lib/ui-port/foundation-contract.ts` — shared types
