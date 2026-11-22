/** @vitest-environment jsdom */
// One-line contract (no-silence area 3): the Check-in header says the desk is live capture and where edits live,
// and does not offer a read-only role a walk-in it cannot make.
import { vi } from 'vitest';

const h = vi.hoisted(() => ({
  role: 'organiser_member' as string,
  rpcError: null as { code: string } | null,
  rosterProps: null as null | { eligibilityUnavailable: boolean },
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
  return { supabaseServer: async () => ({ from: () => chain, rpc: async () => (h.rpcError ? { data: null, error: h.rpcError } : result) }) };
});
vi.mock('@/components/shell/StaffShell', () => ({ StaffShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./RosterClient', () => ({ default: (props: { eligibilityUnavailable: boolean }) => { h.rosterProps = props; return null; } }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import StaffCheckinPage from './page';

afterEach(cleanup);
const open = async () => render(await StaffCheckinPage({ params: Promise.resolve({ id: 'e1' }) }));

describe('Check-in page header', () => {
  const EDIT_ALL = "Live capture only: scan, enter a code or add a walk-in. To edit a person’s details or roles, open Registrations.";
  const EDIT_DETAILS = "Live capture only: scan, enter a code or add a walk-in. To edit a person’s details, open Registrations.";

  beforeEach(() => { h.event.created_by = 'u1'; h.rpcError = null; h.rosterProps = null; });

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

  // UX-R8 (Ivan, 2026-11-22): the gate on the day is open to every door role of the organisation. Only the
  // registration list keeps the creator-or-admin rule, so the pointer says "see", not "edit".
  it.each(['organiser_member', 'body_admin'])('%s on a colleague\'s event: the full desk, sent to Registrations only to look', async (role) => {
    h.role = role;
    h.event.created_by = 'someone-else';
    await open();
    expect(screen.getByText('Live capture only: scan, enter a code or add a walk-in. To see everyone registered, open Registrations.')).toBeTruthy();
  });

  it('eventar_staff who did not create the event can still edit roles', async () => {
    h.role = 'eventar_staff';
    h.event.created_by = 'someone-else';
    await open();
    expect(screen.getByText(EDIT_ALL)).toBeTruthy();
  });

  it('auditor: cannot check in, so the line does not offer scan, code or walk-in', async () => {
    h.role = 'auditor';
    await open();
    // UX-R7: the role limit is said once, by the status line above the buttons (RosterClient), not again under the title.
    expect(screen.getByText('Live capture only. To see everyone registered, open Registrations.')).toBeTruthy();
    expect(screen.queryByText(/read-only for your role/)).toBeNull();
    expect(screen.queryByText(/add a walk-in/)).toBeNull();
  });
});

// UX-R8 (Ivan 1c, 2026-11-22): event_registration_eligibility refuses body_admin and auditor by design (42501). That is
// not an outage, so the desk must not show the "couldn't be checked just now" banner for them; a real failure still does.
describe('Check-in page eligibility notice', () => {
  beforeEach(() => { h.rpcError = null; h.rosterProps = null; });

  it('42501 (a role the RPC refuses): no outage banner', async () => {
    h.role = 'body_admin';
    h.rpcError = { code: '42501' };
    await open();
    expect(h.rosterProps?.eligibilityUnavailable).toBe(false);
  });

  it('any other failure still shows the banner', async () => {
    h.role = 'organiser_member';
    h.rpcError = { code: 'XX000' };
    await open();
    expect(h.rosterProps?.eligibilityUnavailable).toBe(true);
  });
});
