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

  it('defaults to the portal home (/account/registrations) when there is no destination', () => {
    atLicenceStep(undefined);
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(push).toHaveBeenCalledExactlyOnceWith('/account/registrations');
  });

  it('does not let a visitor finish without a licence, destination or not', () => {
    atLicenceStep('/account/claim', []);
    const done = screen.getByRole('button', { name: /^done$/i });
    expect(done).toBeDisabled();
    fireEvent.click(done);
    expect(push).not.toHaveBeenCalled();
  });
});

// Every attendee page sends an incomplete account here (Registrations, Check-in, History, Account, Claim, Profile),
// with no reason on the way, so this lead is the only place that can say what happened and what is next. The
// registrations are saved ("any": a brand-new account has none, and the page does not know); finishing puts them under Registrations, and History is where past events go.
describe('CompleteClient — the lead explains the redirect', () => {
  const LEAD =
    'Any registrations you have made are saved. Finish this and you will see them under Registrations, with your past events in History. ' +
    'It takes about two minutes, and after that registering for an event only asks about the event.';

  it.each([1, 4])('step %i: says any registrations are saved (true with none too) and where they are after finishing', (step) => {
    render(
      <CompleteClient
        initialStep={step as 1 | 4}
        initialAccount={account}
        initialProfile={null}
        initialLicences={[licence]}
        activeBodies={[]}
        professions={[]}
        positions={[]}
        specialties={[]}
      />,
    );
    expect(screen.getByText(LEAD)).toBeTruthy();
    expect(screen.queryByText(/aren.t accessible/)).toBeNull();
  });
});
