/** @vitest-environment jsdom */
// One-line contract (no-silence area 3): the Registrations header says what the page is for and where check-in lives.
import { vi } from 'vitest';

const h = vi.hoisted(() => ({
  staff: { id: 'u1', email: 'a@b.co', role: 'organiser_admin', organisation_id: 'org1' },
  event: { id: 'e1', title: 'Cardio Update 2026', start_time: '2026-11-10T01:00:00Z', end_time: '2026-11-10T03:00:00Z', timezone: 'Asia/Hong_Kong', organisation_id: 'org1', created_by: 'u1' },
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
  const chain: unknown = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return (res: (v: unknown) => unknown) => res(result);
      if (prop === 'maybeSingle') return () => Promise.resolve({ data: h.event, error: null });
      return () => chain;
    },
  });
  return { supabaseServer: async () => ({ from: () => chain }) };
});
vi.mock('@/components/shell/StaffShell', () => ({ StaffShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./RegistrationsClient', () => ({ default: () => null }));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import RegistrationsPage from './page';

afterEach(() => {
  cleanup();
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
