// One sentence per "your session is gone" case, shared by every client that
// shows an account action's error (same convention as claimErrorCopy.ts:
// one dictionary, no per-caller wording; Rule 11). Before this, a signed-out
// user got "Fill both fields" or "Some fields need attention" and retried
// forever. Q45, 2026-10-14.
export function isSignedOutError(error: string): boolean {
  return error === 'session_revoked' || error === 'not_authorized';
}

export function signedOutCopy(error: string): string {
  return error === 'session_revoked'
    ? "For your security, you've been signed out on all your devices after repeated rapid attempts. Please sign in again."
    : "You're signed out. Sign in again to continue.";
}
