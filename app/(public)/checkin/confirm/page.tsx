import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTz } from '@/lib/tz';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { rateLimitByIp } from '@/lib/rateLimit';
import { PublicShell } from '@/components/shell/PublicShell';
import ConfirmButton from './ConfirmButton';

// §1 event-meta formatters — same shape as PE/(public)/events/[id]/page.tsx.
// Duplicated inline per rule 11 (convention) — both PE and CI keep their
// own copies until a third caller motivates lifting into lib/tz.ts.
function formatDate(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: tz,
  }).formatToParts(new Date(iso));
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.weekday} ${m.day} ${m.month}`;
}
function formatClock(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
  }).formatToParts(new Date(iso));
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.hour}:${m.minute}`;
}
function formatTimeRange(startIso: string, endIso: string, tz: string): string {
  return `${formatClock(startIso, tz)}–${formatClock(endIso, tz)}`;
}

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

  // Enumeration defense: cap per-IP page loads before the admin lookup runs.
  // 60/min easily covers legit re-renders; an attacker iterating codes
  // saturates quickly.
  const limit = await rateLimitByIp('confirmGet', { windowMs: 60_000, max: 60 });
  if (!limit.allowed) {
    return (
      <PublicShell>
        <PageWrap>
          <EmptyState
            icon="hourglass_empty"
            title="Too many requests"
            body="Please slow down and try again in a moment."
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
      'id, status, check_in_at, ' +
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
          <AttendedView event={event} checkInAt={reg.check_in_at} />
        </PageWrap>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <PageWrap>
        <RegisteredView event={event} code={code} />
      </PageWrap>
    </PublicShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

// §5 equal-gap rhythm: flex column, gap-lg, 480px-ish (max-w-md) container.
// Matches PE / LG conventions shipped in F.1.
function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md mx-auto px-grid-margin py-lg flex flex-col gap-lg">
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

function RegisteredView({
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
  code: string;
}) {
  // CI-2/3/4: pill (§9 top-left) → hero title → §1 2-row meta
  // CI-5: registration code (RC-B Strong popped — warm amber bg, golden text)
  // CI-6: primary button
  // CI-7: fine print
  return (
    <>
      <header className="flex flex-col gap-sm">
        <span
          className="self-start inline-flex items-center gap-xs px-sm py-xs rounded-full bg-success-container text-on-success-container font-label-md text-label-md uppercase tracking-wider"
        >
          <span aria-hidden>●</span> Ready to check in
        </span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
          {event.title}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant m-0">
          {event.venue_name}
        </p>
        <p className="font-body-md text-body-md text-on-surface-variant m-0">
          <span className="text-on-primary-container font-semibold">
            {formatDate(event.start_time, event.timezone)}
          </span>
          {' · '}
          {formatTimeRange(event.start_time, event.end_time, event.timezone)} ({event.timezone})
        </p>
      </header>

      <RegCodePopped code={code} label="Your registration code" />

      <ConfirmButton code={code} />

      <p className="font-body-md text-body-md text-on-surface-variant text-center m-0">
        Tap when you arrive · staff will see you in the roster instantly.
      </p>
    </>
  );
}

function AttendedView({
  event,
  checkInAt,
}: {
  event: {
    title: string;
    start_time: string;
    end_time: string;
    timezone: string;
    venue_name: string;
  };
  checkInAt: string | null;
}) {
  // Mirror RegisteredView's layout. Pill flips to "Checked in" (neutral
  // pattern §7a "done = absence of color"), the code card becomes the
  // checked-in timestamp instead.
  return (
    <>
      <header className="flex flex-col gap-sm">
        <span
          className="self-start inline-flex items-center gap-xs px-sm py-xs rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md uppercase tracking-wider"
        >
          <span aria-hidden data-fill="1" className="material-symbols-outlined text-[14px]">check</span>
          Checked in
        </span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
          {event.title}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant m-0">
          {event.venue_name}
        </p>
        <p className="font-body-md text-body-md text-on-surface-variant m-0">
          <span className="text-on-primary-container font-semibold">
            {formatDate(event.start_time, event.timezone)}
          </span>
          {' · '}
          {formatTimeRange(event.start_time, event.end_time, event.timezone)} ({event.timezone})
        </p>
      </header>

      <div className="text-center">
        <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs m-0">
          Checked in at
        </p>
        <p className="font-title-lg text-title-lg text-on-surface m-0">
          {checkInAt ? formatInTz(checkInAt, event.timezone) : 'an earlier time'}
        </p>
      </div>

      <p className="font-body-md text-body-md text-on-surface-variant text-center m-0">
        See you at the event.
      </p>
    </>
  );
}

// RC-B Strong popped registration code (mockup CI-5). Light: amber-50 bg +
// orange-900 text; dark: warm-black bg + golden text. Token mapping:
//   bg  = warning-container (FEF3C7 / rgba(252,211,77,0.15))
//   fg  = on-warning-container (92400E / FCD34D)
//   bd  = warning (D97706 / FCD34D)
// Reuses the design-pattern doc's locked warm palette.
function RegCodePopped({ code, label }: { code: string; label: string }) {
  return (
    <div
      className="bg-warning-container border border-warning rounded-[20px] p-lg text-center"
    >
      <p className="font-label-md text-label-md text-on-warning-container uppercase tracking-wider mb-xs m-0">
        {label}
      </p>
      <code
        className="font-mono font-bold text-[32px] tracking-widest text-on-warning-container"
      >
        {code}
      </code>
    </div>
  );
}

// EmptyState: drop the circle medallion (no M3 chrome). Just hero + body
// in the §5 rhythm. The `icon` prop kept on the signature for caller
// compatibility but no longer rendered — callers can be cleaned later.
function EmptyState({
  icon: _icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <>
      <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">{title}</h1>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">{body}</p>
    </>
  );
}
