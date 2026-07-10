# Role-Split Refactor — Scoped Inventory (do NOT execute yet)

> **Status:** scoping only. No code. Re-entry criterion: whenever the platform-role /
> body-label split is prioritised (post-Sprint-3b onboarding of a real body with its
> own role vocabulary). This doc exists so the eventual refactor is *scoped, not
> discovered mid-flight* — the exact underestimate ("additive, whenever") that made the
> Sprint 3a role-widen cost real review effort.

## The change, in one line

Introduce a **platform-role enum** (hardwired, maps to RLS) separate from **body-specific
role labels** (configurable rows in a `body_role_mappings` table). A new body's vocabulary
("CPD Assessor", "Committee Auditor") becomes mapping *rows*, not a migration. Every current
site that keys on a raw `staff.role` literal must route through the mapping.

## Why it's not "additive, whenever"

It touches every RLS policy and function that resolves a role. The Sprint 3a widen already
proved this blast radius is real — `is_manager()`, `pseudonymise_user`, `transition_dsr`,
`mark_attended`, `publish_event` and a fistful of fixtures all hardcoded role literals and
all needed coordinated changes. The **mitigating** finding from the live sweep below: the
blast radius is real but **partially pre-consolidated** — most sites already route through
three existing indirection points (`is_manager()`, `is_eventar_staff()`,
`require_active_staff()`), so the refactor extends three choke points rather than rewriting
dozens of scattered comparisons. That's the good news; the inventory is still mandatory.

## Full live blast radius (queried against the DB, not migration history)

### A. The three existing indirection points — extend these, don't bypass
| Site | Current role logic | Refactor action |
|---|---|---|
| `app_private.is_manager()` | `role in ('organiser_admin','eventar_staff')` | resolve via platform-role mapping |
| `app_private.is_eventar_staff()` | `role = 'eventar_staff'` | resolve via platform-role mapping |
| `app_private.require_active_staff(variadic p_roles)` | callers pass raw role literals as args | args become platform-role enum values; body labels resolved before the call |

### B. Definer functions passing raw role literals to `require_active_staff(...)`
| Function | Literal args today |
|---|---|
| `transition_dsr` | `('organiser_admin','eventar_staff')` |
| `mark_attended` | `('organiser_admin','organiser_member','eventar_staff')` |
| `publish_event` | `('organiser_admin','organiser_member','eventar_staff')` |
| `verify_licence` | `('body_admin','eventar_staff')` |
| `lapse_licence` | `('body_admin','eventar_staff')` |
| `revoke_licence` | `('body_admin','eventar_staff')` |
| `pseudonymise_user` | inline `role in ('organiser_admin','eventar_staff')` (not via the helper) |

### C. RLS policies with role literals **inlined** (not via a helper) — the easy-to-miss ones
| Table | Policy | Inline literal |
|---|---|---|
| `credit_ledger` | `credit_ledger_body_admin_read` | `s.role = ANY(ARRAY['body_admin','eventar_staff'])` |
| `practitioner_licences` | `practitioner_licences_body_admin_read` | `s.role = ANY(ARRAY['body_admin','eventar_staff'])` |

### D. RLS policies routing through the helpers (change once the helpers change — no per-policy edit)
`audit_events_staff_read`, `consent_staff_read`, `dsr_staff_all`, `organisations_staff_read`,
`users_staff_read` — all `is_manager() OR is_eventar_staff()`. These are covered by fixing A;
listed so the refactor knows they're *already* consolidated and don't need touching individually.

### E. TS app-layer sites (frozen frontend — change with the unfreeze, not before)
| File:line | Check |
|---|---|
| `app/dashboard/actions.ts:19` | `staff.role !== 'eventar_staff'` |
| `app/(public)/events/[id]/page.tsx:65` | `staff.role === 'eventar_staff'` |
| `app/events/[id]/details/page.tsx:90` | `staff.role === 'eventar_staff'` |
| `app/events/[id]/details/emailActions.ts:66` | `staff.role === 'eventar_staff'` |
Plus `lib/auth.ts`'s `Staff.role` union type and the duplicate prop-type declarations in
`components/shell/StaffShell.tsx` / `app/settings/SettingsClient.tsx`.

### F. Test fixtures inserting `staff` rows with role literals
`tests/rls/*.rls.test.ts` and `tests/audit/licence_mutations.test.ts` — several insert
`staff` rows / call RPCs with raw role values. These follow the code; enumerate at execution
time, they're mechanical once A–E are settled.

## Sequencing note for the eventual execution
1. Add the platform-role enum + `body_role_mappings` (additive, no behaviour change).
2. Fix the three choke points (A) to resolve through the mapping.
3. Convert the two inline policies (C) and `pseudonymise_user`'s inline check.
4. `require_active_staff` callers (B) — arg lists become platform-role values.
5. TS sites (E) — **with** the frontend unfreeze, not before (and remember `is_manager()`'s
   coverage was never extended to the 4 TS `eventar_staff`-only checks — see DEFERRED).
6. Fixtures (F) last, driven by `tsc`/`test:rls` red.
