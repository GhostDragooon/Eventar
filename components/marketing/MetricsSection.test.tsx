/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MetricsSection } from './MetricsSection';

afterEach(cleanup);

describe('MetricsSection', () => {
  it('renders each metric with its source attribution', () => {
    render(
      <MetricsSection
        title="By the numbers"
        description="Verified activity."
        metrics={[{ id: 'm1', label: 'Events accredited', displayValue: '12', description: 'Since launch.', sourceLabel: 'internal-ops', approvalVersion: 'v1' }]}
      />,
    );
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/internal-ops · v1/)).toBeInTheDocument();
  });
});
