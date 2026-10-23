import { describe, expect, it } from 'vitest';
import { translateCpdRpcError } from './rpcErrors';

describe('translateCpdRpcError 42501', () => {
  // The old fallback said "Only the event owner (or staff) can make this change", which is false for a
  // member who created the event (CX-05): the refusal is about the role, not ownership.
  it('the generic refusal points at the role and an organiser admin, and never claims ownership', () => {
    const msg = translateCpdRpcError({ code: '42501' });
    expect(msg).toMatch(/organiser admin/i);
    expect(msg).not.toMatch(/owner/i);
  });

  it('keeps the two specific 42501 messages', () => {
    expect(translateCpdRpcError({ code: '42501', details: 'not_authorised_for_body' })).toMatch(/accrediting body/i);
    expect(translateCpdRpcError({ code: '42501', details: 'multi_body_configured' })).toMatch(/multiple-body/i);
  });

  // Every accreditation and registration-role RPC raises 42501 with detail `not_owner` for anyone who did not
  // create the event (and is not Eventar staff). That is the one 42501 left once the role is checked up
  // front, and an organiser admin who is not the creator must not be told to ask an organiser admin
  // (review UX-03/CX-05 M2).
  it('names the real rule for not_owner: the creator or Eventar staff', () => {
    const msg = translateCpdRpcError({ code: '42501', details: 'not_owner' });
    expect(msg).toMatch(/created this event/i);
    expect(msg).toMatch(/eventar staff/i);
    expect(msg).not.toMatch(/ask an organiser admin/i);
  });

  it('keeps the generic refusal neutral: it serves registration roles as well as accreditation', () => {
    expect(translateCpdRpcError({ code: '42501' })).not.toMatch(/accreditation/i);
  });
});
