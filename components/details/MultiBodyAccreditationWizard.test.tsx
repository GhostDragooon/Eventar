/** @vitest-environment jsdom */
// multiBodyActions.ts is a Server Action module ('use server') — pulls in
// next/cache's revalidatePath, forbidden in jsdom builds. These tests are
// about the wizard's own rendering and state updates, not the actions.
vi.mock('@/app/events/[id]/details/multiBodyActions', () => ({
  addAccreditationGroup: vi.fn(),
  removeAccreditationGroup: vi.fn(),
  addAccreditationRow: vi.fn(),
  removeAccreditationRow: vi.fn(),
  linkAccreditationOccurrence: vi.fn(),
  unlinkAccreditationOccurrence: vi.fn(),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MultiBodyAccreditationWizard } from './MultiBodyAccreditationWizard';
import * as actions from '@/app/events/[id]/details/multiBodyActions';

// Vitest doesn't auto-import RTL's cleanup (project config has `globals` off);
// without this, renders accumulate in jsdom across tests.
afterEach(cleanup);

const bodies = [{ id: 'b1', full_name: 'HK College of Pathologists', short_name: 'HKCP', cycle_config: {} }];
const occurrences = [
  { id: 'o1', ordinal: 1, name: 'Day 1', starts_at: '2026-09-01T00:00:00Z' },
  { id: 'o2', ordinal: 2, name: 'Day 2', starts_at: '2026-09-02T00:00:00Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MultiBodyAccreditationWizard', () => {
  it('renders collapsed by default when nothing is configured', () => {
    render(<MultiBodyAccreditationWizard eventId="e1" bodies={bodies} bodyDirectory={bodies} occurrences={occurrences} initialGroups={[]} frozen={false} />);
    expect(screen.getByText(/configure multiple accrediting bodies/i)).toBeTruthy();
    expect(screen.queryByText('Accrediting bodies')).toBeNull();
  });

  it('opens automatically when a group already exists', () => {
    render(
      <MultiBodyAccreditationWizard
        eventId="e1"
        bodies={bodies}
        bodyDirectory={bodies}
        occurrences={occurrences}
        initialGroups={[{ id: 'g1', bodyId: 'b1', categoryCode: null, unit: 'points', awardScheme: 'proportional', rows: [] }]}
        frozen={false}
      />,
    );
    // The picker excludes already-added bodies (dev-lens fix), so the group
    // card is the only place this text appears.
    expect(screen.getAllByText('HKCP — HK College of Pathologists')).toHaveLength(1);
  });

  it('adds a body, shows it in the list, and removes it from the add-picker (no silent duplicates)', async () => {
    vi.mocked(actions.addAccreditationGroup).mockResolvedValue({ ok: true, data: { id: 'g-new' } });
    render(<MultiBodyAccreditationWizard eventId="e1" bodies={bodies} bodyDirectory={bodies} occurrences={occurrences} initialGroups={[]} frozen={false} />);

    fireEvent.click(screen.getByText(/configure multiple accrediting bodies/i));
    fireEvent.change(screen.getByLabelText(/accrediting body/i), { target: { value: 'b1' } });
    fireEvent.click(screen.getByRole('button', { name: /^add body$/i }));

    await waitFor(() => expect(screen.getAllByText('HKCP — HK College of Pathologists')).toHaveLength(1));
    expect(actions.addAccreditationGroup).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'e1', bodyId: 'b1', awardScheme: 'proportional' }),
    );
    // Only body already added, so the picker has nothing left to offer.
    expect(screen.getByText(/every authorised body has already been added/i)).toBeTruthy();
  });

  it('surfaces the translated RPC error instead of silently failing', async () => {
    vi.mocked(actions.addAccreditationGroup).mockResolvedValue({ error: 'Your organisation isn’t authorised by that accrediting body.' });
    render(<MultiBodyAccreditationWizard eventId="e1" bodies={bodies} bodyDirectory={bodies} occurrences={occurrences} initialGroups={[]} frozen={false} />);

    fireEvent.click(screen.getByText(/configure multiple accrediting bodies/i));
    fireEvent.change(screen.getByLabelText(/accrediting body/i), { target: { value: 'b1' } });
    fireEvent.click(screen.getByRole('button', { name: /^add body$/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/isn.t authorised/i));
    // The failed add must not appear as if it succeeded — only the picker
    // option carries the body's name, not a group card.
    expect(screen.getAllByText('HKCP — HK College of Pathologists')).toHaveLength(1);
  });

  it('blocks a body pick with no body chosen instead of calling the server', () => {
    render(<MultiBodyAccreditationWizard eventId="e1" bodies={bodies} bodyDirectory={bodies} occurrences={occurrences} initialGroups={[]} frozen={false} />);
    fireEvent.click(screen.getByText(/configure multiple accrediting bodies/i));
    fireEvent.click(screen.getByRole('button', { name: /^add body$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/choose an accrediting body/i);
    expect(actions.addAccreditationGroup).not.toHaveBeenCalled();
  });

  it('disables remove and add controls once credit has been issued (frozen)', () => {
    render(
      <MultiBodyAccreditationWizard
        eventId="e1"
        bodies={bodies}
        bodyDirectory={bodies}
        occurrences={occurrences}
        initialGroups={[{ id: 'g1', bodyId: 'b1', categoryCode: null, unit: 'points', awardScheme: 'proportional', rows: [] }]}
        frozen
      />,
    );
    expect(screen.getByText(/credits have already been issued/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /remove/i })).toBeDisabled();
    // The add-body fieldset is not rendered at all once frozen — nothing to add to a locked config.
    expect(screen.queryByLabelText(/accrediting body/i)).toBeNull();
  });

  // Regression test for the "Unknown body" bug found live: a group whose
  // body is no longer in the offerable `bodies` list (authorisation lapsed)
  // must still resolve a real name from `bodyDirectory`, the superset.
  it('resolves a group label from bodyDirectory when the body is no longer offerable', () => {
    const lapsedBody = { id: 'b2', full_name: 'Lapsed Authorisation College', short_name: 'LAC', cycle_config: {} };
    render(
      <MultiBodyAccreditationWizard
        eventId="e1"
        bodies={[]}
        bodyDirectory={[lapsedBody]}
        occurrences={occurrences}
        initialGroups={[{ id: 'g1', bodyId: 'b2', categoryCode: null, unit: 'hours', awardScheme: 'proportional', rows: [] }]}
        frozen={false}
      />,
    );
    expect(screen.getByText('LAC — Lapsed Authorisation College')).toBeTruthy();
    expect(screen.queryByText(/no longer authorised/i)).toBeNull();
  });

  it('falls back to an explicit label when a body is in neither list', () => {
    render(
      <MultiBodyAccreditationWizard
        eventId="e1"
        bodies={[]}
        bodyDirectory={[]}
        occurrences={occurrences}
        initialGroups={[{ id: 'g1', bodyId: 'ghost', categoryCode: null, unit: 'hours', awardScheme: 'proportional', rows: [] }]}
        frozen={false}
      />,
    );
    expect(screen.getByText(/no longer authorised for this organisation/i)).toBeTruthy();
  });

  // event_accreditations cascades on group delete, so removing a body with
  // schedule rows destroys them silently. The confirm step must actually
  // GATE the server call, not merely appear alongside it.
  it('does not remove a body with schedule rows until the removal is confirmed', async () => {
    vi.mocked(actions.removeAccreditationGroup).mockResolvedValue({ ok: true, data: undefined });
    render(
      <MultiBodyAccreditationWizard
        eventId="e1"
        bodies={bodies}
        bodyDirectory={bodies}
        occurrences={occurrences}
        initialGroups={[
          { id: 'g1', bodyId: 'b1', categoryCode: null, unit: 'hours', awardScheme: 'explicit_schedule', rows: [{ id: 'r1', credit_value: 2, occurrenceIds: ['o1'] }] },
        ]}
        frozen={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    expect(actions.removeAccreditationGroup).not.toHaveBeenCalled();
    // The warning must name what else goes with it, not just "are you sure".
    expect(screen.getByRole('dialog')).toHaveTextContent(/1 schedule row/i);

    fireEvent.click(screen.getByRole('button', { name: /remove body/i }));
    await waitFor(() => expect(actions.removeAccreditationGroup).toHaveBeenCalledWith({ groupId: 'g1', eventId: 'e1' }));
  });

  it('abandons the removal when the confirm step is cancelled', () => {
    render(
      <MultiBodyAccreditationWizard
        eventId="e1"
        bodies={bodies}
        bodyDirectory={bodies}
        occurrences={occurrences}
        initialGroups={[
          { id: 'g1', bodyId: 'b1', categoryCode: null, unit: 'hours', awardScheme: 'explicit_schedule', rows: [{ id: 'r1', credit_value: 2, occurrenceIds: ['o1'] }] },
        ]}
        frozen={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(actions.removeAccreditationGroup).not.toHaveBeenCalled();
  });

  // A group with no rows has nothing to lose, so it skips the confirm step —
  // guarding against the dialog becoming blanket friction on every remove.
  it('removes a body with no schedule rows without a confirm step', async () => {
    vi.mocked(actions.removeAccreditationGroup).mockResolvedValue({ ok: true, data: undefined });
    render(
      <MultiBodyAccreditationWizard
        eventId="e1"
        bodies={bodies}
        bodyDirectory={bodies}
        occurrences={occurrences}
        initialGroups={[{ id: 'g1', bodyId: 'b1', categoryCode: null, unit: 'hours', awardScheme: 'proportional', rows: [] }]}
        frozen={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(actions.removeAccreditationGroup).toHaveBeenCalledWith({ groupId: 'g1', eventId: 'e1' }));
  });

  // Regression test for the sibling bug (award engine only ever reads a
  // proportional group's earliest row): the add-row control must disappear
  // once a proportional group already has one row.
  it('caps a proportional group to one schedule row', async () => {
    vi.mocked(actions.addAccreditationRow).mockResolvedValue({ ok: true, data: { id: 'row-1' } });
    render(
      <MultiBodyAccreditationWizard
        eventId="e1"
        bodies={bodies}
        bodyDirectory={bodies}
        occurrences={occurrences}
        initialGroups={[{ id: 'g1', bodyId: 'b1', categoryCode: null, unit: 'hours', awardScheme: 'proportional', rows: [] }]}
        frozen={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /schedule & occurrences/i }));
    expect(screen.getByLabelText(/total credit value/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/total credit value/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /^add row$/i }));

    await waitFor(() => expect(screen.getByText(/total credit value: 3 hours/i)).toBeTruthy());
    expect(screen.queryByLabelText(/total credit value/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /^add row$/i })).toBeNull();
  });
});
