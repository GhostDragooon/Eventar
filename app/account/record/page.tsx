// Practitioner Eventar record — read-only history of the caller's own
// registrations + credit_ledger rows, and (2026-09-21 two-persona funnel
// instruction §3) the default landing surface for a complete practitioner.
//
// REVERSAL, 2026-09-21: this page previously had NO isAccountComplete gate
// (2026-09-18 decision, spec §4.1 — "an incomplete profile must still be
// able to see held attendance"). The 2026-09-21 work instruction is
// explicit ("Incomplete account: only /account/complete. No record
// access.") and Ivan's plan approval applied it as written. Held attendance
// is not lost — it's gated from view, not deleted — until the account is
// complete. Flagged at plan time as a doctrine reversal, not a silent one.

import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { isAccountComplete } from '@/lib/accountCompleteness';
import { listMyAttendanceRecords, listMyCreditRecords, getUnlinkedRegistrationCount } from '../actions';
import { RecordClient } from './RecordClient';
import { SiteShell } from '@/components/shell/SiteShell';

export const metadata = {
  title: 'Your record',
};

export default async function AccountRecordPage() {
  const supabase = await supabaseServer();
  // eslint-disable-next-line no-restricted-syntax -- no-session and call-failed collapse to "must sign in"
  const { data: authRes } = await supabase.auth.getUser();
  if (!authRes?.user) {
    redirect(`/account/sign-in?next=${encodeURIComponent('/account/record')}`);
  }

  // Same completion guard as /account (app/account/page.tsx) — see the
  // REVERSAL note above.
  const completeness = await isAccountComplete(authRes.user.id, authRes.user.email_confirmed_at != null);
  if (!completeness.complete) {
    redirect('/account/complete');
  }

  const [attendanceResult, creditsResult, unlinkedResult] = await Promise.all([
    listMyAttendanceRecords(),
    listMyCreditRecords(),
    getUnlinkedRegistrationCount(),
  ]);
  // Same fail-closed posture as app/account/page.tsx:45-51 — a genuine auth
  // failure bounces to sign-in; any other error degrades to an empty list
  // (this is a personal history view, not a gate the account depends on).
  if (!attendanceResult.ok && attendanceResult.error === 'not_authorized') {
    redirect(`/account/sign-in?next=${encodeURIComponent('/account/record')}`);
  }

  const attendance = attendanceResult.ok ? attendanceResult.data.items : [];
  const credits = creditsResult.ok ? creditsResult.data.items : [];
  const unlinkedCount = unlinkedResult.ok ? unlinkedResult.data.count : 0;

  return (
    <SiteShell active="account" signedIn accountComplete unlinkedCount={unlinkedCount}>
      <div className="mx-auto w-full max-w-2xl px-grid-margin py-xl">
        <RecordClient attendance={attendance} credits={credits} />
      </div>
    </SiteShell>
  );
}
