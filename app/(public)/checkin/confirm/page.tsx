import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTz } from '@/lib/tz';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { PublicShell } from '@/components/shell/PublicShell';
import ConfirmButton from './ConfirmButton';

export const dynamic = 'force-dynamic';

export default async function SelfCheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!code) {
    return (
      <PublicShell>
        <PageWrap>
          <EmptyState
            icon="qr_code_scanner"
            title="No check-in code"
            body="Open this page from your registration link or by scanning your personal QR code. If you don't have one, ask the event organiser for help."
          />
        </PageWrap>
      </PublicShell>
    );
  }
  if (!isValidRegistrationCode(code)) {
    return (
      <PublicShell>
        <PageWrap>
          <EmptyState
            icon="error"
            title="Code not recognised"
            body="Please show this code (or your QR) to the event organiser. They can check you in manually."
          />
        </PageWrap>
      </PublicShell>
    );
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

  if (!reg || !reg.events) {
    return (
      <PublicShell>
        <PageWrap>
          <EmptyState
            icon="error"
            title="Code not recognised"
            body="Please show this code (or your QR) to the event organiser. They can check you in manually."
          />
        </PageWrap>
      </PublicShell>
    );
  }

  // The supabase-js typing for embedded selects can return the relation as
  // an object OR an array depending on relationship cardinality.
  // registrations.event_id -> events.id is many-to-one, so it's always an
  // object here, but TS doesn't know that. Narrow:
  const event = Array.isArray(reg.events) ? reg.events[0] : reg.events;
  if (!event || event.status !== 'published') {
    return (
      <PublicShell>
        <PageWrap>
          <EmptyState
            icon="error"
            title="Code not recognised"
            body="Please show this code (or your QR) to the event organiser. They can check you in manually."
          />
        </PageWrap>
      </PublicShell>
    );
  }

  // Already-attended state: server-rendered (the page knew status before
  // any click happened). Distinguished from action-time "already checked
  // in" (see selfCheckIn action — both copy strings exist deliberately).
  if (reg.status === 'attended') {
    return (
      <PublicShell>
        <PageWrap>
          <AttendedView event={event} fullName={reg.full_name} checkInAt={reg.check_in_at} />
        </PageWrap>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <PageWrap>
        <RegisteredView event={event} fullName={reg.full_name} code={code} />
      </PageWrap>
    </PublicShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md mx-auto px-grid-margin py-lg space-y-md">
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

function RegisteredView({
  event,
  fullName,
  code,
}: {
  event: {
    title: string;
    start_time: string;
    end_time: string;
    timezone: string;
    venue_name: string;
  };
  fullName: string;
  code: string;
}) {
  return (
    <>
      <header className="text-center space-y-sm">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-container text-on-primary rounded-full mb-sm" aria-hidden>
          <span className="material-symbols-outlined text-[32px]">person_check</span>
        </div>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
          Check-in ready
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Welcome, {fullName}.
        </p>
      </header>

      <EventCard event={event} code={code} />

      <ConfirmButton code={code} fullName={fullName} />
    </>
  );
}

function AttendedView({
  event,
  fullName,
  checkInAt,
}: {
  event: {
    title: string;
    start_time: string;
    end_time: string;
    timezone: string;
    venue_name: string;
  };
  fullName: string;
  checkInAt: string | null;
}) {
  return (
    <>
      <header className="text-center space-y-sm">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-container text-on-primary rounded-full mb-sm" aria-hidden>
          <span className="material-symbols-outlined text-[32px]" data-fill="1">check_circle</span>
        </div>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
          You&apos;re checked in
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Welcome, {fullName}.
        </p>
      </header>

      <EventCard event={event} />

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-md text-center">
        <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs">
          Checked in at
        </p>
        <p className="font-title-lg text-title-lg text-on-surface">
          {checkInAt ? formatInTz(checkInAt, event.timezone) : 'an earlier time'}
        </p>
      </div>
    </>
  );
}

function EventCard({
  event,
  code,
}: {
  event: {
    title: string;
    start_time: string;
    end_time: string;
    timezone: string;
    venue_name: string;
  };
  code?: string;
}) {
  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm space-y-sm">
      <h2 className="font-headline-sm text-headline-sm text-on-surface">{event.title}</h2>
      <p className="font-body-md text-body-md text-on-surface-variant flex items-start gap-xs">
        <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden>schedule</span>
        <span>
          {formatInTz(event.start_time, event.timezone)} → {formatInTz(event.end_time, event.timezone)}
        </span>
      </p>
      <p className="font-body-md text-body-md text-on-surface-variant flex items-start gap-xs">
        <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden>location_on</span>
        <span>{event.venue_name}</span>
      </p>
      {code && (
        <div className="mt-sm pt-sm border-t border-outline-variant flex items-center justify-between">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
            Your code
          </span>
          <code className="font-mono font-label-md text-label-md text-primary bg-secondary-fixed px-sm py-xs rounded-full">
            {code}
          </code>
        </div>
      )}
    </section>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="text-center space-y-sm">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary-container text-on-secondary-container rounded-full mb-sm" aria-hidden>
        <span className="material-symbols-outlined text-[32px]">{icon}</span>
      </div>
      <h1 className="font-headline-sm text-headline-sm text-on-surface">{title}</h1>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-sm mx-auto">
        {body}
      </p>
    </div>
  );
}
