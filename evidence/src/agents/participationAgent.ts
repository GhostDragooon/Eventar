/**
 * Q2 specialist — deterministic claim builder (no model).
 * Mirrors agents/eventar-participation.md emission rules.
 */
import { randomUUID } from 'node:crypto';
import type {
  EvidenceClaim,
  EventRecord,
  LedgerEntry,
  ParticipationStatus,
} from '../types.js';
import { assertValidClaim } from '../validateClaim.js';

export const PARTICIPATION_AGENT = 'eventar-participation' as const;
export const AGENT_VERSION = '0.1.0';

const FALSIFY =
  'The same check-in code is reused across two licences, the ledger entry rule_version differs from the frozen version, or the chain check reports a hash mismatch at this entry.';

const LEADING =
  'Count of check-ins exceeding registrations for the event, and count of ledger entries whose rule_version does not match the frozen version.';

const DEPENDS_ON = [
  'credit_ledger chain verification result for this event',
  'event rule_version is frozen',
] as const;

type Failure = {
  status: ParticipationStatus;
  observation: string;
};

function evaluateEntry(
  entry: LedgerEntry,
  event: EventRecord,
): { ok: true } | { ok: false; failure: Failure } {
  const problems: string[] = [];

  if (!event.frozen_rule_version) {
    problems.push('event rule version is not frozen');
  } else if (entry.rule_version !== event.frozen_rule_version) {
    problems.push(
      `entry rule_version ${entry.rule_version} differs from frozen ${event.frozen_rule_version}`,
    );
  }

  if (entry.chain_verified === null) {
    problems.push('credit ledger chain verification has not run');
  } else if (entry.chain_verified === false) {
    problems.push('credit ledger chain check reports a hash mismatch');
  }

  if (entry.checkin_count > entry.registration_count) {
    problems.push('check-ins exceed registrations for the event');
  }

  if (problems.length) {
    return {
      ok: false,
      failure: {
        status: 'error',
        observation: `Participation could not be verified without review: ${problems.join('; ')}.`,
      },
    };
  }

  return { ok: true };
}

export function buildParticipationClaim(
  entry: LedgerEntry,
  event: EventRecord,
  generatedAt: string = new Date().toISOString(),
): EvidenceClaim {
  const result = evaluateEntry(entry, event);

  let status: ParticipationStatus;
  let observation: string;
  let humanReview: boolean;

  if (result.ok) {
    status = 'attendance_verified';
    observation =
      'A single check-in event is recorded in the append-only ledger against this licence under the frozen rule version, and the deterministic chain check reports the entry intact.';
    humanReview = false;
  } else {
    status = result.failure.status;
    observation = result.failure.observation;
    humanReview = true;
  }

  const claim: EvidenceClaim = {
    claim_type: 'participation',
    question: 2,
    event_id: entry.event_id,
    subject_id: entry.practitioner_licence_id,
    status,
    evidence_refs: [entry.entry_id],
    rule_version: event.frozen_rule_version ?? entry.rule_version,
    observation,
    depends_on: [...DEPENDS_ON],
    how_would_we_know_this_failed: FALSIFY,
    leading_indicator: LEADING,
    human_review_required: humanReview,
    agent: PARTICIPATION_AGENT,
    agent_version: AGENT_VERSION,
    generated_at: generatedAt,
  };

  assertValidClaim(claim);
  return claim;
}

export function buildParticipationClaims(
  event: EventRecord,
  entries: LedgerEntry[],
  generatedAt?: string,
): EvidenceClaim[] {
  return entries.map((e) => buildParticipationClaim(e, event, generatedAt));
}

/** Stable id helper for packages (CLI / tests). */
export function newPackageId(): string {
  return randomUUID();
}
