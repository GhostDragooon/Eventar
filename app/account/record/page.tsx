// Practitioner Eventar record (2026-09-18 product decision) — read-only
// history of the caller's own registrations + credit_ledger rows.
//
// Deliberately NO isAccountComplete gate, unlike every other /account/* page
// (see app/account/page.tsx:29-35) — spec §4.1: an incomplete profile must
// still be able to see held attendance, not get bounced to /account/complete.

import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { listMyAttendanceRecords, listMyCreditRecords } from '../actions';
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

  const [attendanceResult, creditsResult] = await Promise.all([
    listMyAttendanceRecords(),
    listMyCreditRecords(),
  ]);
  // Same fail-closed posture as app/account/page.tsx:45-51 — a genuine auth
  // failure bounces to sign-in; any other error degrades to an empty list
  // (this is a personal history view, not a gate the account depends on).
  if (!attendanceResult.ok && attendanceResult.error === 'not_authorized') {
    redirect(`/account/sign-in?next=${encodeURIComponent('/account/record')}`);
  }

  const attendance = attendanceResult.ok ? attendanceResult.data.items : [];
  const credits = creditsResult.ok ? creditsResult.data.items : [];

  return (
    <SiteShell active="account" signedIn>
      <div className="mx-auto w-full max-w-2xl px-grid-margin py-xl">
        <RecordClient attendance={attendance} credits={credits} />
      </div>
    </SiteShell>
  );
}
