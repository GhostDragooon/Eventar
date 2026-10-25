---
name: eventar-gate-behaviour-sweep
description: Use when changing an Eventar gate's window, status or role.
category: verification
---

# A changed gate leaves its old claim behind; sweep for it before reporting the change

- Before calling a gate change done, grep the old behaviour's words across `docs/`, `scripts/`, `lib/`, `app/` and `docs/DEFERRED.md`. Example: `grep -rni "time-gated\|deliberately not" docs scripts lib app`.
- Every hit that still describes the old behaviour is a defect in the same change. Rewrite it to the new behaviour, and record the migration that changed it in the DEFERRED row or the card hand-back.
- A demo or seed script that runs at a fixed offset is the usual casualty. Re-derive which surfaces still work at that offset and state it in its run sheet.
- A comment that says a string or rule has one source ("one voice", "shared source") is a claim to check. Grep each copy of the wording, including pages and server actions that render their own literals. A "shared" comment over separate literals is a defect in the same change.
- Open-item rows in the active plan that the change closes are swept too (for example an O-row in `docs/plans/2026-10-11-mvp-execution-plan.md`). Mark each closed with the migration name in the same change.
- A gate that reads a derived row (an `event_occurrences` window, a cached status) is only as correct as that row's writers. Before shipping, grep every UPDATE path of the source columns (`update_event_with_blocks`, seed scripts, edit actions) and check the derived row follows each one.
- A filter enforced by RLS (a `deleted_at is null` or `status = 'published'` policy) covers only reads through the user client. Service-role or admin-client readers bypass it. Before calling a visibility gate done, grep every `createAdminClient` or `admin` reader of the same table under `app/` and `lib/`, and check each one applies the gate or is named in the hand-back as not gated.
- Deleting a fallback that masked drift exposes the drift. After removing the "single occurrence, any time" style branch, re-check which edits leave the derived row stale, and add a test that edits the source column and then runs the gate.
- The hand-back lists which claims were swept and what each now says.
