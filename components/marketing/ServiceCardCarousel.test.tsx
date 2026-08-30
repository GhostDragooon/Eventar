/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ServiceCardCarousel } from './ServiceCardCarousel';

afterEach(cleanup);

const cards = [
  { id: 'a', icon: 'event', title: 'Run events', description: 'For organisers.', action: { label: 'Get started', href: '/events/new' } },
  { id: 'b', icon: 'badge', title: 'Track credit', description: 'For practitioners.', action: { label: 'Learn more', href: '/#platform' } },
];

describe('ServiceCardCarousel', () => {
  it('advances between cards', () => {
    render(<ServiceCardCarousel cards={cards} />);
    expect(screen.getByRole('heading', { name: 'Run events' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next service' }));
    expect(screen.getByRole('heading', { name: 'Track credit' })).toBeInTheDocument();
  });
});
