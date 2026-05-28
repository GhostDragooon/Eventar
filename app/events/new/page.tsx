import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { StaffShell } from '@/components/shell/StaffShell';
import NewEventForm from './NewEventForm';

export default async function NewEventPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }
  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }}>
      <NewEventForm />
    </StaffShell>
  );
}
