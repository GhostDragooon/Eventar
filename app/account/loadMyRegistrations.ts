import 'server-only';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { isAccountComplete } from '@/lib/accountCompleteness';
import { listMyAttendanceRecords } from './actions';
import type { AttendanceRecordView } from './schema';

// The guard and the read every attendee list page shares (the same shape /account/record has always had):
// signed out -> sign-in with a way back; incomplete account -> the wizard (doctrine reversal 2026-09-21, see
// record/page.tsx); a genuine auth failure -> sign-in; any other read error degrades to an empty list, which the
// page words honestly (this is a personal view, not a gate the account depends on).
export async function loadMyRegistrations(path: string): Promise<{ items: AttendanceRecordView[]; failed: boolean }> {
  const supabase = await supabaseServer();
  // eslint-disable-next-line no-restricted-syntax -- no-session and call-failed collapse to "must sign in"
  const { data: authRes } = await supabase.auth.getUser();
  if (!authRes?.user) redirect(`/account/sign-in?next=${encodeURIComponent(path)}`);

  const completeness = await isAccountComplete(authRes.user.id, authRes.user.email_confirmed_at != null);
  if (!completeness.complete) redirect('/account/complete');

  const res = await listMyAttendanceRecords();
  if (!res.ok && res.error === 'not_authorized') redirect(`/account/sign-in?next=${encodeURIComponent(path)}`);
  return res.ok ? { items: res.data.items, failed: false } : { items: [], failed: true };
}
