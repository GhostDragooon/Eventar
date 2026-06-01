/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { AggregateRegistrationTile } from './AggregateRegistrationTile';

describe('AggregateRegistrationTile', () => {
  it('renders empty state when no upcoming events', () => {
    // U-LIVE #1: prior version showed "0 across upcoming events" even when
    // there ARE no upcoming events to count across — misleading metric.
    const { getByText, queryByText } = render(
      <AggregateRegistrationTile total={0} upcomingCount={0} />,
    );
    expect(getByText('—')).toBeInTheDocument();
    expect(getByText('No upcoming events')).toBeInTheDocument();
    expect(queryByText(/across .* upcoming/i)).toBeNull();
  });

  it('renders singular "1 upcoming event" without trailing s', () => {
    const { getByText } = render(<AggregateRegistrationTile total={3} upcomingCount={1} />);
    expect(getByText('3')).toBeInTheDocument();
    expect(getByText('across 1 upcoming event')).toBeInTheDocument();
  });

  it('renders plural "N upcoming events" with trailing s', () => {
    const { getByText } = render(<AggregateRegistrationTile total={42} upcomingCount={5} />);
    expect(getByText('42')).toBeInTheDocument();
    expect(getByText('across 5 upcoming events')).toBeInTheDocument();
  });
});
