import Link from 'next/link';

// The wizard can be finished without a licence (Ivan 2026-11-04), and credit is released only once one is declared.
// This is the portal's reminder, on Registrations and Check-in next to the claim banner.

export function LicenceBanner({ missing }: { missing: boolean }) {
  if (!missing) return null;
  return (
    <div
      role="status"
      className="space-y-xs rounded-[20px] border border-outline-variant bg-primary-fixed p-lg font-body-md text-body-md text-on-surface"
    >
      <p className="m-0">
        Account setup is not finished: no current licence is declared. Credit is released only for events you check in to after you
        declare one.
      </p>
      <Link href="/account/profile" className="text-sm font-medium text-primary-ink hover:underline">
        Add a licence
      </Link>
    </div>
  );
}
