import Link from 'next/link';

// Guest registrations (made with this email while signed out) are invisible in the portal until claimed, and claiming
// is an explicit button (Stage C Q3). This banner is the nudge on Registrations, Check-in and History.

export function ClaimBanner({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div
      role="status"
      className="space-y-xs rounded-[20px] border border-outline-variant bg-primary-fixed p-lg font-body-md text-body-md text-on-surface"
    >
      <p className="m-0">
        {count === 1
          ? '1 guest registration found under your email.'
          : `${count} guest registrations found under your email.`}
      </p>
      <Link href="/account/claim" className="text-sm font-medium text-primary-ink hover:underline">
        Link past registrations
      </Link>
    </div>
  );
}
