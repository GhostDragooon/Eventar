  // Holds registration row locks across transactions. This file is in the serial stage of the test:rls script, with the
  // other files that run DDL in a transaction (updateAsRoleWithGrant): in parallel with the main stage they deadlock.
  describe('a check-in racing an email edit on an unattended, unlinked registration', () => {
run 4 exit=1 ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯  Tests 1 failed | 504 passed | 2 skipped (507)
 FAIL  tests/rls/registrations_link_immutability.rls.test.ts > registrations link-columns immutability > authenticated UPDATE that changes source is blocked by the trigge