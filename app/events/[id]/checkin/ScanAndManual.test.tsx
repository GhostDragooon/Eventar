/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ScanAndManual } from './ScanAndManual';

// vitest has no globals:true, so RTL does not clean up on its own.
afterEach(cleanup);

const noop = vi.fn(async () => ({ error: 'unused' }));

describe('ScanAndManual (DB-02: the desk never invites a check-in the server will refuse)', () => {
  it('both entry buttons work and no note shows when check-in is open', () => {
    render(<ScanAndManual onScanClick={() => {}} onManualSubmit={noop} closedMessage={null} />);
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /enter code/i })).toBeEnabled();
    // Always mounted so assistive tech announces the change; open, it is screen-reader-only.
    expect(screen.getByRole('status')).toHaveTextContent('Check-in is open.');
    expect(screen.getByRole('status')).toHaveClass('sr-only');
  });

  it('disables both buttons and says why when check-in is closed', () => {
    const reason = 'Check-in has not opened yet. It opens 60 minutes before the event starts.';
    render(<ScanAndManual onScanClick={() => {}} onManualSubmit={noop} closedMessage={reason} />);
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /enter code/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(reason);
    expect(screen.getByRole('status')).not.toHaveClass('sr-only');
    // The reason is wired to the controls for assistive tech, not only drawn near them.
    expect(screen.getByRole('button', { name: /scan badge/i })).toHaveAttribute('aria-describedby', 'checkin-closed-note');
  });

  it('defaults to open when no reason is passed (existing callers)', () => {
    render(<ScanAndManual onScanClick={() => {}} onManualSubmit={noop} />);
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeEnabled();
  });
});
