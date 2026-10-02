// Which sign-in door a post-login destination belongs to (Q32 audience
// boundary): the attendee door (/account/sign-in) or the organiser door
// (/login). Pure and dependency-free so the server (the /auth/callback error
// redirect) and the client (/login forwarding a signed-in organiser) share one
// answer. null = neutral or unknown (/, the /events listing,
// /events/<uuid>/poster, /pricing, anything else).
//
// Replaces the callback's old path-prefix heuristic ("/account*, or /events/*
// except exactly /events/new"), which sent a failed organiser sign-in on
// /events/<id>/checkin, /edit, /details or /analytics to the attendee door
// (finding I4, 2026-09-25). Event pages are matched on a UUID-shaped segment
// (events.id is uuid), so a future /events/<word> sibling of /events/new
// cannot be mistaken for an event page.
//
// Keep it in step with the matcher in proxy.ts: Next statically analyses
// `config.matcher`, so proxy.ts cannot import this module to build it. The
// drift guard is lib/authDoor.test.ts, which asserts every gated path
// classifies as 'organiser'.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The one open-redirect rule for every `next` value (both sign-in forms, the
// magic-link callback, /login forwarding): a path on THIS origin, nothing else.
// "Starts with a single '/'" is not enough: a browser reads '\' as '/' and drops
// tab, CR and LF while parsing, so '/\evil.example', '/<TAB>/evil.example' and
// '/\/evil.example' all start with one slash and still resolve off-site (the
// callback's NextResponse.redirect and the client router both resolve against the
// page URL). So resolve against a dummy origin and require the origin to survive
// and the path not to collapse into '//host'. Returns the ORIGINAL string, so
// callers keep the exact path, query and hash they were given.
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw[0] !== '/') return null;
  const base = 'http://next.invalid';
  try {
    const url = new URL(raw, base);
    return url.origin === base && !url.pathname.startsWith('//') ? raw : null;
  } catch {
    return null;
  }
}

export function classifyPath(next: string | null | undefined): 'attendee' | 'organiser' | null {
  // Anything that is not a same-origin path is not ours to classify.
  const path = safeNextPath(next);
  if (!path) return null;

  // Classify on the path only — a query or hash must never flip the door
  // (`/account?next=/dashboard` is still an attendee URL).
  const segments = path.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  const [head, second, third] = segments;

  switch (head) {
    case 'account':
      return 'attendee';
    case 'dashboard':
    case 'settings':
      return 'organiser';
    case 'invite':
      return segments.length >= 2 ? 'organiser' : null;
    case 'login':
      return segments.length === 1 ? 'organiser' : null;
    case 'survey':
      return segments.length === 1 ? 'attendee' : null;
    case 'analytics':
    case 'participants':
      return segments.length === 1 ? 'organiser' : null;
    case 'checkin':
      if (segments.length === 1) return 'organiser';
      return segments.length === 2 && second === 'confirm' ? 'attendee' : null;
    case 'events':
      if (second === 'new') return segments.length === 2 ? 'organiser' : null;
      if (second === undefined || !UUID.test(second)) return null;
      if (segments.length === 2) return 'attendee';
      return segments.length === 3 && ['edit', 'checkin', 'details', 'analytics'].includes(third)
        ? 'organiser'
        : null;
    default:
      return null;
  }
}
