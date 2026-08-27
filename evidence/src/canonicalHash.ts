/**
 * RFC 8785 JSON Canonicalization Scheme + SHA-256, hex-encoded.
 *
 * Uses `canonicalize` (Erdtman's reference JCS impl, zero deps) rather than
 * hand-rolled key sorting — doctrine `docs/doctrine.md`: "Never hash raw
 * JSONB. Adopt RFC 8785, do not hand-roll."
 *
 * Used at evidence-export time to identify which taxonomy pack was in force
 * (Decision 2, 2026-08-21): the hash is computed alongside the ledger read,
 * NOT written into `credit_ledger`. Doctrine D.1 stays open.
 */
import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';

export function canonicalSha256Hex(value: unknown): string {
  const canonical = canonicalize(value);
  if (canonical === undefined) {
    // canonicalize returns undefined for values JSON refuses (bigint, function,
    // symbol). A taxonomy jsonb from Postgres can never carry any of these, so
    // this is a programmer error (or corruption), not a runtime condition.
    throw new Error('canonicalize returned undefined (input is not JSON-serialisable)');
  }
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
