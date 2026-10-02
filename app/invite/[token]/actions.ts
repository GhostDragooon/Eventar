'use server';

import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';

// Same three tables, same definition of "practitioner data", as D3
// (2026-09-25): any professional profile, licence or event registration owned
// by the signed-in user. consent_records alone do not count — consent is only
// the account wizard's first step and holds no record.
const PRACTITIONER_TABLES = ['professional_profiles', 'practitioner_licences', 'registrations'] as const;

type InviteFailure = {
  error: string;
  needsSignIn?: true;
  /** Pressing the button again cannot help (the invite is spent, expired or unknown): the page drops it. */
  final?: true;
  /** The caller already belongs to the organisation: the page offers the dashboard instead. */
  alreadyMember?: true;
  /** This link was used. The person it was used by may well be the one reading this
   *  (they joined, then reopened the email), so the page offers them the dashboard too. */
  used?: true;
};

// accept_invite_token raises one plain-English reason per case. An unknown
// token says "invalid or expired" and a real expiry says "has expired"; these are
// matched as phrases because matching the bare word "expired" used to tell
// someone holding a mistyped link that it had expired.
const RPC_FAILURES: Array<[phrase: string, failure: InviteFailure]> = [
  [
    'invalid or expired',
    { error: "This invite link isn't valid. Check that you copied all of it, or ask your admin for a new one.", final: true },
  ],
  [
    'already been used',
    { error: 'This invite link has already been used. Ask your admin for a new one.', final: true, used: true },
  ],
  ['has expired', { error: 'This invite link has expired. Ask your admin for a new one.', final: true }],
  ['already a member', { error: "You're already a member of this organisation.", final: true, alreadyMember: true }],
];

function inviteRpcFailure(message: string): InviteFailure | null {
  return RPC_FAILURES.find(([phrase]) => message.includes(phrase))?.[1] ?? null;
}

export async function acceptInvite(
  token: string,
  options?: { confirmed?: boolean } | null,
): Promise<{ orgName: string } | InviteFailure | { needsConfirm: true; email: string | null }> {
  // A Server Action argument is client-controlled: only a literal `true`
  // skips the prompt, and a null or odd options value must not throw.
  const confirmed = options?.confirmed === true;
  const supabase = await supabaseServer();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    // "No session" and "the lookup failed" are different facts here: only the
    // first one gets the sign-in link. Telling someone mid-outage to sign in
    // again would be a lie (rule 12).
    if (userErr && !isAuthSessionMissingError(userErr)) {
      console.error('[acceptInvite] user lookup failed', {
        name: userErr.name,
        status: userErr.status,
        code: userErr.code,
      });
      return { error: "We couldn't verify your sign-in just now. Try again." };
    }
    return { error: 'You must be signed in to accept an invite.', needsSignIn: true };
  }

  // D3: an invitee whose email already holds practitioner records is asked to
  // use a separate organiser email, and may decline. This is a UX prompt, not
  // an enforcement control — both outcomes are allowed, so it lives here and
  // not in accept_invite_token. The reads go through the session client: each
  // table has a self-read RLS policy, and every query is pinned to the
  // caller's own id as well.
  if (!confirmed) {
    const reads = await Promise.all(
      PRACTITIONER_TABLES.map((table) =>
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ),
    );
    // Not knowing is not "no data": accepting silently on a failed read would
    // skip the very prompt this check exists for. Fail visibly, log the code.
    const failed = reads.find((r) => r.error);
    if (failed?.error) {
      console.error('[acceptInvite] practitioner-data check failed', { code: failed.error.code });
      return { error: "We couldn't check your account just now. Try again." };
    }
    if (reads.some((r) => (r.count ?? 0) > 0)) {
      return { needsConfirm: true, email: user.email ?? null };
    }
  }

  const { data, error } = await supabase.rpc('accept_invite_token', { p_token: token });
  if (error) {
    const failure = inviteRpcFailure(error.message);
    if (failure) return failure;
    // Anything else is database wording the invitee cannot act on (and the
    // message can carry row detail). Say so plainly; keep only the code for us.
    console.error('[acceptInvite] accept_invite_token failed', { code: error.code });
    return { error: "We couldn't accept this invite. Try again, or ask your admin for a new link." };
  }

  return { orgName: data as string };
}
