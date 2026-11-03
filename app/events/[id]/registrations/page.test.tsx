/** @vitest-environment jsdom */
// One-line contract (no-silence area 3): the Registrations header says what the page is for and where check-in lives.
import { vi } from 'vitest';

const h = vi.hoisted(() => ({
  staff: { id: 'u1', email: 'a@b.co', role: 'organiser_admin', organisation_id: 'org1' },
  roster: [] as Record<string, unknown>[],
  clientProps: null as null | { rows: { id: string }[] },
  event: { id: 'e1', title: 'Cardio Update 2026', start_time: '2026-11-10T01:00:00Z', end_time: '2026-11-10T03:00:00Z', timezone: 'Asia/Hong_Kong', organisation_id: 'org1', created_by: 'u1', deleted_at: null as string | null },
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
}));
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  requireStaff: async () => h.staff,
}));
vi.mock('@/lib/supabase/server', () => {
  const result = { data: [], error: null };
  const chain = (table: string): unknown => {
    // Stands in for the database: the soft-delete filter hides a deleted event, and .range() pages the roster.
    let hideDeleted = false;
    const c: unknown = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'then') return (res: (v: unknown) => unknown) => res(result);
        if (prop === 'maybeSingle') return () => Promise.resolve({ data: hideDeleted && h.event.deleted_at ? null : h.event, error: null });
        if (prop === 'is') return (col: string, val: unknown) => { if (col === 'deleted_at' && val === null) hideDeleted = true; return c; };
        if (prop === 'range' && table === 'registrations') {
          return (from: number, to: number) => Promise.resolve({ data: h.roster.slice(from, Math.min(to + 1, from + 1000)), error: null });
        }
        return () => c;
      },
    });
    return c;
  };
  return { supabaseServer: async () => ({ from: (table: string) => chain(table) }) };
});
vi.mock('@/components/shell/StaffShell', () => ({ StaffShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./RegistrationsClient', () => ({ default: (p: { rows: { id: string }[] }) => { h.clientProps = p; return null; } }));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import RegistrationsPage from './page';

afterEach(() => {
  cleanup();
  h.roster = [];
  h.clientProps = null;
  h.event.deleted_at = null;
  h.staff = { id: 'u1', email: 'a@b.co', role: 'organiser_admin', organisation_id: 'org1' };
});

describe('Registrations page header', () => {
  it('says what the page is for and points at Check-in, instead of repeating the event title', async () => {
    render(await RegistrationsPage({ params: Promise.resolve({ id: 'e1' }) }));
    expect(screen.getByRole('heading', { level: 1, name: 'Registrations' })).toBeTruthy();
    expect(screen.getByText('Everyone registered for this event. Edit contact details and roles here. To check people in, open Check-in.')).toBeTruthy();
    // The title still shows once, in the breadcrumb, not as a second subtitle.
    expect(screen.getAllByText('Cardio Update 2026')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /^Check-in/ })).toHaveAttribute('href', '/events/e1/checkin');
  });

  // Instruction copy follows the same gate as the controls: a sentence that tells the viewer to edit or to check
  // people in is only shown to a role that can (canEditRegistrations / canEditRoles / canCheckIn).
  const subtitle = async (over: Partial<typeof h.staff>) => {
    h.staff = { ...h.staff, ...over };
    const { container } = render(await RegistrationsPage({ params: Promise.resolve({ id: 'e1' }) }));
    return container.querySelector('header p')?.textContent;
  };

  it('tells the event creator (an editor) they can edit contact details and roles and check people in', async () => {
    expect(await subtitle({ role: 'organiser_admin' })).toBe(
      'Everyone registered for this event. Edit contact details and roles here. To check people in, open Check-in.',
    );
  });

  it('does not promise role edits to an editor who is not the creator (the role chips are read-only for them)', async () => {
    expect(await subtitle({ id: 'u2', role: 'organiser_member' })).toBe(
      'Everyone registered for this event. Edit contact details here. To check people in, open Check-in.',
    );
  });

  it.each(['body_admin', 'auditor'])('tells a read-only %s what they can do, not what they cannot', async (role) => {
    expect(await subtitle({ role })).toBe(
      'Everyone registered for this event. You can view contact details; an organiser admin or member can edit them.',
    );
  });
});

describe('Registrations page data', () => {
  it('is not found for a soft-deleted event, so no edit can be tried against it (dev m3)', async () => {
    h.event.deleted_at = '2026-10-01T00:00:00Z';
    await expect(RegistrationsPage({ params: Promise.resolve({ id: 'e1' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('lists every registration past the 1000-row cap, not the first 1000 (dev m2)', async () => {
    h.roster = Array.from({ length: 2300 }, (_, i) => ({ id: `r${i}`, status: 'registered', registered_at: '2026-10-01T00:00:00Z', check_in_at: null, user_id: null }));
    render(await RegistrationsPage({ params: Promise.resolve({ id: 'e1' }) }));
    expect(h.clientProps?.rows).toHaveLength(2300);
    expect(new Set(h.clientProps?.rows.map((r) => r.id)).size).toBe(2300);
  });
});
