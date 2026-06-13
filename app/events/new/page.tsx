import Link from 'next/link';
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
      {/* Page-level header — matches /edit's pattern (breadcrumb +
          title + small meta) so the form itself doesn't carry duplicate
          header chrome. Single source of header chrome per the EE-mockup. */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-xs text-on-surface-variant mb-sm">
        <Link href="/dashboard" className="font-label-md text-label-md uppercase tracking-wider hover:text-primary">
          Dashboard
        </Link>
        <span className="material-symbols-outlined text-[16px]" aria-hidden>chevron_right</span>
        <span className="font-label-md text-label-md uppercase tracking-wider text-primary">New event</span>
      </nav>

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
