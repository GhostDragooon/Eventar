// Security review 2026-08-06 — HIGH (latent): exportRegistrantsCsv / getEventQrPng
// had no ownership check. requireStaff() established identity, but the event was
// read via the anon-scoped supabaseServer() client whose only matching policy is
// events_public_read_published (status='published' for ANY authenticated
// principal), then registrations were read via supabaseAdmin() (RLS bypassed).
// So any active staff — another org's member, a body_admin, an auditor — could
// export every registrant's name+email for any published event. The owner gate
// lived one layer up in edit/page.tsx; the action had none. This pins the gate
// into the action itself, matching emailActions.ts::authorizeEvent.
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
let mockIpTz: string | null = null;
vi.mock('next/headers', () => ({ headers: async () => ({ get: (k: string) => (k === 'x-vercel-ip-timezone' ? mockIpTz : null) }) }));

type Staff = { id: string; role: 'organiser_member' | 'eventar_staff'; email: string; full_name: string | null; organisation_id: string | null };
let mockStaff: Staff;
vi.mock('@/lib/auth', () => ({
  requireStaff: vi.fn(async () => mockStaff),
  NotAuthorizedError: class NotAuthorizedError extends Error {},
  canManageEvent: (event: { organisation_id: string | null }, staff: { role: string; organisation_id: string | null }) => {
    if (staff.role === 'eventar_staff') return true;
    return event.organisation_id != null && event.organisation_id === staff.organisation_id;
  },
}));

type EventRow = {
  id: string; title: string; status: string; organisation_id: string | null;
  start_time: string; end_time: string; timezone: string;
  venue_name: string; max_attendees: number | null;
};
let mockEventRow: EventRow | null;
let selectedColumns = '';
vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    from: () => ({
      select: (cols: string) => {
        selectedColumns = cols;
        return { eq: () => ({ maybeSingle: async () => ({ data: mockEventRow, error: null }) }) };
      },
    }),
  })),
}));

let adminRegRows: Array<{ full_name: string; email: string; registered_at: string }>;
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: adminRegRows, error: null }) }) }),
    }),
  })),
}));
vi.mock('@/lib/qr', () => ({ buildEventQrPng: vi.fn(async () => ({ pngBase64: 'UE5H', filename: 'qr.png' })) }));
vi.mock('@/lib/origin', () => ({ getRequestOrigin: vi.fn(async () => 'http://localhost:3000') }));

import { describe, it, expect, beforeEach } from 'vitest';
import { exportRegistrantsCsv, getEventQrPng } from './actions';

const eventId = '11111111-2222-4333-8444-555555555555';
const orgId = 'org-0000-0000';
const ownerId = 'staff-owner-0000';

beforeEach(() => {
  mockStaff = { id: ownerId, role: 'organiser_member', email: 'owner@x.com', full_name: 'Owner', organisation_id: orgId };
  mockEventRow = {
    id: eventId, title: 'Clinical Skills Day', status: 'published', organisation_id: orgId,
    start_time: new Date(Date.now() - 7_200_000).toISOString(),
    end_time: new Date(Date.now() - 3_600_000).toISOString(), // ended → export gate open
    timezone: 'Asia/Hong_Kong', venue_name: 'HQ', max_attendees: null,
  };
  adminRegRows = [{ full_name: 'Alice Wong', email: 'alice@x.com', registered_at: new Date().toISOString() }];
  selectedColumns = '';
  mockIpTz = null;
});

describe('exportRegistrantsCsv — ownership', () => {
  it('refuses a non-owner, non-manager staff member (no registrant PII returned)', async () => {
    mockStaff = { id: 'other-org-member', role: 'organiser_member', email: 'x@y.com', full_name: null, organisation_id: 'other-org' };
    const result = await exportRegistrantsCsv(eventId);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toMatch(/not found/i);
    expect('csvBase64' in result).toBe(false);
  });

  it('reads organisation_id so the gate can evaluate org membership', async () => {
    await exportRegistrantsCsv(eventId);
    expect(selectedColumns).toContain('organisation_id');
  });

  it('allows the owner', async () => {
    const result = await exportRegistrantsCsv(eventId);
    expect('csvBase64' in result).toBe(true);
  });

  it('keeps Start and End in the venue zone and adds the exporter\'s zone beside them (Ivan 2026-11-21)', async () => {
    mockEventRow!.start_time = '2020-12-04T01:00:00+00:00';
    mockEventRow!.end_time = '2020-12-04T09:00:00+00:00'; // ended long ago → export gate open
    const csvOf = async (viewerTz?: string) => {
      const result = await exportRegistrantsCsv(eventId, viewerTz);
      if (!('csvBase64' in result)) throw new Error('export refused');
      return Buffer.from(result.csvBase64, 'base64').toString('utf-8');
    };
    const us = await csvOf('America/New_York'); // a US exporter of a Hong Kong event
    expect(us).toContain('Start,2020-12-04T09:00:00+08:00 (Asia/Hong_Kong)');
    expect(us).toContain('Start (your time),2020-12-03T20:00:00-05:00 (America/New_York)');
    expect(us).toContain('End (your time),2020-12-04T04:00:00-05:00 (America/New_York)');
    mockIpTz = 'Asia/Tokyo';
    expect(await csvOf()).toContain('Start (your time),2020-12-04T10:00:00+09:00 (Asia/Tokyo)');
    expect(await csvOf('Not/AZone')).toContain('(Asia/Tokyo)');
    mockIpTz = null;
    const sameZone = await csvOf('Asia/Hong_Kong');
    expect(sameZone).toContain('Start,2020-12-04T09:00:00+08:00 (Asia/Hong_Kong)');
    expect(sameZone).not.toContain('your time');
    expect(sameZone).not.toContain('+00:00');
  });

  it('allows an eventar_staff who does not own the event', async () => {
    mockStaff = { id: 'platform-admin', role: 'eventar_staff', email: 'a@x.com', full_name: 'Admin', organisation_id: 'other-org' };
    const result = await exportRegistrantsCsv(eventId);
    expect('csvBase64' in result).toBe(true);
  });
});

describe('getEventQrPng — ownership', () => {
  it('refuses a non-owner, non-manager staff member', async () => {
    mockStaff = { id: 'other-org-member', role: 'organiser_member', email: 'x@y.com', full_name: null, organisation_id: 'other-org' };
    const result = await getEventQrPng(eventId);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toMatch(/not found/i);
  });

  it('allows the owner', async () => {
    const result = await getEventQrPng(eventId);
    expect('pngBase64' in result).toBe(true);
  });
});
