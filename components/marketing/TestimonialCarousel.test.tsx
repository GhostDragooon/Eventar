/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TestimonialCarousel } from './TestimonialCarousel';

afterEach(cleanup);

const items = [
  { id: 'a', quote: 'Great platform.', name: 'Dr. Wong', role: 'Cardiologist', approvalReference: 'ref-1' },
  { id: 'b', quote: 'Saves us hours.', name: 'Dr. Lee', role: 'Administrator', approvalReference: 'ref-2' },
];

describe('TestimonialCarousel', () => {
  it('shows a fallback message when there are no items', () => {
    render(<TestimonialCarousel items={[]} />);
    expect(screen.getByText('No approved testimonials are available.')).toBeInTheDocument();
  });

  it('advances to the next testimonial', () => {
    render(<TestimonialCarousel items={items} />);
    expect(screen.getByText('Great platform.', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Saves us hours.', { exact: false })).toBeInTheDocument();
  });
});
