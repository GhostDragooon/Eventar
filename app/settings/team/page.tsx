import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { StaffShell } from '@/components/shell/StaffShell';
import { TeamClient } from './TeamClient';
import { listTeamMembers, listInvites } from './actions';

export const metadata = {
  title: 'Team',
  robots: { index: false, follow: false },
};

export default async function TeamPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }

  const isAdmin = staff.role === 'organiser_admin' || staff.role === 'eventar_staff';
  const [members, invites] = await Promise.all([
    listTeamMembers(),
    isAdmin ? listInvites() : Promise.resolve([]),
  ]);

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }} backHref="/settings" backLabel="Settings">
      <header className="mb-lg">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Team</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">
          Members of your organisation and invite links.
        </p>
      </header>
      <TeamClient members={members} invites={invites} isAdmin={isAdmin} />
    </StaffShell>
  );
}
