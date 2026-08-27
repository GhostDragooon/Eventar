/**
 * Q2 evidence orchestrator slice.
 *
 * Loads one event, runs the participation agent per credited licence,
 * validates every claim, applies the evidence gate, returns a package.
 *
 * Q1 / Q3 seams are marked below — not faked.
 */
import type {
  EvidenceClaim,
  EvidencePackage,
  PackageType,
  ParticipationSource,
} from './types';
import { buildParticipationClaims, newPackageId } from './agents/participationAgent';
import { validateClaim } from './validateClaim';

const PACKAGE_VERSION = '0.1.0';

export type OrchestrateInput = {
  eventId: string;
  packageType?: PackageType;
  source: ParticipationSource;
  generatedBy?: string;
  /** Fixed timestamp for golden tests / sample regeneration. */
  generatedAt?: string;
  /**
   * Body identity stamped onto the package. Optional so the mock CLI path
   * (which has no body concept) can omit it; the Supabase Server Action
   * always passes it so multi-body exports carry per-package attribution.
   */
  body?: { id: string; shortName: string; fullName: string };
};

export type OrchestrateResult = EvidencePackage;

/**
 * Gate: any human_review_required or invalid claim → blocked.
 * Ordinary pathway + participation package → refused.
 * Missing event → refused.
 */
export async function orchestrateParticipation(
  input: OrchestrateInput,
): Promise<OrchestrateResult> {
  const packageType = input.packageType ?? 'participation_only';
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const generatedBy = input.generatedBy ?? 'cli@eventar';
  const body = input.body ?? { id: '', shortName: '', fullName: '' };

  const event = await input.source.getEvent(input.eventId);
  if (!event) {
    return basePackage({
      eventId: input.eventId,
      body,
      packageType,
      pathway: 'ordinary',
      ruleVersion: null,
      status: 'refused',
      claims: [],
      generatedAt,
      generatedBy,
      refuseReason: `Event ${input.eventId} not found`,
    });
  }

  // Verified participation is an accredited concept.
  if (
    event.pathway === 'ordinary' &&
    (packageType === 'verified_participation' ||
      packageType === 'participation_only' ||
      packageType === 'structured_submission')
  ) {
    return basePackage({
      eventId: event.event_id,
      body,
      packageType,
      pathway: event.pathway,
      ruleVersion: event.frozen_rule_version,
      status: 'refused',
      claims: [],
      generatedAt,
      generatedBy,
      refuseReason:
        'Ordinary pathway events cannot produce a verified participation package',
    });
  }

  // Unfrozen rule version: still emit per-entry claims so reasons are visible,
  // but the package is blocked.
  const entries = await input.source.listEntries(event.event_id);
  const claims = buildParticipationClaims(event, entries, generatedAt);

  // Schema gate — every claim must validate; invalid → blocked.
  const gated: EvidenceClaim[] = [];
  let blocked = false;

  for (const claim of claims) {
    const v = validateClaim(claim);
    if (!v.ok) {
      blocked = true;
      gated.push({
        ...claim,
        status: 'error',
        human_review_required: true,
        observation: `Claim failed schema validation: ${v.errors.join('; ')}`,
      });
      continue;
    }
    if (claim.human_review_required) blocked = true;
    gated.push(claim);
  }

  // Event-level: no frozen rule → always blocked even if somehow no entries.
  if (!event.frozen_rule_version) blocked = true;

  // --- Q1 seam (eventar-accreditation): not wired in this slice ---
  // --- Q3 seam (eventar-submission): not wired in this slice ---

  return basePackage({
    eventId: event.event_id,
    body,
    packageType,
    pathway: event.pathway,
    ruleVersion: event.frozen_rule_version,
    status: blocked ? 'blocked' : 'ready',
    claims: gated,
    generatedAt,
    generatedBy,
  });
}

function basePackage(args: {
  eventId: string;
  body: { id: string; shortName: string; fullName: string };
  packageType: PackageType;
  pathway: 'ordinary' | 'accredited';
  ruleVersion: string | null;
  status: EvidencePackage['status'];
  claims: EvidenceClaim[];
  generatedAt: string;
  generatedBy: string;
  refuseReason?: string;
}): EvidencePackage {
  return {
    package_id: newPackageId(),
    event_id: args.eventId,
    body_id: args.body.id,
    body_short_name: args.body.shortName,
    body_full_name: args.body.fullName,
    package_type: args.packageType,
    pathway: args.pathway,
    rule_version: args.ruleVersion,
    // Single source of truth: a null hash means the pack was missing/empty.
    // A hex hash means it was hashed. sha256('{}') never reaches the export.
    rule_version_status: args.ruleVersion === null ? 'missing' : 'present',
    status: args.status,
    claims: args.claims,
    generated_at: args.generatedAt,
    generated_by: args.generatedBy,
    package_version: PACKAGE_VERSION,
    ...(args.refuseReason ? { refuse_reason: args.refuseReason } : {}),
  };
}
