// Kept in sync with the production dictionary in app/login/page.tsx
// (URL_ERROR_MESSAGES) — that one is inline/unexported, this is the
// reusable copy for the ported auth components.
export const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  missing_code: 'The sign-in link was missing its verification code. Request a new one below.',
  exchange_failed: 'The sign-in link has expired or already been used. Request a new one below.',
  not_authorized: 'Your email is not on the staff list. Contact an admin to be added.',
  unavailable:
    'We could not check your staff access just now. This is on our side — please try again in a moment.',
};

export function resolveAuthError(code: string | null): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? 'Sign-in could not be completed. Request a new link below.';
}
