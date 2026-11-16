// B9-S1-A: who can read the B9 tables. eventar_staff sees everything. A body_admin sees a
// document (and what hangs off its version) only when it is global_authority, its body belongs
// to their organisation, and their staff row is role body_admin and active. Organiser roles in
// that SAME organisation, a suspended body_admin, body-less and organisation-private documents,
// and a relationship that touches an unreadable version all stay hidden. anon is denied (42501).
//
// Fixtures carry the prefix B9S1A. Cleanup patterns are narrowed to this file ('r-') so the
// parallel write-guard file's fixtures are never deleted from under it.
//
// Gated: only runs under RLS_TESTS=1.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
const PERMISSION_DENIED = '42501';

describe.skipIf(!process.env.RLS_TESTS)('B9 RAG read scope', () => {
  const ts = Date.now();
  const orgIds: string[] = [];
  const bodyIds: string[] = [];
  const staffEmails: string[] = [];
  const users: TestUser[] = [];
  type K = 'X' | 'Y' | 'G' | 'P';
  const doc = {} as Record<K, string>;
  const ver = {} as Record<'X' | 'Y', string>;
  let staff: TestUser;
  let bodyAdmin: TestUser;
  let suspendedAdmin: TestUser;
  let organiserAdmin: TestUser;
  let organiserMember: TestUser;
  let auditor: TestUser;

  const mkOrg = async (tag: string) => {
    const { data, error } = await admin
      .from('organisations')
      .insert({ name: `B9S1A Org ${tag} ${ts}`, slug: `b9s1a-r-${tag}-${ts}` })
      .select('id')
      .single();
    if (error || !data) throw new Error(`org ${tag}: ${error?.message}`);
    orgIds.push(data.id as string);
    return data.id as string;
  };
  const mkBody = async (tag: string, orgId: string) => {
    const { data, error } = await admin
      .from('accrediting_bodies')
      .insert({
        organisation_id: orgId,
        short_name: `B9S1A-${tag}-${ts}`,
        full_name: `B9S1A Body ${tag}`,
        status: 'active',
        cycle_config: {},
        category_taxonomy: {},
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`body ${tag}: ${error?.message}`);
    bodyIds.push(data.id as string);
    return data.id as string;
  };
  const mkUser = async (tag: string, role: string, orgId: string, status = 'active') => {
    const u = await createTestUser(`b9s1a-r-${tag}-${ts}`);
    users.push(u);
    const { error } = await admin.from('staff').insert({
      email: u.email,
      role,
      full_name: `B9S1A ${role}`,
      organisation_id: orgId,
      status,
    });
    if (error) throw new Error(`staff ${tag}: ${error.message}`);
    staffEmails.push(u.email);
    return u;
  };
  const mkDoc = async (k: K, scope: string, bodyId: string | null, owner: string | null) => {
    const [d] = await sqlSuperuserQuery<{ id: string }>(
      `insert into public.documents (scope_type, body_id, owner_organisation_id, family, source_filename, source_mime, source_sha256, storage_path)
       values ($1, $2, $3, 'body_rule_source', 'B9S1A.docx', 'application/octet-stream',
               sha256('B9S1A-r-${k}-${ts}'::bytea), 'rag/B9S1A/r-${k}-${ts}') returning id`,
      [scope, bodyId, owner],
    );
    doc[k] = d.id;
    return d.id;
  };

  beforeAll(async () => {
    const orgX = await mkOrg('x');
    const orgY = await mkOrg('y');
    const orgZ = await mkOrg('z');
    const bodyX = await mkBody('X', orgX);
    const bodyY = await mkBody('Y', orgY);

    for (const [k, bodyId] of [['X', bodyX], ['Y', bodyY]] as const) {
      const docId = await mkDoc(k, 'global_authority', bodyId, null);
      const [v] = await sqlSuperuserQuery<{ id: string }>(
        `insert into public.document_versions (document_id, declared_version, parser_policy_version)
         values ('${docId}', 'B9S1A v1', 'p1') returning id`,
      );
      ver[k] = v.id;
      const [p] = await sqlSuperuserQuery<{ id: string }>(
        `insert into public.parse_runs (document_version_id, parser_name, parser_version, parser_policy_version)
         values ('${v.id}', 'fixture', '0', 'p1') returning id`,
      );
      await sqlSuperuserQuery(
        `insert into public.parsed_elements (document_version_id, parse_run_id, ordinal, element_type, text, content_sha256, parser_name, parser_version)
         values ('${v.id}', '${p.id}', 0, 'paragraph', 'B9S1A el', sha256('B9S1A el'::bytea), 'fixture', '0')`,
      );
      await sqlSuperuserQuery(
        `insert into public.chunks (document_version_id, parse_run_id, chunk_set_id, chunk_version, ordinal, text, text_for_embedding, content_sha256, token_count)
         values ('${v.id}', '${p.id}', gen_random_uuid(), 'fixture', 0, 'B9S1A text', 'B9S1A text', sha256('B9S1A text'::bytea), 2)`,
      );
    }
    await mkDoc('G', 'global_authority', null, null); // no body: eventar_staff only
    await mkDoc('P', 'organisation_private', bodyX, orgZ); // names body X but is private: eventar_staff only
    await sqlSuperuserQuery(
      `insert into public.document_relationships (source_document_version_id, target_document_version_id, relationship_type)
       values ('${ver.X}', '${ver.Y}', 'supersedes')`,
    );
    await sqlSuperuserQuery(
      `insert into public.evaluation_cases (case_id, question, use_case, expected_query_class, answerability, dataset_partition, dataset_version)
       values ('B9S1A-r-${ts}', 'B9S1A question', 'rule_lookup', 'exact_value', 'answerable', 'development', 'B9S1A-r')`,
    );

    staff = await mkUser('staff', 'eventar_staff', DEFAULT_ORG);
    bodyAdmin = await mkUser('bodyadmin', 'body_admin', orgX);
    suspendedAdmin = await mkUser('suspended', 'body_admin', orgX, 'suspended');
    // Same organisation as body X: only the role clause keeps these out.
    organiserAdmin = await mkUser('orgadmin', 'organiser_admin', orgX);
    organiserMember = await mkUser('orgmember', 'organiser_member', orgX);
    auditor = await mkUser('auditor', 'auditor', orgX);
  });

  afterAll(async () => {
    const mine = `select v.id from public.document_versions v join public.documents d on d.id = v.document_id where d.storage_path like 'rag/B9S1A/r-%'`;
    await sqlSuperuser(`
      delete from public.evaluation_cases where dataset_version = 'B9S1A-r';
      delete from public.document_relationships where source_document_version_id in (${mine}) or target_document_version_id in (${mine});
      delete from public.chunks where document_version_id in (${mine});
      delete from public.parsed_elements where document_version_id in (${mine});
      delete from public.parse_runs where document_version_id in (${mine});
      delete from public.document_versions where document_id in (select id from public.documents where storage_path like 'rag/B9S1A/r-%');
      delete from public.documents where storage_path like 'rag/B9S1A/r-%';
    `);
    if (staffEmails.length) await admin.from('staff').delete().in('email', staffEmails);
    if (bodyIds.length) await admin.from('accrediting_bodies').delete().in('id', bodyIds);
    if (orgIds.length) await admin.from('organisations').delete().in('id', orgIds);
    for (const u of users) await deleteTestUser(u);
  });

  type C = TestUser['client'];
  const seenDocs = async (c: C) => {
    const { data, error } = await c.from('documents').select('id').in('id', Object.values(doc));
    expect(error).toBeNull();
    return (data ?? []).map((r) => r.id as string).sort();
  };
  // Tables that hang off a document version, keyed by the column that holds the version id.
  const VERSION_TABLES = [
    ['document_versions', 'id'],
    ['parse_runs', 'document_version_id'],
    ['parsed_elements', 'document_version_id'],
    ['chunks', 'document_version_id'],
  ] as const;
  const seenVersions = async (c: C, table: string, col: string) => {
    const { data, error } = await c.from(table).select(col).in(col, [ver.X, ver.Y]);
    expect(error, table).toBeNull();
    return ((data ?? []) as unknown as Record<string, string>[]).map((r) => r[col]).sort();
  };
  const seenRelationships = async (c: C) => {
    const { data, error } = await c
      .from('document_relationships')
      .select('id')
      .eq('source_document_version_id', ver.X);
    expect(error).toBeNull();
    return data ?? [];
  };

  it('eventar_staff sees every document, version-level row and the relationship', async () => {
    expect(await seenDocs(staff.client)).toEqual(Object.values(doc).sort());
    for (const [t, col] of VERSION_TABLES) {
      expect(await seenVersions(staff.client, t, col), t).toEqual([ver.X, ver.Y].sort());
    }
    expect(await seenRelationships(staff.client)).toHaveLength(1);
  });

  it('body_admin sees body X only: its global document and version-level rows', async () => {
    expect(await seenDocs(bodyAdmin.client)).toEqual([doc.X]);
    for (const [t, col] of VERSION_TABLES) {
      expect(await seenVersions(bodyAdmin.client, t, col), t).toEqual([ver.X]);
    }
  });

  it('body_admin does not see a body-less global document', async () => {
    const { data, error } = await bodyAdmin.client.from('documents').select('id').eq('id', doc.G);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('body_admin does not see an organisation-private document that names their body', async () => {
    const { data, error } = await bodyAdmin.client.from('documents').select('id').eq('id', doc.P);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('body_admin does not see a relationship whose target version is unreadable', async () => {
    expect(await seenRelationships(bodyAdmin.client)).toEqual([]);
  });

  it('a suspended body_admin of body X sees nothing', async () => {
    expect(await seenDocs(suspendedAdmin.client)).toEqual([]);
    for (const [t, col] of VERSION_TABLES) {
      expect(await seenVersions(suspendedAdmin.client, t, col), t).toEqual([]);
    }
  });

  for (const role of ['organiserAdmin', 'organiserMember', 'auditor'] as const) {
    it(`${role} in body X's own organisation sees nothing`, async () => {
      const c = { organiserAdmin, organiserMember, auditor }[role].client;
      expect(await seenDocs(c)).toEqual([]);
      for (const [t, col] of VERSION_TABLES) {
        expect(await seenVersions(c, t, col), t).toEqual([]);
      }
      expect(await seenRelationships(c)).toEqual([]);
    });
  }

  describe('eventar_staff-only tables', () => {
    const STAFF_ONLY = [
      'embedding_indexes', 'retrieval_index_assignments', 'pack_versions', 'pack_sources',
      'pack_source_passages', 'evaluation_cases', 'retrieval_traces',
    ];
    for (const t of STAFF_ONLY) {
      it(`${t}: body_admin and organiser get zero rows and no error; anon gets 42501`, async () => {
        for (const c of [bodyAdmin.client, organiserAdmin.client]) {
          const { data, error } = await c.from(t).select('*').limit(1);
          expect(error, t).toBeNull();
          expect(data, t).toEqual([]);
        }
        expect((await createAnonClient().from(t).select('*').limit(1)).error?.code).toBe(PERMISSION_DENIED);
      });
    }
    it('evaluation_cases: eventar_staff sees the fixture row, body_admin and organiser do not', async () => {
      const q = (c: C) => c.from('evaluation_cases').select('id').eq('dataset_version', 'B9S1A-r');
      const s = await q(staff.client);
      expect(s.error).toBeNull();
      expect(s.data).toHaveLength(1);
      expect((await q(bodyAdmin.client)).data).toEqual([]);
      expect((await q(organiserAdmin.client)).data).toEqual([]);
    });
  });

  it('anon select is denied with 42501', async () => {
    const anon = createAnonClient();
    expect((await anon.from('documents').select('id').in('id', [doc.X])).error?.code).toBe(PERMISSION_DENIED);
    expect((await anon.from('chunks').select('id').limit(1)).error?.code).toBe(PERMISSION_DENIED);
  });
});
