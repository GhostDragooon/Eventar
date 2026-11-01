exit=1
   1  Test Files  2 failed | 7 passed (9)
   1  FAIL  app/login/page.test.tsx > /login — signed-in practitioner (D1) > shows signed-in chrome rather than the "Sign in" pill
   1       Tests  16 failed | 126 passed (142)
(Earlier, from the gate script output: "== vitest (auth paths)" followed directly by the Vitest HTML dump and "exit=1" with no failing test names; the gate tail cut off the failure list. Untruncated tip run: "Tests  16 failed | 2377 passed (2393)".)