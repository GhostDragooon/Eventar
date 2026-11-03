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
import { listMyAttendanceRecords, listMyCreditRecords } from '../actions';
import { RecordClient } from './RecordClient';
import { ClaimBanner } from '../ClaimBanner';
import { readUnlinkedCount } from '../readUnlinkedCount';
import { splitRegistrations } from '../myRegistrations';
import { AccountShell } from '@/components/shell/AccountShell';

export const metadata = {
  title: 'History',
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

  const [attendanceResult, creditsResult, unlinkedCount] = await Promise.all([
    listMyAttendanceRecords(),
    listMyCreditRecords(),
    readUnlinkedCount(),
  ]);
  // Same fail-closed posture as app/account/page.tsx:45-51 — a genuine auth
  // failure bounces to sign-in; any other error degrades to an empty list
  // (this is a personal history view, not a gate the account depends on).
  if (!attendanceResult.ok && attendanceResult.error === 'not_authorized') {
    redirect(`/account/sign-in?next=${encodeURIComponent('/account/record')}`);
  }

  // History is what is over (Doctrine 2026-10-30 section 2); live and upcoming sign-ups are under Registrations.
  // eslint-disable-next-line react-hooks/purity -- the server's clock at render
  const attendance = splitRegistrations(attendanceResult.ok ? attendanceResult.data.items : [], Date.now()).past;
  const credits = creditsResult.ok ? creditsResult.data.items : [];

  return (
    <AccountShell>
      <div className="mx-auto w-full max-w-2xl space-y-md px-grid-margin py-xl">
        <ClaimBanner count={unlinkedCount} />
        <RecordClient attendance={attendance} credits={credits} />
      </div>
    </AccountShell>
  );
}
