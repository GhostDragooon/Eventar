'use server';

import { requireStaff, canManageEvent } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildCsv } from '@/lib/csv';

export type ExportAttendanceResult =
  | { ok: true; csvBase64: string; filename: string; rowCount: number }
  | { ok: false; error: string };

export async function exportAttendanceEvidence(
  eventId: string,
): Promise<ExportAttendanceResult> {
  const staff = await requireStaff();
  const admin = supabaseAdmin();

  const eventRes = await admin
    .from('events')
    .select('id, title, organisation_id, created_by')
    .eq('id', eventId)
    .maybeSingle();
  if (eventRes.error) {
    console.error('[exportAttendanceEvidence] event lookup failed', { code: eventRes.error.code });
    return { ok: false, error: 'Could not load event. Please try again.' };
  }
  if (!eventRes.data) return { ok: false, error: 'Event not found.' };
  if (!canManageEvent(eventRes.data, staff)) {
    return { ok: false, error: 'Not authorised to export this event.' };
  }

  const evidenceRes = await admin
    .from('participation_evidence')
    .select('id, registration_id, evidence_type, capture_method, source, attestation_strength, captured_at, occurrence_id, chain_seq, created_at')
    .eq('event_id', eventId)
    .order('chain_seq', { ascending: true });
  if (evidenceRes.error) {
    console.error('[exportAttendanceEvidence] evidence query failed', { code: evidenceRes.error.code });
    return { ok: false, error: 'Could not load evidence records. Please try again.' };
  }
  const evidence = evidenceRes.data ?? [];
  if (evidence.length === 0) {
    return { ok: false, error: 'No attendance evidence recorded for this event.' };
  }

  const regIds = [...new Set(evidence.map((e) => e.registration_id as string).filter(Boolean))];
  const regMap = new Map<string, { full_name: string; email: string; registration_code: string }>();

  if (regIds.length > 0) {
    const regsRes = await admin
      .from('registrations')
      .select('id, full_name, email, registration_code')
      .in('id', regIds);
    if (regsRes.error) {
      console.error('[exportAttendanceEvidence] registration lookup failed', { code: regsRes.error.code });
      return { ok: false, error: 'Could not load registration details for evidence export. Please try again.' };
    }
    for (const r of regsRes.data ?? []) {
      regMap.set(r.id as string, {
        full_name: (r.full_name as string) ?? '',
        email: (r.email as string) ?? '',
        registration_code: (r.registration_code as string) ?? '',
      });
    }
  }

  const rows: string[][] = [
    [
      'Evidence ID', 'Registration ID', 'Registration Code', 'Full Name', 'Email',
      'Evidence Type', 'Capture Method', 'Source', 'Attestation Strength',
      'Captured At', 'Occurrence ID', 'Chain Sequence',
    ],
    ...evidence.map((e) => {
      const reg = regMap.get(e.registration_id as string);
      return [
        (e.id as string) ?? '',
        (e.registration_id as string) ?? '',
        reg?.registration_code ?? '',
        reg?.full_name ?? '',
        reg?.email ?? '',
        (e.evidence_type as string) ?? '',
        (e.capture_method as string) ?? '',
        (e.source as string) ?? '',
        (e.attestation_strength as string) ?? '',
        (e.captured_at as string) ?? '',
        (e.occurrence_id as string) ?? '',
        String(e.chain_seq ?? ''),
      ];
    }),
  ];

  const csv = buildCsv(rows);
  const title = ((eventRes.data.title as string) ?? 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return {
    ok: true,
    csvBase64: Buffer.from(csv).toString('base64'),
    filename: `attendance-evidence-${title}-${eventId.slice(0, 8)}.csv`,
    rowCount: evidence.length,
  };
}
