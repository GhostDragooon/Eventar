<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI porting contract

When porting UI from an external or vanilla prototype:

1. Treat the prototype as structure and interaction reference only.
2. The colour source of truth is `app/globals.css`.
3. Never copy prototype colour values or prototype colour variables.
4. Never introduce hexadecimal, RGB, HSL or named colour values in component files.
5. Never introduce a new colour custom property as part of a component port.
6. Primary fill and primary ink are separate. Use `bg-primary text-on-primary` for fills and `text-primary-ink` for small primary text on pale surfaces.
7. Use existing surface, text, border and semantic status utilities registered by production.
8. Primary blue must not mean verified, approved, complete or successful.
9. Dark mode must work through existing tokens. Do not add `data-theme`, parallel dark rules or component-owned theme persistence.
10. Preserve the prototype UI and UX behaviour. Document any required deviation before implementation.
11. Reuse existing production primitives and conventions before creating a new shared component.
12. Service-dependent success must come from a real result contract, never an arbitrary timer.
13. Run the no-new-colour check (`pnpm check:ui-colours`) and review both light and dark mode before reporting completion.

Full guidance: `docs/ui-port/README.md`, `docs/ui-port/COLOUR_CONTRACT.md`, `docs/ui-port/PORTING_GUIDE.md`.
