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
          ? 'We found 1 registration made with your email as a guest. Link it to your account to see it here.'
          : `We found ${count} registrations made with your email as a guest. Link them to your account to see them here.`}
      </p>
      <Link href="/account/claim" className="text-sm font-medium text-primary-ink hover:underline">
        Link past registrations
      </Link>
    </div>
  );
}
