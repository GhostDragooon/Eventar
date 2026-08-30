/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FeatureShowcase } from './FeatureShowcase';

afterEach(cleanup);

describe('FeatureShowcase', () => {
  it('renders the title, features, and CTA link', () => {
    render(
      <FeatureShowcase
        eyebrow="New"
        title="Accreditation, made legible"
        description="Every listing shows its points before you register."
        features={[{ id: 'a', label: 'Verified bodies' }]}
        action={{ label: 'Browse events', href: '/events' }}
        visual={<div>Visual</div>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Accreditation, made legible' })).toBeInTheDocument();
    expect(screen.getByText('Verified bodies')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse events' })).toHaveAttribute('href', '/events');
  });
});
