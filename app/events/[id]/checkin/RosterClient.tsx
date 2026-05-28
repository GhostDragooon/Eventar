'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { formatInTz } from '@/lib/tz';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { humanizeCameraError } from '@/lib/cameraError';
import { markAttended } from './actions';

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

export default function RosterClient({
  eventId,
  eventTimezone,
  initialRoster,
  maxAttendees,
}: {
  eventId: string;
  eventTimezone: string;
  initialRoster: RosterRow[];
  maxAttendees: number | null;
}) {
  const [roster, setRoster] = useState<RosterRow[]>(initialRoster);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'attended' | 'registered'>('all');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Realtime: subscribe to postgres_changes on registrations for this event.
  // Authenticated channel (uses the staff session cookie via @supabase/ssr).
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

  // Auto-dismiss toast after 3s.
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
      r => r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    );
  }, [roster, search, statusFilter]);

  const attendedCount = roster.filter(r => r.status === 'attended').length;
  const registeredTotal = roster.length;
  const arrivalRate = registeredTotal > 0 ? Math.round((attendedCount / registeredTotal) * 100) : 0;

  async function handleMark(code: string, method: 'qr' | 'manual') {
    const res = await markAttended(code, method);
    if ('error' in res) {
      const suffix = res.alreadyAttendedAt
        ? ` at ${formatInTz(res.alreadyAttendedAt, eventTimezone)}`
        : '';
      setToast({ kind: 'err', message: `${res.error.replace(/\.$/, '')}${suffix}.` });
      return;
    }
    setToast({
      kind: 'ok',
      message: `Marked ${res.registration.full_name} attended (${res.registration.event_title}).`,
    });
    // Realtime broadcast will update the roster; no optimistic update needed.
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-grid-gutter">
      {/* Left: roster (8 cols) */}
      <section className="lg:col-span-8 bg-surface-container-lowest rounded-[20px] border border-outline-variant p-md overflow-hidden">
        {/* Toolbar: filter pills + search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-md border-b border-outline-variant pb-sm mb-sm">
          <div className="flex gap-sm flex-wrap">
            <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label={`All (${registeredTotal})`} />
            <FilterPill active={statusFilter === 'attended'} onClick={() => setStatusFilter('attended')} label={`Checked In (${attendedCount})`} />
            <FilterPill active={statusFilter === 'registered'} onClick={() => setStatusFilter('registered')} label={`Pending (${registeredTotal - attendedCount})`} />
          </div>
          <div className="relative w-full md:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]" aria-hidden>search</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or email"
              className="w-full pl-9 pr-3 py-1.5 bg-surface-container-low border border-outline-variant rounded-full font-body-md text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>
        </div>

        {scannerOpen && (
          <ScannerPanel
            onScan={code => handleMark(code, 'qr')}
            onClose={() => setScannerOpen(false)}
          />
        )}

        {codeModalOpen && (
          <CodeEntryModal
            onSubmit={code => {
              handleMark(code, 'manual');
              setCodeModalOpen(false);
            }}
            onClose={() => setCodeModalOpen(false)}
          />
        )}

        {/* Roster table */}
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <p className="p-md font-body-md text-body-md text-on-surface-variant">
              {search || statusFilter !== 'all' ? 'No matches.' : 'No registrants yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-surface-container-highest">
              {filtered.map(r => {
                const isAttended = r.status === 'attended';
                const initials = r.full_name.slice(0, 2).toUpperCase();
                return (
                  <li key={r.id} className="py-sm px-sm flex items-center justify-between gap-md hover:bg-surface-container-low transition-colors">
                    <div className="flex items-center gap-md min-w-0">
                      <div
                        aria-hidden
                        className={
                          'w-9 h-9 rounded-full flex items-center justify-center font-label-md text-label-md font-bold shrink-0 ' +
                          (isAttended
                            ? 'bg-primary-container text-on-primary-container'
                            : 'bg-surface-container-high text-on-surface-variant')
                        }
                      >
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-body-md text-body-md font-semibold text-on-surface truncate">
                          {r.full_name}
                        </p>
                        <p className="font-body-md text-[12px] text-on-surface-variant truncate">
                          {r.email} · <code className="font-mono">{r.registration_code}</code>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleMark(r.registration_code, 'manual')}
                      disabled={isAttended}
                      className={
                        'shrink-0 min-w-32 min-h-11 rounded-lg px-md py-sm font-label-md text-label-md transition-colors ' +
                        (isAttended
                          ? 'bg-secondary-fixed text-on-secondary-fixed cursor-default'
                          : 'bg-primary text-on-primary hover:opacity-90')
                      }
                    >
                      {isAttended
                        ? `✓ ${r.check_in_at ? formatInTz(r.check_in_at, eventTimezone) : 'Attended'}`
                        : 'Mark Attended'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Right: action canvas (4 cols) */}
      <aside className="lg:col-span-4 flex flex-col gap-grid-gutter">
        {/* Primary scan action — the Rule of Thirds focal point per the mockup */}
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="bg-surface-container-lowest rounded-[20px] border border-outline-variant p-lg flex flex-col items-center justify-center text-center shadow-sm min-h-[250px] relative overflow-hidden group cursor-pointer hover:border-primary transition-colors"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-surface to-secondary-container opacity-20 pointer-events-none group-hover:opacity-40 transition-opacity" />
          <div className="w-20 h-20 bg-primary-container text-on-primary-container rounded-full flex items-center justify-center mb-md shadow-lg group-hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-[36px]" aria-hidden>
              qr_code_scanner
            </span>
          </div>
          <h3 className="font-headline-sm text-headline-sm text-primary mb-sm relative z-10">
            Scan Badge
          </h3>
          <p className="font-body-md text-body-md text-on-surface-variant relative z-10">
            Activate camera to scan attendee QR code.
          </p>
        </button>

        {/* Manual code entry — secondary action */}
        <button
          type="button"
          onClick={() => setCodeModalOpen(true)}
          className="bg-surface-container-lowest rounded-[20px] border border-outline-variant p-md flex items-center gap-md hover:border-primary transition-colors group text-left"
        >
          <span className="material-symbols-outlined text-primary text-[28px] shrink-0 group-hover:scale-110 transition-transform" aria-hidden>
            keyboard
          </span>
          <div>
            <p className="font-label-md text-label-md text-on-surface font-bold">Manual Check-in</p>
            <p className="font-body-md text-[12px] text-on-surface-variant">
              Type a WK-XXXX code by hand
            </p>
          </div>
        </button>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-sm">
          <StatTile
            value={`${arrivalRate}%`}
            label="Arrival Rate"
          />
          <StatTile
            value={`${attendedCount}`}
            label="Checked In"
          />
        </div>

        {/* Capacity (when set) */}
        {maxAttendees != null && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-md">
            <div className="flex justify-between items-center mb-xs">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase">
                Capacity
              </span>
              <span className="font-label-md text-label-md text-on-surface">
                {registeredTotal} / {maxAttendees}
              </span>
            </div>
            <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${Math.min(100, (registeredTotal / maxAttendees) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </aside>

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

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-md text-center">
      <span className="block font-headline-sm text-headline-sm text-primary">{value}</span>
      <span className="font-label-md text-label-md text-on-surface-variant">{label}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Subcomponents                                                              */
/* -------------------------------------------------------------------------- */

function CodeEntryModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (code: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const normalized = value.trim().toUpperCase();
  const isValid = isValidRegistrationCode(normalized);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg w-full max-w-sm space-y-md shadow-xl">
        <h2 className="font-title-lg text-title-lg text-on-surface">Enter code</h2>
        <input
          type="text"
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="WK-XXXX"
          className="w-full rounded-lg border border-outline-variant px-md py-sm font-mono uppercase bg-surface-container-lowest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <p className="font-label-md text-label-md text-on-surface-variant">
          Format: WK-XXXX (no 0, O, 1, I, or L).
        </p>
        <div className="flex justify-end gap-sm">
          <button
            type="button"
            onClick={onClose}
            className="px-md py-sm font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-low rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isValid}
            onClick={() => onSubmit(normalized)}
            className="rounded-lg bg-primary text-on-primary px-lg py-sm font-label-md text-label-md hover:opacity-90 disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </div>
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
  // useRef (not useState) so the html5-qrcode decoded-text callback — which is
  // registered ONCE at mount and closes over its initial scope forever — can
  // read the current debounce state via .current. With useState, the closure
  // captured `lastScanned = null` permanently and the debounce never fired.
  const lastScannedRef = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    let scanner: import('html5-qrcode').Html5Qrcode | null = null;
    let cancelled = false;

    (async () => {
      try {
        // Dynamic import keeps html5-qrcode (~120KB) out of the staff tablet
        // page's initial bundle. Only loads when the scanner panel mounts.
        const mod = await import('html5-qrcode');
        if (cancelled) return;
        scanner = new mod.Html5Qrcode('qr-reader');
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          decodedText => {
            // Extract `code` from URL; QR encodes /checkin/confirm?code=WK-XXXX.
            let code: string | null = null;
            try {
              const u = new URL(decodedText);
              code = u.searchParams.get('code');
            } catch {
              // Not a URL — maybe a raw code? Be liberal.
              code = decodedText.trim().toUpperCase();
            }
            if (!code || !isValidRegistrationCode(code)) return;

            // Debounce same-code-twice within 3s while QR is held up.
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
      scanner?.stop().catch(() => {
        // ignore - panel is closing
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: we want a fresh scanner per mount, not per render
  }, []);

  return (
    <div className="border border-outline-variant rounded-[20px] p-md mb-md bg-surface-container-low">
      <div className="flex items-center justify-between mb-sm">
        <h2 className="font-title-lg text-title-lg text-on-surface">Point camera at QR</h2>
        <button
          type="button"
          onClick={onClose}
          className="font-label-md text-label-md text-primary hover:underline"
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
