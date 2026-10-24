import { classifyPath, safeNextPath } from '@/lib/authDoor';

// The one gate for a post-sign-in destination on the attendee doors
// (/account/sign-in, /account/sign-up) and the first-run wizard (spec 001
// FR-005): a path on this origin that classifyPath puts in the ATTENDEE
// audience. safeNextPath alone is the open-redirect rule; it still lets
// /dashboard and /login through, which an attendee must never be sent to.
//
// Classified on the path the browser will load, not the raw text: classifyPath
// splits the raw string, so '/account/../dashboard' reads as an account page
// there while the callback's redirect resolves it to /dashboard.
export function attendeeNextPath(raw: string | null | undefined): string | null {
  const safe = safeNextPath(raw);
  if (!safe) return null;
  const url = new URL(safe, 'http://next.invalid');
  const resolved = url.pathname + url.search + url.hash;
  return classifyPath(resolved) === 'attendee' ? resolved : null;
}

// Where the wizard may hand a finished visitor on to: any attendee
// destination except the wizard itself.
export function wizardLandingPath(raw: string | null | undefined): string | null {
  const path = attendeeNextPath(raw);
  return path && path.split(/[?#]/, 1)[0] !== '/account/complete' ? path : null;
}
