import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { StaffShell } from '@/components/shell/StaffShell';
import { ManageWorkstation } from '@/components/dashboard/ManageWorkstation';
import { fetchDecoratedEvents } from '@/app/dashboard/data';
import { DevEmailStubBanner } from '@/components/dev/DevEmailStubBanner';

export const metadata = {
  title: 'Manage events',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ManagePage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }

  const supabase = await supabaseServer();
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const { events } = await fetchDecoratedEvents(supabase, nowMs);

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role, full_name: staff.full_name }}>
      <DevEmailStubBanner />
      <ManageWorkstation events={events} />
    </StaffShell>
  );
}
