import { supabaseBrowser } from '@/lib/supabase/browser';

export type DoorSession = 'signed_in' | 'signed_out' | 'ended';

/**
 * What the attendee doors (/account/sign-in, /account/sign-up) need to know
 * before they redirect an "already signed in" visitor away.
 *
 * A cookie is not proof of a session. A server-side sign-out (the §4 abuse
 * tier, "sign out everywhere" on another device) leaves the cookie behind,
 * and a door that trusted it looped /account ⇄ door forever while the server
 * pages, which verify, kept bouncing back (verified live 2026-10-14, Q45).
 * So a cookie session is confirmed with the server first. 'ended' means the
 * server rejected it: the dead cookie is cleared so the form can work. A
 * network failure is not proof the session is dead, so it is left alone.
 */
export async function checkDoorSession(): Promise<DoorSession> {
  const sb = supabaseBrowser();
  // eslint-disable-next-line no-restricted-syntax -- cookie read only; verified below before any redirect
  const { data: local } = await sb.auth.getSession();
  if (!local.session) return 'signed_out';
  const { data, error } = await sb.auth.getUser();
  if (data.user) return 'signed_in';
  const status = error?.status ?? 0;
  if (status >= 400 && status < 500) {
    await sb.auth.signOut({ scope: 'local' });
    return 'ended';
  }
  return 'signed_out';
}
