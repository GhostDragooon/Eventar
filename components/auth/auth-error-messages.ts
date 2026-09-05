// Kept in sync with the production dictionary in app/login/page.tsx
// (URL_ERROR_MESSAGES) — that one is inline/unexported, this is the
// reusable copy for the ported auth components.
//
// Two codes have audience-dependent copy: `not_authorized` (attendees are
// self-serve — there's no allowlist) and `unavailable` (mentions "organizer
// access", which is meaningless on the attendee door). The remaining two
// (`missing_code`, `exchange_failed`) are neutral and shared verbatim.
export type AuthAudience = 'organizer' | 'attendee';

const AUTH_ERROR_MESSAGES_ORGANIZER: Readonly<Record<string, string>> = {
  missing_code: 'The sign-in link was missing its verification code. Request a new one below.',
  exchange_failed: 'The sign-in link has expired or already been used. Request a new one below.',
  not_authorized: 'Your email is not on the organizer list. Contact an admin to be added.',
  unavailable:
    'We could not check your organizer access just now. This is on our side — please try again in a moment.',
};

const AUTH_ERROR_MESSAGES_ATTENDEE: Readonly<Record<string, string>> = {
  missing_code: 'The sign-in link was missing its verification code. Request a new one below.',
  exchange_failed: 'The sign-in link has expired or already been used. Request a new one below.',
  not_authorized: 'This email is not recognised. Sign up first by registering for an event.',
  unavailable:
    'We could not verify your account just now. This is on our side — please try again in a moment.',
};

/** @deprecated Prefer `resolveAuthError(code, audience)`. Kept for callers that predate the audience param. */
export const AUTH_ERROR_MESSAGES = AUTH_ERROR_MESSAGES_ORGANIZER;

export function resolveAuthError(code: string | null, audience: AuthAudience = 'organizer'): string | null {
  if (!code) return null;
  const dict = audience === 'attendee' ? AUTH_ERROR_MESSAGES_ATTENDEE : AUTH_ERROR_MESSAGES_ORGANIZER;
  return dict[code] ?? 'Sign-in could not be completed. Request a new link below.';
}
