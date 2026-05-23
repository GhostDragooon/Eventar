import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTz } from '@/lib/tz';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import ConfirmButton from './ConfirmButton';

export const dynamic = 'force-dynamic';

export default async function SelfCheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!code || !isValidRegistrationCode(code)) {
    return <UnrecognisedCode />;
  }

  const admin = supabaseAdmin();
  // The select string with !inner embed confuses supabase-js's generic
  // inference and the row gets typed as GenericStringError. Cast to the
  // shape we actually request — small and contained.
  type RegRow = {
    id: string;
    full_name: string;
    status: string;
    check_in_at: string | null;
    events:
      | {
          id: string;
          title: string;
          start_time: string;
          end_time: string;
          timezone: string;
          venue_name: string;
          status: string;
        }
      | Array<{
          id: string;
          title: string;
          start_time: string;
          end_time: string;
          timezone: string;
          venue_name: string;
          status: string;
        }>
      | null;
  };
  const { data: reg } = (await admin
    .from('registrations')
    .select(
      'id, full_name, status, check_in_at, ' +
        'events!inner(id, title, start_time, end_time, timezone, venue_name, status)',
    )
    .eq('registration_code', code)
    .maybeSingle()) as { data: RegRow | null };

  if (!reg || !reg.events) return <UnrecognisedCode />;

  // The supabase-js typing for embedded selects can return the relation as
  // an object OR an array depending on relationship cardinality.
  // registrations.event_id -> events.id is many-to-one, so it's always an
  // object here, but TS doesn't know that. Narrow:
  const event = Array.isArray(reg.events) ? reg.events[0] : reg.events;
  if (!event || event.status !== 'published') return <UnrecognisedCode />;

  if (reg.status === 'attended') {
    return (
      <Layout>
        <EventCard event={event} />
        <div className="rounded-xl bg-gray-50 border p-6 text-center space-y-1">
          <p className="text-lg font-medium">You&apos;re already checked in.</p>
          <p className="text-sm text-gray-600">
            Checked in at {reg.check_in_at ? formatInTz(reg.check_in_at, event.timezone) : 'an earlier time'}.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <p className="text-sm text-gray-600 text-center">
        Hi <strong>{reg.full_name}</strong>, you&apos;re registered for:
      </p>
      <EventCard event={event} />
      <ConfirmButton code={code} />
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-md mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold text-center">Check-in</h1>
      {children}
    </main>
  );
}

function EventCard({
  event,
}: {
  event: {
    title: string;
    start_time: string;
    end_time: string;
    timezone: string;
    venue_name: string;
  };
}) {
  return (
    <section className="rounded-xl border p-4 space-y-1">
      <p className="font-medium">{event.title}</p>
      <p className="text-sm text-gray-600">
        {formatInTz(event.start_time, event.timezone)} → {formatInTz(event.end_time, event.timezone)}
      </p>
      <p className="text-sm text-gray-600">📍 {event.venue_name}</p>
    </section>
  );
}

function UnrecognisedCode() {
  return (
    <main className="max-w-md mx-auto p-6 space-y-4 text-center">
      <h1 className="text-xl font-semibold">Code not recognised</h1>
      <p className="text-sm text-gray-600">
        Please show this code (or your QR) to the event organiser. They can
        check you in manually.
      </p>
    </main>
  );
}
