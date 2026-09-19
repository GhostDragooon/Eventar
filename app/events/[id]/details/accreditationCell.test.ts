import { describe, expect, it } from 'vitest';
import { deriveAccreditationCell, type AccreditationCellInput } from './accreditationCell';

const base: AccreditationCellInput = {
  wizardGroupCount: 0,
  multiBodyAccredited: false,
  singleBodyAccredited: false,
  configuredBodyShortName: null,
  cpdHours: null,
  hasConfig: false,
  creditsIssued: 0,
};

describe('deriveAccreditationCell', () => {
  it('reads Not set when nothing is configured and no credits exist', () => {
    const cell = deriveAccreditationCell(base);
    expect(cell.value).toBe('Not set');
    expect(cell.state).toBe('warn');
  });

  it('reads Unverified when a single-body config exists but the body is not authorised', () => {
    const cell = deriveAccreditationCell({ ...base, hasConfig: true });
    expect(cell.value).toBe('Unverified');
    expect(cell.state).toBe('blocked');
  });

  it('resolves a real single-body accreditation', () => {
    const cell = deriveAccreditationCell({
      ...base, hasConfig: true, singleBodyAccredited: true,
      configuredBodyShortName: 'HKCP', cpdHours: 3.5,
    });
    expect(cell.value).toBe('HKCP 3.5');
    expect(cell.state).toBe('ok');
  });

  it('resolves a real multi-body accreditation', () => {
    const cell = deriveAccreditationCell({
      ...base, wizardGroupCount: 2, multiBodyAccredited: true,
    });
    expect(cell.value).toBe('2 bodies');
    expect(cell.state).toBe('ok');
  });

  it('locks with authorisation-lapsed copy when the legacy single-body config lapsed after credits posted', () => {
    // lapsedButLocked path (2026-09-12 fix) — hasConfig true, no longer
    // resolves as accredited, credits already exist.
    const cell = deriveAccreditationCell({ ...base, hasConfig: true, creditsIssued: 2 });
    expect(cell.value).toBe('Locked');
    expect(cell.state).toBe('warn');
    expect(cell.note).toBe('authorisation lapsed · 2 credits already issued');
  });

  it('F-DETAILS-1 regression: locks (not "Not set") when a bridge-shaped wizard group has credits but no legacy config', () => {
    // The actual bug: an event built only through the multi-body wizard has
    // hasConfig=false (legacy scalar columns never set). A bridge-shaped
    // group is deliberately excluded from multiBodyAccredited. Before the
    // fix, every branch missed and this fell through to 'Not set' even
    // though credits were already issued.
    const cell = deriveAccreditationCell({
      ...base, wizardGroupCount: 1, multiBodyAccredited: false, creditsIssued: 1,
    });
    expect(cell.value).toBe('Locked');
    expect(cell.state).toBe('warn');
    expect(cell.note).toBe('1 credit already issued');
  });

  it('pluralises the bridge-locked credits note', () => {
    const cell = deriveAccreditationCell({
      ...base, wizardGroupCount: 1, multiBodyAccredited: false, creditsIssued: 3,
    });
    expect(cell.note).toBe('3 credits already issued');
  });
});
