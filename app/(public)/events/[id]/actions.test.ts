import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, it, expect } from 'vitest';
import { registrationInputSchema } from './actions';

// Real v4 UUID (third group starts with 4, fourth with 8|9|a|b) — Zod 4's
// .uuid() validator is version-strict.
const valid = {
  event_id: '11111111-2222-4333-8444-555555555555',
  full_name: 'Ivan Lee',
  email: 'ivan@example.com',
};

describe('registrationInputSchema', () => {
  it('accepts a valid registration', () => {
    expect(registrationInputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing full_name', () => {
    const r = registrationInputSchema.safeParse({ ...valid, full_name: '' });
    expect(r.success).toBe(false);
  });

  it('rejects full_name longer than 100 chars', () => {
    const r = registrationInputSchema.safeParse({ ...valid, full_name: 'x'.repeat(101) });
    expect(r.success).toBe(false);
  });

  it('rejects malformed email', () => {
    expect(registrationInputSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
    expect(registrationInputSchema.safeParse({ ...valid, email: '@nodomain.com'  }).success).toBe(false);
    expect(registrationInputSchema.safeParse({ ...valid, email: 'no-at-sign'      }).success).toBe(false);
  });

  it('rejects non-uuid event_id', () => {
    expect(registrationInputSchema.safeParse({ ...valid, event_id: 'not-a-uuid' }).success).toBe(false);
  });

  it('trims and lowercases email so duplicate-detection works', () => {
    const r = registrationInputSchema.safeParse({ ...valid, email: '  Ivan@Example.COM  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('ivan@example.com');
  });

  it('trims full_name', () => {
    const r = registrationInputSchema.safeParse({ ...valid, full_name: '  Ivan  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.full_name).toBe('Ivan');
  });
});
