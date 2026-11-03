---
name: eventar-server-action-write-guards
description: Use when a Server Action write needs a role gate or 500s.
category: security
---

# A write Server Action enforces the same gate its UI and copy promise

The check that decides who may write runs inside the action, before any read or write. A disabled button or a read-only sentence is not a gate.

- Call the role helper the UI uses (`canCheckIn(role)` in `lib/auth.ts`) first. For a refused role, return the shared constant (`CHECKIN_ROLE_MESSAGE` in `lib/lifecycle/eventLifecycle.ts`). Do not copy the role list into the action.
- Map Postgres errors to plain copy, never HTTP 500:
  - `42501` (grant denied, including another organisation's staff) → "You do not have access to this event."
  - `40P01` / `40001` (deadlock, serialization) → "That check-in collided with another change. Try again."
- Validate enum inputs with Zod (`z.enum([...])`) and return a plain message. An unchecked value that reaches the RPC returns a 500.
- Sort on save inside the action, not only in the form. Sort by start instant (stable), send the sorted blocks to the RPC, and map returned ids back through the permutation so an unsorted client still maps correctly.
- Write the sorted index into the stored order field as well. `create_event_with_blocks` saves the `display_order` it is sent (`coalesce((block->>'display_order')::int, 0)`), while `update_event_with_blocks` uses array position. Map each block to `{ ...block, display_order: pos }` before the RPC, or a stale client's numbers decide the saved order. Ivan's ruling 2026-11-02: the agenda is saved in start-time order. Test: send blocks with conflicting `display_order` values and assert the RPC argument carries 0..n in start order.
- A field the form always fills (agenda block start time) still gets a plain server error. The action may not assume the form ran.
- Test: a refused role triggers no insert or update, and each error code maps to its plain message. Revert the gate once and confirm the test fails (see `regression-test-must-fail-first`).
