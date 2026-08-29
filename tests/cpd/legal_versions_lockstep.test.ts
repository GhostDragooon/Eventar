// Stage D / follow-up 2 — real lockstep check for consent version pins.
//
// D4 dev-lens re-review IMPORTANT 3. The F2 evaluator inside
// 20260829120000_award_attendance_credit_f1_f5_gate.sql hardcodes
// 'pp-0.2-draft' and 'tos-0.1-draft'. A comment tells future editors to
// update the migration in lockstep with lib/legalVersions.ts, but the
// migration's own self-check only re-declares the literals — it can't
// detect drift. If someone bumps lib/legalVersions.ts (e.g. after a
// lawyer edit) without also editing / re-issuing the migration, every
// CPD credit silently skips with 'missing_consents'.
//
// This test reads BOTH files and asserts every value in LEGAL_VERSIONS
// appears in the F2-gate migration body. Runs under vitest (no DB needed).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LEGAL_VERSIONS, CONSENT_TYPES } from '../../lib/legalVersions';

const F2_MIGRATION = resolve(
  __dirname,
  '../../supabase/migrations/20260829120000_award_attendance_credit_f1_f5_gate.sql',
);

describe('consent version lockstep — lib/legalVersions.ts ↔ F2 gate migration', () => {
  const migrationBody = readFileSync(F2_MIGRATION, 'utf8');

  for (const consentType of CONSENT_TYPES) {
    const version = LEGAL_VERSIONS[consentType];
    it(`${consentType}: current version "${version}" appears in the F2 gate migration`, () => {
      // Both the consent_type literal and its version literal must appear
      // in the migration body. If lib/legalVersions.ts changes without a
      // matching migration edit, this test fires the loudest signal we can.
      expect(migrationBody).toContain(`'${consentType}'`);
      expect(migrationBody).toContain(`'${version}'`);
    });
  }

  it('migration also references BOTH consent types by name in the F2 count clause', () => {
    // Defensive: the F2 check counts distinct consent_types and requires
    // both to be present. If a future migration edit accidentally drops
    // one type, this catches it before hitting production.
    for (const consentType of CONSENT_TYPES) {
      const pattern = new RegExp(`consent_type\\s*=\\s*'${consentType}'`);
      expect(migrationBody).toMatch(pattern);
    }
  });
});
