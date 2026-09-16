// Pure projection logic for exportCollegeActions.ts's CSV, split into its own
// module (not 'use server') because a 'use server' file may only export
// async functions — every top-level export becomes a Server Action
// reference. Kept separate so it can be unit-tested directly (see
// exportCollegeActions.test.ts) without a Supabase query-builder mock.

export type LedgerRow = {
  id: string;
  chain_seq: number;
  user_id: string;
  licence_id: string;
  body_id: string;
  category: string | null;
  points: number | string | null;
  hours: number | string | null;
  attestation_status: string | null;
};
export type UserRow = { full_name: string | null; salutation: string | null };
export type ProfileRow = {
  workplace_text: string | null;
  position_code: string | null;
  position_other: string | null;
  profession_code: string | null;
  specialty_code: string | null;
  specialty_other: string | null;
};
export type LicenceRow = { licence_number: string; status: string };
export type BodyRow = { short_name: string | null; full_name: string };
export type RegRow = { registration_code: string };
export type EvidenceRow = { evidence_type: string; attestation_strength: string; captured_at: string };
export type EventInfo = { id: string; title: string | null; start_time: string | null; end_time: string | null };

export type CollegeExportLookups = {
  userById: Map<string, UserRow>;
  profileByUserId: Map<string, ProfileRow>;
  licenceById: Map<string, LicenceRow>;
  bodyById: Map<string, BodyRow>;
  regByUserId: Map<string, RegRow>;
  evidenceByUserId: Map<string, EvidenceRow>;
  professionLabelByCode: Map<string, string>;
  positionLabelByCode: Map<string, string>;
  specialtyLabelByCode: Map<string, string>;
};

export const COLLEGE_EXPORT_HEADER = [
  'Registration Code', 'Practitioner Name', 'Salutation', 'Profession', 'Specialty', 'Position', 'Workplace',
  'Accrediting Body (Short)', 'Accrediting Body (Full)', 'Licence Number', 'Licence Status',
  'Event ID', 'Event Name', 'Event Starts', 'Event Ends',
  'Category', 'Points', 'Hours', 'Attestation Status',
  'Ledger Entry ID', 'Ledger Chain Sequence',
  'Evidence Captured At', 'Evidence Type', 'Attestation Strength',
  'Generated At',
];

/**
 * Controlled-list codes share a literal `'other'` sentinel (professions,
 * positions, specialties — supabase/migrations/20260916000000_controlled_lists.sql)
 * that means "see the free-text companion column instead." A naive
 * `code || freeText` fallback is wrong here: `'other'` is a real, truthy,
 * seeded code, so it always wins the `||` and the free-text override is
 * silently dropped on the exact path it exists for — the specific defect
 * this function exists to not repeat. Looking up 'other' by label would
 * ALSO be wrong (it resolves to the string "Other", discarding what the
 * practitioner actually typed).
 */
function labelOrFreeText(
  code: string | null | undefined,
  freeText: string | null | undefined,
  labelByCode: Map<string, string>,
): string {
  if (!code || code === 'other') return freeText ?? '';
  return labelByCode.get(code) ?? code;
}

/**
 * profession_code has no free-text companion column (no `profession_other`
 * exists on professional_profiles) — 'other' is not a sentinel here, it is
 * the code's own real, honest meaning (seeded label: "Other"), so this is a
 * plain label lookup, not labelOrFreeText's sentinel-aware version.
 */
function professionLabel(code: string | null | undefined, labelByCode: Map<string, string>): string {
  if (!code) return '';
  return labelByCode.get(code) ?? code;
}

/**
 * Pure per-row projection — the actual logic this export exists to get
 * right, and exported specifically so it can be unit-tested without a
 * Supabase query-builder mock (see exportCollegeActions.test.ts).
 */
export function projectCreditLedgerRow(row: LedgerRow, event: EventInfo, generatedAt: string, lookups: CollegeExportLookups): string[] {
  const user = lookups.userById.get(row.user_id);
  const profile = lookups.profileByUserId.get(row.user_id);
  const licence = lookups.licenceById.get(row.licence_id);
  const body = lookups.bodyById.get(row.body_id);
  const reg = lookups.regByUserId.get(row.user_id);
  const evidence = lookups.evidenceByUserId.get(row.user_id);

  return [
    reg?.registration_code ?? '',
    user?.full_name ?? '',
    user?.salutation ?? '',
    professionLabel(profile?.profession_code, lookups.professionLabelByCode),
    labelOrFreeText(profile?.specialty_code, profile?.specialty_other, lookups.specialtyLabelByCode),
    labelOrFreeText(profile?.position_code, profile?.position_other, lookups.positionLabelByCode),
    profile?.workplace_text ?? '',
    body?.short_name ?? '',
    body?.full_name ?? '',
    licence?.licence_number ?? '',
    licence?.status ?? '',
    event.id,
    event.title ?? '',
    event.start_time ?? '',
    event.end_time ?? '',
    row.category ?? '',
    row.points == null ? '' : String(row.points),
    row.hours == null ? '' : String(row.hours),
    row.attestation_status ?? '',
    row.id,
    String(row.chain_seq ?? ''),
    evidence?.captured_at ?? '',
    evidence?.evidence_type ?? '',
    evidence?.attestation_strength ?? '',
    generatedAt,
  ];
}
