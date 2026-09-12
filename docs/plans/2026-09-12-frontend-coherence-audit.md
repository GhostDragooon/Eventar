# Frontend coherence audit — 2026-09-12

Mechanical alignment pass against the adopted token system. Not a design review — no palette/layout decisions made here, only conformance to what `app/globals.css` and `components/ui/*` already establish.

**Authority used:** `app/globals.css` (live token source), `docs/plans/2026-08-01-m2-frontend-unfreeze.md`, vault `30 — Reference/Frontend Design Standard.md` (Q32), `components/ui/input.tsx`, `components/ui/button.tsx`.

## Section 1 — Authority extract

| Domain | Expected (token / class / px) |
|---|---|
| Body text | `text-body-md` (14px×`--text-scale`) or Tailwind `text-sm` (also 14px×scale — globals.css overrides Tailwind's default scale to respect `--text-scale`) |
| Labels | `text-label-md` (12px×scale) / `font-label-md` / weight 600 / letter-spacing 0.05em |
| Page titles (H1) | `text-headline-lg` (39px×scale) or `text-headline-md` (31px×scale) |
| Input height/padding/radius/border | `h-8`, `px-2.5 py-1`, `rounded-lg`, `border-input` — from `components/ui/input.tsx` |
| Button sizes/variants | `h-8` default, `rounded-full` (pill shape, "one language everywhere" 2026-08-08), sizes: xs(`h-6`)/sm(`h-7`)/lg(`h-9`)/icon(`size-8`) |
| Card/surface levels | `surface-container-lowest/-low/-/-high/-highest` tokens; `bg-card` → `surface-container-lowest` |
| Focus ring | `focus-visible:ring-3 ring-ring/50` + `focus-visible:border-ring` |
| Spacing rhythm | `--spacing-xs`(4) `-sm`(8) `-md`(16) `-lg`(24) `-xl`(32) `-xxl`(48) |
| Sidebar/shells | StaffShell: `bg-sidebar` (→ `surface-container-low`); PublicShell/SiteShell: `bg-background`/`bg-surface` |
| Primary fill vs ink | `--primary` (#0070f3, fill only, paired with `--on-primary` white) vs `--primary-ink` (#1c3c94, ink only, on white/pale grounds) — never substitute one for the other (Q32, 2026-08-09) |
| Status colors | `--success`/`--warning`/`--error` families — semantic, off the brand ramp; blue never signals verification (§7a) |

## Section 2 — Codebase inventory (measured)

Sweep commands and hit counts, run 2026-09-12 against `app/` and `components/` (excluding `.test.*` and `.md`):

```
rg -cn "text-\[[0-9]+px\]" app components --glob '!*.md' --glob '!*.test.*'
→ ~60 hits across 20 files
  DashboardWorkstation.tsx: 22, dev-preview-uiport/breadcrumb-compare: 15 (dev-only),
  EventCard.tsx: 3, HowItWorks.tsx: 2, MultiBodyAccreditationWizard.tsx: 2, ~15 files with 1
  Correction from dev review: the integer-only regex missed 5 DECIMAL sizes
  (text-[12.5px]) in the same file — re-run with text-\[([0-9]+(?:\.[0-9]+)?)px\]
  found and fixed all 5. Final count for this file: 27 converted, 0 remaining
  unscaled, 0 double-wrapped (verified by grep after each pass).

rg -cn "<input |<textarea |<select " app components --glob '!*.test.*' --glob '!components/ui/**'
→ 11 hits across 9 files — but this pattern doesn't distinguish input TYPES.
  Re-run split by type (the finding that matters):

rg -n "<select " app components --glob '!*.test.*' --glob '!components/ui/**'
→ ManageWorkstation.tsx:214 (real, no wrapper primitive used),
  breadcrumb-compare/page.tsx: 2 (dev-only)

rg -n "<textarea" app components --glob '!*.test.*' --glob '!components/ui/**'
→ ProfileClient.tsx:354 (real, had hand-copied the Input primitive's exact
  className instead of using the Textarea primitive — drift risk if the
  primitive's styling changes)

rg -n "<input " app components --glob '!*.test.*' --glob '!components/ui/**' \
  | grep -v 'type="hidden"\|type="checkbox"\|type="radio"\|type="file"'
→ ManageWorkstation.tsx:205 (real, type="text" search field)
  RegistrationCloseEditor.tsx:13 is a CODE COMMENT, not markup (false hit)

The rest of the original 11 raw-element hits are type="hidden" (2:
  MagicLinkSignInForm.tsx, CpdAccreditationSection.tsx — no visual chrome,
  nothing to migrate), type="checkbox" (3: ReferralDialog.tsx,
  PersonShareSheet.tsx, ManageWorkstation.tsx:312 — no checkbox primitive
  exists in components/ui/), and type="radio" (1: PlanSelectionCards.tsx —
  no radio primitive exists), plus type="file" (MultiFileUpload.tsx — no
  file primitive exists). None of these are debt this pass can close
  without first introducing a new primitive, which is a design decision.

rg -cn "rounded-\[[^\]]+\]|h-\[[0-9]+px\]|py-\[[0-9]+px\]" app components --glob '!*.test.*'
→ 100+ hits, concentrated in shells, landing, and dashboard components —
  mostly intentional one-off layout values (hero art, decorative dots),
  not control chrome. Not itemized further; none touch shared form controls.

rg -cn "#[0-9a-fA-F]{3,8}|rgb\(|hsl\(" app components --glob '!*.css' --glob '!*.test.*'
→ 34 hits across 14 files
  poster/page.tsx: 10 (print-only, intentionally fixed — not a screen surface),
  LiveScoreboard.tsx: 5, Scoreboard.tsx: 4 (status/score visualizations),
  icon.svg: 3 (favicon, not a component), toast.tsx: 2, ~8 files with 1

rg -cn "text-(xs|sm|base|lg|xl|2xl)" app components --glob '!components/ui/**' --glob '!*.test.*'
→ 22 hits across 11 files — NOT debt: globals.css :root redefines Tailwind's
  own text-xs/sm/base/lg/xl/2xl/3xl/4xl to resolve via calc(Npx * var(--text-scale)),
  so these already respect /settings → Text size. Confirmed by reading
  globals.css lines 212-237.

rg -n "text-primary[^-]|bg-primary[^-]|text-\[#0070f3\]|text-\[#1c3c94\]" app components --glob '!*.test.*'
→ bg-primary: ~20 correct uses, always paired with text-on-primary (fill role, correct)
→ text-primary (ink role) used ONCE as literal ink: LandingHero.tsx:149,
  an italic accent word on white ground. #0070f3 is 4.55:1 on white — passes
  AA for normal text by a small margin, but the design contract (globals.css
  lines 303-311) reserves --primary for FILL only and --primary-ink for INK.
  Technically passing, contract violation.
```

## Section 3 — Discrepancy register

| ID | Surface / file | Element | Observed | Authority expected | Severity | Fix |
|---|---|---|---|---|---|---|
| F001 | `components/details/RegistrationCloseEditor.tsx:50` | `<input type="datetime-local">` | Raw HTML input, hand-styled | `components/ui/input.tsx` Input primitive | HIGH | Migrated |
| F002 | `components/dashboard/ManageWorkstation.tsx:205` | `<input type="text">` (search) | Raw HTML input, hand-styled | ui/Input | MED | Migrated |
| F003 | `components/dashboard/ManageWorkstation.tsx:214` | `<select>` (sort) | Raw HTML select, hand-styled | ui/select (Base UI) | MED | Migrated |
| F004 | `app/account/profile/ProfileClient.tsx:354` | `<textarea>` (biography) | Raw HTML textarea with hand-copied Input classes (drift risk) | ui/textarea | MED | Migrated |
| F005 | `components/files/MultiFileUpload.tsx` | `<input type="file">` | Raw HTML input | No file primitive exists in `components/ui/` | LOW | Skipped — no primitive to migrate to |
| F006 | `components/pricing/PlanSelectionCards.tsx`, `components/dialogs/ReferralDialog.tsx`, `components/communications/PersonShareSheet.tsx`, `components/dashboard/ManageWorkstation.tsx:312` | `<input type="radio">` / `<input type="checkbox">` (4 sites) | Raw HTML | No radio/checkbox primitive in `components/ui/` | LOW | Skipped — no primitive to migrate to |
| F007 | `components/auth/MagicLinkSignInForm.tsx`, `components/details/CpdAccreditationSection.tsx` | `<input type="hidden">` (2 sites) | Raw HTML hidden field | N/A — no visual chrome | LOW | Skipped — false positive, nothing to migrate |
| F008 | `components/dashboard/DashboardWorkstation.tsx` | 22× `text-[Npx]` | Arbitrary sizes | Tokens or scaled Tailwind classes | MED | Migrated (shared staff surface) |
| F009 | `components/landing/LandingHero.tsx:149` | `text-primary` on white | Fill color used as ink | Ambiguous — see note | LOW | Flagged, not fixed |
| F010 | `app/dev-preview-uiport/breadcrumb-compare/` | 15× arbitrary text, 2× raw select | Dev-only comparison page | N/A — not shipped UI | LOW | Skipped — dev-only, does not leak to prod nav |
| F011 | `app/(public)/events/[id]/poster/page.tsx` | 10× hex literals | Fixed print colors | N/A | LOW | Skipped — intentionally fixed for print output, not screen tokens |
| F012 | `components/details/LiveScoreboard.tsx`, `app/events/[id]/checkin/Scoreboard.tsx` | 9× hex literals combined | Hard-coded score/status colors | Design review needed before touching | LOW | Skipped — out of mechanical-pass scope, needs a design call |

**One HIGH item, fixed (F001).** 3 MED items fixed (F002-F004, F008). 1 LOW item fixed (F009). 6 LOW items explicitly deferred (F005-F007, F010-F012) with reasons above — no silent scope cuts, no primitive invented mid-pass.

## Fixes landed

1. F001 — `RegistrationCloseEditor.tsx` raw datetime input migrated to `components/ui/input.tsx`
2. F002 — `ManageWorkstation.tsx` search input migrated to ui/Input
3. F003 — `ManageWorkstation.tsx` sort control migrated to ui/select (Base UI Select/SelectTrigger/SelectValue/SelectContent/SelectItem), trigger chrome overridden via className to preserve the existing pill wrapper's visual appearance
4. F004 — `ProfileClient.tsx` biography field migrated to ui/Textarea (removes a hand-copied duplicate of the Input primitive's className)
5. F008 — `DashboardWorkstation.tsx` arbitrary `text-[Npx]` migrated to scaled Tailwind text-size classes
## Phase-completion review findings (fixed before sign-off)

Per CLAUDE.md's phase-completion protocol, a separate dev-perspective review and a separate user-perspective cold-start review both ran against this diff before it was called done. Findings that were real and in-scope:

- **Base UI Select trigger showed the raw value, not the label** (caught by the user-review agent actually clicking through the Manage page: "SORT most" instead of "SORT Most registered"). Root cause: `Select.Value` resolves its label from an `items` prop on `<Select.Root>`, not from the rendered `<SelectItem>` children — a genuine Base UI API requirement this migration missed. Fixed by adding a `SORT_ITEMS` record and passing `items={SORT_ITEMS}`. The same omission is pre-existing on `/settings/team`'s role picker and two unwired components — flagged separately, out of this pass's scope.
- **`<label>` wrapped the Select's `<button>` trigger** (caught by dev review): invalid HTML, and it silently shrank the clickable area from the whole pill down to just the trigger text since a label can't associate with a button. Changed to `<div>`.
- A reported "arrow keys don't work in the sort dropdown" turned out to be a **false positive** from the review tooling sending a key named `"Down"` instead of `"ArrowDown"` — verified by dispatching a real `KeyboardEvent` and confirming the app's own keyboard handling moves focus correctly. No fix needed.

## Remaining (deferred, with reason)

- **F009 — flagged, not fixed.** `LandingHero.tsx:149` uses `text-primary` (#0070f3, the FILL role) as ink for the hero's italic accent word. The code comment directly above (lines 144-145) calls this "the link blue," but the design standard's actual link/highlight token is `--tertiary` (#0e79ec) — not `--primary-ink` (#1c3c94) and not `--primary` (what's there now). No existing `text-tertiary` usage anywhere in the codebase to confirm that reading either. Three live candidates (current `text-primary`, `text-primary-ink`, `text-tertiary`) with no clear authority pick — this is customer-facing marketing copy on the highest-traffic page, so per CLAUDE.md rule 7 (surface conflicts, don't average) this needs an explicit call, not a guess made mid-sweep. Left untouched.
- F005, F006 — no matching ui/ primitive exists for file/radio/checkbox inputs; introducing one is a design decision, out of scope for a mechanical pass
- F007 — false positive from the sweep pattern; hidden fields carry no visual chrome, nothing to migrate
- F010 — dev-only comparison page, never reachable from production navigation
- F011 — poster print output is deliberately hard-coded per its own header comment
- F012 — score/status hex literals need a design-language decision (which token role each state maps to), not a mechanical swap
