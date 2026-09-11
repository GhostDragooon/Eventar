import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { StaffShell } from '@/components/shell/StaffShell';
import SettingsClient, { SettingsSignOut } from './SettingsClient';

export const metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }} backHref="/dashboard" backLabel="Programme">
      <header className="mb-lg">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Settings</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">
          Personal preferences for your Eventar session.
        </p>
      </header>
      <SettingsClient staff={{ email: staff.email, role: staff.role }} />

      <section className="mt-xl border-t border-outline-variant pt-lg">
        <h2 className="font-title-lg text-title-lg text-on-surface mb-sm">Team</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mb-md">
          Manage your organisation's members and invite new teammates.
        </p>
        <Link
          href="/settings/team"
          className="inline-flex items-center gap-sm rounded-lg border border-outline-variant px-md py-sm font-label-lg text-label-lg text-primary hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden>group</span>
          Manage team
        </Link>
      </section>

      <section className="mt-xl border-t border-outline-variant pt-lg">
        <h2 className="font-title-lg text-title-lg text-on-surface mb-sm">Session</h2>
        <SettingsSignOut />
      </section>
    </StaffShell>
  );
}
