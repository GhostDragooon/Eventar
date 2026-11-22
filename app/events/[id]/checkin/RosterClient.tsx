'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { checkDoorSession } from '@/lib/doorSession';
import { formatInTz } from '@/lib/tz';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { humanizeCameraError } from '@/lib/cameraError';
import { CHECKIN_ROLE_MESSAGE, checkInGateMessage, computeLifecycle, walkInClosedMessage, type EventLifecycleRow, type Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { markAttended, walkInRegisterAndCheckIn } from './actions';
import { Scoreboard } from './Scoreboard';
import { ScanAndManual } from './ScanAndManual';
import { SpeakersCard, type SpeakerCheckinRow } from './SpeakersCard';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/help/EmptyState';
import { useToast } from '@/components/ui/toast';

type RosterRow = {
  id: string;
  full_name: string;
  email: string;
  registration_code: string;
  status: 'registered' | 'attended' | 'cancelled';
  check_in_at: string | null;
  check_in_method: 'qr' | 'manual' | null;
};

type Toast = { kind: 'ok' | 'err'; message: string; signInHref?: string };

// proxy.ts turns an ended session into a redirect before a door action runs,
// so the action fails with a generic error and never reaches its own
// "signed out" branch. Ask the auth server which case it was (Ivan, 2026-10-15).
async function sessionEnded(): Promise<boolean> {
  try {
    const s = await checkDoorSession();
    return s === 'ended' || s === 'signed_out';
  } catch {
    return false;
  }
}
const doorSignIn = (eventId: string) =>
  `/login?next=${encodeURIComponent(`/events/${eventId}/checkin`)}`;
const isSignedOutMessage = (m: string) => m.startsWith("You’ve been signed out");

// What each eligibility value means AT THE DOOR. Only the exceptions appear —
// 'eligible' and 'not_cpd' render nothing, because a marker on every row of a
// non-CPD event is noise that implies a fixable problem.
//
// Deliberately about the CREDIT, never about the person: an operator learns
// "this attendance won't post a credit", not which body anyone is licensed
// with. That distinction is the whole reason the RPC returns an enum instead
// of licence rows (Hard Rule 10).
const ELIGIBILITY_NOTE: Record<string, string> = {
  no_licence: 'No verified licence with this event\u2019s accrediting body \u2014 checking in won\u2019t post a CPD credit.',
  no_account: 'No practitioner account for this email \u2014 checking in won\u2019t post a CPD credit.',
  cancelled: 'Registration cancelled \u2014 this attendee can\u2019t be checked in.',
};

// "Recent" window for the accent-fading roster row state (\u00a7 E.4 row states).
// 5 minutes balances "still feels fresh" against "the tablet isn\u2019t a party
// trick" \u2014 a longer window dilutes the affordance.
const RECENT_WINDOW_MS = 5 * 60_000;

export default function RosterClient({
  eventId,
  eventTimezone,
  eventStartTime,
  eventEndTime,
  lifecycleRow,
  serverNowMs,
  canCheckIn,
  initialRoster,
  eligibility,
  eligibilityUnavailable,
  maxAttendees: _maxAttendees,
  speakerNames,
  initialSpeakerCheckins,
}: {
  eventId: string;
  eventTimezone: string;
  eventStartTime: string;
  eventEndTime: string;
  /** What computeLifecycle needs. The desk derives the lifecycle from the ticking clock below, so check-in opens and closes without a reload (DB-02). */
  lifecycleRow: EventLifecycleRow;
  /**
   * The server's clock at render. The desk's clock is the server's, carried forward by the browser's own elapsed
   * time, so a tablet whose clock is minutes off never disables controls the server would accept (DB-02 review F2).
   */
  serverNowMs: number;
  /** False for a role mark_attended refuses (auditor), or staff of another organisation: the desk says so instead of offering controls that fail. */
  canCheckIn: boolean;
  initialRoster: RosterRow[];
  /** registration_id \u2192 eligibility enum from event_registration_eligibility. */
  eligibility: Record<string, string>;
  eligibilityUnavailable: boolean;
  /**
   * Capacity, currently unused — the Scoreboard renders attended/registered.
   * Kept on the prop contract so the page can pass it without divergence; a
   * future capacity surface (e.g. waitlist) can pick it up without touching
   * the page.
   */
  maxAttendees: number | null;
  speakerNames: string[];
  initialSpeakerCheckins: SpeakerCheckinRow[];
}) {
  const [roster, setRoster] = useState<RosterRow[]>(initialRoster);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'attended' | 'registered'>('all');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  // Shared toast: an outcome with a Log in action stays until dismissed; the rest auto-dismiss.
  const { toast: pushToast } = useToast();
  const setToast = (t: Toast) =>
    pushToast(t.kind === 'ok' ? 'success' : 'error', t.message, t.signInHref ? { label: 'Log in', href: t.signInHref } : undefined);
  // Server time minus this browser's clock, fixed at mount: nowMs below is the server's clock moving forward.
  const [clockOffsetMs] = useState<number>(() => serverNowMs - Date.now());
  const [nowMs, setNowMs] = useState<number>(serverNowMs);

  useEffect(() => {
    const tick = () => setNowMs(Date.now() + clockOffsetMs);
    const id = setInterval(tick, 30_000);
    // A tablet woken from sleep (or a throttled background tab) must not wait out the interval.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [clockOffsetMs]);

  // One clock for every control on the desk. mark_attended and self_check_in refuse outside
  // [start - 60 min, end] (DB-02); computeLifecycle's 'live' is the same window, so the controls here are
  // disabled with the reason exactly when the server would refuse, and enable when the window opens.
  const lifecycle = computeLifecycle(lifecycleRow, nowMs);
  const checkInClosed = canCheckIn ? checkInGateMessage(lifecycle) : CHECKIN_ROLE_MESSAGE;

  useEffect(() => {
    const client = supabaseBrowser();
    const channel = client
      .channel(`registrations:event=${eventId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'registrations', filter: `event_id=eq.${eventId}` },
        payload => {
          const next = payload.new as RosterRow;
          setRoster(prev => prev.map(r => (r.id === next.id ? { ...r, ...next } : r)));
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'registrations', filter: `event_id=eq.${eventId}` },
        payload => {
          const newRow = payload.new as RosterRow;
          setRoster(prev =>
            [...prev, newRow].sort((a, b) => a.full_name.localeCompare(b.full_name)),
          );
        },
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [eventId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byStatus = roster.filter(r =>
      statusFilter === 'all' ? true : statusFilter === 'attended' ? r.status === 'attended' : r.status === 'registered',
    );
    if (!q) return byStatus;
    return byStatus.filter(
      r => r.full_name.toLowerCase().includes(q) || r.registration_code.toLowerCase().includes(q),
    );
  }, [roster, search, statusFilter]);

  const attendedCount = roster.filter(r => r.status === 'attended').length;
  const registeredTotal = roster.length;
  const startMs = useMemo(() => new Date(eventStartTime).getTime(), [eventStartTime]);
  const endMs = useMemo(() => new Date(eventEndTime).getTime(), [eventEndTime]);

  // Returns the outcome as well as toasting it: the manual-entry dialog shows
  // its own inline success/error state, so it needs the result rather than
  // inferring anything from a toast it cannot see.
  async function handleMark(
    code: string,
    method: 'qr' | 'manual',
  ): Promise<{ ok: true; name: string } | { error: string }> {
    let res: Awaited<ReturnType<typeof markAttended>>;
    try {
      res = await markAttended(code, method);
    } catch {
      // QR, manual dialog and row button all land here: never a silent dead
      // end. A retry is safe: a repeat comes back as "already attended".
      const ended = await sessionEnded();
      const message = ended
        ? "You’ve been signed out. This check-in was not saved."
        : "Could not confirm this check-in. Try the code again; a repeat won’t check them in twice.";
      setToast({ kind: 'err', message, signInHref: ended ? doorSignIn(eventId) : undefined });
      return { error: message };
    }
    if ('error' in res) {
      const suffix = res.alreadyAttendedAt
        ? ` at ${formatInTz(res.alreadyAttendedAt, eventTimezone)}`
        : '';
      const message = `${res.error.replace(/\.$/, '')}${suffix}.`;
      setToast({ kind: 'err', message, signInHref: isSignedOutMessage(res.error) ? doorSignIn(eventId) : undefined });
      return { error: message };
    }
    const creditLines = res.credit?.lines?.length ? ` \u00b7 ${res.credit.lines.join(' \u00b7 ')}` : '';
    setToast({
      kind: res.credit?.allSkipped ? 'err' : 'ok',
      message: `Marked ${res.registration.full_name} attended (${res.registration.event_title})${creditLines}.`,
    });
    // Realtime broadcast will update the roster; no optimistic update needed.
    return { ok: true, name: res.registration.full_name };
  }

  return (
    <div className="flex flex-col gap-grid-gutter">
      <Scoreboard
        lifecycle={lifecycle}
        startMs={startMs}
        endMs={endMs}
        attended={attendedCount}
        registered={registeredTotal}
      />

      <ScanAndManual
        closedMessage={checkInClosed}
        onScanClick={() => setScannerOpen(true)}
        onManualSubmit={(code) => handleMark(code, 'manual')}
      />

      <Button
        type="button"
        variant="outline"
        onClick={() => setWalkInOpen(true)}
        disabled={!canCheckIn}
        aria-describedby={canCheckIn ? undefined : 'checkin-closed-note'}
        className="self-start font-label-md text-label-md px-md py-sm"
      >
        + Walk-in
      </Button>

      {walkInOpen && (
        <WalkInDialog
          eventId={eventId}
          lifecycle={lifecycle}
          onClose={() => setWalkInOpen(false)}
          onSuccess={(name, creditLines) => {
            setWalkInOpen(false);
            const suffix = creditLines?.length ? ` · ${creditLines.join(' · ')}` : '';
            setToast({ kind: 'ok', message: `Registered & checked in ${name}${suffix}.` });
          }}
        />
      )}

      <SpeakersCard
        eventId={eventId}
        eventTimezone={eventTimezone}
        speakerNames={speakerNames}
        initialCheckins={initialSpeakerCheckins}
        canCheckIn={checkInClosed == null}
        closedMessage={checkInClosed}
        onError={(message) => setToast({ kind: 'err', message })}
      />

      {scannerOpen && (
        <ScannerPanel
          onScan={code => handleMark(code, 'qr')}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {eligibilityUnavailable && canCheckIn && (
        <p className="mb-md rounded-lg bg-warning-container px-md py-sm font-body-md text-body-md text-on-warning-container">
          <abbr title="Continuing professional development">CPD</abbr> eligibility couldn’t be checked just now, so this roster isn’t showing which attendees will
          earn a credit. Check-in still works normally and credits post as usual &mdash; only the warnings are missing.
        </p>
      )}

      <section className="bg-surface-container-lowest rounded-card border border-outline-variant p-md overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-md border-b border-outline-variant pb-sm mb-sm">
          <div className="flex gap-sm flex-wrap">
            <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label={`All (${registeredTotal})`} />
            <FilterPill active={statusFilter === 'attended'} onClick={() => setStatusFilter('attended')} label={`Checked in (${attendedCount})`} />
            <FilterPill active={statusFilter === 'registered'} onClick={() => setStatusFilter('registered')} label={`Pending (${registeredTotal - attendedCount})`} />
          </div>
          <div className="relative w-full md:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[calc(1.125rem*var(--text-scale))]" aria-hidden>search</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or code"
              className="w-full pl-9 pr-3 py-1.5 bg-surface-container-low border border-outline-variant rounded-full font-body-md text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <EmptyState
              icon="group"
              title={search || statusFilter !== 'all' ? 'No matches' : 'No registrants yet'}
              description={search || statusFilter !== 'all' ? 'Try another name, code or filter.' : 'People appear here as they register.'}
            />
          ) : (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_110px_150px_90px] gap-md px-sm pb-xs font-label-md text-label-md text-on-surface-variant uppercase tracking-wider" aria-hidden>
                <span>Attendee</span>
                <span>Code</span>
                <span>Status</span>
                <span>Method</span>
              </div>
              <ul className="divide-y divide-surface-container-highest">
                {filtered.map(r => (
                  <RosterRowItem
                    key={r.id}
                    row={r}
                    eligibility={eligibility[r.id]}
                    nowMs={nowMs}
                    checkInClosed={checkInClosed}
                    eventTimezone={eventTimezone}
                    onMark={() => handleMark(r.registration_code, 'manual')}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    // aria-pressed selection, not a plain action — same pattern as EventCard's
    // Save. Kept on <Button> rather than the Toggle primitive so the existing
    // secondary-container "on" colour survives (Toggle's on-state is bg-muted).
    <Button
      type="button"
      variant={active ? 'secondary' : 'outline'}
      onClick={onClick}
      aria-pressed={active}
      className="font-label-md text-label-md px-md py-sm"
    >
      {label}
    </Button>
  );
}

function RosterRowItem({
  row: r,
  eligibility,
  nowMs,
  checkInClosed,
  eventTimezone,
  onMark,
}: {
  row: RosterRow;
  eligibility?: string;
  nowMs: number;
  /** Why check-in is closed right now (DB-02), or null when it is open. */
  checkInClosed: string | null;
  eventTimezone: string;
  onMark: () => void;
}) {
  const isAttended = r.status === 'attended';
  const isCancelled = r.status === 'cancelled';
  const checkInMs = r.check_in_at ? new Date(r.check_in_at).getTime() : null;
  const isRecent = isAttended && checkInMs !== null && nowMs - checkInMs <= RECENT_WINDOW_MS;

  const rowBg = isRecent
    ? 'bg-primary-container/60'
    : isAttended
      ? 'bg-surface-container-low'
      : 'bg-transparent hover:bg-surface-container-low';

  return (
    <li
      data-row-state={isRecent ? 'recent' : isAttended ? 'checked' : 'default'}
      className={`grid grid-cols-[minmax(0,1fr)_110px_150px_90px] gap-md items-center py-sm px-sm transition-colors ${rowBg}`}
    >
      <div className="min-w-0">
        <p className="font-body-md text-body-md font-semibold text-on-surface truncate">
          {r.full_name}
        </p>
        {eligibility && ELIGIBILITY_NOTE[eligibility] && (
          <p className="mt-[0.125rem] flex items-start gap-xs font-body-md text-[calc(0.75rem*var(--text-scale))] text-on-surface-variant">
            <span
              className="material-symbols-outlined text-[calc(0.875rem*var(--text-scale))] leading-none mt-[0.125rem]"
              aria-hidden
            >
              error
            </span>
            <span>{ELIGIBILITY_NOTE[eligibility]}</span>
          </p>
        )}
      </div>
      <code className="font-body-md text-[calc(0.8125rem*var(--text-scale))] text-on-surface-variant tabular-nums">
        {r.registration_code}
      </code>
      {isAttended ? (
        <span className="font-label-md text-label-md text-[color:var(--success)] inline-flex items-center gap-xs">
          <span aria-hidden>{'\u2713'}</span>
          {r.check_in_at ? formatInTz(r.check_in_at, eventTimezone) : 'Checked in'}
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={onMark}
          disabled={isCancelled || checkInClosed != null}
          aria-describedby={checkInClosed && !isCancelled ? 'checkin-closed-note' : undefined}
          className="justify-self-start min-h-11 px-md py-sm font-label-md text-label-md text-primary-ink"
        >
          Check in →
        </Button>
      )}
      <span className="font-label-md text-label-md text-on-surface-variant normal-case tracking-normal">
        {isAttended ? (r.check_in_method === 'qr' ? 'QR' : r.check_in_method === 'manual' ? 'Manual' : '\u2014') : '\u2014'}
      </span>
    </li>
  );
}

function WalkInDialog({
  eventId,
  lifecycle,
  onClose,
  onSuccess,
}: {
  eventId: string;
  lifecycle: Lifecycle;
  onClose: () => void;
  onSuccess: (name: string, creditLines?: string[]) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signInHref, setSignInHref] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The server action enforces this too (it's the source of truth) — this
  // is the same check surfaced up front, so an operator learns the event
  // is closed before filling the form and waiting on a doomed round trip,
  // rather than only after submitting (user-lens finding, 2026-09-19).
  const closedMessage = walkInClosedMessage(lifecycle);
  // Why the button is grey (UX-R4): same wording shape as RegisterCard's reason line.
  const missing = !name.trim() ? (!email.trim() ? 'name and email' : 'name') : !email.trim() ? 'email' : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSignInHref(null);
    setSubmitting(true);
    let res: Awaited<ReturnType<typeof walkInRegisterAndCheckIn>>;
    try {
      res = await walkInRegisterAndCheckIn({ eventId, fullName: name, email });
    } catch {
      // Never leave the button stuck on "Registering…" (user-lens, 2026-10-14).
      // The insert may have landed before the response was lost, so never
      // claim "nothing was saved"; a retry of a saved walk-in says so.
      const ended = await sessionEnded();
      setError(ended ? "You’ve been signed out. This walk-in was not saved." : 'Could not confirm this walk-in. Check the roster before trying again.');
      setSignInHref(ended ? doorSignIn(eventId) : null);
      return;
    } finally {
      setSubmitting(false);
    }
    if ('error' in res) {
      setError(res.error);
      setSignInHref(isSignedOutMessage(res.error) ? doorSignIn(eventId) : null);
      return;
    }
    onSuccess(res.registration.full_name, res.credit?.lines);
  }

  return (
    <div className="border border-outline-variant rounded-card p-md bg-surface-container-low">
      <div className="flex items-center justify-between mb-sm">
        <h2 className="font-title-lg text-title-lg text-on-surface">Walk-in registration</h2>
        <button type="button" onClick={onClose} className="font-label-md text-label-md text-primary-ink hover:underline">
          Close
        </button>
      </div>
      {closedMessage && (
        <p role="alert" className="font-body-md text-body-md text-error mb-sm">{closedMessage}</p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-sm">
        <input
          type="text"
          required
          placeholder="Full name"
          value={name}
          onChange={e => { setName(e.target.value); if (!signInHref) setError(null); }}
          className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={e => { setEmail(e.target.value); if (!signInHref) setError(null); }}
          className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        {error && (
          <p className="font-body-md text-body-md text-error">
            {error}
            {signInHref && (
              <>
                {' '}
                <a href={signInHref} className="underline font-semibold">
                  Log in
                </a>
              </>
            )}
          </p>
        )}
        {missing && !closedMessage && !submitting && (
          <p id="walkin-why" aria-live="polite" className="m-0 font-body-md text-body-md text-on-surface-variant">
            Enter the {missing} to register this walk-in.
          </p>
        )}
        <Button
          type="submit"
          disabled={submitting || closedMessage != null || missing != null}
          aria-describedby={missing && !closedMessage ? 'walkin-why' : undefined}
          className="self-start min-h-11 px-md py-sm font-label-md text-label-md"
        >
          {submitting ? 'Registering…' : 'Register & check in'}
        </Button>
      </form>
    </div>
  );
}

function ScannerPanel({
  onScan,
  onClose,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const lastScannedRef = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    let scanner: import('html5-qrcode').Html5Qrcode | null = null;
    let cancelled = false;

    (async () => {
      try {
        const mod = await import('html5-qrcode');
        if (cancelled) return;
        scanner = new mod.Html5Qrcode('qr-reader');
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          decodedText => {
            let code: string | null = null;
            try {
              const u = new URL(decodedText);
              code = u.searchParams.get('code');
            } catch {
              code = decodedText.trim().toUpperCase();
            }
            if (!code || !isValidRegistrationCode(code)) return;

            const now = Date.now();
            const last = lastScannedRef.current;
            if (last && last.code === code && now - last.at < 3000) return;
            lastScannedRef.current = { code, at: now };

            onScan(code);
          },
          undefined,
        );
      } catch (e) {
        if (cancelled) return;
        setError(humanizeCameraError(e));
      }
    })();

    return () => {
      cancelled = true;
      scanner?.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: fresh scanner per mount
  }, []);

  return (
    <div className="border border-outline-variant rounded-card p-md bg-surface-container-low">
      <div className="flex items-center justify-between mb-sm">
        <h2 className="font-title-lg text-title-lg text-on-surface">Point camera at QR</h2>
        <button
          type="button"
          onClick={onClose}
          className="font-label-md text-label-md text-primary-ink hover:underline"
        >
          Close
        </button>
      </div>
      <div id="qr-reader" className="mx-auto" style={{ width: 320, maxWidth: '100%' }} />
      {error && (
        <p className="font-body-md text-body-md text-error mt-sm">{error}</p>
      )}
    </div>
  );
}
