'use server';

/**
 * Stage 10 Workstream D — College/MCHK-oriented provisional points package.
 *
 * One CSV, one row per credit_ledger entry for this event (multi-body: a
 * practitioner credited at 2 bodies gets 2 rows). A College admin filters by
 * "Accrediting Body" in a spreadsheet for their own body's rows — documented
 * choice over a per-body ZIP, since nothing here needs a new dependency.
 *
 * Identity fields are read LIVE from professional_profiles/users, not from
 * registrations.profile_snapshot. Two reasons, not one: (1) the snapshot
 * (build_profile_snapshot, 20260829110000) never captures specialty_other,
 * and (2) the snapshot is captured once and never overwritten, so a
 * practitioner who registered before that gap is fixed would stay blank
 * forever even if the function were patched — live is the only source that
 * can serve already-registered practitioners. Nothing in the app reads
 * profile_snapshot today (confirmed by grep), so there is no sibling this
 * routes around. Unlike credit_ledger's own values (rule-pack output,
 * D.1-locked interpretation), identity fields are not interpretation-
 * affecting, so reading live is the correct call, not merely a workaround —
 * the tradeoff is that two exports of the same frozen ledger rows can differ
 * if the practitioner edits their profile between them, which the
 * `Generated At` column below makes legible rather than silent.
 *
 * Read-only. No ledger mutation. Same requireStaff + canManageEvent gate as
 * every sibling export (exportAttendanceActions.ts, exportEvidenceActions.ts).
 */

import { requireStaff, canManageEvent } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildCsv } from '@/lib/csv';
import {
  COLLEGE_EXPORT_HEADER,
  projectCreditLedgerRow,
  type LedgerRow,
  type UserRow,
  type ProfileRow,
  type LicenceRow,
  type BodyRow,
  type RegRow,
  type EvidenceRow,
  type EventInfo,
  type CollegeExportLookups,
} from './collegeExportProjection';

export type ExportCollegeResult =
  | { ok: true; csvBase64: string; filename: string; rowCount: number }
  | { ok: false; error: string };

// PostgREST silently truncates an unbounded read at the project's `db.max_rows`
// (1000 locally, per supabase/config.toml) — an over-cap read looks complete
// and is not (see docs/DEFERRED.md's email-budget row, and lib/email/eventEmails.ts's
// BUDGET_READ_LIMIT for the established pattern this mirrors). A regulator
// submission missing rows is worse than an email retry undercount, so this
// fails the export outright rather than delivering a silently short CSV.
const EXPORT_ROW_LIMIT = 1000;

export async function exportCollegePackage(eventId: string): Promise<ExportCollegeResult> {
  const staff = await requireStaff();
  const admin = supabaseAdmin();

  const eventRes = await admin
    .from('events')
    .select('id, title, start_time, end_time, organisation_id')
    .eq('id', eventId)
    .maybeSingle();
  if (eventRes.error) {
    console.error('[exportCollegePackage] event lookup failed', { code: eventRes.error.code });
    return { ok: false, error: 'Could not load event. Please try again.' };
  }
  if (!eventRes.data) return { ok: false, error: 'Event not found.' };
  const event = eventRes.data;
  if (!canManageEvent(event, staff)) {
    return { ok: false, error: 'Not authorised to export this event.' };
  }

  const ledgerRes = await admin
    .from('credit_ledger')
    .select('id, chain_seq, user_id, licence_id, body_id, category, points, hours, attestation_status, created_at')
    .eq('event_id', eventId)
    .order('chain_seq', { ascending: true })
    .limit(EXPORT_ROW_LIMIT);
  if (ledgerRes.error) {
    console.error('[exportCollegePackage] ledger query failed', { code: ledgerRes.error.code });
    return { ok: false, error: 'Could not load credit records. Please try again.' };
  }
  const ledger = (ledgerRes.data ?? []) as LedgerRow[];
  if (ledger.length === 0) {
    return { ok: false, error: 'No credit has been posted for this event yet — nothing to export.' };
  }
  if (ledger.length >= EXPORT_ROW_LIMIT) {
    console.error('[exportCollegePackage] ledger read hit its row limit — export would be an undercount', { eventId, limit: EXPORT_ROW_LIMIT });
    return { ok: false, error: 'This event has more credit records than a single export can safely include. Contact support for a bulk export.' };
  }

  const userIds = [...new Set(ledger.map((r) => r.user_id))];
  const licenceIds = [...new Set(ledger.map((r) => r.licence_id))];
  const bodyIds = [...new Set(ledger.map((r) => r.body_id))];

  const usersRes = await admin.from('users').select('id, full_name, salutation').in('id', userIds);
  if (usersRes.error) {
    console.error('[exportCollegePackage] users lookup failed', { code: usersRes.error.code });
    return { ok: false, error: 'Could not load practitioner details for export. Please try again.' };
  }
  const profilesRes = await admin
    .from('professional_profiles')
    .select('user_id, workplace_text, position_code, position_other, profession_code, specialty_code, specialty_other')
    .in('user_id', userIds);
  if (profilesRes.error) {
    console.error('[exportCollegePackage] professional_profiles lookup failed', { code: profilesRes.error.code });
    return { ok: false, error: 'Could not load practitioner details for export. Please try again.' };
  }
  const licencesRes = await admin.from('practitioner_licences').select('id, licence_number, status').in('id', licenceIds);
  if (licencesRes.error) {
    console.error('[exportCollegePackage] practitioner_licences lookup failed', { code: licencesRes.error.code });
    return { ok: false, error: 'Could not load licence details for export. Please try again.' };
  }
  const bodiesRes = await admin.from('accrediting_bodies').select('id, short_name, full_name').in('id', bodyIds);
  if (bodiesRes.error) {
    console.error('[exportCollegePackage] accrediting_bodies lookup failed', { code: bodiesRes.error.code });
    return { ok: false, error: 'Could not load accrediting body details for export. Please try again.' };
  }
  const regsRes = await admin
    .from('registrations')
    .select('user_id, registration_code')
    .eq('event_id', eventId)
    .in('user_id', userIds);
  if (regsRes.error) {
    console.error('[exportCollegePackage] registrations lookup failed', { code: regsRes.error.code });
    return { ok: false, error: 'Could not load registration details for export. Please try again.' };
  }
  // Ascending so the first row kept per user below is the EARLIEST evidence —
  // a representative single capture, not an exhaustive list (multi-occurrence
  // events can write several evidence rows per registration; the full list is
  // already available via the existing "Export attendance evidence" button).
  const evidenceRes = await admin
    .from('participation_evidence')
    .select('user_id, evidence_type, attestation_strength, captured_at')
    .eq('event_id', eventId)
    .in('user_id', userIds)
    .order('captured_at', { ascending: true })
    .limit(EXPORT_ROW_LIMIT);
  if (evidenceRes.error) {
    console.error('[exportCollegePackage] participation_evidence lookup failed', { code: evidenceRes.error.code });
    return { ok: false, error: 'Could not load evidence details for export. Please try again.' };
  }
  // Evidence rows are a best-effort enrichment (per-row blank is fine — see
  // the evidenceByUserId lookup below), so a truncated read degrades rather
  // than fails the whole export outright: log loudly, keep going.
  if ((evidenceRes.data ?? []).length >= EXPORT_ROW_LIMIT) {
    console.error('[exportCollegePackage] evidence read hit its row limit — some rows may show no evidence', { eventId, limit: EXPORT_ROW_LIMIT });
  }

  const professionsRes = await admin.from('professions').select('code, label_en');
  const positionsRes = await admin.from('positions').select('code, label_en');
  const specialtiesRes = await admin.from('specialties').select('code, label_en');
  if (professionsRes.error || positionsRes.error || specialtiesRes.error) {
    console.error('[exportCollegePackage] controlled-list lookup failed', {
      professions: professionsRes.error?.code, positions: positionsRes.error?.code, specialties: specialtiesRes.error?.code,
    });
    return { ok: false, error: 'Could not load reference data for export. Please try again.' };
  }

  const lookups: CollegeExportLookups = {
    userById: new Map((usersRes.data ?? []).map((u) => [u.id as string, u as UserRow])),
    profileByUserId: new Map((profilesRes.data ?? []).map((p) => [p.user_id as string, p as ProfileRow])),
    licenceById: new Map((licencesRes.data ?? []).map((l) => [l.id as string, l as LicenceRow])),
    bodyById: new Map((bodiesRes.data ?? []).map((b) => [b.id as string, b as BodyRow])),
    regByUserId: new Map((regsRes.data ?? []).map((r) => [r.user_id as string, r as RegRow])),
    evidenceByUserId: new Map<string, EvidenceRow>(),
    professionLabelByCode: new Map((professionsRes.data ?? []).map((p) => [p.code as string, p.label_en as string])),
    positionLabelByCode: new Map((positionsRes.data ?? []).map((p) => [p.code as string, p.label_en as string])),
    specialtyLabelByCode: new Map((specialtiesRes.data ?? []).map((s) => [s.code as string, s.label_en as string])),
  };
  for (const e of evidenceRes.data ?? []) {
    const uid = e.user_id as string | null;
    if (uid && !lookups.evidenceByUserId.has(uid)) {
      lookups.evidenceByUserId.set(uid, {
        evidence_type: (e.evidence_type as string) ?? '',
        attestation_strength: (e.attestation_strength as string) ?? '',
        captured_at: (e.captured_at as string) ?? '',
      });
    }
  }

  const generatedAt = new Date().toISOString();
  const eventInfo: EventInfo = {
    id: eventId,
    title: event.title as string | null,
    start_time: event.start_time as string | null,
    end_time: event.end_time as string | null,
  };
  const rows: string[][] = [
    COLLEGE_EXPORT_HEADER,
    ...ledger.map((r) => projectCreditLedgerRow(r, eventInfo, generatedAt, lookups)),
  ];

  const csv = buildCsv(rows);
  const slug = ((event.title as string) ?? 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return {
    ok: true,
    csvBase64: Buffer.from(csv).toString('base64'),
    filename: `college-package-${slug}-${eventId.slice(0, 8)}.csv`,
    rowCount: ledger.length,
  };
}
