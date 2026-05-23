'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { formatInTz } from '@/lib/tz';
import { isValidRegistrationCode } from '@/lib/registrationCode';
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
}: {
  eventId: string;
  eventTimezone: string;
  initialRoster: RosterRow[];
}) {
  const [roster, setRoster] = useState<RosterRow[]>(initialRoster);
  const [search, setSearch] = useState('');
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
    if (!q) return roster;
    return roster.filter(
      r => r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    );
  }, [roster, search]);

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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or email"
          className="flex-1 min-w-48 rounded-md border px-3 py-2"
        />
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 min-h-11"
        >
          📷 Scan QR
        </button>
        <button
          type="button"
          onClick={() => setCodeModalOpen(true)}
          className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 min-h-11"
        >
          ⌨ Enter code
        </button>
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

      <ul className="divide-y border rounded-xl">
        {filtered.length === 0 && (
          <li className="p-4 text-sm text-gray-500">
            {search ? 'No matches.' : 'No registrants yet.'}
          </li>
        )}
        {filtered.map(r => {
          const isAttended = r.status === 'attended';
          return (
            <li key={r.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.full_name}</p>
                <p className="text-sm text-gray-600 truncate">
                  {r.email} · <code className="text-xs">{r.registration_code}</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleMark(r.registration_code, 'manual')}
                disabled={isAttended}
                className={
                  'shrink-0 min-w-32 min-h-11 rounded-md px-3 py-2 text-sm font-medium ' +
                  (isAttended
                    ? 'border border-gray-300 text-gray-500 bg-gray-50'
                    : 'bg-blue-600 text-white hover:bg-blue-700')
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

      {toast && (
        <div
          role="status"
          className={
            'fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md px-4 py-2 text-sm shadow-lg ' +
            (toast.kind === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white')
          }
        >
          {toast.message}
        </div>
      )}
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
      <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-4">
        <h2 className="text-lg font-medium">Enter code</h2>
        <input
          type="text"
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="WK-XXXX"
          className="w-full rounded-md border px-3 py-2 font-mono uppercase"
        />
        <p className="text-xs text-gray-500">Format: WK-XXXX (no 0, O, 1, I, or L).</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={!isValid}
            onClick={() => onSubmit(normalized)}
            className="rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
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
        setError(
          e instanceof Error
            ? `Camera unavailable: ${e.message}. Use "Enter code" instead.`
            : 'Camera unavailable. Use "Enter code" instead.',
        );
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
    <div className="border rounded-xl p-4 space-y-2 bg-gray-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Point camera at QR</h2>
        <button type="button" onClick={onClose} className="text-sm underline">
          Close
        </button>
      </div>
      <div id="qr-reader" className="mx-auto" style={{ width: 320, maxWidth: '100%' }} />
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
