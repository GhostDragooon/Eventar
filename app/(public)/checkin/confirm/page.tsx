import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTz } from '@/lib/tz';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { rateLimitByIp } from '@/lib/rateLimit';
import { getRequestOrigin } from '@/lib/origin';
import { buildCheckinQrPng } from '@/lib/checkinQr';
import { PublicShell } from '@/components/shell/PublicShell';
import ConfirmButton from './ConfirmButton';
import { CHECKIN_OPEN_MINUTES } from '@/lib/lifecycle/eventLifecycle';

export const metadata = {
  title: 'Your check-in pass',
  robots: { index: false, follow: false },
};

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
    status: string;
    check_in_at: string | null;
    check_in_method: string | null;
    events: EventRow | EventRow[] | null;
  };
  // full_name is deliberately NOT selected: this GET is anonymous and reachable
  // by anyone holding (or guessing) the code, so returning the registrant's name
  // is a name↔event enumeration oracle (Phase-8 gate 1, closed in 7c5bcbd and
  // re-opened by a later restyle — see page.test.tsx). The holder already knows
  // who they are; reception identifies by QR/code, not a printed name.
  const { data: reg, error: regErr } = (await admin
    .from('registrations')
    .select(
      'id, status, check_in_at, check_in_method, ' +
        'events!inner(id, title, start_time, end_time, timezone, venue_name, status, checkin_modes)',
    )
    .eq('registration_code', code)
    .maybeSingle()) as { data: RegRow | null; error: { code?: string } | null };

  // A lookup FAILURE is not an unrecognised code (rule 12). Collapsing the two
  // told an attendee their code was wrong when the platform was at fault, and
  // then routed them to a manual check-in that would fail identically. Log the
  // code only — no PII, no row data.
  if (regErr) {
    console.error('[checkin] registration lookup failed', { code: regErr.code });
    return (
      <Empty
        title="Something went wrong"
        body="We couldn't look up your pass just now. Your registration is unaffected — please try again in a moment, or show this page to a member of staff."
      />
    );
  }

  if (!reg || !reg.events) {
    return <Empty title="Code not recognised" body="Please show this code (or your QR) to the event organiser. They can check you in manually." />;
  }

  const event = Array.isArray(reg.events) ? reg.events[0] : reg.events;
  // An unpublished event is a real state, not an unrecognised code — the demo
  // run sheet pre-opens this page before the publish beat and it read as a
  // broken seed.
  if (!event) {
    return <Empty title="Code not recognised" body="Please show this code (or your QR) to the event organiser. They can check you in manually." />;
  }
  if (event.status !== 'published') {
    return (
      <Empty
        title="This event isn't open yet"
        body="Your registration is valid — the organiser hasn't published this event yet. Your pass will appear here once they do."
      />
    );
  }

  // A cancelled registration must not render a green "Pass ready" pill, a QR
  // and a tappable button. self_check_in refuses it, so the old page showed a
  // valid-looking pass right up until the tap failed — at a door, at the least
  // recoverable moment.
  if (reg.status === 'cancelled') {
    return (
      <Empty
        title="This registration was cancelled"
        body="If you think that's wrong, please speak to the event organiser — they can re-register you."
      />
    );
  }

  // Checked-in success state (final v2) — server-rendered when reception (or
  // self-serve) already marked them in.
  if (reg.status === 'attended') {
    // CPD credit banner: user-lens 2026-08-26 caught that the client-side
    // ok-state render in ConfirmButton never got a paint frame (revalidatePath
    // replaces PassView → CheckedInView in the same React 19 transition). The
    // banner lives here now so it always renders after attendance is marked
    // — including on a return visit or a staff-driven manual check-in that
    // the attendee never triggered themselves. Read-only via a definer that
    // resolves email → auth.users.id (see the migration for the why).
    let creditStatus: 'posted' | 'pending' | 'missing' | 'silence' = 'silence';
    const { data: creditData, error: creditErr } = await admin.rpc(
      'registration_credit_status',
      { p_event_id: event.id, p_registration_code: code },
    );
    if (creditErr) {
      // Fall silent (rule 12: fail visibly at the LOG, not in the UI). The
      // banner is a helpful signal — a lookup failure showing "missing" would
      // send every attendee to reception on a transient RPC error.
      console.error('[checkin] credit status lookup failed', { code: creditErr.code });
    } else if (
      creditData === 'posted' ||
      creditData === 'pending' ||
      creditData === 'missing'
    ) {
      creditStatus = creditData;
    }
    return (
      <PublicShell pill={{ label: 'Checked in', tone: 'success' }}>
        <PageWrap>
          <CheckedInView
            event={event}
            checkInAt={reg.check_in_at}
            method={reg.check_in_method}
            creditStatus={creditStatus}
          />
        </PageWrap>
      </PublicShell>
    );
  }

  // Pass state — build the personal QR (encodes this page's own URL, same
  // value the Email #2 pass carries).
  const origin = await getRequestOrigin();
  const qr = await buildCheckinQrPng(code, origin);
  const selfServe = event.checkin_modes?.self_serve === true;
  // The same window self_check_in enforces (20260804010000 / 20260804040000):
  // [start - CHECKIN_OPEN_MINUTES, end]. Computed here so the pass tells the
  // attendee where they stand instead of making them tap to find out.
  const opensAtMs = new Date(event.start_time).getTime() - CHECKIN_OPEN_MINUTES * 60_000;
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const checkinState: 'early' | 'open' | 'closed' =
    nowMs < opensAtMs ? 'early' : nowMs > new Date(event.end_time).getTime() ? 'closed' : 'open';

  return (
    <PublicShell pill={{ label: 'Pass ready', tone: 'success' }}>
      <PageWrap>
        <PassView event={event} code={code} qrDataUri={`data:image/png;base64,${qr.pngBase64}`} selfServe={selfServe} checkinState={checkinState} opensAtIso={new Date(opensAtMs).toISOString()} />
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
  qrDataUri,
  selfServe,
  checkinState,
  opensAtIso,
}: {
  event: EventRow;
  code: string;
  qrDataUri: string;
  selfServe: boolean;
  /** Where `now` sits relative to this event's own check-in window. */
  checkinState: 'early' | 'open' | 'closed';
  opensAtIso: string;
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
        {/* No name here: this pass is served on an anonymous, code-addressable
            GET, so the identity line would leak a stranger's name to anyone who
            guesses a code (Phase-8 gate 1). The event above + QR below identify
            the pass without naming its holder. */}
        <div className="flex items-baseline justify-between px-lg pt-md pb-sm">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Check-in pass</span>
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
            <code className="font-mono font-extrabold text-[calc(26px*var(--text-scale))] tracking-[0.14em] text-[color:var(--on-primary-container)]">
              {code}
            </code>
            <p className="font-body-md text-[calc(12px*var(--text-scale))] text-on-surface-variant mt-xs m-0">
              If the QR won&apos;t scan, give reception this code instead.
            </p>
          </div>
        </div>
      </div>

      {!selfServe ? (
        <p className="font-body-md text-body-md text-on-surface-variant text-center m-0">
          Self check-in isn&apos;t enabled for this event — please see reception.
        </p>
      ) : checkinState === 'open' ? (
        <>
          <ConfirmButton code={code} />
          <p className="font-body-md text-body-md text-on-surface-variant text-center m-0">
            Tap when you arrive · staff will see you in the roster instantly.
          </p>
        </>
      ) : checkinState === 'early' ? (
        // The button used to render regardless of the clock, so tapping it was
        // the only way to discover check-in hadn't opened. The window is known
        // here — say so instead of letting the server refuse.
        <p className="font-body-md text-body-md text-on-surface-variant text-center m-0">
          Check-in opens at {formatClock(opensAtIso, event.timezone)} on{' '}
          {formatDate(event.start_time, event.timezone)} — an hour before the event starts. Keep this pass handy.
        </p>
      ) : (
        <p className="font-body-md text-body-md text-on-surface-variant text-center m-0">
          Check-in for this event has closed. Please see a member of staff.
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
  creditStatus,
}: {
  event: EventRow;
  checkInAt: string | null;
  method: string | null;
  /** 'posted' → green success banner, 'missing' → see-reception nudge,
   *  'silence' → no banner (event is non-CPD, or upstream refused). */
  creditStatus: 'posted' | 'pending' | 'missing' | 'silence';
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
          <span className="material-symbols-outlined text-[calc(40px*var(--text-scale))]">check</span>
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

      {/* CPD credit banner — same tone/colour/icon as the old ConfirmButton
          ok-state; JSX reused verbatim so posted/missing read identically
          across the surface. Silence renders nothing. */}
      {creditStatus === 'posted' && (
        <p
          role="status"
          aria-live="polite"
          className="font-body-md text-body-md text-on-success-container bg-success-container border border-success-container rounded-lg px-md py-sm flex items-start gap-sm m-0"
        >
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden data-fill="1">check_circle</span>
          <span className="flex-1">CPD credit recorded.</span>
        </p>
      )}
      {creditStatus === 'pending' && (
        <p
          role="status"
          aria-live="polite"
          className="font-body-md text-body-md text-on-surface-variant bg-surface-container border border-outline-variant rounded-lg px-md py-sm flex items-start gap-sm m-0"
        >
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>info</span>
          <span className="flex-1">
            CPD credit is pending.{' '}
            <Link
              href="/account/sign-in?next=/account/claim"
              className="text-primary-ink hover:underline font-semibold"
            >
              Sign in or sign up
            </Link>{' '}
            with the email you registered with to link this attendance to
            your account and release credit — reception can&apos;t do this
            for you.
          </span>
        </p>
      )}
      {creditStatus === 'missing' && (
        <p
          role="status"
          aria-live="polite"
          className="font-body-md text-body-md text-on-surface-variant bg-surface-container border border-outline-variant rounded-lg px-md py-sm flex items-start gap-sm m-0"
        >
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>info</span>
          <span className="flex-1">
            We couldn&apos;t record your CPD credit for this event. Please see
            reception before you leave.
          </span>
        </p>
      )}
    </>
  );
}
