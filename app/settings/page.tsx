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
    <StaffShell staff={{ email: staff.email, role: staff.role }} backHref="/dashboard" backLabel="Dashboard">
      <header className="mb-lg">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Settings</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">
          Personal preferences for your Eventar session.
        </p>
      </header>
      <SettingsClient staff={{ email: staff.email, role: staff.role }} />

      {/* Sign-out moved here from the nav (Design Session Log: right cluster
          is email + settings only). */}
      <section className="mt-xl border-t border-outline-variant pt-lg">
        <h2 className="font-title-lg text-title-lg text-on-surface mb-sm">Session</h2>
        <SettingsSignOut />
      </section>
    </StaffShell>
  );
}
