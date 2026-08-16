# UI port pull request checklist

## Source discipline

- [ ] Read `AGENTS.md`, `CLAUDE.md` and `docs/plans/PROJECT_STATE.md`.
- [ ] Read `app/globals.css` before writing classes.
- [ ] Read the existing component and adjacent siblings.
- [ ] Recorded all source EV identifiers.
- [ ] Recorded any behavioural deviation.

## Colour contract

- [ ] No prototype colour variable was copied.
- [ ] No hexadecimal, RGB, HSL or named colour was added to a component.
- [ ] No new colour custom property was introduced.
- [ ] Filled primary controls use `bg-primary text-on-primary`.
- [ ] Primary text on pale surfaces uses `text-primary-ink`.
- [ ] General text uses `text-on-surface`.
- [ ] Supporting text uses `text-on-surface-variant`.
- [ ] Borders use `border-outline-variant`.
- [ ] Error, success and warning states use semantic roles.
- [ ] Primary blue is not used to imply verification or success.
- [ ] No `data-theme` or parallel dark palette was added.

## Behaviour and accessibility

- [ ] Prototype interaction behaviour is preserved.
- [ ] Keyboard operation is verified.
- [ ] Focus placement and return are verified.
- [ ] Pointer and touch behaviour are verified where relevant.
- [ ] Reduced motion is verified.
- [ ] Loading does not imply success.
- [ ] Empty and error states are present.

## Review

- [ ] Light mode reviewed.
- [ ] Dark mode reviewed.
- [ ] Behavioural tests added or updated.
- [ ] No-new-colour script passes (`pnpm check:ui-colours`).
- [ ] No unrelated production files were changed.
