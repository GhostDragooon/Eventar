// isAccountComplete — table-driven unit test over the four required groups
// plus the all-present case. Real end-to-end coverage (does the /account
// redirect guard actually fire, does the completion flow's data really
// satisfy this) lives in the live backtest + tests/rls/, per the plan's
// Verification section — this test is scoped to the boolean composition
// logic itself, which ponytail's "non-trivial logic leaves one runnable
// check" rule asks for and which had no coverage until now.
//
// Mocking pattern matches lib/withSecurity.test.ts: mock the whole
// ./supabase/server module so the real cookies()/next-headers plumbing
// never has to run under plain vitest.

import { vi } from 'vitest';

const { mockSupabaseServer } = vi.hoisted(() => ({ mockSupabaseServer: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: mockSupabaseServer,
}));

import { describe, expect, it } from 'vitest';
import { isAccountComplete } from '@/lib/accountCompleteness';
import { LEGAL_VERSIONS } from '@/lib/legalVersions';

type Row = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  professional_profiles: Record<string, unknown> | null;
  practitioner_licences: Array<{ status: string }>;
  consent_records: Array<{ consent_type: string; version: string; withdrawn_at: string | null }>;
};

const COMPLETE_PROFILE = {
  workplace_text: 'Queen Mary Hospital',
  workplace_organisation_id: null,
  position_code: 'consultant',
  position_other: null,
  profession_code: 'medicine',
  specialty_code: 'cardiac_cardiovascular',
  specialty_other: null,
  department_text: 'Cardiology',
};

const VALID_CONSENTS = [
  { consent_type: 'terms_of_service', version: LEGAL_VERSIONS.terms_of_service, withdrawn_at: null },
  { consent_type: 'privacy_policy', version: LEGAL_VERSIONS.privacy_policy, withdrawn_at: null },
];

const COMPLETE_ROW: Row = {
  first_name: 'Alex',
  last_name: 'Chan',
  phone: '+852 9123 4567',
  professional_profiles: COMPLETE_PROFILE,
  practitioner_licences: [{ status: 'declared' }],
  consent_records: VALID_CONSENTS,
};

function mockRow(row: Row | null) {
  mockSupabaseServer.mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  });
}

describe('isAccountComplete', () => {
  it.each([
    ['missing identity (no phone)', { ...COMPLETE_ROW, phone: null }, 'identity'],
    ['missing profile (no specialty)', { ...COMPLETE_ROW, professional_profiles: { ...COMPLETE_PROFILE, specialty_code: null, specialty_other: null } }, 'profile'],
    ['missing licence (no non-terminal row)', { ...COMPLETE_ROW, practitioner_licences: [{ status: 'lapsed' }] }, 'licence'],
    ['missing consents (only one of two)', { ...COMPLETE_ROW, consent_records: [VALID_CONSENTS[0]] }, 'consents'],
  ] as const)('%s -> complete: false, %s: false', async (_label, row, failingKey) => {
    mockRow(row as unknown as Row);
    const result = await isAccountComplete('user-1', true);
    expect(result.complete).toBe(false);
    expect(result[failingKey]).toBe(false);
  });

  it('every group present -> complete: true', async () => {
    mockRow(COMPLETE_ROW);
    const result = await isAccountComplete('user-1', true);
    expect(result).toEqual({ complete: true, identity: true, profile: true, licence: true, consents: true });
  });

  it('emailConfirmed=false alone flips complete to false even with every other group satisfied', async () => {
    mockRow(COMPLETE_ROW);
    const result = await isAccountComplete('user-1', false);
    expect(result.complete).toBe(false);
    // The other four groups are unaffected — F1 is auth-tier, passed in
    // separately, not derived from this row.
    expect(result.identity).toBe(true);
    expect(result.profile).toBe(true);
    expect(result.licence).toBe(true);
    expect(result.consents).toBe(true);
  });

  it('no users row at all (defensive — should be unreachable for a signed-in caller) -> everything false', async () => {
    mockRow(null);
    const result = await isAccountComplete('user-1', true);
    expect(result).toEqual({ complete: false, identity: false, profile: false, licence: false, consents: false });
  });

  it('professional_profiles returned as an array (alternate PostgREST embed shape) is normalized the same as a single object', async () => {
    mockSupabaseServer.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { ...COMPLETE_ROW, professional_profiles: [COMPLETE_PROFILE] },
              error: null,
            }),
          }),
        }),
      }),
    });
    const result = await isAccountComplete('user-1', true);
    expect(result.profile).toBe(true);
  });
});
