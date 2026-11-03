---
name: eventar-fixture-leak-cleanup
description: Use when ZZ- test fixtures leak rows into the local DB.
category: verification
---

# Clean leaked test fixtures: count in a rolled-back dry run, then commit

Delete leaked fixtures only after a rolled-back dry run has printed the planned counts, and only inside the set bounded by the run's start time and the fixture prefix. Start from `templates/clean-fixture-leaks.sql`. Run it against 127.0.0.1:54322 only.

- Scope: rows created after the run started AND carrying the fixture title prefix or email domain. Older rows and unprefixed rows are drift to report, not delete.
- Dry run first: the file ends in `rollback;`. Read the planned and left counts. Then commit a copy whose last line is `commit;`. Never run a delete you have not counted.
- Find dependent tables from `information_schema.columns` on each run. Cast `::text` on both sides of every user_id comparison: `auth.refresh_tokens.user_id` is varchar, and `user_id in (select id from lu)` fails with `operator does not exist: character varying = uuid`.
- Never delete from `credit_ledger` or `audit_events` (Hard rule 11). If a leaked row is referenced by either, stop and ask Ivan.
- Do not set `session_replication_role = replica` to get past FK or trigger order: it switches off the triggers that guard invariants. If a delete hits an FK, delete that child first and re-run the dry run.
- After COMMIT, recount and name what remains. A count that differs from the last baseline is drift to report, not zero.
- `audit_events` grows during any run that another session shares the DB with. Attribute audit rows to fixtures by their fixture id or title, not by the count delta. Report the unattributed remainder by name as drift, and never delete it.
