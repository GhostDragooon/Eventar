/** @vitest-environment jsdom */
import { vi } from 'vitest';

// Spec 001 FR-005: the wizard's last step ("Done") hands the visitor on to the
// destination the page gave it, defaulting to the portal home. Only the hand-off
// is under test here; the actions are stubbed because nothing submits.
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock('../actions', () => ({
  declareMyLicence: vi.fn(),
  updateMyAccount: vi.fn(),
  updateMyProfessionalProfile: vi.fn(),
  uploadAvatar: vi.fn(),
}));
vi.mock('./actions', () => ({ acceptRequiredConsents: vi.fn() }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CompleteClient } from './CompleteClient';

beforeEach(() => push.mockReset());
afterEach(cleanup);

const account = {
  id: 'u1',
  full_name: 'Alice Wong',
  first_name: 'Alice',
  last_name: 'Wong',
  salutation: null,
  preferred_name: null,
  phone: null,
  phone_country_code: null,
  country_code: null,
  display_language: 'en',
  locale: 'en',
  timezone: 'Asia/Hong_Kong',
};
const licence = {
  id: 'l1',
  body_id: 'b1',
  body_short_name: 'HKCP',
  licence_number: 'M12345',
  licence_type: null,
  track: null,
  status: 'declared' as const,
  is_primary: true,
  declared_at: '2026-10-24T00:00:00Z',
  verified_at: null,
  cycle_started_on: null,
};

function atLicenceStep(next?: string, licences = [licence]) {
  render(
    <CompleteClient
      initialStep={4}
      initialAccount={account}
      initialProfile={null}
      initialLicences={licences}
      activeBodies={[]}
      professions={[]}
      positions={[]}
      specialties={[]}
      next={next}
    />,
  );
}

describe('CompleteClient — where "Done" goes', () => {
  it('lands on the destination the page carried through the wizard', () => {
    atLicenceStep('/account/claim');
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(push).toHaveBeenCalledExactlyOnceWith('/account/claim');
  });

  it('defaults to the portal home (/account/record) when there is no destination', () => {
    atLicenceStep(undefined);
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(push).toHaveBeenCalledExactlyOnceWith('/account/record');
  });

  it('does not let a visitor finish without a licence, destination or not', () => {
    atLicenceStep('/account/claim', []);
    const done = screen.getByRole('button', { name: /^done$/i });
    expect(done).toBeDisabled();
    fireEvent.click(done);
    expect(push).not.toHaveBeenCalled();
  });
});
