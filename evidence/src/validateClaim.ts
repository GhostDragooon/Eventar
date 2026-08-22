/**
 * Lightweight validator mirroring schema/evidence-claim.schema.json.
 * No ajv/zod — keeps this slice dependency-free for Next.js and CLI.
 */
import type { EvidenceClaim } from './types.js';

const CLAIM_TYPES = new Set(['accreditation', 'participation', 'submission']);
const QUESTIONS = new Set([1, 2, 3]);
const AGENTS = new Set([
  'eventar-accreditation',
  'eventar-participation',
  'eventar-submission',
]);

const FOUR = [
  'observation',
  'depends_on',
  'how_would_we_know_this_failed',
  'leading_indicator',
] as const;

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export function validateClaim(claim: unknown): ValidationResult {
  const errors: string[] = [];
  if (!claim || typeof claim !== 'object') {
    return { ok: false, errors: ['(root): claim must be an object'] };
  }
  const c = claim as Record<string, unknown>;

  if (!CLAIM_TYPES.has(c.claim_type as string)) {
    errors.push(`claim_type: invalid (${String(c.claim_type)})`);
  }
  if (!QUESTIONS.has(c.question as number)) {
    errors.push(`question: must be 1, 2, or 3`);
  }
  for (const key of [
    'event_id',
    'subject_id',
    'status',
    'rule_version',
    'agent_version',
    'generated_at',
  ]) {
    if (typeof c[key] !== 'string' || !(c[key] as string).length) {
      errors.push(`${key}: required non-empty string`);
    }
  }
  if (!Array.isArray(c.evidence_refs)) {
    errors.push('evidence_refs: must be an array');
  }
  if (!AGENTS.has(c.agent as string)) {
    errors.push(`agent: invalid (${String(c.agent)})`);
  }
  if (typeof c.human_review_required !== 'boolean') {
    errors.push('human_review_required: must be boolean');
  }

  for (const f of FOUR) {
    const v = c[f];
    if (f === 'depends_on') {
      if (!Array.isArray(v)) errors.push('depends_on: must be an array');
    } else if (typeof v !== 'string' || !v.length) {
      errors.push(`${f}: required non-empty string`);
    }
  }

  if (c.claim_type === 'submission' && c.status === 'accepted') {
    const refs = c.evidence_refs;
    if (!Array.isArray(refs) || refs.length < 1) {
      errors.push(
        'evidence_refs: Q3 accepted requires at least one confirmation artefact reference',
      );
    }
  }

  if (
    c.claim_type === 'participation' &&
    c.status === 'attendance_verified' &&
    c.human_review_required === true
  ) {
    errors.push(
      'status: attendance_verified cannot be paired with human_review_required=true',
    );
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

export function assertValidClaim(claim: EvidenceClaim): void {
  const result = validateClaim(claim);
  if (!result.ok) {
    throw new Error(`Invalid claim:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}
