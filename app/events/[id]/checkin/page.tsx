import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';
import { StaffShell } from '@/components/shell/StaffShell';
import RosterClient from './RosterClient';

export default async function StaffCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }
  const { id } = await params;

  const supabase = await supabaseServer();
  const { data: event } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, timezone, venue_name, status, max_attendees')
    .eq('id', id)
    .maybeSingle();
  if (!event) notFound();

  // Initial roster paint: organiser/manager RLS already gates this read.
  // The client subscribes to Realtime postgres_changes for live updates.
  const { data: initialRoster } = await supabase
    .from('registrations')
    .select('id, full_name, email, registration_code, status, check_in_at, check_in_method')
    .eq('event_id', id)
    .order('full_name', { ascending: true });

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }}>
      <nav aria-label="Breadcrumb" className="flex items-center gap-xs text-on-surface-variant mb-sm">
        <Link href="/dashboard" className="font-label-md text-label-md uppercase tracking-wider hover:text-primary">
          Dashboard
        </Link>
        <span className="material-symbols-outlined text-[16px]" aria-hidden>chevron_right</span>
        <Link href={`/events/${event.id}/edit`} className="font-label-md text-label-md uppercase tracking-wider hover:text-primary truncate max-w-[200px]">
          {event.title}
        </Link>
        <span className="material-symbols-outlined text-[16px]" aria-hidden>chevron_right</span>
        <span className="font-label-md text-label-md uppercase tracking-wider text-primary">Check-in</span>
      </nav>

      <header className="mb-lg">
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-sm">
          {event.title}
        </h1>
        <div className="flex flex-wrap items-center gap-md text-on-surface-variant">
          <p className="font-body-md text-body-md flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]" aria-hidden>schedule</span>
            {formatInTz(event.start_time, event.timezone)} → {formatInTz(event.end_time, event.timezone)} ({event.timezone})
          </p>
          {event.venue_name && (
            <p className="font-body-md text-body-md flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]" aria-hidden>location_on</span>
              {event.venue_name}
            </p>
          )}
        </div>
      </header>

      <RosterClient
        eventId={event.id}
        eventTimezone={event.timezone}
        initialRoster={initialRoster ?? []}
        maxAttendees={event.max_attendees}
      />
    </StaffShell>
  );
}
