/**
 * RFC 8785 canonical hash — the load-bearing property for A3 is that two
 * equivalent JSON values produce the same hash regardless of key order or
 * whitespace, and different values produce different hashes. If this ever
 * breaks, the taxonomy hash on an exported package becomes decorative.
 */
import { describe, expect, it } from 'vitest';
import { canonicalSha256Hex } from './canonicalHash';

describe('canonicalSha256Hex', () => {
  it('is deterministic across key order', () => {
    const a = { role_mappings: { attendee: 'A' }, cycle_config: { cycle_length_years: 3 } };
    const b = { cycle_config: { cycle_length_years: 3 }, role_mappings: { attendee: 'A' } };
    expect(canonicalSha256Hex(a)).toBe(canonicalSha256Hex(b));
  });

  it('detects a single-byte content change', () => {
    const before = { cycle_config: { cycle_length_years: 3 } };
    const after = { cycle_config: { cycle_length_years: 4 } };
    expect(canonicalSha256Hex(before)).not.toBe(canonicalSha256Hex(after));
  });

  it('is stable for a realistic HKCP-shaped taxonomy fragment', () => {
    const tax = {
      provisional: true,
      pack_version_seq: 1,
      role_mappings: { attendee: 'A', chair: 'A', presenter: 'A' },
    };
    // Two runs of the same input must return the same digest.
    expect(canonicalSha256Hex(tax)).toBe(canonicalSha256Hex(tax));
    // Hex, 64 chars (SHA-256).
    expect(canonicalSha256Hex(tax)).toMatch(/^[0-9a-f]{64}$/);
  });
});
