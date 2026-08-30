/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FileSubmissionStatus } from './FileSubmissionStatus';

afterEach(cleanup);

describe('FileSubmissionStatus', () => {
  it('renders rejected as an alert', () => {
    render(<FileSubmissionStatus state="rejected" message="File too large." />);
    expect(screen.getByRole('alert')).toHaveTextContent('File too large.');
  });

  it('renders accepted as a status region', () => {
    render(<FileSubmissionStatus state="accepted" />);
    expect(screen.getByRole('status')).toHaveTextContent('Accepted');
  });
});
