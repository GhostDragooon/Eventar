# Eventar component porting task

## Scope

Category:
Source EV identifiers:
Target production files:

## Required reading

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/plans/PROJECT_STATE.md`
4. relevant vault notes
5. `app/globals.css`
6. adjacent production components
7. `docs/ui-port/README.md` (Eventar UI Port Foundation)
8. source category package

## Hard constraints

* Do not use colours from the vanilla prototype CSS.
* Do not introduce new colour values or colour custom properties.
* Use only production token utilities from `app/globals.css`.
* Preserve the source UI and UX behaviour.
* Reuse existing production primitives first.
* Do not simulate service completion.
* Keep the change surgical.

## Behavioural acceptance criteria

List the visible and interactive behaviours that must remain unchanged.

## Colour acceptance criteria

Use the fixed mapping in `docs/ui-port/COLOUR_CONTRACT.md`.

## Verification

Run behavioural tests, the repository validation commands and `pnpm check:ui-colours`.
