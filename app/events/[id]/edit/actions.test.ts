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

type Staff = { id: string; role: 'organiser_member' | 'eventar_staff'; email: string; full_name: string | null };
let mockStaff: Staff;
vi.mock('@/lib/auth', () => ({
  requireStaff: vi.fn(async () => mockStaff),
  NotAuthorizedError: class NotAuthorizedError extends Error {},
}));

type EventRow = {
  id: string; title: string; status: string; created_by: string;
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
const ownerId = 'staff-owner-0000';

beforeEach(() => {
  mockStaff = { id: ownerId, role: 'organiser_member', email: 'owner@x.com', full_name: 'Owner' };
  mockEventRow = {
    id: eventId, title: 'Clinical Skills Day', status: 'published', created_by: ownerId,
    start_time: new Date(Date.now() - 7_200_000).toISOString(),
    end_time: new Date(Date.now() - 3_600_000).toISOString(), // ended → export gate open
    timezone: 'Asia/Hong_Kong', venue_name: 'HQ', max_attendees: null,
  };
  adminRegRows = [{ full_name: 'Alice Wong', email: 'alice@x.com', registered_at: new Date().toISOString() }];
  selectedColumns = '';
});

describe('exportRegistrantsCsv — ownership', () => {
  it('refuses a non-owner, non-manager staff member (no registrant PII returned)', async () => {
    mockStaff = { id: 'other-org-member', role: 'organiser_member', email: 'x@y.com', full_name: null };
    const result = await exportRegistrantsCsv(eventId);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toMatch(/not found/i);
    expect('csvBase64' in result).toBe(false);
  });

  it('reads created_by so the gate can evaluate ownership', async () => {
    await exportRegistrantsCsv(eventId);
    expect(selectedColumns).toContain('created_by');
  });

  it('allows the owner', async () => {
    const result = await exportRegistrantsCsv(eventId);
    expect('csvBase64' in result).toBe(true);
  });

  it('allows an eventar_staff who does not own the event', async () => {
    mockStaff = { id: 'platform-admin', role: 'eventar_staff', email: 'a@x.com', full_name: 'Admin' };
    const result = await exportRegistrantsCsv(eventId);
    expect('csvBase64' in result).toBe(true);
  });
});

describe('getEventQrPng — ownership', () => {
  it('refuses a non-owner, non-manager staff member', async () => {
    mockStaff = { id: 'other-org-member', role: 'organiser_member', email: 'x@y.com', full_name: null };
    const result = await getEventQrPng(eventId);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toMatch(/not found/i);
  });

  it('allows the owner', async () => {
    const result = await getEventQrPng(eventId);
    expect('pngBase64' in result).toBe(true);
  });
});
