import Link from 'next/link';

// The public event page keeps the pill shell (its hero band was cut for it), so a signed-in attendee who opened an
// event from the portal has no link back except the Account menu. One quiet line above the hero, Registrations being
// the attendee home (Ivan 2026-11-02, 7a-1). The page decides who sees it.
export function BackToRegistrations() {
  return (
    <div className="mx-auto w-full max-w-md px-grid-margin pt-md">
      <Link
        href="/account/registrations"
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary-ink hover:underline"
      >
        ← Back to my registrations
      </Link>
    </div>
  );
}
