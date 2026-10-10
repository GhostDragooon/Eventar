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
const { searchVenues } = vi.hoisted(() => ({ searchVenues: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: pushMock }),
}));
vi.mock('@/lib/nominatim', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/nominatim')>()),
  searchVenues,
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
  searchVenues.mockReset().mockResolvedValue([initialVenue]);
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
    // onSubmit (so the user sees the click registered).
    //
    // This is the fix for the long-tracked flake in this file. The previous
    // version used `await findByRole(...)` and a comment claiming it waited
    // for the button to re-enable — it does not. findByRole resolves as soon
    // as a MATCHING ELEMENT EXISTS, and the button exists the whole time; it
    // is merely `disabled={pending}` while the first useTransition settles.
    // So under load the second click landed on a disabled button, onSubmit
    // never ran, the confirmation never cleared, and the synchronous assert
    // below failed. Waiting on the ENABLED state is the real precondition,
    // and the clear is async, so it needs waitFor too.
    const button = screen.getByRole('button', { name: /save changes/i });
    // The pending state is aria-disabled, not the native `disabled` attribute: the Save
    // buttons use focusableWhenDisabled so keyboard focus survives a save (P2a, 2026-10-09).
    // toBeEnabled() only reads the native attribute, so it passed at once and the second
    // click landed on a button that was still pending. And the label cannot be the signal
    // either: it flips back to "Save changes" as soon as `intent` clears, before the
    // transition settles. Wait for aria-disabled to clear.
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled', 'true'));
    fireEvent.click(button);
    await waitFor(() => expect(screen.queryByTestId('save-confirmation')).toBeNull());
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
        cpdBodies={[]}
        cpdBodiesUnavailable={false}
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
  it('renders the five v4 sections in order with numbered headings', () => {
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
    // Editor v4 (locked 2026-06-20): 1 Hero image · 2 Basics · 3 Date & venue
    // · 4 Agenda · 5 Registration period. 6 Check-in added 2026-08-03 — the
    // self-serve flag existed in the DB from the start but no surface wrote it.
    const numbered = headings.filter(t => /^\s*\d\s*·/.test(t));
    expect(numbered).toHaveLength(6);
    expect(numbered[0]).toMatch(/1\s*·\s*Hero\s*image/);
    expect(numbered[1]).toMatch(/2\s*·\s*Basics/);
    expect(numbered[2]).toMatch(/3\s*·\s*Date\s*&\s*venue/);
    expect(numbered[3]).toMatch(/4\s*·\s*Agenda/);
    expect(numbered[4]).toMatch(/5\s*·\s*Registration\s*period/);
    expect(numbered[5]).toMatch(/6\s*·\s*Check-in/);
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

  it('shows Max attendees inside the Date & venue section (v4 right column)', () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    // v4: capacity moved into Date & venue's right column. Find that section
    // by heading and assert the prefilled "80" input lives inside it.
    const dvHeading = screen.getAllByRole('heading', { level: 2 })
      .find(h => /date\s*&\s*venue/i.test(h.textContent ?? ''));
    expect(dvHeading).toBeDefined();
    const section = dvHeading!.closest('section');
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
    // v4 copy: "Timezone follows the venue — {tz}."
    expect(hint.textContent ?? '').toMatch(/timezone follows the venue/i);
  });

  it('does NOT render the timezone hint before a venue is picked (create mode)', () => {
    render(
      <NewEventForm
        mode="create"
        submit={vi.fn(async () => ({ ok: true as const }))}
        cpdBodies={[]}
        cpdBodiesUnavailable={false}
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

  it('does not render a "Format" field in the Basics section (removed from the UI)', () => {
    render(
      <NewEventForm
        mode="create"
        submit={vi.fn(async () => ({ ok: true as const }))}
        cpdBodies={[]}
        cpdBodiesUnavailable={false}
      />,
    );
    expect(screen.queryByLabelText(/^Format/)).toBeNull();
    expect(screen.queryByText(/No format/)).toBeNull();
  });

  it('round-trips an existing event\'s format through a no-edit Save even with no Format control in the UI', async () => {
    // Format's <select> was removed from Section 2, but the schema still
    // accepts the field and existing events may already have one set. A
    // no-edit Save must not silently drop it (rule 12 — silent data loss).
    type SubmitPayload = Parameters<NonNullable<React.ComponentProps<typeof NewEventForm>['submit']>>[0];
    const submit = vi.fn<(p: SubmitPayload) => Promise<{ ok: true }>>(async () => ({ ok: true }));
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={{ ...initialEvent, format: 'symposium' }}
        initialBlocks={initialBlocks}
        submit={submit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const payload = submit.mock.calls[0]![0];
    expect(payload.event).toMatchObject({ format: 'symposium' });
  });
});

describe('NewEventForm — agenda block type taxonomy (2026-09-13 instruction)', () => {
  it('renders the new primary chips, keeps Workshop/Break, drops Webinar/Transition entirely', () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    expect(screen.getByRole('button', { name: '+ Case Presentation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Workshop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Break' })).toBeInTheDocument();
    // Removed primary types are gone entirely — not relocated to "+ More".
    expect(screen.queryByRole('button', { name: '+ Webinar' })).toBeNull();
    expect(screen.queryByRole('button', { name: '+ Transition' })).toBeNull();
  });

  it('keeps secondary types behind "+ More" until opened, then adds a block of the picked kind', () => {
    render(
      <NewEventForm
        mode="create"
        submit={vi.fn(async () => ({ ok: true as const }))}
        cpdBodies={[]}
        cpdBodiesUnavailable={false}
      />,
    );
    expect(screen.queryByText('Awards')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+ More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Awards' }));
    // Menu closes on pick, so the only "Awards" left is the new block's kind badge.
    expect(screen.getByText('Awards')).toBeInTheDocument();
  });

  it('a legacy "transition" block still routes to the filler editor, not the rich editor', () => {
    const legacyBlocks: InitialBlock[] = [{
      id: 'b-legacy',
      start_time: buildIso(EVENT_DATE, '10:00'),
      end_time:   buildIso(EVENT_DATE, '10:15'),
      kind: 'transition',
      title: 'Walk to room B',
      host: null,
      topics: [],
      notes: null,
    }];
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={legacyBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    // FillerEditor's "What" field, not BlockEditor's "Title" + "Topics".
    expect(screen.getByText(/^What/)).toBeInTheDocument();
    expect(screen.queryByText('Topics')).toBeNull();
  });

  it('the sponsored toggle reveals a sponsor name field, and both survive submit', async () => {
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
    expect(screen.queryByLabelText(/Sponsor name/)).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Sponsored/ }));
    fireEvent.change(screen.getByLabelText(/Sponsor name/), { target: { value: 'Acme Pharma' } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const payload = submit.mock.calls[0]![0];
    expect(payload.blocks[0]).toMatchObject({ sponsored: true, sponsor_name: 'Acme Pharma' });
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
        cpdBodies={[]}
        cpdBodiesUnavailable={false}
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
        cpdBodies={[]}
        cpdBodiesUnavailable={false}
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

describe('NewEventForm — check-in mode (self-serve)', () => {
  type SubmitPayload = Parameters<NonNullable<React.ComponentProps<typeof NewEventForm>['submit']>>[0];

  it('defaults a new event to staff-only check-in', async () => {
    const submit = vi.fn<(p: SubmitPayload) => Promise<{ ok: true }>>(async () => ({ ok: true }));
    render(<NewEventForm mode="create" submit={submit} cpdBodies={[]} cpdBodiesUnavailable={false} />);

    const toggle = screen.getByRole('checkbox', { name: /check themselves in/i });
    expect(toggle).not.toBeChecked();
  });

  it('sends self_serve: true once the organiser turns the toggle on', async () => {
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

    fireEvent.click(screen.getByRole('checkbox', { name: /check themselves in/i }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    // `staff` is sent constant-true, not toggled: nothing in the product reads
    // it, so offering it as a control would be fabricated chrome.
    expect(submit.mock.calls[0]![0].event.checkin_modes)
      .toEqual({ staff: true, self_serve: true });
  });

  it('round-trips an already-enabled event through a no-edit Save', async () => {
    // Same silent-data-loss class as the block-notes regression above: the
    // RPCs are full-replace, so a prefill that forgot this field would turn
    // self-serve OFF on every organiser who saved an unrelated typo fix.
    const submit = vi.fn<(p: SubmitPayload) => Promise<{ ok: true }>>(async () => ({ ok: true }));
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={{ ...initialEvent, checkin_modes: { staff: true, self_serve: true } }}
        initialBlocks={initialBlocks}
        submit={submit}
      />,
    );

    expect(screen.getByRole('checkbox', { name: /check themselves in/i })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]![0].event.checkin_modes)
      .toEqual({ staff: true, self_serve: true });
  });

  it('tells the organiser what self-serve actually does, not just that it is on', () => {
    render(<NewEventForm mode="create" submit={vi.fn(async () => ({ ok: true as const }))} cpdBodies={[]} cpdBodiesUnavailable={false} />);
    // Consequence-bearing copy: the pass page gains a button, staff scanning
    // is unaffected, and on an accredited event this posts credit unattended.
    // Matched on the full sentence, not a bare /credit/i — the CPD
    // accreditation section added below also contains "accredited", and a
    // loose matcher would pass on the wrong element.
    expect(screen.getByText(/reception/i)).toBeInTheDocument();
    expect(
      screen.getByText(/posts attendance credit with no staff member present/i),
    ).toBeInTheDocument();
  });
});

// P2a (findings B2, B5): a role that cannot publish was offered the button and
// ended on the crash page; a saved-but-not-accredited event left the organiser
// on a failed form with no way back to the event they had just saved.
describe('NewEventForm — create mode, publishing role and the saved-event link', () => {
  const createProps = {
    mode: 'create' as const,
    cpdBodies: [],
    cpdBodiesUnavailable: false,
  };

  it('offers Publish event by default', () => {
    render(<NewEventForm {...createProps} submit={vi.fn(async () => ({ ok: true as const }))} />);
    expect(screen.getByRole('button', { name: /publish event/i })).toBeInTheDocument();
    expect(screen.queryByText(/your role can't publish events/i)).not.toBeInTheDocument();
  });

  it('hides Publish event for a role that cannot publish, says why, and keeps Save draft', () => {
    render(<NewEventForm {...createProps} canPublish={false} submit={vi.fn(async () => ({ ok: true as const }))} />);
    expect(screen.queryByRole('button', { name: /publish event/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save draft/i })).toBeInTheDocument();
    expect(screen.getByText(/your role can't publish events\. save a draft and ask an organiser admin to publish it\./i)).toBeInTheDocument();
  });

  // One primary action per card (D16). With Publish hidden, Save draft is the only
  // way forward and must look like it; beside Publish it stays the quiet one. The
  // default variant carries bg-primary, the outline variant does not.
  it('makes Save draft the primary action only when Publish is hidden', () => {
    const { unmount } = render(<NewEventForm {...createProps} canPublish={false} submit={vi.fn(async () => ({ ok: true as const }))} />);
    expect(screen.getByRole('button', { name: /save draft/i }).className).toMatch(/(^|\s)bg-primary(\s|$)/);
    unmount();
    render(<NewEventForm {...createProps} submit={vi.fn(async () => ({ ok: true as const }))} />);
    expect(screen.getByRole('button', { name: /save draft/i }).className).not.toMatch(/(^|\s)bg-primary(\s|$)/);
    expect(screen.getByRole('button', { name: /publish event/i }).className).toMatch(/(^|\s)bg-primary(\s|$)/);
  });

  // User-lens 2026-10-02: the action row was 32px tall on a phone. 44px is the touch
  // target everywhere else on the surface (D16).
  it('keeps every action-row button at a 44px touch target', () => {
    render(<NewEventForm {...createProps} submit={vi.fn(async () => ({ ok: true as const }))} />);
    for (const name of [/^cancel$/i, /save draft/i, /publish event/i]) {
      expect(screen.getByRole('button', { name }).className, String(name)).toMatch(/(^|\s)min-h-11(\s|$)/);
    }
  });

  it('explains when this role cannot set accreditation and hides the unusable picker', () => {
    render(
      <NewEventForm
        {...createProps}
        canSetAccreditation={false}
        cpdBodies={[{ id: 'body-1', full_name: 'Example Council', short_name: 'EC' }]}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    expect(screen.getByText(/your role can't set accreditation\. you can still create the event without it/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/accrediting body/i)).not.toBeInTheDocument();
  });

  it('never shows the role note in edit mode (edit has no publish control to hide)', () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    expect(screen.queryByText(/your role can't publish events/i)).not.toBeInTheDocument();
  });

  // Create mode is the only real path: createEvent returns {error, eventId} on a partial
  // success, updateEvent never returns an eventId (dev-lens, 2026-10-11).
  it('links to the saved event when the create reports an error AND an event id', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const submit = vi.fn(async () => ({
      error: 'The event was published, but the accreditation could not be saved. Open it and set the accreditation there.',
      eventId: 'abc-123',
    }));
    render(<NewEventForm {...createBase} submit={submit} />);
    await fillValidEvent();
    fireEvent.click(screen.getByRole('button', { name: /publish event/i }));

    const link = await screen.findByRole('link', { name: /open the saved event/i });
    expect(link).toHaveAttribute('href', '/events/abc-123/edit');
  });

  it('shows no link for an error that did not save anything', async () => {
    render(
      <NewEventForm
        mode="edit"
        eventId="11111111-2222-4333-8444-555555555555"
        initialEvent={initialEvent}
        initialBlocks={initialBlocks}
        submit={vi.fn(async () => ({ error: 'rpc blew up' }))}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByText(/rpc blew up/);
    expect(screen.queryByRole('link', { name: /open the saved event/i })).not.toBeInTheDocument();
  });
});

// ---- Round 2 (2026-10-09): what the second review found on the create form ----------

async function fillValidEvent() {
  fireEvent.change(screen.getByPlaceholderText('Workshop on TDD'), { target: { value: 'Test event' } });
  fireEvent.change(screen.getByPlaceholderText(/search a venue/i), { target: { value: 'Rosewood' } });
  const venue = await screen.findByRole('option', { name: /Rosewood Sand Hill/ });
  fireEvent.click(within(venue).getByRole('button'));
  fireEvent.click(screen.getByRole('button', { name: new Date().toDateString() }));
  fireEvent.click(screen.getByRole('button', { name: 'Event start time (required)' }));
  fireEvent.click(screen.getByRole('option', { name: '09:00 AM' }));
  fireEvent.click(screen.getByRole('button', { name: /Event end time \(required\)/ }));
  fireEvent.click(screen.getByRole('option', { name: '10:00 AM' }));
}

const createBase = { mode: 'create' as const, cpdBodies: [], cpdBodiesUnavailable: false };
const okSubmit = () => vi.fn(async () => ({ ok: true as const }));
const sectionHeading = (el: HTMLElement) => el.closest('section')?.querySelector('h2')?.textContent ?? '';

describe('NewEventForm: a validation message appears in the section it names', () => {
  beforeEach(() => {
    // jsdom does not implement scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
  });

  // User-lens 2026-10-09: the message rendered under the buttons, ~1,500px from the field
  // the page had just scrolled to, so Save draft looked like it did nothing.
  it('puts the name message under the Basics heading, focuses it, and shows it once', () => {
    const submit = okSubmit();
    render(<NewEventForm {...createBase} submit={submit} />);
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Add the event basics (name) to continue.');
    expect(sectionHeading(alert)).toMatch(/Basics/);
    expect(document.activeElement).toBe(alert);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it('puts the venue message under Date & venue, and clears it on the next attempt that gets further', async () => {
    render(<NewEventForm {...createBase} submit={okSubmit()} />);
    fireEvent.change(screen.getByPlaceholderText('Workshop on TDD'), { target: { value: 'Only a name' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Pick a venue from the dropdown to continue.');
    expect(sectionHeading(alert)).toMatch(/Date & venue/);

    fireEvent.change(screen.getByPlaceholderText(/search a venue/i), { target: { value: 'Rosewood' } });
    const venue = await screen.findByRole('option', { name: /Rosewood Sand Hill/ });
    fireEvent.click(within(venue).getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Set the date, start, and end time to continue.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});

// User-lens 2026-10-09 / dev-lens round 2: a chosen accrediting body with empty hours was
// sent as "no accreditation" and the event was created (or published) unaccredited, with
// no message. Both-or-neither is the server's rule; the form now stops and says so.
describe('NewEventForm: a chosen accrediting body needs its hours', () => {
  const cpdProps = { ...createBase, cpdBodies: [{ id: 'body-1', full_name: 'Example Council', short_name: 'EC' }] };

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('stops before submitting, names the field in section 7, and sends the pair once it is valid', async () => {
    const submit = okSubmit();
    render(<NewEventForm {...cpdProps} submit={submit} />);
    await fillValidEvent();
    fireEvent.change(screen.getByLabelText(/accrediting body/i), { target: { value: 'body-1' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    const empty = screen.getByRole('alert');
    expect(empty).toHaveTextContent(/enter the cpd hours \(more than 0, up to 24\) for the accrediting body, or set it back to "not accredited"/i);
    expect(sectionHeading(empty)).toMatch(/CPD accreditation/);
    expect(submit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/cpd hours/i), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/enter the cpd hours/i);
    expect(submit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/cpd hours/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/enter the cpd hours/i);
    expect(submit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/cpd hours/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ cpd: { bodyId: 'body-1', hours: 3 } }));
  });

  it('is not triggered when no body is chosen', async () => {
    const submit = okSubmit();
    render(<NewEventForm {...cpdProps} submit={submit} />);
    await fillValidEvent();
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ cpd: { bodyId: null, hours: null } }));
  });
});

describe('NewEventForm: the create buttons and notes, round 2', () => {
  // Where Publish is the blue button, say what it costs BEFORE the click.
  it('warns publishers that details cannot be edited after publishing, and not other roles', () => {
    const { unmount } = render(<NewEventForm {...createBase} submit={okSubmit()} />);
    expect(screen.getByText(/publish event makes the registration page live\. details cannot be edited after publishing yet, so check them first/i)).toBeInTheDocument();
    unmount();
    render(<NewEventForm {...createBase} canPublish={false} submit={okSubmit()} />);
    expect(screen.queryByText(/details cannot be edited after publishing/i)).not.toBeInTheDocument();
  });

  // A disabled button drops keyboard focus to <body> the moment the click lands.
  it('keeps keyboard focus on the button while it saves (aria-disabled, not disabled)', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    let finish!: (v: { ok: true }) => void;
    const submit = vi.fn(() => new Promise<{ ok: true }>((resolve) => { finish = resolve; }));
    render(<NewEventForm {...createBase} submit={submit} />);
    await fillValidEvent();
    const save = screen.getByRole('button', { name: /save draft/i });
    save.focus();
    fireEvent.click(save);
    const pendingButton = await screen.findByRole('button', { name: /saving/i });
    expect(pendingButton).toHaveAttribute('aria-disabled', 'true');
    expect(pendingButton).not.toHaveAttribute('disabled');
    expect(document.activeElement).toBe(pendingButton);
    fireEvent.click(pendingButton);
    expect(submit).toHaveBeenCalledTimes(1);
    finish({ ok: true });
  });
});
