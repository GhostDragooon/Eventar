/** @vitest-environment jsdom */
import { vi } from 'vitest';

// ProfileClient imports 'use server' actions; jsdom cannot load 'server-only'.
// Mock the whole module so both actions are stubbed.
vi.mock('../actions', () => ({
  updateMyProfessionalProfile: vi.fn(async () => ({
    ok: true as const,
    data: { profile_created: false },
  })),
  declareMyLicence: vi.fn(async () => ({
    ok: true as const,
    data: { licence_id: 'lic-new-1' },
  })),
}));

import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProfileClient } from './ProfileClient';
import { declareMyLicence } from '../actions';
import type { AccreditingBodyView, LicenceRowView } from '../schema';

afterEach(cleanup);

const activeBodies: AccreditingBodyView[] = [
  { id: 'body-1', short_name: 'HKCP', full_name: 'Hong Kong College of Physicians', jurisdiction: 'HK' },
  { id: 'body-2', short_name: 'MCHK', full_name: 'Medical Council of Hong Kong', jurisdiction: 'HK' },
];

const existingLicences: LicenceRowView[] = [
  {
    id: 'lic-1',
    body_id: 'body-1',
    body_short_name: 'HKCP',
    licence_number: 'M12345',
    licence_type: null,
    track: null,
    status: 'declared',
    is_primary: true,
    declared_at: '2026-09-01T12:00:00.000Z',
    verified_at: null,
    cycle_started_on: null,
  },
];

describe('ProfileClient — Licences SectionCard', () => {
  it('renders the empty-state hint when the caller has no licences', () => {
    render(
      <ProfileClient
        initialProfile={null}
        initialLicences={[]}
        activeBodies={activeBodies}
      />,
    );
    expect(screen.getByText(/no licences declared yet/i)).toBeInTheDocument();
    // Submit disabled until both fields filled.
    const submit = screen.getByRole('button', { name: /declare licence/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('renders existing licences with body short_name, number, and status pill', () => {
    render(
      <ProfileClient
        initialProfile={null}
        initialLicences={existingLicences}
        activeBodies={activeBodies}
      />,
    );
    expect(screen.getByText('HKCP')).toBeInTheDocument();
    expect(screen.getByText('M12345')).toBeInTheDocument();
    expect(screen.getByText(/^declared$/i)).toBeInTheDocument();
    // Primary badge is suppressed when the caller has a single licence
    // (user-lens CONFUSING fix — a lone licence is trivially primary at
    // its body, and the badge just reads as unexplained jargon).
    expect(screen.queryByText(/^primary$/i)).not.toBeInTheDocument();
  });

  it('shows the Primary badge only once a second licence lands (>1 total)', () => {
    render(
      <ProfileClient
        initialProfile={null}
        initialLicences={[
          existingLicences[0],
          {
            ...existingLicences[0],
            id: 'lic-2',
            body_id: 'body-2',
            body_short_name: 'MCHK',
            licence_number: 'D67890',
            is_primary: false,
          },
        ]}
        activeBodies={activeBodies}
      />,
    );
    expect(screen.getByText(/^primary$/i)).toBeInTheDocument();
  });

  it('LicenceStatusPill carries a screen-reader-friendly aria-label with the "Status:" prefix', () => {
    render(
      <ProfileClient
        initialProfile={null}
        initialLicences={existingLicences}
        activeBodies={activeBodies}
      />,
    );
    // The pill's visible text is bare "declared"; the accessible name comes
    // from the aria-label. User-lens CONFUSING: a screen reader must not
    // hear "declared" without context.
    expect(screen.getByLabelText(/status: declared, pending verification/i)).toBeInTheDocument();
  });

  it('successful declare appends the licence to the list, clears the form, shows the success banner', async () => {
    render(
      <ProfileClient
        initialProfile={null}
        initialLicences={[]}
        activeBodies={activeBodies}
      />,
    );
    // Fill both fields and submit.
    const select = screen.getByLabelText(/accrediting body/i) as HTMLSelectElement;
    const number = screen.getByLabelText(/licence number/i) as HTMLInputElement;
    fireEvent.change(select, { target: { value: 'body-1' } });
    fireEvent.change(number, { target: { value: 'M99999' } });
    await act(async () => {
      fireEvent.submit(number.closest('form')!);
    });
    expect(declareMyLicence).toHaveBeenCalledWith({
      body_id: 'body-1',
      licence_number: 'M99999',
    });
    // Empty-state hint is gone; new row rendered.
    expect(screen.queryByText(/no licences declared yet/i)).not.toBeInTheDocument();
    expect(screen.getByText('M99999')).toBeInTheDocument();
    // Success banner copy — specific enough to not collide with the F4
    // checklist item ("At least one active licence declared…") in the
    // combined-readiness banner at the top of the page.
    expect(screen.getByText(/credit release also needs a confirmed email/i)).toBeInTheDocument();
    // Form cleared.
    expect((screen.getByLabelText(/licence number/i) as HTMLInputElement).value).toBe('');
  });

  it('already_declared error renders the specific "you\'ve already declared" copy and keeps the list unchanged', async () => {
    vi.mocked(declareMyLicence).mockResolvedValueOnce({
      ok: false as const,
      error: 'already_declared' as const,
    });
    render(
      <ProfileClient
        initialProfile={null}
        initialLicences={existingLicences}
        activeBodies={activeBodies}
      />,
    );
    const select = screen.getByLabelText(/accrediting body/i) as HTMLSelectElement;
    const number = screen.getByLabelText(/licence number/i) as HTMLInputElement;
    fireEvent.change(select, { target: { value: 'body-1' } });
    fireEvent.change(number, { target: { value: 'M12345' } });
    await act(async () => {
      fireEvent.submit(number.closest('form')!);
    });
    expect(screen.getByText(/already declared this licence number/i)).toBeInTheDocument();
    // List is untouched — still one row with M12345.
    expect(screen.getAllByText('M12345')).toHaveLength(1);
  });

  it('body_inactive error renders the specific "isn\'t accepting new licences" copy', async () => {
    vi.mocked(declareMyLicence).mockResolvedValueOnce({
      ok: false as const,
      error: 'body_inactive' as const,
    });
    render(
      <ProfileClient
        initialProfile={null}
        initialLicences={[]}
        activeBodies={activeBodies}
      />,
    );
    const select = screen.getByLabelText(/accrediting body/i) as HTMLSelectElement;
    const number = screen.getByLabelText(/licence number/i) as HTMLInputElement;
    fireEvent.change(select, { target: { value: 'body-1' } });
    fireEvent.change(number, { target: { value: 'M12345' } });
    await act(async () => {
      fireEvent.submit(number.closest('form')!);
    });
    expect(screen.getByText(/isn't accepting new licences/i)).toBeInTheDocument();
  });

  it('F3+F4 readiness banner: shows F3 "done" but F4 "not yet" when profile is complete and no licence is declared', () => {
    // User-lens BLOCKER guard: the pre-existing F3-only banner would turn
    // green here and lie about CPD readiness. The combined banner must
    // stay in the "not yet" tone whenever F4 is unmet.
    render(
      <ProfileClient
        initialProfile={{
          workplace_text: 'Queen Mary Hospital',
          workplace_organisation_id: null,
          position_code: 'consultant',
          position_other: null,
          profession_code: 'medicine',
          specialty_code: null,
          specialty_other: null,
          department_text: null,
          biography: null,
          expertise_codes: null,
          presentation_languages: null,
          speaker_discovery_opt_in: false,
          speaker_discovery_opt_in_at: null,
        }}
        initialLicences={[]}
        activeBodies={activeBodies}
      />,
    );
    // Banner must NOT be in the "profile and licences are in place" state.
    expect(screen.queryByText(/profile and licences are in place/i)).not.toBeInTheDocument();
    // Checklist must call out the licence gap as the remaining hurdle.
    expect(screen.getByText(/at least one active licence declared/i)).toBeInTheDocument();
  });

  it('F3+F4 readiness banner: goes green ONLY when profile + a non-terminal licence are both present', () => {
    render(
      <ProfileClient
        initialProfile={{
          workplace_text: 'Queen Mary Hospital',
          workplace_organisation_id: null,
          position_code: 'consultant',
          position_other: null,
          profession_code: 'medicine',
          specialty_code: null,
          specialty_other: null,
          department_text: null,
          biography: null,
          expertise_codes: null,
          presentation_languages: null,
          speaker_discovery_opt_in: false,
          speaker_discovery_opt_in_at: null,
        }}
        initialLicences={existingLicences}
        activeBodies={activeBodies}
      />,
    );
    expect(screen.getByText(/profile and licences are in place/i)).toBeInTheDocument();
  });

  it('F3+F4 readiness: a lapsed licence does NOT satisfy F4', () => {
    // Non-terminal statuses (declared, verified) satisfy F4; terminal
    // states (lapsed, revoked, superseded) do not — otherwise a user
    // whose licence expired last year would trip the same silent
    // check-in gate the BLOCKER fix closed.
    render(
      <ProfileClient
        initialProfile={{
          workplace_text: 'Queen Mary Hospital',
          workplace_organisation_id: null,
          position_code: 'consultant',
          position_other: null,
          profession_code: 'medicine',
          specialty_code: null,
          specialty_other: null,
          department_text: null,
          biography: null,
          expertise_codes: null,
          presentation_languages: null,
          speaker_discovery_opt_in: false,
          speaker_discovery_opt_in_at: null,
        }}
        initialLicences={[{ ...existingLicences[0], status: 'lapsed' }]}
        activeBodies={activeBodies}
      />,
    );
    expect(screen.queryByText(/profile and licences are in place/i)).not.toBeInTheDocument();
    expect(screen.getByText(/at least one active licence declared/i)).toBeInTheDocument();
  });

  it('disables the body picker + surfaces the "no bodies available" placeholder when the active list is empty', () => {
    render(
      <ProfileClient
        initialProfile={null}
        initialLicences={[]}
        activeBodies={[]}
      />,
    );
    const select = screen.getByLabelText(/accrediting body/i) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(screen.getByText(/no bodies available/i)).toBeInTheDocument();
  });
});

// Change email section moved to /account (AccountClient) after the user-lens
// BLOCKER 1 finding — attendees look for account controls on /account, not on
// /account/profile (professional profile). Tests for it live in
// AccountClient.test.tsx now.
