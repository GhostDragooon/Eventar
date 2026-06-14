import { describe, expect, it } from 'vitest';
import { sectionState } from './sectionState';

// E.3 ladder (patterns §7a):
//   Registration: ACTIVE while {registering, upcoming}; DONE in {live, completed};
//                 LOCKED on drafted; cancelled is a graceful pass-through (locked).
//   Attendance:   ACTIVE while live; DONE on completed;
//                 LOCKED everywhere else (drafted/registering/upcoming/cancelled).
//   Feedback:     ACTIVE on completed (spec uses "active" loosely as "current focus");
//                 LOCKED elsewhere.
// "Done" exists only after a section's window has passed.
describe('sectionState — registration', () => {
  it.each(['registering', 'upcoming'] as const)('is active on %s', (lc) => {
    expect(sectionState('registration', lc)).toBe('active');
  });
  it.each(['live', 'completed'] as const)('is done on %s', (lc) => {
    expect(sectionState('registration', lc)).toBe('done');
  });
  it.each(['drafted', 'cancelled'] as const)('is locked on %s', (lc) => {
    expect(sectionState('registration', lc)).toBe('locked');
  });
});

describe('sectionState — attendance', () => {
  it('is active on live', () => {
    expect(sectionState('attendance', 'live')).toBe('active');
  });
  it('is done on completed', () => {
    expect(sectionState('attendance', 'completed')).toBe('done');
  });
  it.each(['drafted', 'registering', 'upcoming', 'cancelled'] as const)(
    'is locked on %s',
    (lc) => {
      expect(sectionState('attendance', lc)).toBe('locked');
    },
  );
});

describe('sectionState — feedback', () => {
  it('is active on completed (current focus once event ends)', () => {
    expect(sectionState('feedback', 'completed')).toBe('active');
  });
  it.each(['drafted', 'registering', 'upcoming', 'live', 'cancelled'] as const)(
    'is locked on %s',
    (lc) => {
      expect(sectionState('feedback', lc)).toBe('locked');
    },
  );
});
