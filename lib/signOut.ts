import { supabaseBrowser } from '@/lib/supabase/browser';

export const SIGN_OUT_FAILED = 'Could not sign out. Try again.';

/**
 * The one client sign-out. The server revoke is authoritative: supabase-js removes the local session only after the
 * server call succeeds (a 401/403/404 counts as already ended), and returns `{ error }` otherwise with the session
 * normally still in place (exception: a rejected token refresh clears it first, so the error can show to someone already
 * signed out; pressing again then succeeds). So we leave the page only on success, with a hard navigation (a full reload drops every in-memory
 * session view). On failure nothing changes and the caller shows the returned message; pressing again retries.
 * Returns the message to show, or null after navigating away.
 */
export async function signOutAndLeave(to: '/' | '/login'): Promise<string | null> {
  try {
    const { error } = await supabaseBrowser().auth.signOut();
    if (error) return SIGN_OUT_FAILED;
  } catch {
    return SIGN_OUT_FAILED;
  }
  window.location.href = to;
  return null;
}
