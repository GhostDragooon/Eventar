// Rule-content history for accrediting bodies (migration 20261105100000).
// Every create or change of category_taxonomy / cycle_config must leave an
// audit_events row with the old and new content and their hashes, so an award
// can be traced to the rules in force when it posted. A change to any other
// column must not. Gated: only runs under RLS_TESTS=1, local stack only.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

type AuditRow = {
  event_type: string;
  subject_id: string;
  payload: {
    operation: string;
    old: { category_taxonomy: unknown; cycle_config: unknown } | null;
    new: { category_taxonomy: unknown; cycle_config: unknown };
    old_hash: string | null;
    new_hash: string;
  };
};

async function ruleAudits(bodyId: string): Promise<AuditRow[]> {
  const { data, error } = await admin
    .from('audit_events')
    .select('event_type, subject_id, payload, chain_seq')
    .eq('subject_type', 'accrediting_body')
    .eq('subject_id', bodyId)
    .eq('event_type', 'body_rule_content_changed')
    .order('chain_seq');
  if (error) throw new Error(`audit read: ${error.message}`);
  return (data ?? []) as unknown as AuditRow[];
}

describe.skipIf(!process.env.RLS_TESTS)('accrediting_bodies rule-content audit', () => {
  let bodyId: string;
  const v1 = { role_mappings: { attendee: 'A' } };
  const v2 = { role_mappings: { attendee: 'B' } };

  beforeAll(async () => {
    const { data, error } = await admin
      .from('accrediting_bodies')
      .insert({
        organisation_id: DEFAULT_ORG,
        short_name: `RLS-RULEAUDIT-${Date.now()}`,
        full_name: 'RLS rule-audit fixture body',
        cycle_config: {},
        category_taxonomy: v1,
        status: 'onboarding',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`body fixture: ${error?.message}`);
    bodyId = data.id as string;
  });

  afterAll(async () => {
    if (bodyId) await mustDelete(admin.from('accrediting_bodies').delete().eq('id', bodyId), 'rule-audit body');
  });

  it('insert writes one row with the new content and no old', async () => {
    const rows = await ruleAudits(bodyId);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.operation).toBe('insert');
    expect(rows[0].payload.old).toBeNull();
    expect(rows[0].payload.new.category_taxonomy).toEqual(v1);
    expect(rows[0].payload.new_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a non-rule column change writes nothing', async () => {
    const { error } = await admin.from('accrediting_bodies').update({ full_name: 'renamed' }).eq('id', bodyId);
    expect(error).toBeNull();
    expect(await ruleAudits(bodyId)).toHaveLength(1);
  });

  it('a same-value rule update writes nothing', async () => {
    const { error } = await admin.from('accrediting_bodies').update({ category_taxonomy: v1 }).eq('id', bodyId);
    expect(error).toBeNull();
    expect(await ruleAudits(bodyId)).toHaveLength(1);
  });

  it('a rule change writes old and new content with chained hashes', async () => {
    const { error } = await admin.from('accrediting_bodies').update({ category_taxonomy: v2 }).eq('id', bodyId);
    expect(error).toBeNull();
    const rows = await ruleAudits(bodyId);
    expect(rows).toHaveLength(2);
    const change = rows[1].payload;
    expect(change.operation).toBe('update');
    expect(change.old?.category_taxonomy).toEqual(v1);
    expect(change.new.category_taxonomy).toEqual(v2);
    expect(change.old_hash).toBe(rows[0].payload.new_hash);
    expect(change.new_hash).not.toBe(change.old_hash);
  });

  it('the audit chain still verifies', async () => {
    const { data, error } = await admin.rpc('verify_audit_chain');
    expect(error).toBeNull();
    const broken = (data as { link_valid: boolean; content_valid: boolean }[]).filter(
      (r) => !r.link_valid || !r.content_valid,
    );
    expect(broken).toEqual([]);
  });
});
