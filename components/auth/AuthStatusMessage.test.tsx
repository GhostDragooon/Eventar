/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AuthStatusMessage } from './AuthStatusMessage';

afterEach(cleanup);

describe('AuthStatusMessage', () => {
  it('uses alert semantics only for an error', () => {
    const { rerender } = render(<AuthStatusMessage status={{ kind: 'error', message: 'Failed' }} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<AuthStatusMessage status={{ kind: 'success', message: 'Sent' }} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(<AuthStatusMessage status={{ kind: 'info', message: 'Note' }} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
