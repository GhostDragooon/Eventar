import { describe, expect, it } from 'vitest';
import { attendeeNextPath, wizardLandingPath } from './attendeeNext';

const EVENT = '37e37c81-b10a-4077-8f7d-5b5d247b1adc';

// Spec 001 FR-005 / User Story 2 scenario 3: a destination carried through
// sign-in, sign-up and the first-run wizard is honoured only if it is a page
// inside the attendee area, under the same rule as every other redirect target.
describe('attendeeNextPath', () => {
  it.each([
    '/account/record',
    '/account/claim',
    '/account/claim?from=card#top',
    `/events/${EVENT}`,
    '/checkin/confirm',
  ])('honours the attendee path %s unchanged', (path) => {
    expect(attendeeNextPath(path)).toBe(path);
  });

  it.each([
    ['protocol-relative', '//evil.example'],
    ['backslash', '/\\evil'],
    ['tab before the host', '/\t/evil.example'],
    ['backslash then slash', '/\\/evil.example'],
    ['absolute URL', 'https://evil.example/account'],
    ['organiser workspace', '/dashboard'],
    ['organiser workspace with a query', '/dashboard?next=/account/record'],
    ['organiser settings', '/settings'],
    ['the organiser door', '/login'],
    ['a staff event route', `/events/${EVENT}/edit`],
    ['a dot-segment walk out of /account', '/account/../dashboard'],
    ['an encoded dot-segment walk', '/account/%2e%2e/dashboard'],
    ['a neutral page', '/pricing'],
    ['the events list (neutral, not the attendee area)', '/events'],
    ['an events path that is not an event id', '/events/abc123'],
    ['empty', ''],
    ['null', null],
    ['undefined', undefined],
  ])('drops %s', (_why, raw) => {
    expect(attendeeNextPath(raw)).toBeNull();
  });
});

describe('wizardLandingPath', () => {
  it('is an attendee path, so a hostile destination is ignored here too', () => {
    expect(wizardLandingPath('/account/claim')).toBe('/account/claim');
    expect(wizardLandingPath('/dashboard')).toBeNull();
    expect(wizardLandingPath('//evil.example')).toBeNull();
  });

  it('never the wizard itself, which would bounce a finished visitor straight back in', () => {
    expect(wizardLandingPath('/account/complete')).toBeNull();
    expect(wizardLandingPath('/account/complete?next=%2Faccount%2Fclaim')).toBeNull();
  });
});
