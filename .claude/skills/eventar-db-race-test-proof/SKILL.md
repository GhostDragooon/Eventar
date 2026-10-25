---
name: eventar-db-race-test-proof
description: Use when writing a Postgres row-lock or race test.
category: verification
---

# A lock test counts only after it sees the second writer waiting

Hold the lock on connection A inside an open transaction, start the competing statement on connection B, and poll `pg_stat_activity` until B shows `wait_event_type = 'Lock'` and its query text. Assert that wait before you COMMIT or ROLLBACK A. If the wait is never seen, the test proves nothing about the lock: fail it with that message.

- Open both clients on `LOCAL_DB` (127.0.0.1:54322 only). Inside B's transaction, set the caller's claims with `set_config('request.jwt.claims', ..., true)` and then `set local role authenticated`, so the function runs as the real actor.
- Do not await B's statement directly. Map it to `{ ok, code, message }` so a refusal is data the test asserts on, not a thrown crash.
- Poll with a bounded loop (100 tries, 50 ms apart), assert the wait, then COMMIT A and await B.
- In `finally`, roll back both transactions and end both clients. Ignore rollback errors on a transaction that already finished.
- Assert the losing side's effects as well: no audit row, row unchanged or gone.
- Prove the test bites: remove the lock clause (`for no key update`) or the not-found check in a mutant, and the named test must fail. See `eventar-grant-guard-proof` for the mutant harness.
- A not-found or re-check guard that runs after the lock is killed only by a case that changes the row while B waits (delete it, or update it). A row already absent before B starts leaves that guard's mutant alive.

Example recipe: `tests/rls/registration_contact_edit.rls.test.ts` (the "deleted while an edit waits" case).