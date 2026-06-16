/** @vitest-environment jsdom */
import { vi } from 'vitest';

// NewEventForm imports `./actions` (createEvent) which pulls in 'server-only'
// — forbidden in jsdom builds. Mock the module to a no-op shape so the
// component imports cleanly. Tests drive the form via the parent's `submit`
// prop, not the action directly.
vi.mock('./actions', () => ({
  createEvent: vi.fn(async () => ({ error: 'unreachable from tests' })),
}));

// next/navigation: edit-mode uses router.refresh() on success, router.push()
// for Cancel navigation in both modes.
const refreshMock = vi.fn();
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: pushMock }),
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import NewEventForm, { type InitialBlock } from './NewEventForm';
import type { Venue } from '@/lib/venue';

// Vitest config has `globals: false` — RTL cleanup is not auto.
afterEach(cleanup);

// Fixture chosen so the local-tz round-trip is stable: build the ISO the same
// way the form does (new Date(`${date}T${hh:mm}:00`).toISOString()) so the
// derived minutes echo back exactly regardless of the host timezone.
function buildIso(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00`).toISOString();
}

const EVENT_DATE = '2026-06-15';

const initialVenue: Venue = {
  venue_name: 'Rosewood Sand Hill',
  venue_address: '2825 Sand Hill Rd',
  city: 'Menlo Park',
  region: 'California',
  country: 'United States',
  latitude: 37.4123,
  longitude: -122.2007,
};

const initialEvent = {
  title: 'Internal Workshop',
  topic: 'Engineering',
  description: 'A test event description.',
  max_attendees: 80,
  start_time: buildIso(EVENT_DATE, '09:00'),
  end_time:   buildIso(EVENT_DATE, '16:00'),
  ...initialVenue,
};

// InitialBlock uses raw ISO start/end + nullable notes — the form derives the
// browser-local HH:MM client-side so encode/decode share the same tz.
const initialBlocks: InitialBlock[] = [
  {
    id: 'b1',
    start_time: buildIso(EVENT_DATE, '09:00'),
    end_time:   buildIso(EVENT_DATE, '10:00'),
    kind: 'workshop',
    title: 'Opening session',
    host: 'Jane Doe',
    topics: [
      {
        title: 'Why test-first?',
        speaker_name: 'Jane Doe',
        speaker_credential: 'Sr. Engineer',
        speaker_affiliation: 'Acme Co',
      },
    ],
    notes: null,
  },
];

beforeEach(() => {
  refreshMock.mockClear();
  pushMock.mockClear();
});

describe('NewEventForm — edit mode prefill', () => {
  it('renders the event title in the basics section (now linear, always visible)', () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    // Linear form: every section is always rendered, so the title input is
    // present without needing to expand anything.
    const titleInput = screen.getByDisplayValue('Internal Workshop');
    expect(titleInput).toBeInTheDocument();
    // Prefilled venue shows in the picked-venue card (no longer a summary
    // line — the venue card is always visible in the linear layout).
    expect(screen.getByText(/Menlo Park/)).toBeInTheDocument();
  });

  it('shows a single "Save changes" button in edit mode (no Draft/Publish split)', () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    // Single save button in edit mode — lifecycle is managed elsewhere
    // (publishEvent action remains on the page header).
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish event/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /save draft/i })).toBeNull();
  });

  it('calls submit with the unchanged round-tripped payload (no status key) when clicked without edits', async () => {
    type SubmitPayload = Parameters<NonNullable<React.ComponentProps<typeof NewEventForm>['submit']>>[0];
    const submit = vi.fn<(p: SubmitPayload) => Promise<{ ok: true }>>(async () => ({ ok: true }));
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={submit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const payload = submit.mock.calls[0]![0];
    // Event-side round-trip: the form should re-emit the same ISO strings it
    // received (start/end/venue), since neither the date, the start/end
    // minutes, nor the venue/basics changed.
    expect(payload.event).toMatchObject({
      title: 'Internal Workshop',
      topic: 'Engineering',
      description: 'A test event description.',
      // Capacity is bound to a text Input (string), then passed through to
      // the action; the Zod schema coerces server-side. Matches the
      // create-flow behavior — no widening in D.3a.
      max_attendees: '80',
      start_time: initialEvent.start_time,
      end_time: initialEvent.end_time,
      venue_name: 'Rosewood Sand Hill',
      city: 'Menlo Park',
      country: 'United States',
      latitude: 37.4123,
      longitude: -122.2007,
    });
    // The form must NOT send `status` in edit mode (the update RPC keeps the
    // current value when status is absent; sending it would be a lifecycle
    // change the form doesn't manage).
    expect(payload).not.toHaveProperty('status');
    // Block-side round-trip: the single initial block re-emits the same ISO
    // times. Because both encode and decode run client-side (jsdom = UTC), a
    // server-side decode regression (Vercel's UTC clock applied to browser-
    // local encode) would shift these timestamps and fail this assertion.
    expect(payload.blocks).toHaveLength(1);
    expect(payload.blocks[0]).toMatchObject({
      kind: 'workshop',
      title: 'Opening session',
      host: 'Jane Doe',
      start_time: initialBlocks[0]!.start_time,
      end_time:   initialBlocks[0]!.end_time,
      display_order: 0,
    });
  });

  it('round-trips block notes through a no-edit Save (rule 12 — silent data loss guard)', async () => {
    // Regression: the edit-page SELECT used to omit `notes` and the prefill
    // defaulted every block to notes: ''. A no-edit Save then wrote '' over
    // every organiser-authored note via the form's full-replace payload.
    // The fix prefills BlockDraft.notes from the row; this test pins it.
    type SubmitPayload = Parameters<NonNullable<React.ComponentProps<typeof NewEventForm>['submit']>>[0];
    const submit = vi.fn<(p: SubmitPayload) => Promise<{ ok: true }>>(async () => ({ ok: true }));
    const blocksWithNotes: InitialBlock[] = [
      {
        ...initialBlocks[0]!,
        notes: 'Bring projector adapter',
      },
    ];
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={blocksWithNotes}
        submit={submit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const payload = submit.mock.calls[0]![0];
    expect(payload.blocks).toHaveLength(1);
    expect(payload.blocks[0]).toMatchObject({
      notes: 'Bring projector adapter',
    });
  });

  it('calls router.refresh() after a successful submit (edit mode stays in place)', async () => {
    const submit = vi.fn(async () => ({ ok: true as const }));
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={submit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it('shows a "Saved as draft" confirmation banner after a successful save', async () => {
    // Regression: without this, the user clicks Save and sees nothing — the
    // page refreshes to the same values with no signal the action landed.
    const submit = vi.fn(async () => ({ ok: true as const }));
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={submit}
      />,
    );

    // Before save: no banner.
    expect(screen.queryByTestId('save-confirmation')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const banner = await screen.findByTestId('save-confirmation');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner.textContent).toMatch(/saved\.?/i);
  });

  it('does NOT show the save confirmation when the submit fails', async () => {
    const submit = vi.fn(async () => ({ error: 'rpc blew up' }));
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={submit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText(/rpc blew up/)).toBeInTheDocument());
    expect(screen.queryByTestId('save-confirmation')).toBeNull();
  });

  it('clears the save confirmation on the next submit attempt', async () => {
    const submit = vi.fn(async () => ({ ok: true as const }));
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={submit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByTestId('save-confirmation');

    // Second click: confirmation should vanish at the start of the next
    // onSubmit (so the user sees the click registered). Wait for the button
    // to re-enable after the first transition completes before clicking again.
    const button = await screen.findByRole('button', { name: /save changes/i });
    fireEvent.click(button);
    expect(screen.queryByTestId('save-confirmation')).toBeNull();
  });

  it('surfaces the submit error and does not refresh on failure', async () => {
    const submit = vi.fn(async () => ({ error: 'rpc blew up' }));
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={submit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/rpc blew up/)).toBeInTheDocument());
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe('NewEventForm — create mode (regression: existing behavior preserved)', () => {
  it('renders the create-mode dual buttons + empty basics', () => {
    render(
      <NewEventForm
        mode="create"
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    // The breadcrumb + page H1 ("New event"/"Create event") moved up to the
    // page-level header in app/events/new/page.tsx; this form no longer
    // renders them. Assert what the form DOES still own: the action buttons.
    expect(screen.getByRole('button', { name: /save draft/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish event/i })).toBeInTheDocument();
  });
});

/* ====================================================================
 * D.3b — EE form restyle (linear, numbered sections + new action row)
 * ==================================================================== */

describe('NewEventForm — D.3b linear layout', () => {
  it('renders the four sections in mockup order with numbered headings', () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent ?? '');
    // The four section H2s, in the mockup order: 1 · Basics → 2 · Date &
    // venue → 3 · Capacity → 4 · Agenda.
    const numbered = headings.filter(t => /^\s*\d\s*·/.test(t));
    expect(numbered).toHaveLength(4);
    expect(numbered[0]).toMatch(/1\s*·\s*Basics/);
    expect(numbered[1]).toMatch(/2\s*·\s*Date\s*&\s*venue/);
    expect(numbered[2]).toMatch(/3\s*·\s*Capacity/);
    expect(numbered[3]).toMatch(/4\s*·\s*Agenda/);
  });

  it('marks the Agenda section as optional in the heading', () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    const agendaHeading = screen.getAllByRole('heading', { level: 2 })
      .find(h => /agenda/i.test(h.textContent ?? ''));
    expect(agendaHeading?.textContent ?? '').toMatch(/optional/i);
  });

  it('shows Max attendees outside the Basics section (now in section 3 · Capacity)', () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    // Find the Capacity section by its heading, then assert the max-attendees
    // input lives inside it (not inside the Basics section). The Capacity
    // input has the prefilled "80" value from the fixture's max_attendees.
    const capacityHeading = screen.getAllByRole('heading', { level: 2 })
      .find(h => /capacity/i.test(h.textContent ?? ''));
    expect(capacityHeading).toBeDefined();
    const section = capacityHeading!.closest('section');
    expect(section).not.toBeNull();
    const capacityInput = within(section!).getByDisplayValue('80');
    expect(capacityInput).toBeInTheDocument();

    // Conversely, the Basics section heading should NOT contain a numeric
    // input with the capacity value any more.
    const basicsHeading = screen.getAllByRole('heading', { level: 2 })
      .find(h => /basics/i.test(h.textContent ?? ''));
    const basicsSection = basicsHeading!.closest('section');
    expect(within(basicsSection!).queryByDisplayValue('80')).toBeNull();
  });

  it('renders the timezone hint once a venue is picked (edit mode prefilled venue)', () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    // Menlo Park lat/lng resolves to America/Los_Angeles via tz-lookup; the
    // hint copy includes the resolved zone string verbatim.
    const hint = screen.getByTestId('venue-tz-hint');
    expect(hint.textContent ?? '').toMatch(/Los_Angeles/);
    expect(hint.textContent ?? '').toMatch(/picked up from your venue/i);
  });

  it('does NOT render the timezone hint before a venue is picked (create mode)', () => {
    render(
      <NewEventForm
        mode="create"
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    expect(screen.queryByTestId('venue-tz-hint')).toBeNull();
  });

  it('renders the "Event type" terminology in the agenda section (not "Kind")', () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    // The agenda's components header reads "Event type" (locked terminology
    // per patterns doc §7 — DB column stays `kind`).
    expect(screen.getByText(/^Event type$/)).toBeInTheDocument();
  });
});

describe('NewEventForm — D.3b action row (Cancel · Save & Preview · Save)', () => {
  it('Cancel in edit mode navigates to the details page', () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/events/11111111-2222-4333-8444-555555555555/details');
  });

  it('Cancel in create mode navigates to the dashboard', () => {
    render(
      <NewEventForm
        mode="create"
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });

  it('shows Save & Preview only in edit mode (create-mode redirect makes the workaround not worth it)', () => {
    const { unmount } = render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    expect(screen.getByRole('button', { name: /save & preview/i })).toBeInTheDocument();
    unmount();

    render(
      <NewEventForm
        mode="create"
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    expect(screen.queryByRole('button', { name: /save & preview/i })).toBeNull();
  });

  it('Save & Preview in edit mode submits AND opens the public URL in a new tab after the save resolves', async () => {
    const submit = vi.fn(async () => ({ ok: true as const }));
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={submit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /save & preview/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
    expect(openSpy).toHaveBeenCalledWith(
      '/events/11111111-2222-4333-8444-555555555555',
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });

  it('Save & Preview does NOT open the preview tab when the save fails (no orphan tab)', async () => {
    const submit = vi.fn(async () => ({ error: 'rpc blew up' }));
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={submit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /save & preview/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/rpc blew up/)).toBeInTheDocument());
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
