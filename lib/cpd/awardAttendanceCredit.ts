import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AwardOutcome =
  | { status: 'issued' } // a fresh attendance-verified credit was written
  | { status: 'already' } // idempotent no-op — the credit already existed
  | { status: 'skipped'; reason: string } // a business condition (not_cpd, no_licence, …)
  | { status: 'failed'; reason: string }; // an unexpected technical error

/**
 * Award an attendance-verified CPD credit for a fresh check-in. Config-free — no
 * body_rules evaluation, just a snapshot-valued tamper-evident credit.
 *
 * Runtime contract: attendance is authoritative; this is best-effort and MUST be
 * called AFTER attendance is marked, wrapped so its failure never changes the
 * attendance outcome. Transient misses heal via the reconcile path (Stage 6).
 *
 * All business logic (guard → resolve identity via auth.users → issue, plus the
 * DB-level idempotency backstop) lives in the `award_attendance_credit` SECURITY
 * DEFINER function — identity resolution needs `auth.users`, unreachable from here.
 * This wrapper is only the kill switch + structured, ids-only logging.
 */
export async function awardAttendanceCredit(
  admin: SupabaseClient,
  { eventId, registrationCode, actorId }: { eventId: string; registrationCode: string; actorId?: string | null },
): Promise<AwardOutcome> {
  // Kill switch: fail-OPEN (issuance runs unless explicitly disabled) — a "kill
  // switch" that defaults off would mean the feature never runs anywhere until
  // someone discovers an undocumented env var (found running this live: the
  // local/demo stack has no CPD_ISSUANCE_ENABLED set anywhere, so a 'true'-gated
  // check silently skipped every award with nothing logged). Deploy-time env
  // (a live mid-event toggle is a documented ⚪ follow-up).
  if (process.env.CPD_ISSUANCE_ENABLED === 'false') {
    console.info('[cpd] attendance credit skipped', { eventId, reason: 'disabled' });
    return { status: 'skipped', reason: 'disabled' };
  }

  const { data, error } = await admin.rpc('award_attendance_credit', {
    p_event_id: eventId,
    p_registration_code: registrationCode,
    p_actor_id: actorId ?? null,
  });

  if (error) {
    // ids/enum only — never the email or the registration_code (a capability token).
    console.error('[cpd] award_attendance_credit failed', { eventId, code: error.code });
    return { status: 'failed', reason: error.code ?? 'unknown' };
  }

  const result = String(data); // 'issued' | 'already' | 'skipped:<reason>'
  if (result === 'issued' || result === 'already') {
    console.info('[cpd] attendance credit', { eventId, result });
    return { status: result };
  }
  const reason = result.startsWith('skipped:') ? result.slice('skipped:'.length) : result;
  console.info('[cpd] attendance credit skipped', { eventId, reason });
  return { status: 'skipped', reason };
}
