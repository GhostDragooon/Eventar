'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { formatInTz } from '@/lib/tz';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { humanizeCameraError } from '@/lib/cameraError';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { markAttended } from './actions';
import { setRegistrationRole, removeRegistrationRole } from '../details/multiBodyActions';
import { Scoreboard } from './Scoreboard';
import { ScanAndManual } from './ScanAndManual';
import { SpeakersCard, type SpeakerCheckinRow } from './SpeakersCard';
import { Button } from '@/components/ui/button';

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
  no_licence: 'No verified licence with this event’s accrediting body — checking in won’t post a CPD credit.',
  no_account: 'No practitioner account for this email — checking in won’t post a CPD credit.',
  cancelled: 'Registration cancelled — this attendee can’t be checked in.',
};

// "Recent" window for the accent-fading roster row state (§ E.4 row states).
// 5 minutes balances "still feels fresh" against "the tablet isn't a party
// trick" — a longer window dilutes the affordance.
const RECENT_WINDOW_MS = 5 * 60_000;

export default function RosterClient({
  eventId,
  eventTimezone,
  eventStartTime,
  lifecycle,
  initialRoster,
  eligibility,
  eligibilityUnavailable,
  roles,
  maxAttendees: _maxAttendees,
  speakerNames,
  initialSpeakerCheckins,
}: {
  eventId: string;
  eventTimezone: string;
  eventStartTime: string;
  lifecycle: Lifecycle;
  initialRoster: RosterRow[];
  /** registration_id → eligibility enum from event_registration_eligibility. */
  eligibility: Record<string, string>;
  eligibilityUnavailable: boolean;
  /** registration_id → non-default roles (attendee is implicit, never listed here). */
  roles: Record<string, ('chair' | 'presenter')[]>;
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
  const [roleState, setRoleState] = useState(roles);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'attended' | 'registered'>('all');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  // For the "recent" row state — bump every 30s so the accent fades out
  // without a full re-render of unrelated tablet state.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  // One shared useTransition would grey out all 400 chips on a 400-person
  // roster while a single toggle round-trips — track pending per row+role.
  const [pendingRoleKeys, setPendingRoleKeys] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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
    // Locked TC spec: the roster carries no email — search by name or code.
    return byStatus.filter(
      r => r.full_name.toLowerCase().includes(q) || r.registration_code.toLowerCase().includes(q),
    );
  }, [roster, search, statusFilter]);

  const attendedCount = roster.filter(r => r.status === 'attended').length;
  const registeredTotal = roster.length;
  const startMs = useMemo(() => new Date(eventStartTime).getTime(), [eventStartTime]);

  // Returns the outcome as well as toasting it: the manual-entry dialog shows
  // its own inline success/error state, so it needs the result rather than
  // inferring anything from a toast it cannot see.
  async function handleMark(
    code: string,
    method: 'qr' | 'manual',
  ): Promise<{ ok: true; name: string } | { error: string }> {
    const res = await markAttended(code, method);
    if ('error' in res) {
      const suffix = res.alreadyAttendedAt
        ? ` at ${formatInTz(res.alreadyAttendedAt, eventTimezone)}`
        : '';
      const message = `${res.error.replace(/\.$/, '')}${suffix}.`;
      setToast({ kind: 'err', message });
      return { error: message };
    }
    setToast({
      kind: 'ok',
      message: `Marked ${res.registration.full_name} attended (${res.registration.event_title}).`,
    });
    // Realtime broadcast will update the roster; no optimistic update needed.
    return { ok: true, name: res.registration.full_name };
  }

  function toggleRole(registrationId: string, role: 'chair' | 'presenter', has: boolean) {
    const key = `${registrationId}:${role}`;
    setPendingRoleKeys((prev) => new Set(prev).add(key));
    startTransition(async () => {
      const res = has
        ? await removeRegistrationRole({ registrationId, eventId, roleCode: role })
        : await setRegistrationRole({ registrationId, eventId, roleCode: role });
      setPendingRoleKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      if ('error' in res) {
        setToast({ kind: 'err', message: res.error });
        return;
      }
      setRoleState((prev) => {
        const current = prev[registrationId] ?? [];
        const next = has ? current.filter((r) => r !== role) : [...current, role];
        return { ...prev, [registrationId]: next };
      });
    });
  }

  return (
    <div className="flex flex-col gap-grid-gutter">
      {/* Scoreboard — status pill + checked-in fraction + bar + countdown */}
      <Scoreboard
        lifecycle={lifecycle}
        startMs={startMs}
        attended={attendedCount}
        registered={registeredTotal}
      />

      {/* Scan square + manual entry card */}
      <ScanAndManual
        onScanClick={() => setScannerOpen(true)}
        onManualSubmit={(code) => handleMark(code, 'manual')}
      />

      {/* Speakers card (G3) */}
      <SpeakersCard
        eventId={eventId}
        eventTimezone={eventTimezone}
        speakerNames={speakerNames}
        initialCheckins={initialSpeakerCheckins}
        onError={(message) => setToast({ kind: 'err', message })}
      />

      {/* Scanner panel (modal-like) — kept inline because it owns scannerOpen state */}
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

      {/* Roster — restyled rows with three states (recent / checked / default) */}
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
              {/* Locked TC spec: 4 columns — Attendee · Code · Status · Method. */}
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
                    roles={roleState[r.id] ?? []}
                    pendingRoleKeys={pendingRoleKeys}
                    onToggleRole={(role, has) => toggleRole(r.id, role, has)}
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

/* -------------------------------------------------------------------------- */
/* Roster row — three states: recent (accent fading) / checked (muted) /       */
/* default (white surface + "Check in →" button)                              */
/* -------------------------------------------------------------------------- */

function RosterRowItem({
  row: r,
  eligibility,
  nowMs,
  eventTimezone,
  onMark,
  roles,
  pendingRoleKeys,
  onToggleRole,
}: {
  row: RosterRow;
  eligibility?: string;
  nowMs: number;
  eventTimezone: string;
  onMark: () => void;
  roles: ('chair' | 'presenter')[];
  pendingRoleKeys: Set<string>;
  onToggleRole: (role: 'chair' | 'presenter', has: boolean) => void;
}) {
  const isAttended = r.status === 'attended';
  const checkInMs = r.check_in_at ? new Date(r.check_in_at).getTime() : null;
  const isRecent = isAttended && checkInMs !== null && nowMs - checkInMs <= RECENT_WINDOW_MS;

  // Three-state visual: recent uses the accent-fading background, checked is
  // muted surface-container-low, default is the card surface with a CTA.
  const rowBg = isRecent
    ? 'bg-primary-container/60'
    : isAttended
      ? 'bg-surface-container-low'
      : 'bg-transparent hover:bg-surface-container-low';

  // Locked TC spec: 4 columns — Attendee · Code · Status · Method.
  // No avatar, no email on the roster.
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
        {/* Multi-body role (chair/presenter) — attendee is the implicit
            default and has no toggle. Same cell as the name, not a 5th
            column: the roster's 4-column grid is a locked TC spec.
            Disabled once attended: award_attendance_credit runs synchronously
            at check-in and credit_ledger_attendance_uniq means a role set
            afterward can never change what was already posted. */}
        <div className="mt-[2px] flex gap-xs">
          {(['chair', 'presenter'] as const).map((role) => {
            const has = roles.includes(role);
            const pending = pendingRoleKeys.has(`${r.id}:${role}`);
            return (
              <button
                key={role}
                type="button"
                disabled={pending || isAttended}
                aria-pressed={has}
                aria-label={`${role} — ${r.full_name}`}
                title={isAttended ? 'Already checked in — role changes here won’t affect the credit already posted.' : undefined}
                onClick={() => onToggleRole(role, has)}
                className={`rounded-full px-xs py-[1px] text-[calc(11px*var(--text-scale))] font-medium capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-ink disabled:opacity-50 ${
                  has
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                }`}
              >
                {role}
              </button>
            );
          })}
        </div>
      </div>
      <code className="font-body-md text-[calc(13px*var(--text-scale))] text-on-surface-variant tabular-nums">
        {r.registration_code}
      </code>
      {isAttended ? (
        <span className="font-label-md text-label-md text-[color:var(--success)] inline-flex items-center gap-xs">
          <span aria-hidden>✓</span>
          {r.check_in_at ? formatInTz(r.check_in_at, eventTimezone) : 'Checked in'}
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={onMark}
          className="justify-self-start min-h-11 px-md py-sm font-label-md text-label-md text-primary-ink"
        >
          Check in →
        </Button>
      )}
      <span className="font-label-md text-label-md text-on-surface-variant normal-case tracking-normal">
        {isAttended ? (r.check_in_method === 'qr' ? 'QR' : r.check_in_method === 'manual' ? 'Manual' : '—') : '—'}
      </span>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Scanner panel — kept inline; owns no public surface beyond onScan/onClose  */
/* -------------------------------------------------------------------------- */

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
