/** Evidence claim — mirrors schema/evidence-claim.schema.json (Q2 subset). */

export type ClaimType = 'accreditation' | 'participation' | 'submission';
export type PackageType =
  | 'activity_accreditation'
  | 'verified_participation'
  | 'structured_submission'
  | 'participation_only';

export type Pathway = 'ordinary' | 'accredited';

export type ParticipationStatus =
  | 'attendance_verified'
  | 'not_confirmed'
  | 'error';

export type PackageStatus = 'draft' | 'blocked' | 'ready' | 'refused';

export type EvidenceClaim = {
  claim_type: ClaimType;
  question: 1 | 2 | 3;
  event_id: string;
  subject_id: string;
  status: string;
  evidence_refs: string[];
  /**
   * The rule-pack hash this claim was evaluated against. `null` when the
   * body has no taxonomy on file — pairs with the package's
   * `rule_version_status: 'missing'` and a `status: 'error'` claim.
   */
  rule_version: string | null;
  observation: string;
  depends_on: string[];
  how_would_we_know_this_failed: string;
  leading_indicator: string;
  human_review_required: boolean;
  agent: 'eventar-accreditation' | 'eventar-participation' | 'eventar-submission';
  agent_version: string;
  generated_at: string;
  confidence?: number;
};

export type EvidencePackage = {
  package_id: string;
  event_id: string;
  /**
   * Accrediting body this package belongs to. Fixture/CLI paths that have no
   * body concept emit empty strings; the Supabase Server Action populates all
   * three so a College reviewer can tell one multi-body package from another
   * without cross-referencing UUIDs against the CSV.
   */
  body_id: string;
  body_short_name: string;
  body_full_name: string;
  package_type: PackageType;
  pathway: Pathway;
  /**
   * RFC 8785 canonical SHA-256 of the body's category_taxonomy at export
   * time. `null` when the body has no taxonomy (missing or empty {}); pair
   * with `rule_version_status` — a reviewer must never treat `null` as
   * "we hashed empty".
   */
  rule_version: string | null;
  rule_version_status: 'present' | 'missing';
  status: PackageStatus;
  claims: EvidenceClaim[];
  generated_at: string;
  generated_by: string;
  package_version: string;
  refuse_reason?: string;
};

/** One credit_ledger-shaped row as seen by the participation agent. */
export type LedgerEntry = {
  entry_id: string;
  event_id: string;
  practitioner_licence_id: string;
  attestation_status: string;
  /**
   * The rule-pack hash the source computed for this entry's body. `null`
   * when the taxonomy is missing/empty — the orchestrator blocks the whole
   * package in that case and stamps `rule_version_status: 'missing'`.
   */
  rule_version: string | null;
  /** Deterministic integrity result. null = not run. Never computed here. */
  chain_verified: boolean | null;
  registration_count: number;
  checkin_count: number;
};

export type EventRecord = {
  event_id: string;
  pathway: Pathway;
  frozen_rule_version: string | null;
};

export type ParticipationSource = {
  getEvent(eventId: string): Promise<EventRecord | null>;
  listEntries(eventId: string): Promise<LedgerEntry[]>;
};
