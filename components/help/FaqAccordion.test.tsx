/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FaqAccordion } from './FaqAccordion';

afterEach(cleanup);

const items = [
  { id: 'a', question: 'What is CPD?', answer: 'Continuing professional development.' },
  { id: 'b', question: 'How do I register?', answer: 'Use the event page.' },
];

describe('FaqAccordion', () => {
  it('allows multiple answers open at once', () => {
    render(<FaqAccordion items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'What is CPD?' }));
    fireEvent.click(screen.getByRole('button', { name: 'How do I register?' }));
    expect(screen.getByText('Continuing professional development.')).toBeVisible();
    expect(screen.getByText('Use the event page.')).toBeVisible();
  });
});
