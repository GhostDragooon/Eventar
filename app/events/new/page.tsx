import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { StaffShell } from '@/components/shell/StaffShell';
import NewEventForm, { type SubmitPayload } from './NewEventForm';
import { createEvent } from './actions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { listAuthorisedBodies } from '@/lib/cpd/authorisedBodies';

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
  // The event does not exist yet, so the allow-list is scoped to the CREATING
  // staff member's organisation — which is exactly the organisation the
  // set_event_organisation trigger will stamp on the new event, so the picker
  // and the server agree by construction.
  const { data: staffRow } = await supabaseAdmin()
    .from('staff')
    .select('organisation_id')
    .eq('id', staff.id)
    .maybeSingle();
  const authorised = staffRow?.organisation_id
    ? await listAuthorisedBodies(staffRow.organisation_id as string)
    : { bodies: [], unavailable: true };

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }} backHref="/dashboard" backLabel="Dashboard">
      {/* Page header. Per patterns §8 the StaffShell's NAV owns all back-
          navigation, so this header only carries the page title + intro
          (no breadcrumb — that would duplicate the top NAV's back link). */}
      <header className="mb-lg">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Create event</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">
          {/* Names the buttons verbatim ("Save draft" / "Publish event").
              Guidance that paraphrases the control it points at is the same
              defect as an error message naming a button that does not exist. */}
          Save draft first; publish event when ready.
        </p>
      </header>

      <NewEventForm
        mode="create"
        cpdBodies={authorised.bodies}
        cpdBodiesUnavailable={authorised.unavailable}
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
