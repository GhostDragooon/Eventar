/**
 * Orchestrator invariants added by Step 6 A3 fix pass (2026-08-27):
 *   - Body identity flows through onto every EvidencePackage (multi-body
 *     JSON attribution).
 *   - Missing/empty taxonomy → rule_version: null, rule_version_status:
 *     'missing' (never sha256("{}") passed off as a real hash).
 *   - Non-null taxonomy → rule_version_status: 'present'.
 */
import { describe, expect, it } from 'vitest';
import { orchestrateParticipation } from './orchestrator';
import type {
  EventRecord,
  LedgerEntry,
  ParticipationSource,
} from './types';

class StubSource implements ParticipationSource {
  constructor(
    private readonly event: EventRecord | null,
    private readonly entries: LedgerEntry[] = [],
  ) {}
  async getEvent(): Promise<EventRecord | null> {
    return this.event;
  }
  async listEntries(): Promise<LedgerEntry[]> {
    return this.entries;
  }
}

const HKCP_BODY = { id: 'body-hkcp', shortName: 'HKCP', fullName: 'Hong Kong College of Physicians' };

describe('orchestrateParticipation', () => {
  it('stamps body identity on the emitted package', async () => {
    const source = new StubSource(
      { event_id: 'ev-1', pathway: 'accredited', frozen_rule_version: 'hash-abc' },
      [
        {
          entry_id: 'entry-1',
          event_id: 'ev-1',
          practitioner_licence_id: 'lic-1',
          attestation_status: 'attendance_verified',
          rule_version: 'hash-abc',
          chain_verified: true,
          registration_count: 1,
          checkin_count: 1,
        },
      ],
    );
    const pkg = await orchestrateParticipation({
      eventId: 'ev-1',
      packageType: 'verified_participation',
      source,
      body: HKCP_BODY,
    });
    expect(pkg.body_id).toBe('body-hkcp');
    expect(pkg.body_short_name).toBe('HKCP');
    expect(pkg.body_full_name).toBe('Hong Kong College of Physicians');
    expect(pkg.rule_version).toBe('hash-abc');
    expect(pkg.rule_version_status).toBe('present');
    expect(pkg.status).toBe('ready');
  });

  it('defaults body identity to empty strings when not supplied (mock CLI path)', async () => {
    const source = new StubSource(
      { event_id: 'ev-2', pathway: 'accredited', frozen_rule_version: 'hash-x' },
      [],
    );
    const pkg = await orchestrateParticipation({ eventId: 'ev-2', source });
    expect(pkg.body_id).toBe('');
    expect(pkg.body_short_name).toBe('');
    expect(pkg.body_full_name).toBe('');
  });

  it('emits rule_version_status: "missing" when the taxonomy is null (never a hash of nothing)', async () => {
    const source = new StubSource(
      { event_id: 'ev-3', pathway: 'accredited', frozen_rule_version: null },
      [
        {
          entry_id: 'entry-3',
          event_id: 'ev-3',
          practitioner_licence_id: 'lic-3',
          attestation_status: 'attendance_verified',
          rule_version: null,
          chain_verified: true,
          registration_count: 1,
          checkin_count: 1,
        },
      ],
    );
    const pkg = await orchestrateParticipation({
      eventId: 'ev-3',
      packageType: 'verified_participation',
      source,
      body: HKCP_BODY,
    });
    expect(pkg.rule_version).toBeNull();
    expect(pkg.rule_version_status).toBe('missing');
    expect(pkg.status).toBe('blocked'); // no frozen pack → orchestrator blocks the package
  });
});
