// Audit chain integrity under concurrency, against the live dev project.
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect } from 'vitest';
import { admin } from '../helpers/clients';

type ChainRow = {
  chain_seq: number;
  link_valid: boolean;
  content_valid: boolean;
};

// Fires `total` RPC calls in concurrent batches of `batchSize`, awaiting
// each batch before starting the next. Verified against the live dev
// project (2026-07-04): raw Promise.all across 200 simultaneous supabase-js
// HTTP calls from one Node process exceeds an undici/platform-gateway
// connection ceiling (158/200 failed with a connectionless "fetch failed",
// not a Postgres error) at concurrency 200; concurrency 30 already showed
// one failure, concurrency 20 was clean. Batching at 20 keeps every chunk
// genuinely concurrent at the Postgres/advisory-lock level — which is the
// property under test — without exceeding the client-side connection limit.
async function writeAuditEventsBatched(
  total: number,
  batchSize: number,
  eventTypePrefix: string,
): Promise<Awaited<ReturnType<typeof admin.rpc>>[]> {
  const results: Awaited<ReturnType<typeof admin.rpc>>[] = [];
  for (let start = 0; start < total; start += batchSize) {
    const end = Math.min(start + batchSize, total);
    const batch = await Promise.all(
      Array.from({ length: end - start }, (_, j) =>
        admin.rpc('write_audit_event', {
          p_event_type: `${eventTypePrefix}_${start + j}`,
        }),
      ),
    );
    results.push(...batch);
  }
  return results;
}

describe.skipIf(!process.env.RLS_TESTS)('audit chain', () => {
  it('sequential writes chain correctly', async () => {
    for (let i = 0; i < 5; i++) {
      const { error } = await admin.rpc('write_audit_event', {
        p_event_type: `chain_test_seq_${i}`,
      });
      expect(error).toBeNull();
    }
    const { data, error } = await admin.rpc('verify_audit_chain');
    expect(error).toBeNull();
    const rows = data as ChainRow[];
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.every((r) => r.link_valid && r.content_valid)).toBe(true);
  }, 60_000);

  it('200 concurrent writes produce a linear, valid chain', async () => {
    const results = await writeAuditEventsBatched(
      200,
      20,
      'chain_test_concurrent',
    );
    expect(results.every((r) => r.error === null)).toBe(true);

    const { data } = await admin.rpc('verify_audit_chain');
    const rows = data as ChainRow[];
    const invalid = rows.filter((r) => !r.link_valid || !r.content_valid);
    expect(invalid).toHaveLength(0);

    // Linkage re-check straight off the table, ordered by chain_seq.
    const { data: raw } = await admin
      .from('audit_events')
      .select('chain_seq, prev_hash, hash')
      .order('chain_seq', { ascending: true });
    for (let i = 1; i < raw!.length; i++) {
      expect(raw![i].prev_hash).toBe(raw![i - 1].hash);
    }
  }, 120_000);
});
