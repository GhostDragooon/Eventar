/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { EmailDeliveryStrip, type EmailDeliveryRow } from './EmailDeliveryStrip';

afterEach(cleanup);

// Helper — {purpose, status} tuples for aggregate assertions.
const row = (purpose: string, status: EmailDeliveryRow['status']): EmailDeliveryRow => ({
  purpose,
  status,
});

// Row lookup by rowheader (the purpose column), then column position. Reads as
// what an operator would visually scan — the row for the purpose, in the
// column for the status.
function cellValue(purposeLabel: string, columnIndex: number): string | null {
  const rowEl = screen.getByRole('rowheader', { name: purposeLabel }).closest('tr');
  if (!rowEl) return null;
  return within(rowEl).getAllByRole('cell')[columnIndex]?.textContent ?? null;
}

describe('EmailDeliveryStrip', () => {
  it('aggregates rows into the purpose × status matrix', () => {
    render(
      <EmailDeliveryStrip
        rows={[
          row('confirmation', 'sent'),
          row('confirmation', 'sent'),
          row('confirmation', 'failed'),
          row('reminder', 'queued'),
          row('reminder', 'sent'),
          row('survey', 'sent'),
        ]}
        deliveryLive
      />,
    );

    // Column order is sent | failed | queued (labelled "stalled"). gaveUp
    // used to have a fourth column here — dropped 2026-08-28 because raw
    // email_log has no gave-up state; that's per-recipient scheduler state
    // on PassDeliveryPanel.
    expect(cellValue('Confirmation', 0)).toBe('2');
    expect(cellValue('Confirmation', 1)).toBe('1');
    expect(cellValue('Reminder + pass', 0)).toBe('1');
    expect(cellValue('Reminder + pass', 2)).toBe('1');
    expect(cellValue('Survey invite', 0)).toBe('1');
  });

  it('renders zeros for a purpose with no rows without dropping the row', () => {
    render(<EmailDeliveryStrip rows={[row('confirmation', 'sent')]} deliveryLive />);
    // The survey row must still appear — an absent row would read as "there
    // are no survey invites to worry about" rather than "we have not sent any
    // yet". Same audience-clarity reason PassDeliveryPanel names people.
    expect(cellValue('Survey invite', 0)).toBe('0');
    expect(cellValue('Survey invite', 1)).toBe('0');
  });

  it('labels itself LIVE when the send seam is real, without the stub warning', () => {
    render(<EmailDeliveryStrip rows={[]} deliveryLive />);
    expect(screen.getByText(/^live$/i)).toBeTruthy();
    expect(screen.queryByText(/RESEND_API_KEY/i)).toBeNull();
  });

  it('labels itself STUBBED and names the reason when the send seam is the dev stub', () => {
    render(<EmailDeliveryStrip rows={[row('confirmation', 'queued')]} deliveryLive={false} />);
    expect(screen.getByText(/^stubbed$/i)).toBeTruthy();
    // Being explicit about WHY the stripes are stalled so a reviewer does not
    // read it as a delivery failure (rule 12, "fail visibly, not silently").
    expect(screen.getByText(/RESEND_API_KEY is unset/i)).toBeTruthy();
  });

  it('ignores rows for purposes the strip does not surface (harden vs schema drift)', () => {
    render(
      <EmailDeliveryStrip
        rows={[
          row('confirmation', 'sent'),
          row('unknown_new_purpose', 'sent'),
        ]}
        deliveryLive
      />,
    );
    // Still renders the confirmation count; the unknown row is silently
    // dropped (kept out of the visible matrix but not thrown on). A future
    // purpose is a schema decision, not this strip's failure mode.
    expect(cellValue('Confirmation', 0)).toBe('1');
  });
});
