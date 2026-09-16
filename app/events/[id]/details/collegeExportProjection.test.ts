import { describe, expect, it } from 'vitest';
import { projectCreditLedgerRow, COLLEGE_EXPORT_HEADER, type CollegeExportLookups } from './collegeExportProjection';

const EVENT = { id: 'event-1', title: 'ICI Summit 2026', start_time: '2026-11-01T01:00:00Z', end_time: '2026-11-02T09:00:00Z' };
const GENERATED_AT = '2026-11-05T00:00:00Z';

function baseLookups(overrides: Partial<CollegeExportLookups> = {}): CollegeExportLookups {
  return {
    userById: new Map([['user-1', { full_name: 'Dr Chan', salutation: 'Dr' }]]),
    profileByUserId: new Map(),
    licenceById: new Map([['lic-1', { licence_number: 'HKCP-001', status: 'verified' }]]),
    bodyById: new Map([['body-1', { short_name: 'HKCP', full_name: 'HK College of Pathologists' }]]),
    regByUserId: new Map([['user-1', { registration_code: 'WK-ABC123' }]]),
    evidenceByUserId: new Map([['user-1', { evidence_type: 'check_in', attestation_strength: 'standard', captured_at: '2026-11-01T02:00:00Z' }]]),
    professionLabelByCode: new Map([['medicine', 'Medicine'], ['other', 'Other']]),
    positionLabelByCode: new Map([['staff_nurse', 'Staff Nurse'], ['other', 'Other']]),
    specialtyLabelByCode: new Map([['cardiac_cardiovascular', 'Cardiology / Cardiovascular Medicine'], ['other', 'Other']]),
    ...overrides,
  };
}

const LEDGER_ROW = {
  id: 'ledger-1', chain_seq: 42, user_id: 'user-1', licence_id: 'lic-1', body_id: 'body-1',
  category: 'A', points: 6, hours: null, attestation_status: 'attendance_verified',
};

describe('projectCreditLedgerRow', () => {
  it('header and row have the same column count', () => {
    const row = projectCreditLedgerRow(LEDGER_ROW, EVENT, GENERATED_AT, baseLookups());
    expect(row).toHaveLength(COLLEGE_EXPORT_HEADER.length);
  });

  it('a clean row resolves seeded codes to human labels', () => {
    const lookups = baseLookups({
      profileByUserId: new Map([['user-1', {
        workplace_text: 'Queen Mary Hospital', profession_code: 'medicine', position_code: 'staff_nurse', position_other: null,
        specialty_code: 'cardiac_cardiovascular', specialty_other: null,
      }]]),
    });
    const row = projectCreditLedgerRow(LEDGER_ROW, EVENT, GENERATED_AT, lookups);
    expect(row[3]).toBe('Medicine'); // Profession
    expect(row[4]).toBe('Cardiology / Cardiovascular Medicine'); // Specialty
    expect(row[5]).toBe('Staff Nurse'); // Position
  });

  // The bug this test exists to pin down: `code === 'other'` is a real,
  // truthy, seeded value — a naive `code || freeText` fallback always picks
  // the code and silently drops the free-text override on exactly the path
  // it exists for. Regression test for that defect.
  it("specialty_code/position_code = 'other' (a real seeded code, not absent) falls through to the free-text field, not the word 'other'", () => {
    const lookups = baseLookups({
      profileByUserId: new Map([['user-1', {
        workplace_text: 'Dry Run Clinic', profession_code: 'nursing', position_code: 'other', position_other: 'Ward clerk',
        specialty_code: 'other', specialty_other: 'Wound Care (not listed)',
      }]]),
    });
    const row = projectCreditLedgerRow(LEDGER_ROW, EVENT, GENERATED_AT, lookups);
    expect(row[4]).toBe('Wound Care (not listed)'); // Specialty — NOT the literal string "other"
    expect(row[5]).toBe('Ward clerk'); // Position — NOT the literal string "other"
  });

  it('profession_code has no free-text override column, so "other" resolves to its own honest label', () => {
    const lookups = baseLookups({
      profileByUserId: new Map([['user-1', {
        workplace_text: null, profession_code: 'other', position_code: null, position_other: null,
        specialty_code: null, specialty_other: null,
      }]]),
    });
    const row = projectCreditLedgerRow(LEDGER_ROW, EVENT, GENERATED_AT, lookups);
    expect(row[3]).toBe('Other');
  });

  it('an unrecognised code with no label falls back to the raw code rather than going blank', () => {
    const lookups = baseLookups({
      profileByUserId: new Map([['user-1', {
        workplace_text: null, profession_code: 'zoology', position_code: null, position_other: null,
        specialty_code: null, specialty_other: null,
      }]]),
    });
    const row = projectCreditLedgerRow(LEDGER_ROW, EVENT, GENERATED_AT, lookups);
    expect(row[3]).toBe('zoology');
  });

  it('a missing registration/profile/evidence degrades to blank cells, not a throw', () => {
    const lookups = baseLookups({ regByUserId: new Map(), evidenceByUserId: new Map() });
    const row = projectCreditLedgerRow(LEDGER_ROW, EVENT, GENERATED_AT, lookups);
    expect(row[0]).toBe(''); // Registration Code
    expect(row[21]).toBe(''); // Evidence Captured At
  });

  it('stamps the Generated At column so two exports of the same frozen ledger row are distinguishable', () => {
    const row = projectCreditLedgerRow(LEDGER_ROW, EVENT, GENERATED_AT, baseLookups());
    expect(row[row.length - 1]).toBe(GENERATED_AT);
  });
});
