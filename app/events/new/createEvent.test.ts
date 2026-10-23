import { vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

// redirect() throws in real Next; the stub does the same so "success" is observable.
const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

type Role = 'organiser_admin' | 'organiser_member' | 'body_admin' | 'auditor' | 'eventar_staff';
let mockRole: Role = 'organiser_member';
// canPublishEvents stays REAL: the pre-check is the thing under test.
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  requireStaff: vi.fn(async () => ({
    id: 'staff-1',
    email: 'organiser@example.com',
    role: mockRole,
    full_name: 'Org Aniser',
    organisation_id: 'org-1',
  })),
}));

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => ({ rpc }) }));

import { beforeEach, describe, expect, it } from 'vitest';
import { createEvent } from './actions';

const event = {
  title: 'Internal Workshop',
  description: 'A test event',
  start_time: '2026-06-15T09:00:00.000Z',
  end_time: '2026-06-15T16:00:00.000Z',
  venue_name: 'Rosewood Sand Hill',
  venue_address: '2825 Sand Hill Rd',
  city: 'Menlo Park',
  region: 'California',
  country: 'United States',
  latitude: 37.4123,
  longitude: -122.2007,
};

const publishRefusal = /can't publish events\. Nothing was saved\. Save a draft, then ask an organiser admin to publish it/i;

beforeEach(() => {
  mockRole = 'organiser_member';
  rpc.mockReset().mockResolvedValue({ data: 'event-123', error: null });
  redirectMock.mockClear();
  revalidatePath.mockClear();
});

// P2a (finding B3/B5): a role that may not publish used to be offered the button
// and end on the crash page; under review mode EVERY role was told "this account
// is not allowed". The refusal is now plain, explained, and made before the database.
describe('createEvent — publishing', () => {
  it.each(['body_admin', 'auditor'] as const)('%s asking to publish is refused with a plain reason and nothing is sent', async (role) => {
    mockRole = role;
    const res = await createEvent({ event, blocks: [], status: 'published' });
    expect(res).toEqual({ error: expect.stringMatching(publishRefusal) });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['organiser_admin', 'organiser_member', 'eventar_staff'] as const)('%s publishing reaches the RPC with status published and the caller as creator', async (role) => {
    mockRole = role;
    // Published lands on the details page in its Published, next steps state (UX-01 pick a1).
    await expect(createEvent({ event, blocks: [], status: 'published' })).rejects.toThrow('NEXT_REDIRECT:/events/event-123/details?published=1');
    expect(rpc).toHaveBeenCalledWith(
      'create_event_with_blocks',
      expect.objectContaining({ event_input: expect.objectContaining({ status: 'published', created_by: 'staff-1' }) }),
    );
  });

  // A saved draft lands on its edit page, which says "Draft saved" (UX-01 pick c1).
  it('saving a draft redirects to the draft page with the saved flag', async () => {
    await expect(createEvent({ event, blocks: [], status: 'draft' })).rejects.toThrow('NEXT_REDIRECT:/events/event-123/edit?saved=1');
  });

  it('a read-only role can still save a DRAFT', async () => {
    mockRole = 'body_admin';
    await expect(createEvent({ event, blocks: [], status: 'draft' })).rejects.toThrow('NEXT_REDIRECT');
    expect(rpc).toHaveBeenCalledWith(
      'create_event_with_blocks',
      expect.objectContaining({ event_input: expect.objectContaining({ status: 'draft' }) }),
    );
  });

  // The database stays the authority: if the role changed after the page loaded,
  // its refusal still arrives, in the same words, and never blames "this account".
  it('maps the database refusal (42501 on a publish) to the same plain reason', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'require_active_staff: caller is not active staff' } });
    const res = await createEvent({ event, blocks: [], status: 'published' });
    expect(res).toEqual({ error: expect.stringMatching(publishRefusal) });
    expect(JSON.stringify(res)).not.toMatch(/this account|require_active_staff/i);
  });

  it('a 42501 on a DRAFT is not dressed up as a publish refusal', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'something else' } });
    const res = await createEvent({ event, blocks: [], status: 'draft' });
    expect(res).toEqual({ error: 'something else' });
  });
});

// The form links to the saved event when only the accreditation failed.
describe('createEvent — partial success', () => {
  it('returns the event id when the event saved but its accreditation did not', async () => {
    // Only organiser_admin and eventar_staff can set CPD accreditation. Use an
    // authorised role so this test reaches the post-save partial-success path.
    mockRole = 'organiser_admin';
    rpc.mockResolvedValueOnce({ data: 'event-123', error: null }).mockResolvedValueOnce({
      data: null,
      error: { code: '23514', details: null, message: 'cpd_hours out of range' },
    });
    const res = await createEvent({
      event,
      blocks: [],
      status: 'draft',
      cpd: { bodyId: '11111111-2222-4333-8444-555555555555', hours: 2 },
    });
    expect(res).toEqual({ error: expect.stringMatching(/event was saved, but/i), eventId: 'event-123' });
  });
});

const BODY = '11111111-2222-4333-8444-555555555555';
const accreditationRefusal = /can't set accreditation\. Nothing was saved\. Remove the accreditation to continue, or ask an organiser admin/i;

// Dev-lens 2026-10-02 (MAJOR): set_event_cpd_config accepts only organiser_admin and
// eventar_staff, yet it runs AFTER the event exists. A member who chose an accrediting
// body and pressed Publish got a LIVE event, an error that said "saved" and blamed
// "this account", and re-enabled buttons: a second live event was one click away.
describe('createEvent: accreditation', () => {
  it('rejects malformed accreditation before creating or publishing an event', async () => {
    mockRole = 'organiser_admin';
    const res = await createEvent({
      event,
      blocks: [],
      status: 'published',
      cpd: { bodyId: null, hours: 2 },
    });
    expect(res).toEqual({ error: 'Choose the accrediting body and enter its CPD hours together, or leave both empty.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  // Dev-lens round 2: "cpd hours: Too big: expected number to be <=24" reached the organiser,
  // and 0 printed two contradictory sentences. Plain words, one sentence, nothing written.
  it.each([25, 0, -1])('hours %s with a body is refused in plain words, with no zod text, before anything is written', async (hours) => {
    mockRole = 'organiser_admin';
    const res = await createEvent({ event, blocks: [], status: 'draft', cpd: { bodyId: BODY, hours } });
    expect(res).toEqual({ error: 'CPD hours must be more than 0 and at most 24.' });
    expect(JSON.stringify(res)).not.toMatch(/too big|expected|cpd hours:/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['organiser_member', 'body_admin', 'auditor'] as const)('%s choosing an accrediting body is refused before anything is written', async (role) => {
    mockRole = role;
    const res = await createEvent({ event, blocks: [], status: 'draft', cpd: { bodyId: BODY, hours: 2 } });
    expect(res).toEqual({ error: expect.stringMatching(accreditationRefusal) });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['organiser_admin', 'eventar_staff'] as const)('%s may set accreditation: the create runs, then set_event_cpd_config with the caller as actor', async (role) => {
    mockRole = role;
    rpc.mockResolvedValueOnce({ data: 'event-123', error: null }).mockResolvedValueOnce({ data: null, error: null });
    await expect(createEvent({ event, blocks: [], status: 'draft', cpd: { bodyId: BODY, hours: 2 } })).rejects.toThrow('NEXT_REDIRECT:/events/event-123/edit?saved=1');
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['create_event_with_blocks', 'set_event_cpd_config']);
    expect(rpc).toHaveBeenLastCalledWith('set_event_cpd_config', {
      p_event_id: 'event-123',
      p_body_id: BODY,
      p_cpd_hours: 2,
      p_actor_override: 'staff-1',
    });
  });

  it('a member who sets no accreditation is unaffected, including an empty body', async () => {
    mockRole = 'organiser_member';
    await expect(createEvent({ event, blocks: [], status: 'published' })).rejects.toThrow('NEXT_REDIRECT');
    await expect(createEvent({ event, blocks: [], status: 'draft', cpd: { bodyId: null, hours: null } })).rejects.toThrow('NEXT_REDIRECT');
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['create_event_with_blocks', 'create_event_with_blocks']);
  });
});

// If the accreditation step still fails after the event exists (a body that has not
// authorised the organisation, a stale role), the message must say what is TRUE.
describe('createEvent: partial success says what happened', () => {
  async function partial(status: 'draft' | 'published', cpdErr: Record<string, unknown>) {
    mockRole = 'organiser_admin';
    rpc.mockResolvedValueOnce({ data: 'event-123', error: null }).mockResolvedValueOnce({ data: null, error: cpdErr });
    return createEvent({ event, blocks: [], status, cpd: { bodyId: BODY, hours: 2 } });
  }

  it('says PUBLISHED when the event is live, and SAVED for a draft', async () => {
    const body = { code: '42501', details: 'not_authorised_for_body', message: 'x' };
    expect(await partial('published', body)).toEqual({
      error: 'The event was published, but your organisation isn’t authorised by that accrediting body. Open it and set the accreditation there.',
      eventId: 'event-123',
    });
    rpc.mockReset();
    expect(await partial('draft', body)).toEqual({
      error: 'The event was saved, but your organisation isn’t authorised by that accrediting body. Open it and set the accreditation there.',
      eventId: 'event-123',
    });
  });

  it('a role refusal (the role changed after the page loaded) points at an organiser admin, never at "this account"', async () => {
    const res = await partial('published', { code: '42501', details: null, message: 'require_active_staff' });
    expect(res).toEqual({
      error: 'The event was published, but your role can’t set accreditation. Ask an organiser admin to add it from the event page.',
      eventId: 'event-123',
    });
    expect(JSON.stringify(res)).not.toMatch(/this account|require_active_staff/i);
  });

  it.each([
    [{ code: '23514', details: null, message: 'cpd_hours out of range' }, 'CPD hours must be between 0 and 24'],
    [{ code: 'XX000', details: null, message: 'boom' }, 'the accreditation could not be set'],
  ])('%j gives its own reason', async (cpdErr, reason) => {
    const res = await partial('draft', cpdErr);
    expect(res).toEqual({ error: `The event was saved, but ${reason}. Open it and set the accreditation there.`, eventId: 'event-123' });
  });
});


// Dev-lens round 2: the rewrite returned generic copy and logged nothing, so an admin had
// no status or code to correlate. Repo convention is console.error(tag, { code }), and
// hard rule 10 forbids anything that could carry PII.
describe('createEvent: server-side trace', () => {
  it('an unexpected accreditation failure is logged by code; the expected refusals are not', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRole = 'organiser_admin';
    rpc.mockResolvedValueOnce({ data: 'event-123', error: null }).mockResolvedValueOnce({ data: null, error: { code: 'XX000', details: null, message: 'boom' }, status: 500 });
    await createEvent({ event, blocks: [], status: 'draft', cpd: { bodyId: BODY, hours: 2 } });
    expect(log).toHaveBeenCalledWith('[events/new] accreditation not set', { code: 'XX000' });
    log.mockClear();
    rpc.mockResolvedValueOnce({ data: 'event-123', error: null }).mockResolvedValueOnce({ data: null, error: { code: '42501', details: 'not_authorised_for_body', message: 'x' }, status: 403 });
    await createEvent({ event, blocks: [], status: 'draft', cpd: { bodyId: BODY, hours: 2 } });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

