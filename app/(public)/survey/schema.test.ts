import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, it, expect } from 'vitest';
import { surveyInputSchema } from './schema';

describe('surveyInputSchema', () => {
  it('accepts a fully-filled valid response', () => {
    const r = surveyInputSchema.safeParse({
      session_format: 'scientific_presentations',
      key_highlights: 'Dr. Lee on biomarkers',
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

  it('rejects an unknown session_format slug', () => {
    expect(surveyInputSchema.safeParse({ session_format: 'banana' }).success).toBe(false);
  });

  it('rejects an unknown expectations slug', () => {
    expect(surveyInputSchema.safeParse({ expectations: 'meh' }).success).toBe(false);
  });

  it('rejects a future_preferences slug outside the template set', () => {
    expect(surveyInputSchema.safeParse({ future_preferences: ['expanded_qa', 'nope'] }).success).toBe(false);
  });

  it('rejects key_highlights longer than 2000 chars', () => {
    expect(surveyInputSchema.safeParse({ key_highlights: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('trims key_highlights', () => {
    const r = surveyInputSchema.safeParse({ key_highlights: '  hi  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.key_highlights).toBe('hi');
  });
});
