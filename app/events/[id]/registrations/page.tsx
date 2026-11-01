import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireStaff, NotAuthorizedError, canManageEvent, canEditRegistrations } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';
import { StaffShell } from '@/components/shell/StaffShell';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { LayoutDashboardIcon, CalendarDaysIcon, UsersIcon } from 'lucide-react';
import RegistrationsClient from './RegistrationsClient';

export const metadata = {
  title: 'Registrations',
  robots: { index: false, follow: false },
};

// UX-04: the people registered for an event and their records. Capturing arrivals is the Check-in page's job; this
// page has no check-in action. Mirrors the check-in page's gate: owner-only, others are sent to /details.
export default async function RegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }
  const { id } = await params;

  const supabase = await supabaseServer();
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, timezone, organisation_id')
    .eq('id', id)
    .maybeSingle();
  if (eventErr) throw eventErr;
  if (!event) notFound();
  if (!canManageEvent(event, staff)) redirect(`/events/${id}/details`);

  // user_id is read only to say whether the email can be corrected; it is reduced to a boolean before it leaves
  // the server, so no account id reaches the browser.
  const [rosterRes, rolesRes] = await Promise.all([
    supabase
      .from('registrations')
      .select('id, full_name, email, registration_code, status, registered_at, check_in_at, user_id')
      .eq('event_id', id)
      .order('full_name', { ascending: true }),
    // registration_roles has no event_id column: filter through the FK embed (!inner restricts the top-level rows)
    // rather than an .in() list of registration ids, which would overflow the query string on a large event.
    supabase
      .from('registration_roles')
      .select('registration_id, role_code, registrations!inner(event_id)')
      .eq('registrations.event_id', id),
  ]);
  // An empty list cannot be told from "nobody registered", so a failed read is a failure (rule 12).
  if (rosterRes.error) throw rosterRes.error;
  // Roles degrade: the list is still right without the chips, and a banner says so.
  if (rolesRes.error) {
    console.error('[registrations] registration_roles read failed', { code: rolesRes.error.code });
  }
  const roles: Record<string, ('chair' | 'presenter')[]> = {};
  for (const row of (rolesRes.data ?? []) as { registration_id: string; role_code: string }[]) {
    if (row.role_code === 'attendee') continue;
    (roles[row.registration_id] ??= []).push(row.role_code as 'chair' | 'presenter');
  }

  const rows = (rosterRes.data ?? []).map(({ user_id, ...r }) => ({
    ...r,
    status: r.status as 'registered' | 'attended' | 'cancelled',
    linked: user_id != null,
    registeredLabel: formatInTz(r.registered_at, event.timezone),
    checkInLabel: r.check_in_at ? formatInTz(r.check_in_at, event.timezone) : null,
  }));

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }} backHref={`/events/${id}/details`} backLabel="Event">
      <Breadcrumbs
        items={[
          { label: 'Events', href: '/dashboard', icon: LayoutDashboardIcon },
          { label: event.title, href: `/events/${id}/details`, icon: CalendarDaysIcon },
          { label: 'Registrations', icon: UsersIcon },
        ]}
        className="mb-sm"
      />

      <header className="mb-lg">
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-xs">Registrations</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">{event.title}</p>
        <Link
          href={`/events/${id}/checkin`}
          className="mt-sm inline-flex min-h-11 items-center gap-xs font-label-md text-label-md text-primary-ink hover:underline"
        >
          Check-in
          <span aria-hidden>→</span>
        </Link>
      </header>

      <RegistrationsClient
        eventId={event.id}
        rows={rows}
        initialRoles={roles}
        rolesUnavailable={Boolean(rolesRes.error)}
        canEdit={canEditRegistrations(staff.role)}
      />
    </StaffShell>
  );
}
