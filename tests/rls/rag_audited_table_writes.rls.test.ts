// B9-S1-A: the audited-write guard for the seven B9 tables whose sole write path is a
// SECURITY DEFINER function (processing_jobs, document_approvals, embedding_indexes,
// retrieval_index_assignments, pack_versions, pack_sources, pack_source_passages).
// Same posture as the "permanent append-only" block in audited_table_writes.rls.test.ts:
// service_role has BYPASSRLS, so only the table-level REVOKE blocks it. Every denial asserts
// SQLSTATE 42501, never "an error occurred". Also: one round trip per definer function,
// the staff-cannot-call-it check, and a seed.sql parity check (the seed runs only on a reset).
//
// Fixtures carry the prefix B9S1A. Cleanup patterns are narrowed to this file ('w-') so the
// parallel read-scope file's fixtures are never deleted from under it. Audit rows written by
// the definer functions are permanent; that is expected.
//
// Gated: only runs under RLS_TESTS=1.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  admin,
  createAnonClient,
  createTestUser,
  deleteTestUser,
  sqlSuperuser,
  sqlSuperuserQuery,
  type TestUser,
} from '../helpers/clients';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const BOGUS = '00000000-0000-0000-0000-0000000000ff';
const PERMISSION_DENIED = '42501';
const AUDITED = [
  'processing_jobs',
  'document_approvals',
  'embedding_indexes',
  'retrieval_index_assignments',
  'pack_versions',
  'pack_sources',
  'pack_source_passages',
] as const;
const ALL_TABLES = [
  'documents', 'document_versions', 'document_relationships', 'document_approvals',
  'processing_jobs', 'parse_runs', 'parsed_elements', 'chunks',
  'embedding_indexes', 'retrieval_index_assignments',
  'pack_versions', 'pack_sources', 'pack_source_passages',
  'evaluation_cases', 'retrieval_traces',
];

describe.skipIf(!process.env.RLS_TESTS)('B9 RAG audited-table write guard', () => {
  const ts = Date.now();
  const staffEmails: string[] = [];
  let staffUser: TestUser;
  let organiser: TestUser;
  let versionId: string;
  let otherVersionId: string;
  let indexId: string;
  let orgId: string;

  const auditTypes = async (subjectId: string) =>
    (
      await sqlSuperuserQuery<{ event_type: string }>(
        'select event_type from public.audit_events where subject_id = $1 order by chain_seq',
        [subjectId],
      )
    ).map((r) => r.event_type);

  beforeAll(async () => {
    staffUser = await createTestUser(`b9s1a-w-staff-${ts}`);
    organiser = await createTestUser(`b9s1a-w-org-${ts}`);
    for (const [u, role] of [
      [staffUser, 'eventar_staff'],
      [organiser, 'organiser_admin'],
    ] as const) {
      const { error } = await admin.from('staff').insert({
        email: u.email,
        role,
        full_name: `B9S1A ${role}`,
        organisation_id: DEFAULT_ORG,
        status: 'active',
      });
      if (error) throw new Error(`staff fixture ${role}: ${error.message}`);
      staffEmails.push(u.email);
    }
    const [doc] = await sqlSuperuserQuery<{ id: string }>(
      `insert into public.documents (scope_type, family, source_filename, source_mime, source_sha256, storage_path)
       values ('global_authority', 'body_rule_source', 'B9S1A.docx', 'application/octet-stream',
               sha256('B9S1A-w-${ts}'::bytea), 'rag/B9S1A/w-${ts}') returning id`,
    );
    const [ver] = await sqlSuperuserQuery<{ id: string }>(
      `insert into public.document_versions (document_id, declared_version, parser_policy_version)
       values ('${doc.id}', 'B9S1A v1', 'p1') returning id`,
    );
    versionId = ver.id;
    const [doc2] = await sqlSuperuserQuery<{ id: string }>(
      `insert into public.documents (scope_type, family, source_filename, source_mime, source_sha256, storage_path)
       values ('global_authority', 'body_rule_source', 'B9S1A.docx', 'application/octet-stream',
               sha256('B9S1A-w-2-${ts}'::bytea), 'rag/B9S1A/w-2-${ts}') returning id`,
    );
    const [ver2] = await sqlSuperuserQuery<{ id: string }>(
      `insert into public.document_versions (document_id, declared_version, parser_policy_version)
       values ('${doc2.id}', 'B9S1A v1', 'p1') returning id`,
    );
    otherVersionId = ver2.id;
    // The assign round trip uses its own organisation, so it can never close a real assignment.
    const { data: org, error: orgErr } = await admin
      .from('organisations')
      .insert({ name: `B9S1A w ${ts}`, slug: `b9s1a-w-${ts}` })
      .select('id')
      .single();
    if (orgErr || !org) throw new Error(`organisation fixture: ${orgErr?.message}`);
    orgId = org.id;
  });

  afterAll(async () => {
    await sqlSuperuser(`
      delete from public.retrieval_index_assignments where active_embedding_index_id in (select id from public.embedding_indexes where name like 'B9S1A-w-%');
      delete from public.processing_jobs where idempotency_key like 'B9S1A-w-%';
      delete from public.document_approvals where document_version_id in (select v.id from public.document_versions v join public.documents d on d.id = v.document_id where d.storage_path like 'rag/B9S1A/w-%');
      delete from public.chunks where document_version_id in (select v.id from public.document_versions v join public.documents d on d.id = v.document_id where d.storage_path like 'rag/B9S1A/w-%');
      delete from public.parse_runs where document_version_id in (select v.id from public.document_versions v join public.documents d on d.id = v.document_id where d.storage_path like 'rag/B9S1A/w-%');
      delete from public.embedding_indexes where name like 'B9S1A-w-%';
      delete from public.document_versions where document_id in (select id from public.documents where storage_path like 'rag/B9S1A/w-%');
      delete from public.documents where storage_path like 'rag/B9S1A/w-%';
    `);
    if (orgId) await admin.from('organisations').delete().eq('id', orgId);
    if (staffEmails.length) await admin.from('staff').delete().in('email', staffEmails);
    if (staffUser) await deleteTestUser(staffUser);
    if (organiser) await deleteTestUser(organiser);
  });

  for (const table of AUDITED) {
    describe(`${table}: no API role writes directly`, () => {
      it('service_role INSERT is 42501', async () => {
        const ins = await admin.from(table).insert({ id: BOGUS });
        expect(ins.error?.code, `${table}: service_role INSERT must be 42501`).toBe(PERMISSION_DENIED);
      });
      it('service_role UPDATE is 42501', async () => {
        const upd = await admin.from(table).update({ id: BOGUS }).eq('id', BOGUS);
        expect(upd.error?.code, `${table}: service_role UPDATE must be 42501`).toBe(PERMISSION_DENIED);
      });
      it('service_role DELETE is 42501', async () => {
        const del = await admin.from(table).delete().eq('id', BOGUS);
        expect(del.error?.code, `${table}: service_role DELETE must be 42501`).toBe(PERMISSION_DENIED);
      });
      it('anon and a signed-in organiser INSERT are 42501', async () => {
        expect((await createAnonClient().from(table).insert({ id: BOGUS })).error?.code).toBe(PERMISSION_DENIED);
        expect((await organiser.client.from(table).insert({ id: BOGUS })).error?.code).toBe(PERMISSION_DENIED);
      });
    });
  }

  describe('definer functions: positive round trips (service_role)', () => {
    it('rag_enqueue_processing_job is idempotent and audits once', async () => {
      const args = { p_document_version_id: versionId, p_job_type: 'ingest', p_idempotency_key: `B9S1A-w-${ts}` };
      const a = await admin.rpc('rag_enqueue_processing_job', args);
      const b = await admin.rpc('rag_enqueue_processing_job', args);
      expect(a.error).toBeNull();
      expect(b.error).toBeNull();
      expect(typeof a.data).toBe('string');
      expect(b.data).toBe(a.data);
      const types = await auditTypes(a.data as string);
      expect(types.filter((t) => t === 'rag_job_enqueued')).toHaveLength(1);
    });

    it('rag_enqueue_processing_job rejects an idempotency key owned by another document version (22023)', async () => {
      const r = await admin.rpc('rag_enqueue_processing_job', {
        p_document_version_id: otherVersionId,
        p_job_type: 'ingest',
        p_idempotency_key: `B9S1A-w-${ts}`,
      });
      expect(r.error?.code).toBe('22023');
    });

    it('rag_record_document_approval records the approval and flips review_status', async () => {
      const r = await admin.rpc('rag_record_document_approval', {
        p_document_version_id: versionId,
        p_approval_status: 'approved',
        p_approval_basis: 'B9S1A fixture',
      });
      expect(r.error).toBeNull();
      const rows = await sqlSuperuserQuery<{ n: string; review_status: string }>(
        `select (select count(*) from public.document_approvals where id = $1) as n,
                (select review_status from public.document_versions where id = $2) as review_status`,
        [r.data, versionId],
      );
      expect(Number(rows[0].n)).toBe(1);
      expect(rows[0].review_status).toBe('approved');
      expect(await auditTypes(versionId)).toContain('rag_document_approval_recorded');
    });

    it('rag_create_embedding_index creates a draft with an emb_ storage table', async () => {
      const r = await admin.rpc('rag_create_embedding_index', {
        p_name: `B9S1A-w-idx-${ts}`,
        p_provider: 'fixture',
        p_model: 'fixture-model',
        p_dimension: 8,
        p_chunk_version: 'c1',
      });
      expect(r.error).toBeNull();
      indexId = r.data as string;
      const [row] = await sqlSuperuserQuery<{ status: string; storage_table: string }>(
        'select status, storage_table from public.embedding_indexes where id = $1',
        [indexId],
      );
      expect(row.status).toBe('draft');
      expect(row.storage_table).toMatch(/^emb_[0-9a-f]{8}$/);
      expect(await auditTypes(indexId)).toContain('rag_embedding_index_created');
    });

    it('rag_set_embedding_index_status rejects draft to active and walks draft to approved', async () => {
      const bad = await admin.rpc('rag_set_embedding_index_status', { p_index_id: indexId, p_new_status: 'active' });
      expect(bad.error?.code).toBe('22023');
      for (const s of ['building', 'evaluating', 'approved']) {
        const ok = await admin.rpc('rag_set_embedding_index_status', { p_index_id: indexId, p_new_status: s });
        expect(ok.error, `-> ${s}`).toBeNull();
      }
      const [row] = await sqlSuperuserQuery<{ status: string }>(
        'select status from public.embedding_indexes where id = $1',
        [indexId],
      );
      expect(row.status).toBe('approved');
      const types = await auditTypes(indexId);
      expect(types.filter((t) => t === 'rag_embedding_index_status_changed')).toHaveLength(3);
    });

    it('rag_assign_retrieval_index leaves one open assignment and activates the index', async () => {
      const args = {
        p_scope_type: 'organisation_private',
        p_organisation_id: orgId,
        p_document_family: 'body_rule_source',
        p_embedding_index_id: indexId,
      };
      const a = await admin.rpc('rag_assign_retrieval_index', args);
      const b = await admin.rpc('rag_assign_retrieval_index', args);
      expect(a.error).toBeNull();
      expect(b.error).toBeNull();
      const [row] = await sqlSuperuserQuery<{ open: string; total: string; status: string }>(
        `select (select count(*) from public.retrieval_index_assignments where active_embedding_index_id = $1 and effective_to is null) as open,
                (select count(*) from public.retrieval_index_assignments where active_embedding_index_id = $1) as total,
                (select status from public.embedding_indexes where id = $1) as status`,
        [indexId],
      );
      expect(Number(row.open)).toBe(1);
      expect(Number(row.total)).toBe(2);
      expect(row.status).toBe('active');
      expect(await auditTypes(b.data as string)).toContain('rag_index_assigned');
    });

    it('rag_set_embedding_index_status refuses to retire an index with an open assignment (22023)', async () => {
      const r = await admin.rpc('rag_set_embedding_index_status', { p_index_id: indexId, p_new_status: 'retired' });
      expect(r.error?.code).toBe('22023');
      const [row] = await sqlSuperuserQuery<{ status: string }>(
        'select status from public.embedding_indexes where id = $1',
        [indexId],
      );
      expect(row.status).toBe('active');
    });
  });

  describe('definer functions: a signed-in eventar_staff client is denied (42501)', () => {
    const calls: [string, Record<string, unknown>][] = [
      ['rag_enqueue_processing_job', { p_document_version_id: BOGUS, p_job_type: 'ingest', p_idempotency_key: 'B9S1A-w-denied' }],
      ['rag_record_document_approval', { p_document_version_id: BOGUS, p_approval_status: 'approved', p_approval_basis: 'x' }],
      ['rag_create_embedding_index', { p_name: 'B9S1A-w-denied', p_provider: 'x', p_model: 'x', p_dimension: 1, p_chunk_version: 'x' }],
      ['rag_set_embedding_index_status', { p_index_id: BOGUS, p_new_status: 'building' }],
      ['rag_assign_retrieval_index', { p_scope_type: 'global_authority', p_organisation_id: null, p_document_family: 'body_rule_source', p_embedding_index_id: BOGUS }],
    ];
    for (const [fn, args] of calls) {
      it(fn, async () => {
        const { error } = await staffUser.client.rpc(fn, args);
        expect(error?.code).toBe(PERMISSION_DENIED);
      });
    }
  });

  describe('seed.sql mirrors the migration grants', () => {
    const seed = readFileSync('supabase/seed.sql', 'utf8');
    const block = seed.slice(seed.indexOf('-- B9 RAG.'));
    const statements = block.split(';');
    const stmt = (role: string) => statements.find((s) => new RegExp(`from ${role}\\s*$`).test(s.trim())) ?? '';
    const has = (s: string, t: string) => new RegExp(`public\\.${t}\\b`).test(s);

    it('the block exists', () => expect(seed.indexOf('-- B9 RAG.')).toBeGreaterThan(-1));
    for (const t of ALL_TABLES) {
      it(`${t}: revoked from anon and authenticated`, () => {
        expect(has(stmt('anon'), t)).toBe(true);
        expect(has(stmt('authenticated'), t)).toBe(true);
      });
    }
    for (const t of AUDITED) {
      it(`${t}: revoked from service_role`, () => expect(has(stmt('service_role'), t)).toBe(true));
    }
  });
});
