// H4 — one dictionary for claim/claim-count errors, shared by AccountClient
// and ClaimClient. Two callers were rendering different sentences for the
// same error string, which is exactly the drift Rule 11 (convention) exists
// to prevent. Add to this union here first; do NOT branch per-caller.
//
// 2026-09-05 dev-lens fix: dropped the `(string & {})` widening. A new
// server-side error string added to claimMyRegistrations without touching this
// file would compile silently and fall through to the generic message,
// defeating H4's whole point. Now TS catches missing cases; runtime `default:`
// still covers a truly-unknown error with a generic sentence.
export type ClaimActionError =
  | 'email_unverified'
  | 'rate_limited'
  | 'not_authorized'
  | 'db_error';

export function claimErrorCopy(error: ClaimActionError | string): string {
  switch (error) {
    case 'email_unverified':
      return 'Confirm your email first — check your inbox for a link from Eventar, then try again.';
    case 'rate_limited':
      return 'Too many attempts in a short window. Please wait a moment.';
    case 'not_authorized':
      return 'You need to sign in first.';
    default:
      return 'Could not link right now. Please try again.';
  }
}
