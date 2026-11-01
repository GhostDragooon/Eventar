---
name: eventar-server-action-role-gates
description: Use when gating an Eventar action by role or canX(role).
category: security
---

# An Eventar role gate mirrors the live RPC's admitted roles, not the card's claim

- Before gating an action by role, find the latest migration defining the RPC it calls (`grep -l "function public.<rpc>" supabase/migrations/*`, take the last file) and copy its role list into the `canX(role)` helper in `lib/auth.ts`.
- Gate only actions whose RPC refuses the role. A card saying "every action checks the role" is a claim to verify. If an RPC admits a role the card would block, leave that action ungated and list it under Findings as a question.
- Order inside a staff action: `requireStaff()`, then the role check, then Zod, then the RPC. The refusal returns before any database call.
- The UI lock uses the same helper, for the same roles. The database still refuses.
- If the RPC also checks ownership (for example `created_by = auth.uid()`), the UI lock must check that predicate too, using the event row, not the role alone. A role-only lock shows an enabled control that every call then refuses with the ownership error.
- A component rendered on several pages gets the lock prop on every page. Grep its usages (`grep -rn "MultiBodyAccreditationWizard" app components`) and wire each one. The accreditation wizard renders on both the details and edit pages; the edit page was caught only because the usage grep ran.
- The generic 42501 message must not claim ownership unless the RPC checks ownership. Assert it matches the role wording and does not match `/owner/`.
- Tests: one refusal case per refused role per action, asserting the RPC mock was never called; one allowed-role case per action; one case per ungated sibling confirming it still reaches the RPC.
- Status gates (only a draft may be edited) go AFTER the organisation check, so a stranger learns nothing about the event's status. Apply them to every role, including `eventar_staff`, when the action writes no audit row: refuse with a specific message.
- When a ruling changes a card's spec (for example DB-04's draft-only rule), amend the card text in the plan doc in the same change, so the spec and the code cannot disagree.
- Mutation-check each guard as in `regression-test-must-fail-first`.
