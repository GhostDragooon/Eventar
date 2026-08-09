import { describe, expect, it } from 'vitest';
import { summariseDelivery, type DeliveryLogRow } from './deliveryStatus';

const reg = (id: string, full_name = 'Alice Chan') => ({ id, full_name });

function rows(...specs: Array<[string, DeliveryLogRow['status']]>): DeliveryLogRow[] {
  return specs.map(([registration_id, status]) => ({ registration_id, purpose: 'reminder', status }));
}

describe('summariseDelivery', () => {
  it('reports a recipient with a sent row as delivered', () => {
    const out = summariseDelivery([reg('r1')], rows(['r1', 'sent']), 'reminder');
    expect(out[0]).toMatchObject({ registrationId: 'r1', state: 'sent' });
  });

  // The whole point of the panel: an organiser must be able to see who has
  // nothing, because that person cannot check in with a QR pass.
  it('reports a recipient with no row at all as not yet sent', () => {
    const out = summariseDelivery([reg('r1')], [], 'reminder');
    expect(out[0].state).toBe('not_sent');
  });

  it('reports a single failure as still retrying', () => {
    const out = summariseDelivery([reg('r1')], rows(['r1', 'failed']), 'reminder');
    expect(out[0]).toMatchObject({ state: 'retrying', attempts: 1 });
  });

  // Matches MAX_SEND_ATTEMPTS in the send core. This is the state that was
  // previously invisible everywhere — the scheduler gives up and nobody is told.
  it('reports three failures as given up, because the scheduler will not try again', () => {
    const out = summariseDelivery([reg('r1')], rows(['r1', 'failed'], ['r1', 'failed'], ['r1', 'failed']), 'reminder');
    expect(out[0]).toMatchObject({ state: 'gave_up', attempts: 3 });
  });

  // A delivered email outranks earlier failures: the retries worked.
  it('prefers a later success over earlier failures', () => {
    const out = summariseDelivery([reg('r1')], rows(['r1', 'failed'], ['r1', 'failed'], ['r1', 'sent']), 'reminder');
    expect(out[0].state).toBe('sent');
  });

  // A queued row is terminal under email_log_dedup_idx — it will never become
  // 'sent' on its own, so it must not read as success.
  it('reports a stalled queued row as logged but not emailed', () => {
    const out = summariseDelivery([reg('r1')], rows(['r1', 'queued']), 'reminder');
    expect(out[0].state).toBe('logged_not_emailed');
  });

  it('ignores rows belonging to a different purpose', () => {
    const survey: DeliveryLogRow[] = [{ registration_id: 'r1', purpose: 'survey', status: 'sent' }];
    const out = summariseDelivery([reg('r1')], survey, 'reminder');
    expect(out[0].state).toBe('not_sent');
  });

  it('keeps a row for every registration, in the order given', () => {
    const out = summariseDelivery([reg('r1', 'Alice'), reg('r2', 'Bob')], rows(['r2', 'sent']), 'reminder');
    expect(out.map((o) => o.registrationId)).toEqual(['r1', 'r2']);
    expect(out.map((o) => o.state)).toEqual(['not_sent', 'sent']);
  });

  it('counts how many need the organiser to act', () => {
    const out = summariseDelivery(
      [reg('r1'), reg('r2'), reg('r3')],
      rows(['r1', 'sent'], ['r2', 'failed'], ['r2', 'failed'], ['r2', 'failed']),
      'reminder',
    );
    expect(out.filter((o) => o.needsAttention).map((o) => o.registrationId)).toEqual(['r2', 'r3']);
  });
});
