import type { ReadinessState } from '@/components/details/ReadinessStrip';

export type AccreditationCellInput = {
  wizardGroupCount: number;
  multiBodyAccredited: boolean;
  singleBodyAccredited: boolean;
  configuredBodyShortName: string | null;
  cpdHours: number | null;
  hasConfig: boolean;
  creditsIssued: number;
};

export type AccreditationCell = { value: string; state: ReadinessState; note: string };

/**
 * Pure derivation for the details-page readiness strip's accreditation cell.
 * Extracted (not inlined in page.tsx) so the bug class below has a unit test,
 * same move as collegeExportProjection.ts made for the Stage 10 export bug.
 *
 * F-DETAILS-1 (2026-09-18 frontend review): a bridge-shaped multi-body
 * wizard group (lib/cpd/multiBodyShape.ts) is deliberately excluded from
 * multiBodyAccredited, and an event built only through the wizard never has
 * the legacy scalar columns (accrediting_body_id/cpd_hours) set — so
 * hasConfig is false too. Without `bridgeButLocked`, credits already issued
 * under that group fell through every check to 'Not set', contradicting
 * CpdAccreditationSection's own "credits issued, locked" state on the same
 * page. `bridgeButLocked` mirrors the 2026-09-12 `lapsedButLocked` fix
 * (which covers the equivalent single-body/legacy-column case) for the
 * wizard path.
 */
export function deriveAccreditationCell(input: AccreditationCellInput): AccreditationCell {
  const {
    wizardGroupCount, multiBodyAccredited, singleBodyAccredited,
    configuredBodyShortName, cpdHours, hasConfig, creditsIssued,
  } = input;
  const accredited = singleBodyAccredited || multiBodyAccredited;
  const lapsedButLocked = hasConfig && !accredited && creditsIssued > 0;
  const bridgeButLocked = wizardGroupCount > 0 && !accredited && creditsIssued > 0;
  const creditsNote = `${creditsIssued} credit${creditsIssued === 1 ? '' : 's'} already issued`;

  return {
    value: multiBodyAccredited
      ? `${wizardGroupCount} ${wizardGroupCount === 1 ? 'body' : 'bodies'}`
      : singleBodyAccredited ? `${configuredBodyShortName} ${cpdHours}`
      : lapsedButLocked ? 'Locked'
      : bridgeButLocked ? 'Locked'
      : hasConfig ? 'Unverified'
      : 'Not set',
    state: accredited ? 'ok'
      : lapsedButLocked ? 'warn'
      : bridgeButLocked ? 'warn'
      : hasConfig ? 'blocked'
      : 'warn',
    note: multiBodyAccredited
      ? 'via multi-body accreditation'
      : singleBodyAccredited ? 'hours confirmed'
      : lapsedButLocked ? `authorisation lapsed · ${creditsNote}`
      : bridgeButLocked ? creditsNote
      : hasConfig ? 'body not authorised for this org'
      : 'no body or hours',
  };
}
