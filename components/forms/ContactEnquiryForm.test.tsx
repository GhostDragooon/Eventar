/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ContactEnquiryForm } from './ContactEnquiryForm';

afterEach(cleanup);

const empty = { name: '', email: '', message: '', consent: false };

describe('ContactEnquiryForm', () => {
  it('blocks submission until all required fields and consent are set', () => {
    render(<ContactEnquiryForm initialValue={empty} onReady={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /prepare enquiry/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/complete the required fields/i);
  });

  it('calls onReady with a valid, consented value', () => {
    const onReady = vi.fn();
    const value = { name: 'Ada Wong', email: 'ada@example.com', message: 'Hello', consent: true };
    render(<ContactEnquiryForm initialValue={value} onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: /prepare enquiry/i }));
    expect(onReady).toHaveBeenCalledWith(value);
  });
});
