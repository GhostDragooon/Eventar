/** @vitest-environment jsdom */
import { vi } from 'vitest';

// NewEventForm imports `./actions` (createEvent) which pulls in 'server-only'
// — forbidden in jsdom builds. Mock the module to a no-op shape so the
// component imports cleanly. Tests drive the form via the parent's `submit`
// prop, not the action directly.
vi.mock('./actions', () => ({
  createEvent: vi.fn(async () => ({ error: 'unreachable from tests' })),
}));

// next/navigation: edit-mode uses router.refresh() on success.
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
});

describe('NewEventForm — edit mode prefill', () => {
  it('shows the breadcrumb + title for edit mode (not create copy)', () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    // Both the in-form breadcrumb and the page-title-style header show "Edit
    // event" (the page-level outer header is owned by the server component;
    // these two are inside the form).
    const editLabels = screen.getAllByText(/edit event/i);
    expect(editLabels.length).toBeGreaterThanOrEqual(2);
    // Section summaries show the initial values in the collapsed accordion rows
    // (only the first/active section is expanded; the others render summary).
    expect(screen.getByText(/Menlo Park/)).toBeInTheDocument();
  });

  it('renders the event title in the basics section', () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    // Basics section is open by default; the Input shows the title value.
    const titleInput = screen.getByDisplayValue('Internal Workshop');
    expect(titleInput).toBeInTheDocument();
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
    // Single button in edit mode — lifecycle is managed elsewhere
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
  it('renders the create-mode breadcrumb + dual buttons + empty basics', () => {
    render(
      <NewEventForm
        mode="create"
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    expect(screen.getByText(/new event/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save draft/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish event/i })).toBeInTheDocument();
  });
});
