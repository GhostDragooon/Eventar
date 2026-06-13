import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { StaffShell } from '@/components/shell/StaffShell';
import NewEventForm, { type SubmitPayload } from './NewEventForm';
import { createEvent } from './actions';

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
      <NewEventForm
        mode="create"
        submit={async (payload: SubmitPayload) => {
          'use server';
          // createEvent throws a Next-internal redirect on success (never
          // returns the ok branch), so on success this call does not resolve
          // to a value the form processes — the redirect happens server-side.
          return createEvent(payload);
        }}
      />
    </StaffShell>
  );
}
