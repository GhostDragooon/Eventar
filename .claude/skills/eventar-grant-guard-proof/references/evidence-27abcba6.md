error: invalid input syntax for type json
 ❯ node_modules/.pnpm/pg@8.22.0/node_modules/pg/lib/client.js:652:17
 ❯ sqlSuperuserQuery tests/helpers/clients.ts:131:17

A fixture insert ran as superuser but with the previous actor's JWT claims still set, so the guard fired. Clearing claims around fixture inserts.

-   "member:move_speaker_row": "42501",
+   "member:move_speaker_row": "ok",
new-restored
      Tests  1 passed (1)