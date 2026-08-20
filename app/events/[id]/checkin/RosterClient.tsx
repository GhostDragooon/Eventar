'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { formatInTz } from '@/lib/tz';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { humanizeCameraError } from '@/lib/cameraError';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { markAttended } from './actions';
import { Scoreboard } from './Scoreboard';
import { ScanAndManual } from './ScanAndManual';
import { SpeakersCard, type SpeakerCheckinRow } from './SpeakersCard';

type RosterRow = {
  id: string;
  full_name: string;
  email: string;
  registration_code: string;
  status: 'registered' | 'attended' | 'cancelled';
  check_in_at: string | null;
  check_in_method: 'qr' | 'manual' | null;
};

type Toast = { kind: 'ok' | 'err'; message: string };

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
  lifecycle,
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
  lifecycle: Lifecycle;
  initialRoster: RosterRow[];
  /** registration_id \u2192 eligibility enum from event_registration_eligibility. */
  eligibility: Record<string, string>;
  eligibilityUnavailable: boolean;
  maxAttendees: number | null;
  speakerNames: string[];
  initialSpeakerCheckins: SpeakerCheckinRow[];
}) {
  const [roster, setRoster] = useState<RosterRow[]>(initialRoster);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'attended' | 'registered'>('all');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

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

  async function handleMark(code: string, method: 'qr' | 'manual') {
    const res = await markAttended(code, method);
    if ('error' in res) {
      const suffix = res.alreadyAttendedAt
        ? ` at ${formatInTz(res.alreadyAttendedAt, eventTimezone)}`
        : '';
      setToast({ kind: 'err', message: `${res.error.replace(/\.$/, '')}${suffix}.` });
      return;
    }
    const creditLines = res.credit?.lines?.length ? ` \u00b7 ${res.credit.lines.join(' \u00b7 ')}` : '';
    setToast({
      kind: res.credit?.allSkipped ? 'err' : 'ok',
      message: `Marked ${res.registration.full_name} attended (${res.registration.event_title})${creditLines}.`,
    });
    // Realtime broadcast will update the roster; no optimistic update needed.
  }

  return (
    <div className="flex flex-col gap-grid-gutter">
      <Scoreboard
        lifecycle={lifecycle}
        startMs={startMs}
        attended={attendedCount}
        registered={registeredTotal}
      />

      <ScanAndManual
        onScanClick={() => setScannerOpen(true)}
        onManualSubmit={(code) => handleMark(code, 'manual')}
      />

      <SpeakersCard
        eventId={eventId}
        eventTimezone={eventTimezone}
        speakerNames={speakerNames}
        initialCheckins={initialSpeakerCheckins}
        onError={(message) => setToast({ kind: 'err', message })}
      />

      {scannerOpen && (
        <ScannerPanel
          onScan={code => handleMark(code, 'qr')}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {eligibilityUnavailable && (
        <p className="mb-md rounded-lg bg-warning-container px-md py-sm font-body-md text-body-md text-on-warning-container">
          CPD eligibility couldn&rsquo;t be checked just now, so this roster isn&rsquo;t showing which attendees will
          earn a credit. Check-in still works normally and credits post as usual &mdash; only the warnings are missing.
        </p>
      )}

      <section className="bg-surface-container-lowest rounded-[20px] border border-outline-variant p-md overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-md border-b border-outline-variant pb-sm mb-sm">
          <div className="flex gap-sm flex-wrap">
            <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label={`All (${registeredTotal})`} />
            <FilterPill active={statusFilter === 'attended'} onClick={() => setStatusFilter('attended')} label={`Checked in (${attendedCount})`} />
            <FilterPill active={statusFilter === 'registered'} onClick={() => setStatusFilter('registered')} label={`Pending (${registeredTotal - attendedCount})`} />
          </div>
          <div className="relative w-full md:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[calc(18px*var(--text-scale))]" aria-hidden>search</span>
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
            <p className="p-md font-body-md text-body-md text-on-surface-variant">
              {search || statusFilter !== 'all' ? 'No matches.' : 'No registrants yet.'}
            </p>
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
                    eventTimezone={eventTimezone}
                    onMark={() => handleMark(r.registration_code, 'manual')}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {toast && (
        <div
          role="status"
          className={
            'fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg px-md py-sm font-body-md text-body-md shadow-lg z-50 ' +
            (toast.kind === 'ok' ? 'bg-primary text-on-primary' : 'bg-error text-on-error')
          }
        >
          {toast.message}
        </div>
      )}
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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'font-label-md text-label-md px-md py-sm rounded-full border transition-colors ' +
        (active
          ? 'bg-secondary-container text-on-secondary-container border-transparent'
          : 'bg-transparent text-on-surface-variant border-outline-variant hover:bg-surface-container')
      }
    >
      {label}
    </button>
  );
}

function RosterRowItem({
  row: r,
  eligibility,
  nowMs,
  eventTimezone,
  onMark,
}: {
  row: RosterRow;
  eligibility?: string;
  nowMs: number;
  eventTimezone: string;
  onMark: () => void;
}) {
  const isAttended = r.status === 'attended';
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
          <p className="mt-[2px] flex items-start gap-xs font-body-md text-[calc(12px*var(--text-scale))] text-on-surface-variant">
            <span
              className="material-symbols-outlined text-[calc(14px*var(--text-scale))] leading-none mt-[2px]"
              aria-hidden
            >
              error
            </span>
            <span>{ELIGIBILITY_NOTE[eligibility]}</span>
          </p>
        )}
      </div>
      <code className="font-body-md text-[calc(13px*var(--text-scale))] text-on-surface-variant tabular-nums">
        {r.registration_code}
      </code>
      {isAttended ? (
        <span className="font-label-md text-label-md text-[color:var(--success)] inline-flex items-center gap-xs">
          <span aria-hidden>\u2713</span>
          {r.check_in_at ? formatInTz(r.check_in_at, eventTimezone) : 'Checked in'}
        </span>
      ) : (
        <button
          type="button"
          onClick={onMark}
          className="justify-self-start min-h-11 rounded-lg px-md py-sm font-label-md text-label-md bg-transparent text-primary-ink border border-outline-variant hover:bg-surface-container-low transition-colors"
        >
          Check in \u2192
        </button>
      )}
      <span className="font-label-md text-label-md text-on-surface-variant normal-case tracking-normal">
        {isAttended ? (r.check_in_method === 'qr' ? 'QR' : r.check_in_method === 'manual' ? 'Manual' : '\u2014') : '\u2014'}
      </span>
    </li>
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
    <div className="border border-outline-variant rounded-[20px] p-md bg-surface-container-low">
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
