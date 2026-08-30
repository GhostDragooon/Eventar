/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BrandFooter } from './BrandFooter';

afterEach(cleanup);

describe('BrandFooter', () => {
  it('renders link groups and legal links', () => {
    render(
      <BrandFooter
        description="CPD infrastructure for Hong Kong."
        groups={[{ label: 'Product', links: [{ label: 'Events', href: '/events' }] }]}
        legal={[{ label: 'Privacy', href: '/privacy' }]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Events' })).toHaveAttribute('href', '/events');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  });
});
