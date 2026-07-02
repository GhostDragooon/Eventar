import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTz } from '@/lib/tz';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { rateLimitByIp } from '@/lib/rateLimit';
import { getRequestOrigin } from '@/lib/origin';
import { buildCheckinQrPng } from '@/lib/checkinQr';
import { PublicShell } from '@/components/shell/PublicShell';
import ConfirmButton from './ConfirmButton';

// CI — the attendee's check-in pass (Design Session Log §"CI page identity").
// A DISPLAY surface: the attendee presents the QR + code to reception; the
// check-in action lives in TC. When the organizer enables self-serve
// (events.checkin_modes.self_serve) a "Confirm I'm here" button appears.

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

type EventRow = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  timezone: string;
  venue_name: string;
  status: string;
  checkin_modes: { staff?: boolean; self_serve?: boolean } | null;
};

export default async function SelfCheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!code) {
    return (
      <Empty
        title="No check-in code"
        body="Open this page from your registration link or by scanning your personal QR code. If you don't have one, ask the event organiser for help."
      />
    );
  }
  if (!isValidRegistrationCode(code)) {
    return <Empty title="Code not recognised" body="Please show this code (or your QR) to the event organiser. They can check you in manually." />;
  }

  // Enumeration defense: cap per-IP page loads before the admin lookup runs.
  const limit = await rateLimitByIp('confirmGet', { windowMs: 60_000, max: 60 });
  if (!limit.allowed) {
    return <Empty title="Too many requests" body="Please slow down and try again in a moment." />;
  }

  const admin = supabaseAdmin();
  // The select string with !inner embed confuses supabase-js's generic
  // inference — cast to the shape we actually request.
  type RegRow = {
    id: string;
    full_name: string;
    status: string;
    check_in_at: string | null;
    check_in_method: string | null;
    events: EventRow | EventRow[] | null;
  };
  const { data: reg } = (await admin
    .from('registrations')
    .select(
      'id, full_name, status, check_in_at, check_in_method, ' +
        'events!inner(id, title, start_time, end_time, timezone, venue_name, status, checkin_modes)',
    )
    .eq('registration_code', code)
    .maybeSingle()) as { data: RegRow | null };

  if (!reg || !reg.events) {
    return <Empty title="Code not recognised" body="Please show this code (or your QR) to the event organiser. They can check you in manually." />;
  }

  const event = Array.isArray(reg.events) ? reg.events[0] : reg.events;
  if (!event || event.status !== 'published') {
    return <Empty title="Code not recognised" body="Please show this code (or your QR) to the event organiser. They can check you in manually." />;
  }

  // Checked-in success state (final v2) — server-rendered when reception (or
  // self-serve) already marked them in.
  if (reg.status === 'attended') {
    return (
      <PublicShell pill={{ label: 'Checked in', tone: 'success' }}>
        <PageWrap>
          <CheckedInView event={event} checkInAt={reg.check_in_at} method={reg.check_in_method} />
        </PageWrap>
      </PublicShell>
    );
  }

  // Pass state — build the personal QR (encodes this page's own URL, same
  // value the Email #2 pass carries).
  const origin = await getRequestOrigin();
  const qr = await buildCheckinQrPng(code, origin);
  const selfServe = event.checkin_modes?.self_serve === true;

  return (
    <PublicShell pill={{ label: 'Pass ready', tone: 'success' }}>
      <PageWrap>
        <PassView event={event} code={code} name={reg.full_name} qrDataUri={`data:image/png;base64,${qr.pngBase64}`} selfServe={selfServe} />
      </PageWrap>
    </PublicShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md mx-auto px-grid-margin py-lg flex flex-col gap-lg">
      {children}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <PublicShell>
      <PageWrap>
        <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">{title}</h1>
        <p className="font-body-md text-body-md text-on-surface-variant m-0">{body}</p>
      </PageWrap>
    </PublicShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Pass state                                                                  */
/* -------------------------------------------------------------------------- */

function EventCard({ event, accent }: { event: EventRow; accent?: boolean }) {
  return (
    <div className={`bg-surface-container-lowest border border-outline-variant rounded-[16px] p-md ${accent ? 'border-l-4 border-l-[color:var(--success)]' : ''}`}>
      <p className="font-title-lg text-title-lg font-semibold text-on-surface m-0">{event.title}</p>
      <p className="font-body-md text-body-md text-on-surface-variant mt-xs m-0">
        <span className="text-on-primary-container font-semibold">{formatDate(event.start_time, event.timezone)}</span>
        {' · '}
        {formatTimeRange(event.start_time, event.end_time, event.timezone)} ({event.timezone})
      </p>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">{event.venue_name}</p>
    </div>
  );
}

function PassView({
  event,
  code,
  name,
  qrDataUri,
  selfServe,
}: {
  event: EventRow;
  code: string;
  name: string;
  qrDataUri: string;
  selfServe: boolean;
}) {
  return (
    <>
      <header className="flex flex-col gap-xs">
        {/* Function-leads eyebrow: PASS · {event}. */}
        <p className="text-label-md font-semibold uppercase tracking-[0.18em] m-0">
          <span className="text-[color:var(--on-primary-container)]">Pass</span>
          <span className="text-on-surface-variant"> · {event.title}</span>
        </p>
        <p className="font-body-md text-body-md text-on-surface-variant m-0">
          Present your personal QR code below to the reception for check-in.
        </p>
      </header>

      {/* Brief event card ABOVE the pass (locked — confirms which event). */}
      <EventCard event={event} />

      {/* Pass card — perforated-ticket pattern. */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[20px] overflow-hidden shadow-sm">
        <div className="flex items-baseline justify-between px-lg pt-md pb-sm">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Issued to</span>
          <span className="font-body-md text-body-md font-semibold text-on-surface">{name}</span>
        </div>

        {/* Notched divider (ticket perforation). */}
        <div className="relative flex items-center" aria-hidden>
          <span className="w-[16px] h-[16px] rounded-full bg-background border border-outline-variant -ml-[8px]" />
          <span className="flex-1 border-t border-dashed border-outline-variant" />
          <span className="w-[16px] h-[16px] rounded-full bg-background border border-outline-variant -mr-[8px]" />
        </div>

        <div className="flex flex-col items-center gap-md px-lg py-lg">
          {/* 218px QR with the 2px green bezel (matches Live band greens). */}
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI QR; next/image adds nothing */}
          <img
            src={qrDataUri}
            alt="Your personal check-in QR code"
            width={218}
            height={218}
            className="rounded-[12px] border-2 border-[#4ADE80] bg-white p-xs"
          />
          <div className="text-center">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs m-0">
              Manual check-in code
            </p>
            <code className="font-mono font-extrabold text-[26px] tracking-[0.14em] text-[color:var(--on-primary-container)]">
              {code}
            </code>
            <p className="font-body-md text-[12px] text-on-surface-variant mt-xs m-0">
              If the QR won&apos;t scan, give reception this code instead.
            </p>
          </div>
        </div>
      </div>

      {selfServe ? (
        <>
          <ConfirmButton code={code} />
          <p className="font-body-md text-body-md text-on-surface-variant text-center m-0">
            Tap when you arrive · staff will see you in the roster instantly.
          </p>
        </>
      ) : (
        <p className="font-body-md text-body-md text-on-surface-variant text-center m-0">
          Self check-in isn&apos;t enabled for this event — please see reception.
        </p>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Checked-in success state (final v2)                                        */
/* -------------------------------------------------------------------------- */

function CheckedInView({
  event,
  checkInAt,
  method,
}: {
  event: EventRow;
  checkInAt: string | null;
  method: string | null;
}) {
  const via = method === 'qr' ? 'via self-scan' : method === 'manual' ? 'via reception' : null;
  return (
    <>
      {/* Event card at top (green left-accent). NO eyebrow, NO QR/code. */}
      <EventCard event={event} accent />

      <div className="flex flex-col items-center gap-md text-center py-md">
        <span
          className="inline-flex items-center justify-center w-[72px] h-[72px] rounded-full bg-[color:var(--success)] text-white shadow-[0_0_0_8px_rgba(22,163,74,0.15)]"
          aria-hidden
        >
          <span className="material-symbols-outlined text-[40px]">check</span>
        </span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">You&apos;re checked in.</h1>
        {(checkInAt || via) && (
          <span className="inline-flex items-center gap-xs px-md py-xs rounded-full bg-surface-container-high font-label-md text-label-md text-on-surface-variant normal-case tracking-normal">
            {checkInAt ? `at ${formatInTz(checkInAt, event.timezone)}` : ''}
            {checkInAt && via ? ' · ' : ''}
            {via ?? ''}
          </span>
        )}
        <p className="font-body-md text-body-md text-on-surface-variant m-0">
          Enjoy the sessions — we&apos;ll email a short survey after it wraps.
        </p>
      </div>
    </>
  );
}
