import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';
import RosterClient from './RosterClient';

export default async function StaffCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }
  const { id } = await params;

  const supabase = await supabaseServer();
  const { data: event } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, timezone, venue_name, status')
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
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <header className="space-y-1">
        <p className="text-sm text-gray-600">
          {formatInTz(event.start_time, event.timezone)} → {formatInTz(event.end_time, event.timezone)} ({event.timezone})
        </p>
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <p className="text-sm text-gray-600">📍 {event.venue_name}</p>
      </header>

      <RosterClient
        eventId={event.id}
        eventTimezone={event.timezone}
        initialRoster={initialRoster ?? []}
      />
    </main>
  );
}
