/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { InlineHelpCallout } from './InlineHelpCallout';

afterEach(cleanup);

describe('InlineHelpCallout', () => {
  it('renders the title, content, and an optional guidance link', () => {
    render(
      <InlineHelpCallout title="Prior approval" href="/help/prior-approval">
        <p>Apply before the deadline.</p>
      </InlineHelpCallout>,
    );
    expect(screen.getByText('Prior approval')).toBeInTheDocument();
    expect(screen.getByText('Apply before the deadline.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View guidance' })).toHaveAttribute('href', '/help/prior-approval');
  });
});
