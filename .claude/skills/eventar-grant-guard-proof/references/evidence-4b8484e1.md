=== MUTANT M4 no row lock, no status predicate
failing tests: 0
restored byte-identical
=== MUTANT M5 survey-answer check off
failing tests: 0
restored byte-identical

--- M5 (survey check off in the RPC)
       × the RPC itself refuses to remove an answered block for server code too (service_role skips the triggers) 23ms
Tests  1 failed | 49 passed (50)

`update_event_with_blocks` is no longer executable by `anon` (it was, through PUBLIC; it died at the table grants, now it dies at the door).