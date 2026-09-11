import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { StaffShell } from '@/components/shell/StaffShell';
import { ParticipantsClient } from './ParticipantsClient';
import { getOrgParticipants } from './actions';

export const metadata = {
  title: 'Participants',
  robots: { index: false, follow: false },
};

export default async function ParticipantsPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }

  const participants = await getOrgParticipants();

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }} backHref="/dashboard" backLabel="Programme">
      <header className="mb-lg">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Participants</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">
          Everyone who has registered for your events.
        </p>
      </header>
      <ParticipantsClient participants={participants} />
    </StaffShell>
  );
}
