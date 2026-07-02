import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { StaffShell } from '@/components/shell/StaffShell';
import NewEventForm, { type SubmitPayload } from './NewEventForm';
import { createEvent } from './actions';

export const metadata = {
  title: 'New event',
  robots: { index: false, follow: false },
};

export default async function NewEventPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }
  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }} backHref="/dashboard" backLabel="Dashboard">
      {/* Page header. Per patterns §8 the StaffShell's NAV owns all back-
          navigation, so this header only carries the page title + intro
          (no breadcrumb — that would duplicate the top NAV's back link). */}
      <header className="mb-lg">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Create event</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">
          Save as draft first; publish when ready.
        </p>
      </header>

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
