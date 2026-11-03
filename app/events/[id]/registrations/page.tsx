import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireStaff, NotAuthorizedError, canManageEvent, canEditRegistrations, canEditRegistrationRoles, canCheckIn } from '@/lib/auth';
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

// PostgREST answers at most max_rows (supabase/config.toml, 1000) rows per request and says nothing when it cuts a list
// short, so a roster is read a page at a time until a page comes back short.
const PAGE = 1000;
async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>,
): Promise<{ data: T[]; error: { code?: string } | null }> {
  const data: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await page(from, from + PAGE - 1);
    if (res.error) return { data, error: res.error };
    data.push(...(res.data ?? []));
    if ((res.data?.length ?? 0) < PAGE) return { data, error: null };
  }
}

// UX-04: the people registered for an event and their records. Capturing arrivals is the Check-in page's job; this
// page has no check-in action. Same gate as the check-in page: staff of the event's organisation (or Eventar staff);
// anyone else is sent to /details. The role chips are narrower: the role RPCs accept only the event's creator or
// Eventar staff, so only they get live chips (the contact edit is organisation-wide).
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
    .select('id, title, start_time, end_time, timezone, organisation_id, created_by')
    .eq('id', id)
    // A deleted event is gone to the organiser, so its roster is too (the edit action already answers "not found" for it).
    .is('deleted_at', null)
    .maybeSingle();
  if (eventErr) throw eventErr;
  if (!event) notFound();
  if (!canManageEvent(event, staff)) redirect(`/events/${id}/details`);

  // user_id is read only to say whether the email can be corrected; it is reduced to a boolean before it leaves
  // the server, so no account id reaches the browser.
  const [rosterRes, rolesRes] = await Promise.all([
    allRows((from, to) =>
      supabase
        .from('registrations')
        .select('id, full_name, email, registration_code, status, registered_at, check_in_at, user_id')
        .eq('event_id', id)
        // id breaks ties so a page boundary never repeats or skips a row.
        .order('full_name', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    // registration_roles has no event_id column: filter through the FK embed (!inner restricts the top-level rows)
    // rather than an .in() list of registration ids, which would overflow the query string on a large event.
    allRows((from, to) =>
      supabase
        .from('registration_roles')
        .select('registration_id, role_code, registrations!inner(event_id)')
        .eq('registrations.event_id', id)
        .order('registration_id', { ascending: true })
        .order('role_code', { ascending: true })
        .range(from, to),
    ),
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

  const canEdit = canEditRegistrations(staff.role);
  const canEditRoles = canEditRegistrationRoles(staff, event);
  // Instruction copy follows the same gates as the controls, so no role is told to do what it cannot.
  const subtitle = [
    'Everyone registered for this event.',
    canEdit
      ? canEditRoles ? 'Edit contact details and roles here.' : 'Edit contact details here.'
      : 'You can view contact details; an organiser admin or member can edit them.',
    canCheckIn(staff.role) ? 'To check people in, open Check-in.' : null,
  ].filter(Boolean).join(' ');

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
        <p className="font-body-md text-body-md text-on-surface-variant">
          {subtitle}
        </p>
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
        canEdit={canEdit}
        canEditRoles={canEditRoles}
      />
    </StaffShell>
  );
}
