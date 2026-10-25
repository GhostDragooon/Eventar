---
name: eventar-ui-port-library
description: Use when pruning or deleting UI-port components.
category: refactoring
---

# Eventar UI-port library

The UI-port components are a deliberate category library. Being unreferenced does not make them dead. Never put them in a delete set.

For any change to one, write a Keep / Replace / Delete proposal row (what it is, live overlap, plan lines that name it, recommendation, cost) and wait for Ivan's ruling on that row. The row format is in `docs/plans/2026-10-14-ui-port-library-proposal.md`.

- The category plan that protects the directories: `docs/ui-port/CATEGORY_PACKAGE_PLAN.md`.
- The 2026-10-14 deletion, its hold, and the restore recipe: `references/ui-port-hold-2026-10-14.md`.
- Procedure for any unused-file removal: `dead-code-deletion` (steps 2 and 10).
