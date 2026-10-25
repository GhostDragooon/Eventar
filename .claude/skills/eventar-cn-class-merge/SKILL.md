---
name: eventar-cn-class-merge
description: Use when cn() or twMerge drops a text colour class.
category: frontend-design
---

# Tailwind merge must know custom type-scale tokens, or it evicts text colour

Default tailwind-merge reads an unknown `text-*` class as a text colour. A custom font-size token such as `text-label-md` therefore evicts the colour class beside it (`text-on-primary!`), and the reverse can happen. Fix it once in the shared merger in `lib/utils.ts`, registering the token as a `font-size` class group. Never add a local override at a call site.

- Add cases to `lib/utils.test.ts` that assert both classes survive, in both orders: `cn('text-label-md', 'text-on-primary')` and `cn('text-on-primary', 'text-label-md')`.
- After changing the merger, diff the rendered classes at every call site it touches. A size class that was being evicted now applies, so some controls can shrink. CX-03 went from 14 or 16 px to the token's 12 px [R]. Show that before→after diff before presenting, per the frontend review rule.
- Lesson detail and the CX-03 measurements: `references/cx-03-evidence.md`.
