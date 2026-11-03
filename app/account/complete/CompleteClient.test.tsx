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

// S2-5: a disabled Continue must say which field is missing, and required
// fields must be marked.
function atStep(step: number, profile: Record<string, string | null> = {}) {
  render(
    <CompleteClient
      initialStep={step}
      initialAccount={{ ...account, phone: '+852 1234' }}
      initialProfile={{
        profession_code: 'medicine',
        specialty_code: null,
        specialty_other: 'Cardiology',
        position_code: 'consultant',
        position_other: null,
        workplace_text: 'QMH',
        department_text: null,
        ...profile,
      } as never}
      initialLicences={[]}
      activeBodies={[]}
      professions={[{ code: 'medicine', label_en: 'Medicine' }]}
      positions={[{ code: 'consultant', label_en: 'Consultant' }]}
      specialties={[]}
    />,
  );
}

describe('CompleteClient — why Continue is disabled', () => {
  it('names the missing department next to the disabled Professional Continue', () => {
    atStep(3);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByText('Add your department to continue.')).toBeInTheDocument();
  });

  it('lists several missing fields and clears the hint once complete', () => {
    atStep(3, { workplace_text: null });
    expect(screen.getByText('Add your workplace and department to continue.')).toBeInTheDocument();
    cleanup();
    atStep(3, { department_text: 'Cardiology' });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(screen.queryByText(/to continue\./)).not.toBeInTheDocument();
  });

  it('marks required Professional fields', () => {
    atStep(3);
    expect(screen.getByText('Department').parentElement?.querySelector('[aria-label="required"]')).not.toBeNull();
  });

  it('names the missing Identity field', () => {
    render(
      <CompleteClient
        initialStep={2}
        initialAccount={account}
        initialProfile={null}
        initialLicences={[]}
        activeBodies={[]}
        professions={[]}
        positions={[]}
        specialties={[]}
      />,
    );
    expect(screen.getByText('Add your phone to continue.')).toBeInTheDocument();
  });

  it('says what Declare licence and Done are waiting for on the Licence step', () => {
    atLicenceStep(undefined, []);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    expect(screen.getByText('Declare a licence to finish.')).toBeInTheDocument();
    expect(screen.getByText('Choose an accrediting body and add your licence number to declare.')).toBeInTheDocument();
  });
});
