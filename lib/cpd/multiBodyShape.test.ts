import { describe, expect, it } from 'vitest';
import { isBridgeShapedConfig, isMultiBodyConfigured, type AccreditationShapeGroup } from './multiBodyShape';

// Each case below corresponds to a branch of set_event_cpd_config's guard
// predicate (20260821000000). The guard's own migration-time self-check
// proves the SQL side; these prove the TS side agrees with it.
const bridgeGroup = (): AccreditationShapeGroup => ({
  categoryCode: null,
  awardScheme: 'proportional',
  rows: [{ occurrenceIds: ['o1'] }],
});

describe('isMultiBodyConfigured', () => {
  it('treats no groups at all as not multi-body', () => {
    expect(isMultiBodyConfigured([], 1)).toBe(false);
  });

  // THE REGRESSION THIS EXISTS TO PREVENT: the bridge writes one group for
  // every plain single-body save, so a naive `groups.length > 0` locks the
  // legacy form on ordinary events the database would happily accept.
  it('treats the single-body bridge shape as NOT multi-body', () => {
    expect(isMultiBodyConfigured([bridgeGroup()], 1)).toBe(false);
    expect(isBridgeShapedConfig([bridgeGroup()], 1)).toBe(true);
  });

  it('treats two groups as multi-body', () => {
    expect(isMultiBodyConfigured([bridgeGroup(), bridgeGroup()], 1)).toBe(true);
  });

  // A wizard group in its own Step 1 state — added, no schedule rows yet.
  // The SQL guard was corrected mid-drafting for exactly this case.
  it('treats a single group with no schedule rows as multi-body', () => {
    expect(isMultiBodyConfigured([{ ...bridgeGroup(), rows: [] }], 1)).toBe(true);
  });

  it('treats a non-proportional scheme as multi-body', () => {
    expect(isMultiBodyConfigured([{ ...bridgeGroup(), awardScheme: 'explicit_schedule' }], 1)).toBe(true);
  });

  it('treats a set category code as multi-body', () => {
    expect(isMultiBodyConfigured([{ ...bridgeGroup(), categoryCode: 'A' }], 1)).toBe(true);
  });

  it('treats more than one schedule row under a group as multi-body', () => {
    expect(
      isMultiBodyConfigured([{ ...bridgeGroup(), rows: [{ occurrenceIds: ['o1'] }, { occurrenceIds: ['o2'] }] }], 1),
    ).toBe(true);
  });

  // The bridge links its single row to EVERY occurrence on the event, so a
  // partial link set is something only the wizard can produce.
  it('treats a row not covering every occurrence as multi-body', () => {
    expect(isMultiBodyConfigured([bridgeGroup()], 2)).toBe(true);
  });

  it('still recognises the bridge shape on a multi-occurrence event', () => {
    const twoDay: AccreditationShapeGroup = {
      categoryCode: null,
      awardScheme: 'proportional',
      rows: [{ occurrenceIds: ['o1', 'o2'] }],
    };
    expect(isMultiBodyConfigured([twoDay], 2)).toBe(false);
  });
});
