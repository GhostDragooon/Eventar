import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { StaffShell } from '@/components/shell/StaffShell';
import SettingsClient from './SettingsClient';

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
    </StaffShell>
  );
}
