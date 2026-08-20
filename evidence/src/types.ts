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
  rule_version: string;
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
  package_type: PackageType;
  pathway: Pathway;
  rule_version: string | null;
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
  rule_version: string;
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
