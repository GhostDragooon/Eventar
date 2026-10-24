// Found 2026-10-24 (CX-04 review): the three export actions put every attendee / licence / user id in ONE `.in()`.
// About 220 uuids make a 9 KB request URL, the gateway answers 414, and the organiser sees "Could not load ... try
// again" for an export that can never succeed. These tests run each action against a fake client that records every
// `.in()` list, so they state the contract: no request carries more than 100 ids, the batches add up to the
// unbatched result, and one failing batch (the second, not only the first) fails the whole export, never a partial file.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

const h = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  requireStaff: async () => ({ id: 'staff-1', email: 's@x.test', role: 'eventar_staff', organisation_id: null }),
}));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => h.admin }));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => ({}) }));
// The Q2 orchestrator reads the ledger on its own; this file is about the export's own reads.
vi.mock('@/evidence/src/ledger/participationSource', () => ({ SupabaseParticipationSource: class {} }));
vi.mock('@/evidence/src/orchestrator', () => ({
  orchestrateParticipation: async () => ({ claims: [], rule_version: 'hash-1' }),
}));

import { exportAttendanceEvidence } from './exportAttendanceActions';
import { exportCollegePackage } from './exportCollegeActions';
import { exportEventEvidence } from './exportEvidenceActions';

const EVENT = '11111111-2222-4333-8444-555555555555';
const N = 250;
const seq = (n: number) => Array.from({ length: n }, (_, i) => i);

// Applies eq/in, records every `.in()` list, and makes the Nth `.in()` on `failOn.table` answer with an error.
function fakeAdmin(tables: Tables, failOn?: { table: string; call: number }) {
  const lists: { table: string; ids: unknown[] }[] = [];
  const from = (table: string) => {
    let rows = tables[table] ?? [];
    let failed = false;
    const q = {
      select: () => q,
      order: () => q,
      limit: () => q,
      eq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return q;
      },
      in: (col: string, ids: unknown[]) => {
        lists.push({ table, ids });
        if (failOn?.table === table && lists.filter((l) => l.table === table).length === failOn.call) failed = true;
        rows = rows.filter((r) => ids.includes(r[col]));
        return q;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(failed ? { data: null, error: { code: 'XX000', message: 'boom' } } : { data: rows, error: null }).then(ok, bad),
    };
    return q;
  };
  return { admin: { from }, lists };
}

const csvRows = (b64: string) =>
  Buffer.from(b64, 'base64').toString().replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
const maxIds = (lists: { ids: unknown[] }[]) => Math.max(...lists.map((l) => l.ids.length));

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('exportAttendanceEvidence — the registration lookup stays under the URL limit', () => {
  const tables = (n: number): Tables => ({
    events: [{ id: EVENT, title: 'Big Event', organisation_id: 'org-1', created_by: 's1' }],
    participation_evidence: seq(n).map((i) => ({
      id: `ev-${i}`, event_id: EVENT, registration_id: `reg-${i}`, evidence_type: 'check_in', capture_method: 'qr',
      source: 'desk', attestation_strength: 'high', captured_at: '2026-10-24T01:00:00Z', occurrence_id: null, chain_seq: i + 1,
    })),
    registrations: seq(n).map((i) => ({ id: `reg-${i}`, full_name: `Person ${i}`, email: `p${i}@x.test`, registration_code: `CODE-${i}` })),
  });

  it('asks in batches of at most 100 ids and still names every attendee', async () => {
    const { admin, lists } = fakeAdmin(tables(N));
    h.admin = admin;
    const res = await exportAttendanceEvidence(EVENT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(maxIds(lists)).toBeLessThanOrEqual(100);
    expect(lists.flatMap((l) => l.ids).sort()).toEqual(seq(N).map((i) => `reg-${i}`).sort());
    const rows = csvRows(res.csvBase64);
    expect(rows).toHaveLength(N + 1);
    for (const i of seq(N)) expect(rows[i + 1].slice(2, 5)).toEqual([`CODE-${i}`, `Person ${i}`, `p${i}@x.test`]);
  });

  it('a failing batch fails the export, even when it is not the first batch', async () => {
    const { admin } = fakeAdmin(tables(N), { table: 'registrations', call: 2 });
    h.admin = admin;
    const res = await exportAttendanceEvidence(EVENT);
    expect(res.ok).toBe(false);
    expect('csvBase64' in res).toBe(false);
  });

  // PostgREST cuts an unbounded read at max_rows = 1000 and says nothing: a regulator file would be short.
  it('refuses a 1000-row evidence read (it may have been cut) and accepts 999', async () => {
    h.admin = fakeAdmin(tables(1000)).admin;
    const cut = await exportAttendanceEvidence(EVENT);
    expect(cut.ok).toBe(false);

    h.admin = fakeAdmin(tables(999)).admin;
    const whole = await exportAttendanceEvidence(EVENT);
    expect(whole).toMatchObject({ ok: true, rowCount: 999 });
  });
});

describe('exportCollegePackage — every lookup stays under the URL limit', () => {
  const tables = (): Tables => ({
    events: [{ id: EVENT, title: 'Big Event', start_time: '2026-10-24T01:00:00Z', end_time: '2026-10-24T03:00:00Z', organisation_id: 'org-1' }],
    credit_ledger: seq(N).map((i) => ({
      id: `le-${i}`, chain_seq: i + 1, event_id: EVENT, user_id: `u-${i}`, licence_id: `l-${i}`, body_id: 'b-1',
      category: '1', points: 1, hours: null, attestation_status: 'verified', created_at: '2026-10-24T03:00:00Z',
    })),
    users: seq(N).map((i) => ({ id: `u-${i}`, full_name: `Person ${i}`, salutation: 'Dr' })),
    professional_profiles: seq(N).map((i) => ({
      user_id: `u-${i}`, workplace_text: null, position_code: null, position_other: null, profession_code: null, specialty_code: null, specialty_other: null,
    })),
    practitioner_licences: seq(N).map((i) => ({ id: `l-${i}`, licence_number: `LIC-${i}`, status: 'active' })),
    accrediting_bodies: [{ id: 'b-1', short_name: 'HKCP', full_name: 'Hong Kong College' }],
    registrations: seq(N).map((i) => ({ user_id: `u-${i}`, event_id: EVENT, registration_code: `CODE-${i}` })),
    participation_evidence: seq(N).map((i) => ({
      user_id: `u-${i}`, event_id: EVENT, evidence_type: 'check_in', attestation_strength: 'high', captured_at: `2026-10-24T01:${String(i % 60).padStart(2, '0')}:00Z`,
    })),
    professions: [], positions: [], specialties: [],
  });

  it('asks in batches of at most 100 ids and still fills every row', async () => {
    const { admin, lists } = fakeAdmin(tables());
    h.admin = admin;
    const res = await exportCollegePackage(EVENT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(maxIds(lists)).toBeLessThanOrEqual(100);
    // Every batched table received every id exactly once.
    for (const [table, prefix] of [['users', 'u'], ['professional_profiles', 'u'], ['registrations', 'u'], ['participation_evidence', 'u'], ['practitioner_licences', 'l']]) {
      expect(lists.filter((l) => l.table === table).flatMap((l) => l.ids).sort(), table).toEqual(seq(N).map((i) => `${prefix}-${i}`).sort());
    }
    const rows = csvRows(res.csvBase64);
    expect(rows).toHaveLength(N + 1);
    for (const i of seq(N)) {
      expect(rows[i + 1][0], 'registration code').toBe(`CODE-${i}`);
      expect(rows[i + 1][1], 'name').toBe(`Person ${i}`);
      expect(rows[i + 1][9], 'licence number').toBe(`LIC-${i}`);
      expect(rows[i + 1][21], 'evidence captured at').not.toBe('');
    }
  });

  // Evidence is a best-effort enrichment (a blank cell, not a missing credit row), so a cut evidence read logs and the
  // export goes on. The cap applies per request, so the check is per batch: 1250 rows over three batches is no cut.
  describe('evidence enrichment row cap', () => {
    const withEvidence = (perUser: (i: number) => number): Tables => {
      const t = tables();
      t.participation_evidence = seq(N).flatMap((i) =>
        seq(perUser(i)).map(() => ({ user_id: `u-${i}`, event_id: EVENT, evidence_type: 'check_in', attestation_strength: 'high', captured_at: '2026-10-24T01:00:00Z' })),
      );
      return t;
    };
    const capLogs = () => vi.mocked(console.error).mock.calls.filter((c) => String(c[0]).includes('row limit'));

    it('does not log when only the merged total passes 1000', async () => {
      h.admin = fakeAdmin(withEvidence(() => 5)).admin;
      expect((await exportCollegePackage(EVENT)).ok).toBe(true);
      expect(capLogs()).toHaveLength(0);
    });

    it('logs once, and still exports, when one batch reaches 1000', async () => {
      h.admin = fakeAdmin(withEvidence((i) => (i === 0 ? 1000 : 1))).admin;
      expect((await exportCollegePackage(EVENT)).ok).toBe(true);
      expect(capLogs()).toHaveLength(1);
    });
  });

  it.each(['users', 'professional_profiles', 'practitioner_licences', 'registrations', 'participation_evidence'])(
    'a failing second %s batch fails the export',
    async (table) => {
      h.admin = fakeAdmin(tables(), { table, call: 2 }).admin;
      const res = await exportCollegePackage(EVENT);
      expect(res.ok).toBe(false);
      expect('csvBase64' in res).toBe(false);
    },
  );
});

describe('exportEventEvidence — the licence lookup stays under the URL limit', () => {
  const tables = (n: number): Tables => ({
    events: [{ id: EVENT, title: 'Big Event', start_time: '2026-10-24T01:00:00Z', timezone: 'Asia/Hong_Kong', created_by: 's1', organisation_id: 'org-1' }],
    credit_ledger: seq(n).map((i) => ({
      id: `le-${i}`, chain_seq: i + 1, event_id: EVENT, licence_id: `l-${i}`, body_id: 'b-1', entry_type: 'credit_earned',
      points: 1, hours: null, category: '1', effective_date: '2026-10-24', attestation_status: 'verified', created_at: '2026-10-24T03:00:00Z',
    })),
    accrediting_bodies: [{ id: 'b-1', short_name: 'HKCP', full_name: 'Hong Kong College' }],
    practitioner_licences: seq(n).map((i) => ({ id: `l-${i}`, licence_number: `LIC-${i}`, licence_type: 'full' })),
  });

  it('asks in batches of at most 100 ids and still fills every licence number', async () => {
    const { admin, lists } = fakeAdmin(tables(N));
    h.admin = admin;
    const res = await exportEventEvidence(EVENT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(maxIds(lists)).toBeLessThanOrEqual(100);
    expect(lists.filter((l) => l.table === 'practitioner_licences').flatMap((l) => l.ids).sort()).toEqual(seq(N).map((i) => `l-${i}`).sort());
    const rows = csvRows(res.csvBase64);
    expect(rows).toHaveLength(N + 1);
    for (const i of seq(N)) expect(rows[i + 1].slice(8, 11), 'licence number, licence type, ledger entry').toEqual([`LIC-${i}`, 'full', `le-${i}`]);
  });

  it('a failing batch fails the export, even when it is not the first batch', async () => {
    h.admin = fakeAdmin(tables(N), { table: 'practitioner_licences', call: 2 }).admin;
    const res = await exportEventEvidence(EVENT);
    expect(res.ok).toBe(false);
    expect('csvBase64' in res).toBe(false);
  });

  it('refuses a 1000-row ledger read (it may have been cut) and accepts 999', async () => {
    h.admin = fakeAdmin(tables(1000)).admin;
    const cut = await exportEventEvidence(EVENT);
    expect(cut.ok).toBe(false);

    h.admin = fakeAdmin(tables(999)).admin;
    const whole = await exportEventEvidence(EVENT);
    expect(whole).toMatchObject({ ok: true, entryCount: 999 });
  });
});
