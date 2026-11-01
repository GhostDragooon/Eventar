---
name: eventar-sign-out-server-revoke
description: Use when changing Eventar sign-out or signOut redirects.
category: security
---

# Eventar sign-out: one shared helper, leave only after the server revoke worked

Every Eventar sign-out goes through `signOutAndLeave()` in `lib/signOut.ts`. It navigates to the signed-out page only when signOut returned no error. On failure it stays on the page, shows "Could not sign out. Try again.", and the button stays usable. Exception: a rejected token refresh removes the session before the error returns, so the error can show to someone already signed out. Pressing again succeeds. Never write comments or copy that say the session is still in place on error.

- Current callers: AccountShell (rail and onboarding bar), AccountMenu, the account Session card in `app/account/AccountClient.tsx`, and organiser Settings through `components/auth/SignOutAction.tsx`. A new sign-out surface calls the helper. Do not call `supabase.auth.signOut()` from UI code.
- Never ignore `{ error }`. Never show signed-out copy when the revoke failed.
- Keep the verbs "Log in" and "Sign out" (Ivan's ruling, 2026-11-01).
- The invite and `/login` PractitionerPanel sign-outs were left as they were. Check them when you touch those files.
- Verify on the local stack: run the blocked-logout probe from the global `supabase-auth-signout-error-handling` skill (if that skill is not in the index, block the route alone), then in the browser block `**/auth/v1/logout*` and press Sign out on each surface. Expect the alert, the page still signed in, and a working button. Unblock, press again, and expect the redirect.
- A menu that closes on outside click or Escape must stay open while signing out. Otherwise the failure alert is invisible. Clear the error when the menu reopens.
- Put the failure alert outside `role="menu"` (a sibling). ARIA allows only menu items inside a menu.
- Each sign-out surface needs a test that renders a failing signOut and asserts the alert, the enabled button, and that a successful retry clears the alert. Removing the error assignment (`setError(await signOut())` becoming `await signOut()`) must fail a test; if none fails, the failure UI is untested.
