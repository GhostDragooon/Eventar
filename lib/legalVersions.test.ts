import { describe, it, expect } from 'vitest';
import { LEGAL_VERSIONS, CONSENT_TYPES } from './legalVersions';

describe('legalVersions', () => {
  it('pins a stable identifier per required consent type', () => {
    expect(LEGAL_VERSIONS.terms_of_service).toBe('tos-0.1-draft');
    expect(LEGAL_VERSIONS.privacy_policy).toBe('pp-0.2-draft');
  });
  it('CONSENT_TYPES matches the DB check-constraint subset used at signup', () => {
    expect(CONSENT_TYPES).toEqual(['terms_of_service', 'privacy_policy']);
  });
});
