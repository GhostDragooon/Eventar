// Security review 2026-08-06 — MEDIUM: registrant full_name was back on the
// anonymous /checkin/confirm GET. Commit 7c5bcbd dropped it to close Phase-8
// gate 1 (a name↔event enumeration oracle keyed on a guessable code); later
// restyle commits (224e0ff, 62e8a52) reintroduced it via the "Issued to" line,
// while CLAUDE.md / PROJECT_STATE / handoff_04062026 all still assert the gate
// is closed. This test pins full_name out of the query so a restyle cannot
// re-open it again silently — the exact regression guard the review found missing.
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

const { capture } = vi.hoisted(() => ({ capture: { regCols: '' } }));

vi.mock('@/lib/rateLimit', () => ({
  rateLimitByIp: vi.fn(async () => ({ allowed: true, remaining: 59, resetAt: new Date() })),
}));
vi.mock('@/lib/origin', () => ({ getRequestOrigin: vi.fn(async () => 'http://localhost:3000') }));
vi.mock('@/lib/checkinQr', () => ({
  buildCheckinQrPng: vi.fn(async () => ({ pngBase64: 'UE5H', filename: 'qr.png' })),
}));

// Route to an early branch (event not published) so the render path is trivial
// and no QR/format work runs — the SELECT still fires and is what we assert on.
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: () => ({
      select: (cols: string) => {
        capture.regCols = cols;
        return {
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'reg-1',
                status: 'registered',
                check_in_at: null,
                check_in_method: null,
                events: { id: 'ev-1', title: 'E', start_time: '', end_time: '', timezone: 'Asia/Hong_Kong', venue_name: 'V', status: 'draft', checkin_modes: null },
              },
              error: null,
            }),
          }),
        };
      },
    }),
  })),
}));

import { describe, it, expect } from 'vitest';
import SelfCheckinPage from './page';

describe('/checkin/confirm — PII exposure', () => {
  it('does not fetch full_name for the anonymous pass (Phase-8 gate 1)', async () => {
    await SelfCheckinPage({ searchParams: Promise.resolve({ code: 'WK-ABCDEF' }) });
    expect(capture.regCols).not.toContain('full_name');
  });
});
