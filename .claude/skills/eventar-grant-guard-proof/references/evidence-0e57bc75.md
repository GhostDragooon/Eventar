Test Files  1 failed | 1 passed (2)
      Tests  4 failed | 7 passed (11)
AssertionError: expected true to be false // Object.is equality
AssertionError: expected { ok: true, rows: +0 } to deeply equal { ok: true, rows: 1 }
--- mutant: link trigger off (the tests must now notice)
     × authenticated UPDATE that changes profile_snapshot is blocked by the trigger (42501) 21ms
     × authenticated UPDATE that changes user_id is blocked by the trigger (42501) 12ms
     × authenticated UPDATE that changes source is blocked by the trigger (42501) 16ms
--- D14
       × a body admin and an anonymous caller may not 12ms
expect(anon.error?.message ?? '', 'must be the grant layer, not the function body').toMatch(/permission denied for function update_registration_contact/i);