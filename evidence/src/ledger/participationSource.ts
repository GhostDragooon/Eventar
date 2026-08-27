/**
 * Participation data seam.
 *
 * Agents and the orchestrator depend only on ParticipationSource.
 * `MockParticipationSource` is the CLI/test path;
 * `SupabaseParticipationSource` is what the staff Server Action passes in.
 *
 * chain_verified MUST come from the deterministic integrity check
 * (`verify_ledger_chain()` — SECURITY DEFINER, service_role-only per
 * `20260709260000_credit_ledger_hardening.sql`). Never compute the hash
 * chain result inside the agent — the seam reads the DB verdict.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventRecord, LedgerEntry, ParticipationSource } from '../types';
import { canonicalSha256Hex } from '../canonicalHash';

export type { ParticipationSource, EventRecord, LedgerEntry } from '../types';
export { MockParticipationSource } from './mockParticipationSource';

/**
 * Empty-taxonomy guard. Any "no content" shape — `null`, `undefined`, `{}`,
 * `[]`, `""` — must not produce a hash. Otherwise a College reviewer sees a
 * real-looking 64-char SHA-256 that in fact hashes an empty value: `{}` →
 * `44136fa3…8a`, `""` → `12ae32cb…5c`, `[]` → `4f53cda1…10`, and every one is
 * indistinguishable in shape from a real pack. Returning `null` here surfaces
 * as `rule_version_status: 'missing'` on the exported package, so an empty
 * value is never presented as attestation. Doctrinally identical to Decision 2:
 * a missing rule pack is genuinely absent, not something-with-a-hash.
 */
function hashTaxonomyOrNull(taxonomy: unknown): string | null {
  if (taxonomy == null || taxonomy === '') return null;
  if (Array.isArray(taxonomy) && taxonomy.length === 0) return null;
  if (
    typeof taxonomy === 'object' &&
    !Array.isArray(taxonomy) &&
    Object.keys(taxonomy as Record<string, unknown>).length === 0
  ) {
    return null;
  }
  return canonicalSha256Hex(taxonomy);
}

/**
 * One (event, body) view of the ledger. One instance per body — the seam's
 * event-scoped `rule_version` cannot express per-body taxonomy in a
 * multi-body event, so the Server Action loops over bodies and constructs
 * a source per body. C4's award engine posts one `credit_ledger` row per
 * body per practitioner, so this naturally yields one Q2 claim per
 * (licence, body).
 *
 * The `frozen_rule_version` returned to the agent is the RFC 8785
 * canonical SHA-256 of THIS body's `category_taxonomy` jsonb, computed
 * at read time (Decision 2, 2026-08-21: no `credit_ledger` column; the
 * hash lives in the export). Every ledger entry carries the same hash,
 * so the agent's `entry.rule_version !== event.frozen_rule_version`
 * check passes when the entry was posted against the pack we just hashed.
 *
 * Reads use the service-role client because both `credit_ledger`
 * (cross-tenant by design — not readable via an organiser's session) and
 * `verify_ledger_chain()` are service_role-only.
 */
export class SupabaseParticipationSource implements ParticipationSource {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly opts: { bodyId: string },
  ) {}

  async getEvent(eventId: string): Promise<EventRecord | null> {
    const [eventRes, bodyRes] = await Promise.all([
      this.admin.from('events').select('id').eq('id', eventId).maybeSingle(),
      this.admin
        .from('accrediting_bodies')
        .select('id, category_taxonomy')
        .eq('id', this.opts.bodyId)
        .maybeSingle(),
    ]);
    if (eventRes.error) throw eventRes.error;
    if (bodyRes.error) throw bodyRes.error;
    if (!eventRes.data) return null;
    // Body missing is a caller mistake (the Server Action derived the id from
    // credit_ledger for this event); surface it rather than emit a package
    // whose rule_version is a hash of nothing.
    if (!bodyRes.data) {
      throw new Error(`accrediting_bodies row for body_id ${this.opts.bodyId} not found`);
    }

    // pathway=accredited is unconditional here: the Server Action only
    // constructs this source for bodies that actually posted credit for the
    // event. An ordinary event never reaches this source.
    return {
      event_id: eventRes.data.id as string,
      pathway: 'accredited',
      frozen_rule_version: hashTaxonomyOrNull(bodyRes.data.category_taxonomy),
    };
  }

  async listEntries(eventId: string): Promise<LedgerEntry[]> {
    // Same hash the agent will compare against — recomputed here so entry
    // and event agree without a shared field. Cheap; single row lookup.
    const bodyRes = await this.admin
      .from('accrediting_bodies')
      .select('id, category_taxonomy')
      .eq('id', this.opts.bodyId)
      .maybeSingle();
    if (bodyRes.error) throw bodyRes.error;
    if (!bodyRes.data) {
      throw new Error(`accrediting_bodies row for body_id ${this.opts.bodyId} not found`);
    }
    // Missing/empty taxonomy → null hash. The agent's per-entry check
    // (entry.rule_version !== event.frozen_rule_version) compares nulls; both
    // sides are null when the pack is missing, so it doesn't false-flag the
    // entry — the orchestrator's own "no frozen version" gate blocks the
    // whole package (rule_version_status: 'missing' on the package makes this
    // explicit to a College reviewer).
    const ruleHash = hashTaxonomyOrNull(bodyRes.data.category_taxonomy);

    // Registration and check-in counts are event-wide (not per-entry) —
    // read once, stamp on every entry so the agent's overflow check works.
    // No PII fetched (ids only + count).
    const regsRes = await this.admin
      .from('registrations')
      .select('id, check_in_at')
      .eq('event_id', eventId);
    if (regsRes.error) throw regsRes.error;
    const regs = regsRes.data ?? [];
    const registrationCount = regs.length;
    const checkinCount = regs.filter((r) => r.check_in_at != null).length;

    // Ledger rows for (event, body). event_id can be null for adjustment
    // entries — those never carry a fresh attendance verdict for this event,
    // so filtering by event_id is exactly right.
    const entriesRes = await this.admin
      .from('credit_ledger')
      .select('id, chain_seq, licence_id, attestation_status')
      .eq('event_id', eventId)
      .eq('body_id', this.opts.bodyId)
      .order('chain_seq', { ascending: true });
    if (entriesRes.error) throw entriesRes.error;
    const entries = entriesRes.data ?? [];
    if (entries.length === 0) return [];

    // verify_ledger_chain() returns (chain_seq, link_valid, content_valid)
    // for the WHOLE ledger — there is no per-event/per-row variant. Read
    // once and index by chain_seq. A run that fails to produce a row for
    // one of our entries is treated as `null` (unknown), which the agent
    // renders as `human_review_required`.
    const chainRes = await this.admin.rpc('verify_ledger_chain');
    if (chainRes.error) throw chainRes.error;
    const chainRows = (chainRes.data ?? []) as Array<{
      chain_seq: number;
      link_valid: boolean;
      content_valid: boolean;
    }>;
    const verdictBySeq = new Map<number, boolean>(
      chainRows.map((r) => [Number(r.chain_seq), Boolean(r.link_valid && r.content_valid)]),
    );

    return entries.map((e) => {
      const seq = Number(e.chain_seq);
      const verdict = verdictBySeq.has(seq) ? verdictBySeq.get(seq)! : null;
      const out: LedgerEntry = {
        entry_id: e.id as string,
        event_id: eventId,
        practitioner_licence_id: e.licence_id as string,
        attestation_status: (e.attestation_status as string | null) ?? 'organiser_attested',
        rule_version: ruleHash, // null when the taxonomy is missing/empty — see hashTaxonomyOrNull.
        chain_verified: verdict,
        registration_count: registrationCount,
        checkin_count: checkinCount,
      };
      return out;
    });
  }
}
