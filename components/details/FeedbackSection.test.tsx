/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FeedbackSection } from './FeedbackSection';

afterEach(cleanup);

const baseProps = {
  eventId: 'e1',
  responseCount: 0,
  attended: 0,
  state: 'locked' as const,
  leadingSession: null,
};

describe('FeedbackSection — G1 leading-session readout', () => {
  it('renders the named session title when leadingSession.kind="block"', () => {
    const { getByText } = render(
      <FeedbackSection
        {...baseProps}
        lifecycle="completed"
        state="active"
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
        state="active"
        responseCount={5}
        attended={10}
        leadingSession={{ kind: 'overall' }}
      />,
    );
    expect(getByText('General sessions / overall')).toBeInTheDocument();
  });

  it('omits the Leading session row when leadingSession is null', () => {
    const { queryByText } = render(
      <FeedbackSection
        {...baseProps}
        lifecycle="completed"
        state="active"
        responseCount={0}
        attended={3}
        leadingSession={null}
      />,
    );
    expect(queryByText('Leading session')).toBeNull();
  });

  it('does NOT render any feedback stats before the event completes', () => {
    const { queryByText, getByText } = render(
      <FeedbackSection
        {...baseProps}
        lifecycle="live"
        state="locked"
        leadingSession={{ kind: 'overall' }}
      />,
    );
    expect(getByText('Survey opens 10 minutes after event ends.')).toBeInTheDocument();
    expect(queryByText('Leading session')).toBeNull();
    expect(queryByText('Response rate')).toBeNull();
  });
});

describe('FeedbackSection — section-state ladder', () => {
  it('active state paints the accent ring on completed', () => {
    const { container } = render(
      <FeedbackSection {...baseProps} lifecycle="completed" state="active" />,
    );
    const section = container.querySelector('section');
    expect(section?.className).toContain('border-primary');
  });

  it('locked state dims the card', () => {
    const { container } = render(
      <FeedbackSection {...baseProps} lifecycle="live" state="locked" />,
    );
    const section = container.querySelector('section');
    expect(section?.className).toContain('opacity-60');
  });
});
