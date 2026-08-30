/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CategorisedFaq } from './CategorisedFaq';

afterEach(cleanup);

const categories = [
  { id: 'general', label: 'General', items: [{ id: 'a', question: 'What is CPD?', answer: 'Answer.' }] },
  { id: 'billing', label: 'Billing', items: [] },
];

describe('CategorisedFaq', () => {
  it('switches categories and shows the empty state for one with no items', () => {
    render(<CategorisedFaq categories={categories} />);
    expect(screen.getByRole('button', { name: 'What is CPD?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Billing' }));
    expect(screen.getByText('No help articles are available in this category.')).toBeInTheDocument();
  });
});
