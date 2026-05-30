import { describe, expect, it } from 'vitest';
import { happyRate } from './happyRate';

type Row = { expectations: string | null };

describe('happyRate', () => {
  it('returns null when there are no non-null Q4 rows', () => {
    expect(happyRate<Row>([], 'expectations')).toBeNull();
    expect(happyRate<Row>([{ expectations: null }, { expectations: null }], 'expectations')).toBeNull();
  });

  it('returns the fraction of exceeded+met over non-null Q4 rows', () => {
    const rows: Row[] = [
      { expectations: 'exceeded' },
      { expectations: 'met' },
      { expectations: 'partially' },
      { expectations: 'not_met' },
    ];
    expect(happyRate(rows, 'expectations')).toBe(0.5);
  });

  it('null rows do not affect the denominator', () => {
    const rows: Row[] = [
      { expectations: 'exceeded' },
      { expectations: null },
      { expectations: 'met' },
    ];
    expect(happyRate(rows, 'expectations')).toBe(1);
  });
});
