// Is an event's accreditation config a REAL multi-body config, or just the
// degenerate one-group case that set_event_cpd_config's compatibility bridge
// writes for every plain single-body save?
//
// This is not a cosmetic distinction. `event_accreditation_groups` is
// non-empty for BOTH, so "has any group" answers the wrong question:
//   - too loose  → an ordinary single-body event is labelled multi-body and
//                  its legacy accreditation form gets locked, even though the
//                  database would accept the save.
//   - too strict → the legacy form stays live over a real wizard config and
//                  silently deletes it on save (the bug 20260821000000 fixed
//                  at the write layer).
//
// The predicate below mirrors set_event_cpd_config's own guard
// (20260821000000) field for field, on purpose. That function is the
// authority on which saves are refused; a UI that disagrees with it is wrong
// by definition — this repo's recurring "a control one layer above where the
// write happens" failure. Keep the two in sync: if the SQL guard's shape
// test changes, this changes with it.
//
// Note a deliberate non-obvious consequence: a group the WIZARD created that
// happens to be bridge-shaped (no category, proportional, exactly one row,
// linked to every occurrence) counts as single-body here. That is correct
// rather than a false negative — the database itself permits the legacy form
// to overwrite exactly that shape, so the UI must too.

export type AccreditationShapeGroup = {
  categoryCode: string | null;
  awardScheme: 'proportional' | 'explicit_schedule';
  rows: Array<{ occurrenceIds: string[] }>;
};

/** True when `groups` is exactly what the single-body compatibility bridge produces. */
export function isBridgeShapedConfig(
  groups: AccreditationShapeGroup[],
  occurrenceCount: number,
): boolean {
  if (groups.length !== 1) return false;
  const g = groups[0];
  return (
    g.categoryCode === null &&
    g.awardScheme === 'proportional' &&
    g.rows.length === 1 &&
    g.rows[0].occurrenceIds.length === occurrenceCount
  );
}

/**
 * True when the event carries a genuine multi-body configuration — i.e. one
 * the legacy single-body form must not be allowed to overwrite.
 */
export function isMultiBodyConfigured(
  groups: AccreditationShapeGroup[],
  occurrenceCount: number,
): boolean {
  return groups.length > 0 && !isBridgeShapedConfig(groups, occurrenceCount);
}
