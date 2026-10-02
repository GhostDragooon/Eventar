import { describe, expect, it } from 'vitest';
import { classifyPath, safeNextPath } from './authDoor';
import { config } from '../proxy';

const EVENT = '37e37c81-b10a-4077-8f7d-5b5d247b1adc';

describe('classifyPath — attendee door', () => {
  it.each([
    '/account',
    '/account/record',
    '/account/claim',
    '/account/complete',
    '/account/sign-in',
    `/events/${EVENT}`,
    '/checkin/confirm',
    '/survey',
  ])('%s → attendee', (path) => {
    expect(classifyPath(path)).toBe('attendee');
  });
});

describe('classifyPath — organiser door', () => {
  it.each([
    '/dashboard',
    '/dashboard/manage',
    '/events/new',
    `/events/${EVENT}/edit`,
    `/events/${EVENT}/checkin`,
    `/events/${EVENT}/details`,
    `/events/${EVENT}/analytics`,
    '/checkin',
    '/analytics',
    '/participants',
    '/settings',
    '/settings/team',
    '/invite/abc123',
    '/login',
  ])('%s → organiser', (path) => {
    expect(classifyPath(path)).toBe('organiser');
  });
});

describe('classifyPath — neutral or unknown routes belong to neither door', () => {
  it.each([
    '/',
    '/events',
    `/events/${EVENT}/poster`,
    `/events/${EVENT}/calendar.ics`,
    '/pricing',
    '/does-not-exist',
    // Bare /invite has no page (only /invite/[token]), /checkin/<other> is not
    // the attendee pass, /login has no children.
    '/invite',
    '/checkin/other',
    '/login/extra',
  ])('%s → null', (path) => {
    expect(classifyPath(path)).toBeNull();
  });

  // The whole point of matching UUID-shaped segments: a future
  // /events/<word> sibling (like today's /events/new) must not be mistaken
  // for an event page — the old prefix heuristic made exactly that mistake.
  it('a non-UUID /events/<segment> is not an event page', () => {
    expect(classifyPath('/events/123')).toBeNull();
    expect(classifyPath('/events/archive')).toBeNull();
    expect(classifyPath(`/events/${EVENT}/not-a-real-subroute`)).toBeNull();
  });
});

describe('classifyPath — /events/new vs /events/<uuid>', () => {
  it('splits the one organiser route under /events from the attendee event page', () => {
    expect(classifyPath('/events/new')).toBe('organiser');
    expect(classifyPath(`/events/${EVENT}`)).toBe('attendee');
  });

  it('accepts an upper-case UUID', () => {
    expect(classifyPath(`/events/${EVENT.toUpperCase()}/checkin`)).toBe('organiser');
    expect(classifyPath(`/events/${EVENT.toUpperCase()}`)).toBe('attendee');
  });
});

describe('classifyPath — query, hash and trailing slash', () => {
  it('classifies on the path only: ?query and #hash are stripped first', () => {
    expect(classifyPath('/dashboard/manage?tab=drafts')).toBe('organiser');
    expect(classifyPath('/events/new#details')).toBe('organiser');
    expect(classifyPath(`/events/${EVENT}?ref=email`)).toBe('attendee');
  });

  // Regression for the substring trap: an organiser path travelling inside the
  // query of an attendee URL must not flip its door.
  it('does not let a query value impersonate another door', () => {
    expect(classifyPath('/account?next=/dashboard')).toBe('attendee');
    expect(classifyPath('/pricing?next=/dashboard')).toBeNull();
    expect(classifyPath('/?x=/settings')).toBeNull();
  });

  it('tolerates a trailing slash', () => {
    expect(classifyPath('/dashboard/')).toBe('organiser');
    expect(classifyPath('/account/')).toBe('attendee');
  });
});

describe('classifyPath — only a single-slash relative path is accepted', () => {
  it.each([
    ['protocol-relative', '//evil.example.com/dashboard'],
    ['absolute URL', 'https://evil.example.com/dashboard'],
    ['no leading slash', 'dashboard'],
    ['empty string', ''],
  ])('%s → null', (_label, value) => {
    expect(classifyPath(value)).toBeNull();
  });

  it('null and undefined → null', () => {
    expect(classifyPath(null)).toBeNull();
    expect(classifyPath(undefined)).toBeNull();
  });
});

// The pre-existing guard (`startsWith('/') && !startsWith('//')`) let these
// through, and NextResponse.redirect(new URL(next, url)) then sent the visitor
// off-site (confirmed against next@16.2.12: 307 to http://evil.example.com/).
// A browser reads '\' as '/' and drops tab, CR and LF while parsing a URL.
describe('safeNextPath — only a path on this origin survives', () => {
  it.each([
    ['backslash', '/\\evil.example.com'],
    ['slash then backslash', '/\\/evil.example.com'],
    ['double backslash', '/\\\\evil.example.com'],
    ['tab', '/\t/evil.example.com'],
    ['line feed', '/\n/evil.example.com'],
    ['carriage return', '/\r/evil.example.com'],
    ['protocol-relative', '//evil.example.com'],
    ['dot-segments that collapse to protocol-relative', '/..//evil.example.com'],
    ['absolute URL', 'https://evil.example.com/dashboard'],
    ['javascript URL', 'javascript:alert(1)'],
    ['no leading slash', 'dashboard'],
    ['leading space', ' /dashboard'],
    ['empty string', ''],
  ])('%s → null', (_label, value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it('null and undefined → null', () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });

  // Returns the string it was given, not the URL parser's normalised form, so
  // a legitimate path keeps its exact query and hash.
  it.each([
    '/dashboard',
    '/events/new',
    '/dashboard/manage?tab=drafts',
    `/events/${EVENT}/edit?x=1#top`,
    '/invite/abc123_-XYZ',
    '/account/record',
  ])('%s is returned unchanged', (value) => {
    expect(safeNextPath(value)).toBe(value);
  });

  it('classifyPath applies the same rule: a hostile string classifies as neither door', () => {
    expect(classifyPath('/\\dashboard')).toBeNull();
    expect(classifyPath('/\t/account')).toBeNull();
  });
});

// Next statically analyses `config.matcher`, so proxy.ts cannot import the
// classifier to build it. This test is the drift guard instead: every path the
// proxy gates is an organiser path by definition, so the classifier must say
// so. A new gated route that is missing from lib/authDoor.ts fails here —
// otherwise /auth/callback would bounce a failed organiser sign-in to the
// attendee door (finding I4, 2026-09-25).
describe('proxy.ts matcher ↔ classifier drift guard', () => {
  function expand(pattern: string): string[] {
    const withId = pattern.replace(':id', EVENT);
    if (withId.endsWith('/:path*')) {
      const base = withId.slice(0, -'/:path*'.length);
      return [base, `${base}/x`];
    }
    return [withId];
  }

  const samples = config.matcher.flatMap(expand);

  it('every matcher pattern expands to concrete paths (extend expand() for new syntax)', () => {
    expect(samples.length).toBeGreaterThanOrEqual(config.matcher.length);
    for (const sample of samples) {
      expect(sample, `unexpanded matcher syntax in ${sample}`).not.toMatch(/[:(*?+]/);
    }
  });

  it.each(samples)('gated path %s classifies as organiser', (path) => {
    expect(classifyPath(path)).toBe('organiser');
  });
});
