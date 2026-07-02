/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FeedbackSection } from './FeedbackSection';

afterEach(cleanup);

const baseProps = {
  eventId: 'e1',
  responseCount: 0,
  attended: 0,
  leadingSession: null,
  endTime: '2026-06-15T12:00:00Z',
  timezone: 'UTC',
};

describe('FeedbackSection — G1 leading-session readout', () => {
  it('renders the named session title when leadingSession.kind="block"', () => {
    const { getByText } = render(
      <FeedbackSection
        {...baseProps}
        lifecycle="completed"
        responseCount={12}
        attended={20}
        leadingSession={{ kind: 'block', id: 'b1', title: 'Hands-on lab on ECG basics' }}
      />,
    );
    expect(getByText('Leading session')).toBeInTheDocument();
    expect(getByText('Hands-on lab on ECG basics')).toBeInTheDocument();
  });

  it('renders the "General sessions / overall" copy when kind="overall"', () => {
    const { getByText } = render(
      <FeedbackSection
        {...baseProps}
        lifecycle="completed"
        responseCount={5}
        attended={10}
        leadingSession={{ kind: 'overall' }}
      />,
    );
    expect(getByText('General sessions / overall')).toBeInTheDocument();
  });

  it('omits the Leading session row when leadingSession is null', () => {
    const { queryByText } = render(
      <FeedbackSection {...baseProps} lifecycle="completed" responseCount={0} attended={3} />,
    );
    expect(queryByText('Leading session')).toBeNull();
  });
});

describe('FeedbackSection — pending one-line stub', () => {
  it('collapses to "opens HH:MM · 10 min after wrap" before the event completes', () => {
    const { getByText, queryByText } = render(
      <FeedbackSection {...baseProps} lifecycle="live" leadingSession={{ kind: 'overall' }} />,
    );
    // 12:00Z end + 10 min = 12:10 UTC
    expect(getByText(/opens 12:10/)).toBeInTheDocument();
    expect(getByText(/10 min after wrap/)).toBeInTheDocument();
    expect(queryByText('Leading session')).toBeNull();
    expect(queryByText('Response rate')).toBeNull();
  });

  it('shows the full card with response rate once completed', () => {
    const { getByText, getAllByText } = render(
      <FeedbackSection {...baseProps} lifecycle="completed" responseCount={5} attended={10} />,
    );
    expect(getByText('Response rate')).toBeInTheDocument();
    // Appears in both the section meta ("5 of 10 responded") and the stat body.
    expect(getAllByText(/5 of 10/).length).toBeGreaterThanOrEqual(1);
  });
});
