     × an email that matches two active staff rows gets /login?error=multiple_organisations, logged without PII, session kept 3ms
...
FAILS proxy.ts | if (staffErr.code === 'PGRST116') { | Tests  1 failed | 9 passed (10)
FAILS auth.ts | if (staffErr.code === 'PGRST116') logMultipleStaffRows(userRes?.user?.id, staffErr.code);
FAILS auth-error-messages.ts |   multiple_organisations:  | Tests  1 failed | 7 passed (8)