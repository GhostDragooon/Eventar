import { describe, expect, it } from 'vitest';
import { translateCpdRpcError } from './rpcErrors';
import { NOT_EVENT_WRITER } from '@/lib/lifecycle/eventLifecycle';

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

  // Q51 (2026-11-07): the accreditation and registration-role RPCs raise 42501 `not_owner`, and every event-owned
  // table raises 42501 `not_event_writer`, for anyone the rule excludes: a member on a colleague's event, or an
  // admin of another organisation. Both say the rule itself.
  it.each(['not_owner', 'not_event_writer'])('names the Q51 rule for %s', (details) => {
    expect(translateCpdRpcError({ code: '42501', details })).toBe(NOT_EVENT_WRITER);
  });

  it('keeps the generic refusal neutral: it serves registration roles as well as accreditation', () => {
    expect(translateCpdRpcError({ code: '42501' })).not.toMatch(/accreditation/i);
  });
});

describe('translateCpdRpcError 22023 role_locked_attended', () => {
  it('says the person has checked in, not that credits are issued for the whole event', () => {
    const msg = translateCpdRpcError({ code: '22023', details: 'role_locked_attended' });
    expect(msg).toMatch(/already checked in/i);
    expect(msg).not.toMatch(/accreditation/i);
  });
});
