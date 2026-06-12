import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, it, expect } from 'vitest';
import { surveyInputSchema } from './schema';

describe('surveyInputSchema', () => {
  it('accepts a fully-filled valid response', () => {
    const r = surveyInputSchema.safeParse({
      session_format: 'scientific_presentations',
      valuable_session: '11111111-2222-4333-8444-555555555555',
      value_proposition: 'clinical_application',
      expectations: 'exceeded',
      future_preferences: ['expanded_qa', 'subspecialty_topics'],
    });
    expect(r.success).toBe(true);
  });

  it('accepts a fully-empty response (all fields optional)', () => {
    const r = surveyInputSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.future_preferences).toEqual([]);
  });

  it('accepts the event_format value_proposition slug (4th option)', () => {
    expect(surveyInputSchema.safeParse({ value_proposition: 'event_format' }).success).toBe(true);
  });

  it('rejects an unknown value_proposition slug', () => {
    expect(surveyInputSchema.safeParse({ value_proposition: 'banana' }).success).toBe(false);
  });

  it('rejects an unknown session_format slug', () => {
    expect(surveyInputSchema.safeParse({ session_format: 'banana' }).success).toBe(false);
  });

  it('rejects an unknown expectations slug', () => {
    expect(surveyInputSchema.safeParse({ expectations: 'meh' }).success).toBe(false);
  });

  it('rejects a future_preferences slug outside the template set', () => {
    expect(surveyInputSchema.safeParse({ future_preferences: ['expanded_qa', 'nope'] }).success).toBe(false);
  });

  it('accepts a uuid valuable_session (agenda block id)', () => {
    const r = surveyInputSchema.safeParse({ valuable_session: '11111111-2222-4333-8444-555555555555' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.valuable_session).toBe('11111111-2222-4333-8444-555555555555');
  });

  it("accepts the 'general' valuable_session sentinel (General sessions / overall)", () => {
    const r = surveyInputSchema.safeParse({ valuable_session: 'general' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.valuable_session).toBe('general');
  });

  it('accepts an omitted valuable_session (question optional)', () => {
    const r = surveyInputSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.valuable_session).toBeUndefined();
  });

  it('rejects a valuable_session that is neither a uuid nor general', () => {
    expect(surveyInputSchema.safeParse({ valuable_session: 'banana' }).success).toBe(false);
    expect(surveyInputSchema.safeParse({ valuable_session: 'Dr. Lee on biomarkers' }).success).toBe(false);
    expect(surveyInputSchema.safeParse({ valuable_session: '' }).success).toBe(false);
  });
});
