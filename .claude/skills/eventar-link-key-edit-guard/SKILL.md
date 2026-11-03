---
name: eventar-link-key-edit-guard
description: Use when editing a value a claim or link function matches.
category: security
---

# An edit to a link key uses the link's own predicate

A claim that matches rows by value links every matching row, whatever its current link state. Before an UPDATE may change that value, copy the claim's WHERE clause into the edit's guard. A guard on `user_id is not null` alone lets an unlinked, attended registration be re-routed to a new owner.

- List every SECURITY DEFINER function that matches on the column: grep `supabase/migrations` for the column name and read each hit.
- The edit refuses when the claim would link the row (`user_id is null`) or the row holds attendance or credit (for example a `registration_checkins` row). Refuse with a named error, not a silent no-op.
- Verify by executing: attend an unlinked registration, change its email through the action, then run the claim as the new owner. The edit must be refused; if it succeeds, the claim must link nothing.
