/** @vitest-environment jsdom */
// One-line contract (no-silence area 3): the Check-in header says the desk is live capture and where edits live,
// and does not offer a read-only role a walk-in it cannot make.
import { vi } from 'vitest';

const h = vi.hoisted(() => ({
  role: 'organiser_member' as string,
  event: { id: 'e1', title: 'Cardio Update 2026', start_time: '2026-11-10T01:00:00Z', end_time: '2026-11-10T03:00:00Z', timezone: 'Asia/Hong_Kong', venue_name: 'HKCC', status: 'published', max_attendees: null, registration_close_at: null, registration_open_at: null, organisation_id: 'org1', created_by: 'u1' },
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
}));
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  requireStaff: async () => ({ id: 'u1', email: 'a@b.co', role: h.role, organisation_id: 'org1' }),
}));
vi.mock('@/lib/supabase/server', () => {
  const result = { data: [], error: null };
  const chain: unknown = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return (res: (v: unknown) => unknown) => res(result);
      if (prop === 'maybeSingle') return () => Promise.resolve({ data: h.event, error: null });
      return () => chain;
    },
  });
  return { supabaseServer: async () => ({ from: () => chain, rpc: async () => result }) };
});
vi.mock('@/components/shell/StaffShell', () => ({ StaffShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./RosterClient', () => ({ default: () => null }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import StaffCheckinPage from './page';

afterEach(cleanup);
const open = async () => render(await StaffCheckinPage({ params: Promise.resolve({ id: 'e1' }) }));

describe('Check-in page header', () => {
  const EDIT_ALL = "Live capture only: scan, enter a code or add a walk-in. To edit a person's details or roles, open Registrations.";
  const EDIT_DETAILS = "Live capture only: scan, enter a code or add a walk-in. To edit a person's details, open Registrations.";

  beforeEach(() => { h.event.created_by = 'u1'; });

  it.each(['organiser_admin', 'organiser_member', 'eventar_staff'])('%s (the event creator): says live capture only and where to edit details and roles', async (role) => {
    h.role = role;
    await open();
    expect(screen.getByText(EDIT_ALL)).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Registrations/ })).toHaveAttribute('href', '/events/e1/registrations');
  });

  // Q51 (Ivan, 2026-11-07): an organiser_admin acts on every event in its organisation; a member only on its own.
  it('organiser_admin who did not create the event: can still check in and edit details and roles', async () => {
    h.role = 'organiser_admin';
    h.event.created_by = 'someone-else';
    await open();
    expect(screen.getByText(EDIT_ALL)).toBeTruthy();
  });

  it('organiser_member who did not create the event: a read-only desk, sent to Registrations only to look', async () => {
    h.role = 'organiser_member';
    h.event.created_by = 'someone-else';
    await open();
    expect(screen.getByText('You can view this desk but not check people in. To see everyone registered, open Registrations.')).toBeTruthy();
    expect(screen.queryByText(/add a walk-in/)).toBeNull();
  });

  it('eventar_staff who did not create the event can still edit roles', async () => {
    h.role = 'eventar_staff';
    h.event.created_by = 'someone-else';
    await open();
    expect(screen.getByText(EDIT_ALL)).toBeTruthy();
  });

  it.each(['body_admin', 'auditor'])('%s: cannot check in, so the line does not offer scan, code or walk-in', async (role) => {
    h.role = role;
    await open();
    expect(screen.getByText('Live capture only: this desk is read-only for your role. To see everyone registered, open Registrations.')).toBeTruthy();
    expect(screen.queryByText(/add a walk-in/)).toBeNull();
  });
});
