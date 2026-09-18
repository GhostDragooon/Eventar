/** @vitest-environment jsdom */
// RecordClient is pure presentational (props in, no Server Actions called
// from the client) — unlike AccountClient.test.tsx / ProfileClient.test.tsx
// it needs no vi.mock('../actions', ...) shim.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RecordClient } from './RecordClient';
import type { AttendanceRecordView, CreditRecordView } from '../schema';

afterEach(cleanup);

function attendanceRow(overrides: Partial<AttendanceRecordView> = {}): AttendanceRecordView {
  return {
    registration_id: 'reg-1',
    event_id: 'event-1',
    event_title: 'HK Cardiology Update 2026',
    event_start: '2026-08-15T01:00:00.000Z',
    event_timezone: 'Asia/Hong_Kong',
    status: 'attended',
    check_in_at: '2026-08-15T01:05:00.000Z',
    check_in_method: 'qr',
    source: 'self_registration',
    has_credit: false,
    ...overrides,
  };
}

function creditRow(overrides: Partial<CreditRecordView> = {}): CreditRecordView {
  return {
    id: 'ledger-1',
    event_id: 'event-1',
    event_title: 'HK Cardiology Update 2026',
    body_id: 'body-1',
    body_short_name: 'HKCP',
    entry_type: 'credit_earned',
    points: 2,
    hours: 1.5,
    category: null,
    effective_date: '2026-08-15',
    attestation_status: 'organiser_attested',
    created_at: '2026-08-15T02:00:00.000Z',
    ...overrides,
  };
}

describe('RecordClient — empty states', () => {
  it('shows the honest empty-state copy for both sections when there is nothing to show', () => {
    render(<RecordClient attendance={[]} credits={[]} />);
    expect(screen.getByText(/no linked events yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no points on your eventar record yet/i)).toBeInTheDocument();
  });
});

describe('RecordClient — attendance section', () => {
  it('renders an attended row with a net-active credit as "On record", not the attended-status colour', () => {
    render(<RecordClient attendance={[attendanceRow({ has_credit: true })]} credits={[]} />);
    expect(screen.getByText('HK Cardiology Update 2026')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /credit: on record/i })).toBeInTheDocument();
  });

  it('renders an attended row with no active credit as "Not yet on record" — never success-green (spec §7)', () => {
    render(<RecordClient attendance={[attendanceRow({ has_credit: false })]} credits={[]} />);
    expect(screen.getByRole('status', { name: /credit: not yet on record/i })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /credit: on record/i })).not.toBeInTheDocument();
  });

  it('renders "Couldn\'t check" (not a confident "Not yet on record") when the ledger read failed', () => {
    render(<RecordClient attendance={[attendanceRow({ has_credit: null })]} credits={[]} />);
    expect(screen.getByRole('status', { name: /credit: couldn.t check right now/i })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /credit: not yet on record/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /credit: on record/i })).not.toBeInTheDocument();
  });

  it('falls back to "Event removed" when the admin event lookup found nothing', () => {
    render(
      <RecordClient
        attendance={[attendanceRow({ event_title: null, event_start: null, event_timezone: null })]}
        credits={[]}
      />,
    );
    expect(screen.getByText('Event removed')).toBeInTheDocument();
  });

  it('does not show a credit chip on a merely-registered (not yet attended) row', () => {
    render(
      <RecordClient
        attendance={[attendanceRow({ status: 'registered', check_in_at: null, check_in_method: null })]}
        credits={[]}
      />,
    );
    expect(screen.queryByRole('status', { name: /credit:/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: /status: registered/i })).toBeInTheDocument();
  });
});

describe('RecordClient — CPD points section', () => {
  it('renders points, hours, entry type, and attestation for an earned row', () => {
    render(<RecordClient attendance={[]} credits={[creditRow()]} />);
    expect(screen.getByText('HKCP')).toBeInTheDocument();
    expect(screen.getByText('2 pts · 1.5 hrs')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /entry: earned/i })).toBeInTheDocument();
    expect(screen.getByText('Organiser-attested')).toBeInTheDocument();
  });

  it('formats effective_date as "DD Mon YYYY", matching the Attendance section — not raw ISO (user-lens 2026-09-19)', () => {
    render(<RecordClient attendance={[]} credits={[creditRow({ effective_date: '2026-08-15' })]} />);
    expect(screen.getByText('15 Aug 2026')).toBeInTheDocument();
    expect(screen.queryByText('2026-08-15')).not.toBeInTheDocument();
  });

  it('empty CPD-points state links to /account/profile, matching the Attendance empty state\'s link parity (user-lens 2026-09-19)', () => {
    render(<RecordClient attendance={[]} credits={[]} />);
    expect(screen.getByRole('link', { name: 'profile and licence' })).toHaveAttribute('href', '/account/profile');
  });

  it('renders a revoked entry distinctly from an earned one', () => {
    render(
      <RecordClient
        attendance={[]}
        credits={[creditRow({ id: 'ledger-2', entry_type: 'credit_revoked', attestation_status: null })]}
      />,
    );
    expect(screen.getByRole('status', { name: /entry: revoked/i })).toBeInTheDocument();
  });
});
