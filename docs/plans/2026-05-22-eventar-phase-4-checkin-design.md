# Phase 4 — Check-in (tablet) — Design

**Date:** 2026-05-22
**Phase scope:** Tablet-optimised staff check-in page with live roster (Supabase Realtime), browser-camera QR scanner (html5-qrcode), manual code entry, and one-tap mark-Attended. Plus a parallel public self-checkin path at the URL embedded in personal QRs.
**Estimate:** ~1.5 days. Bigger than Phase 3.5 (new dependency, new realtime layer, new public route, schema migration with backfill).

> [!info] Brainstorm-driven design
> Four forks locked via structured Q&A before any code:
> - **QR scanner:** ship in Phase 4 (matches PRD §4.4) rather than defer to Phase 9 alongside Email #2 that delivers the QR
> - **Code format:** globally unique `WK-NNNN` (PRD example), app-side generation, alphabet stripped of `0 O 1 I L`
> - **Mutation paths:** both — staff tablet `markAttended(code, method)` AND public `/checkin/confirm?code=...` self-checkin
> - **Self-checkin UX:** event details + attendee name + explicit "Confirm I'm here" button (no auto-mark on page load)

---

## What this phase delivers

1. **Schema migration** — `registrations` gets `registration_code` (NOT NULL UNIQUE after backfill), `check_in_at`, `check_in_method` (CHECK in `'qr' | 'manual'`).
2. **`lib/registrationCode.ts`** — pure code generator + TDD coverage.
3. **Phase 2 `registerForEvent` patched** — generates a code on every new registration (retry on collision).
4. **Staff tablet page** `/events/[id]/checkin` — Realtime roster, scanner, search, manual code entry, one-tap toggle.
5. **Public self-checkin page** `/checkin/confirm?code=WK-XXXX` — event/attendee details + Confirm button + already-attended state.
6. **Two Server Actions** — `markAttended(code, method)` (staff) and `selfCheckIn(code)` (public). Same underlying UPDATE pattern, different auth layer.
7. **Edit-page wiring** — "Open check-in →" link on published events.

That's the phase.

---

## A. Schema migration

`supabase/migrations/20260523010000_init_checkin_columns.sql` (timestamp TBD at write time):

```sql
alter table public.registrations
  add column registration_code text,
  add column check_in_at       timestamptz,
  add column check_in_method   text
    check (check_in_method in ('qr','manual'));

-- Backfill existing rows BEFORE adding NOT NULL + UNIQUE.
-- plpgsql loop self-resolves collisions in the rare backfill case.
do $$
declare
  r record;
  candidate text;
begin
  for r in select id from public.registrations where registration_code is null loop
    loop
      candidate := 'WK-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
      -- Strip ambiguous characters to match the app-side alphabet.
      candidate := replace(replace(replace(replace(candidate, '0','2'), 'O','P'), '1','3'), 'I','J');
      candidate := replace(candidate, 'L','M');
      exit when not exists (select 1 from public.registrations where registration_code = candidate);
    end loop;
    update public.registrations set registration_code = candidate where id = r.id;
  end loop;
end $$;

alter table public.registrations
  alter column registration_code set not null,
  add constraint registrations_code_unique unique (registration_code);

create index registrations_code_idx on public.registrations(registration_code);
```

**RLS:** no policy changes needed. The existing `registrations_organizer_select_own` + `registrations_organizer_update_own` + `registrations_manager_select_all` cover the new columns. The public self-checkin route uses the admin client (anon has no SELECT on `registrations`, same as Phase 2 + 3.5 patterns).

**`status` enum:** already includes `'attended'` from Phase 2's `init_registrations` migration. No new CHECK constraint needed.

---

## B. Code generator

`lib/registrationCode.ts` — pure, TDD-built:

```ts
// 31-char alphabet: digits 2-9 + uppercase letters minus 0/O/1/I/L (visual
// ambiguity on small QR-backup-print or hand-written codes).
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_RE  = /^WK-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

export function generateRegistrationCode(): string {
  let out = 'WK-';
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function isValidRegistrationCode(code: string): boolean {
  return CODE_RE.test(code);
}
```

**Collision math:** 31⁴ = 923,521 codes per global namespace. At 200 attendees/event and ~50 events/year, expected collision probability stays < 0.1% per year for many years. The unique constraint is the source of truth; the generator just minimises retries.

**Tests** (`lib/registrationCode.test.ts`):
- Format always `WK-XXXX`
- All four random chars are in ALPHABET
- 10,000-iteration distribution sanity (each char appears across the run)
- `isValidRegistrationCode` accepts generator output for 1,000 iterations
- `isValidRegistrationCode` rejects: `wk-1234` (lowercase), `WK-0OIL` (banned chars), `WK-AB` (too short), `XX-ABCD` (wrong prefix)

---

## C. Phase 2 `registerForEvent` patch

Add code generation after the existing registration INSERT. Pattern: insert without code (atomic), then UPDATE with code, retrying on 23505. Up to 5 attempts before throwing.

```ts
// after the existing registration INSERT succeeds...
let code: string | null = null;
for (let attempt = 0; attempt < 5; attempt++) {
  const candidate = generateRegistrationCode();
  const { error: codeErr } = await admin
    .from('registrations')
    .update({ registration_code: candidate })
    .eq('id', reg.id);
  if (!codeErr) { code = candidate; break; }
  if (codeErr.code !== '23505') throw codeErr; // not a collision -> real error
}
if (!code) throw new Error('Could not generate unique registration code after 5 attempts');
```

Failure mode: in the astronomically unlikely event that 5 collisions hit in a row, the registration succeeds but has a NULL `registration_code` momentarily, then the throw triggers — leaving the row in an inconsistent state. Acceptable given the math; if this ever fires in production, it's a real signal (probably a misconfigured `random()` seed or generator bug).

---

## D. Staff Server Action — `markAttended(code, method)`

`app/events/[id]/checkin/actions.ts`:

```ts
'use server';

export async function markAttended(
  code: string,
  method: 'qr' | 'manual',
): Promise<{ ok: true; registration: { id: string; full_name: string; event_id: string; event_title: string } } | { error: string }> {
  await requireStaff();
  if (!isValidRegistrationCode(code)) return { error: 'Invalid code format.' };

  const admin = supabaseAdmin();

  // Idempotent UPDATE: returns 0 rows if already attended -> we surface that
  // as a distinct error rather than reporting fake success (CLAUDE.md rule 12).
  const { data: updated, error } = await admin
    .from('registrations')
    .update({
      status: 'attended',
      check_in_at: new Date().toISOString(),
      check_in_method: method,
    })
    .eq('registration_code', code)
    .neq('status', 'attended')
    .select('id, full_name, event_id')
    .maybeSingle();
  if (error) throw error;

  if (!updated) {
    // Distinguish "code didn't exist" from "code existed but was already attended".
    const { data: existing } = await admin
      .from('registrations')
      .select('id, full_name, event_id, check_in_at')
      .eq('registration_code', code)
      .maybeSingle();
    if (!existing) return { error: 'Code not recognised.' };
    return { error: `Already attended at ${existing.check_in_at}.` };
  }

  // Fetch event title for the success toast. Could be one query with a join
  // but two-call shape mirrors existing patterns.
  const { data: event } = await admin
    .from('events').select('title').eq('id', updated.event_id).maybeSingle();

  revalidatePath(`/events/${updated.event_id}/checkin`);
  return { ok: true, registration: {
    id: updated.id, full_name: updated.full_name,
    event_id: updated.event_id, event_title: event?.title ?? '',
  }};
}
```

**Cross-event note:** the action does NOT require that the staff member owns the event whose code was scanned. A manager running check-in for multiple concurrent events from one tablet would otherwise get spurious failures. The success toast shows the event title, making cross-event scans visible. RLS would only matter if we surfaced raw data; here we only return the bare minimum (name + event title) needed for the toast.

---

## E. Staff tablet page

**Files:**
- `app/events/[id]/checkin/page.tsx` — server component, `requireStaff()`, SELECT event + initial roster, render shell
- `app/events/[id]/checkin/RosterClient.tsx` — `'use client'`, owns Realtime subscription + local roster state + scanner + search

**Server portion:**

```tsx
export default async function StaffCheckinPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: event } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, timezone, venue_name, status')
    .eq('id', id).maybeSingle();
  if (!event) notFound();

  const { data: initialRoster } = await supabase
    .from('registrations')
    .select('id, full_name, email, registration_code, status, check_in_at, check_in_method')
    .eq('event_id', id)
    .order('full_name', { ascending: true });

  return (
    <RosterClient
      eventId={event.id}
      eventTitle={event.title}
      eventTimezone={event.timezone}
      initialRoster={initialRoster ?? []}
    />
  );
}
```

**Client portion:** the file is bigger but the shape is:

```tsx
'use client';
import { Html5Qrcode } from 'html5-qrcode';
import { createBrowserClient } from '@supabase/ssr';
// ... plus markAttended action import

export default function RosterClient({ eventId, eventTitle, eventTimezone, initialRoster }) {
  const [roster, setRoster] = useState(initialRoster);
  const [search, setSearch]   = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  // Realtime: subscribe to postgres_changes on registrations for this event.
  useEffect(() => {
    const client = createBrowserClient(/* env vars */);
    const channel = client
      .channel(`registrations:event=${eventId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'registrations', filter: `event_id=eq.${eventId}` },
        payload => {
          setRoster(prev => prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new } : r));
        })
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [eventId]);

  // Filter roster by search.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(r => r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  }, [roster, search]);

  // Mark-attended handler (used by toggle, scanner, modal).
  async function handleMark(code: string, method: 'qr' | 'manual') {
    const res = await markAttended(code, method);
    if ('error' in res) {
      setToast({ kind: 'err', message: res.error });
    } else {
      setToast({ kind: 'ok', message: `Marked ${res.registration.full_name} attended.` });
      // Realtime will update the roster within ~1s; optimistic update optional.
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{eventTitle}</h1>
        <p className="text-sm text-gray-600">{formatInTz(...)} ({eventTimezone})</p>
      </header>

      <div className="flex gap-2">
        <input value={search} onChange={...} placeholder="Search name or email" className="flex-1 ..." />
        <button onClick={() => setScannerOpen(true)} className="...">📷 Scan QR</button>
        <button onClick={() => setCodeModalOpen(true)} className="...">⌨ Enter code</button>
      </div>

      {scannerOpen && <ScannerPanel onScan={(code) => handleMark(code, 'qr')} onClose={() => setScannerOpen(false)} />}
      {codeModalOpen && <CodeEntryModal onSubmit={(code) => { handleMark(code, 'manual'); setCodeModalOpen(false); }} onClose={...} />}

      <ul className="divide-y border rounded-xl">
        {filtered.map(r => (
          <li key={r.id} className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{r.full_name}</p>
              <p className="text-sm text-gray-600">{r.email} · <code className="text-xs">{r.registration_code}</code></p>
            </div>
            <button
              onClick={() => handleMark(r.registration_code, 'manual')}
              disabled={r.status === 'attended'}
              className="min-w-32 min-h-11 ..."
            >
              {r.status === 'attended'
                ? `✓ Attended at ${formatInTz(r.check_in_at, eventTimezone)}`
                : 'Mark Attended'}
            </button>
          </li>
        ))}
      </ul>

      {toast && <Toast {...toast} onDismiss={() => setToast(null)} />}
    </main>
  );
}
```

**Scanner panel** is a small subcomponent that:
- Mounts a `<div id="qr-reader">` element
- `new Html5Qrcode("qr-reader")` + `.start(...)` on mount
- On successful decode, parses the URL with `new URL(text)` — extracts `code` query param
- Debounces same-code-twice within 3 seconds to avoid double-fires while holding a QR up
- Calls `onScan(code)` then keeps scanning for the next person
- Provides a close button + handles camera-permission-denied with a clear message

**`html5-qrcode` dep:** ~120KB unpacked. Imported dynamically inside the `ScannerPanel` so it only loads when staff open the scanner — not on initial page load. Keeps the tablet page snappy.

---

## F. Public self-checkin

**File:** `app/(public)/checkin/confirm/page.tsx` (server) + `ConfirmButton.tsx` (client) + `app/(public)/checkin/confirm/actions.ts`.

**Server page flow:**

```tsx
export default async function SelfCheckinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  if (!code || !isValidRegistrationCode(code)) {
    return <UnrecognisedCode />;
  }

  const admin = supabaseAdmin();
  const { data: reg } = await admin
    .from('registrations')
    .select('id, full_name, email, status, check_in_at, event_id, events(id, title, start_time, end_time, timezone, venue_name, status)')
    .eq('registration_code', code)
    .maybeSingle();

  if (!reg || !reg.events || reg.events.status !== 'published') {
    return <UnrecognisedCode />;
  }

  if (reg.status === 'attended') {
    return <AlreadyAttended event={reg.events} attendee={reg.full_name} when={reg.check_in_at} timezone={reg.events.timezone} />;
  }

  return <ReadyToConfirm event={reg.events} attendee={reg.full_name} code={code} />;
}
```

The `<ReadyToConfirm>` view renders event details + attendee name + a `<ConfirmButton code={code} />`. The button is a `'use client'` component that posts to `selfCheckIn(code)`:

```ts
'use server';

export async function selfCheckIn(code: string): Promise<{ ok: true; eventId: string } | { error: string }> {
  if (!isValidRegistrationCode(code)) return { error: 'Invalid code format.' };

  const admin = supabaseAdmin();
  const { data: updated, error } = await admin
    .from('registrations')
    .update({
      status: 'attended',
      check_in_at: new Date().toISOString(),
      check_in_method: 'qr',
    })
    .eq('registration_code', code)
    .neq('status', 'attended')
    .select('id, event_id')
    .maybeSingle();
  if (error) throw error;
  if (!updated) return { error: 'Already checked in or code not recognised.' };

  revalidatePath(`/checkin/confirm`);
  return { ok: true, eventId: updated.event_id };
}
```

On success, the client component swaps to a success state ("You're checked in for {event}. See you there!").

**Why admin-side, not RLS:** anon has no SELECT/UPDATE on `registrations`. Adding a "bearer token" RLS policy (`USING (registration_code = current_setting('app.code'))`) would work but adds surface area. Mirroring the Phase 2 pattern (Server Action with admin client + careful business-logic gates) is simpler and consistent.

---

## G. Edit-page wiring

`app/events/[id]/edit/page.tsx` gets a new section, only shown when `event.status === 'published'`, next to the existing QR code section:

```tsx
{event.status === 'published' && (
  <section>
    <h2 className="text-sm font-medium text-gray-700 mb-1">On-site check-in</h2>
    <p className="text-sm text-gray-600 mb-3">
      Tablet-friendly roster with QR scanner and manual mark-attended toggle.
    </p>
    <a
      className="inline-flex items-center rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
      href={`/events/${event.id}/checkin`}
      target="_blank"
      rel="noreferrer"
    >
      Open check-in →
    </a>
  </section>
)}
```

Placement: after the QR section, before the Registrant export section. Keeps related staff actions grouped.

---

## H. Race conditions + edge cases

| Scenario | Handling |
|---|---|
| Two staff tabs mark same person at the same time | `UPDATE ... WHERE status != 'attended'`. First wins; second sees zero rows; toast says "Already attended at HH:MM". |
| Self-checkin + staff-tablet markAttended simultaneously | Same. |
| Scanner reads same QR multiple times while held up | Client-side debounce: ignore identical code within 3 seconds. |
| Camera permission denied | Scanner shows clear message + suggests using "Enter code" modal instead. |
| Code in URL but URL is malformed (extra chars, wrong scheme) | Scanner regex extracts only `WK-XXXX` shape; URL parsing wrapped in try/catch; falls through to "code not recognised". |
| Tablet loses Wi-Fi mid-event | No offline mode. Action calls fail; toast says "Network error, please retry"; no local queue. Acceptable per PRD non-functional requirements (reliable venue Wi-Fi assumed). Documented in vault for future. |
| Manager scanning code from another organiser's event | Action succeeds (no event-ownership check); success toast shows the event title so the cross-event nature is visible. Intentional. |
| Realtime delivery lag (>2s) | Optimistic update on the toggle path (`setRoster` immediately after `markAttended` returns ok) handles this. Scanner path also updates roster locally on success. |

---

## I. Testing strategy

| Test | File | Layer |
|---|---|---|
| `generateRegistrationCode` format + alphabet + 10k distribution | `lib/registrationCode.test.ts` | unit (TDD) |
| `isValidRegistrationCode` accepts generator output, rejects bad codes | same | unit |
| Schema migration applies cleanly on fresh DB | `pnpm exec supabase db push` smoke | integration |
| Backfill assigns unique codes to existing 7 rows | same | integration |
| Staff tablet: search filters roster | manual smoke | integration |
| Staff tablet: manual toggle marks attended (Realtime fires across tabs) | manual smoke (two browsers) | integration |
| Staff tablet: manual code entry marks attended | manual smoke | integration |
| Staff tablet: scanner reads QR + marks attended | manual smoke (physical tablet + printed QR) | integration |
| Self-checkin happy path | manual smoke | integration |
| Self-checkin already-attended | manual smoke | integration |
| Self-checkin bad/unknown code | manual smoke | integration |
| Race: same person marked twice → second returns "already attended" | manual smoke | integration |

No vitest for Server Actions per project convention (Phase 2/3.5 precedent). Pure helpers get coverage; integration is manual.

---

## J. Out of scope (called out so we don't drift)

- **Email #2 with personal QR** — Phase 9. Until then, codes are accessible via Phase 3.5 CSV export and on the staff tablet roster.
- **Multi-event "today's events" tablet view** — Phase 6 (analytics dashboard candidate).
- **Bulk import / re-import of attendees** — not planned.
- **Offline-capable PWA** — flagged in vault for a future phase if needed.
- **NFC / Bluetooth / camera-detected face matching** — explicitly out (PRD silent; complexity not justified).
- **Reverting an accidental check-in** — out for now. Organiser can re-mark via direct DB if absolutely needed; full undo UI would require an `unmarkAttended` action + audit. Phase 6 candidate.

---

## K. Verification before completion

Per `superpowers:verification-before-completion`:
1. Gates pass: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build`
2. `next build` shows the new routes: `/events/[id]/checkin` and `/checkin/confirm` (11 routes total — was 9).
3. Vitest passes with the new `registrationCode` tests (likely 78 + ~10 = ~88).
4. All manual smoke scenarios pass end-to-end.
5. Commits pushed to `origin/main` (~9 commits).
6. Vault updated: Phase 4 note created under `20 — Roadmap/`; `00 — Index.md` Status block ticks Phase 4 ✅; the "registration_code/check_in_at/check_in_method follow-up migration" note in Data Model marked done.

If smoke fails, the cause is a real bug — don't paper over it.

---

## Next step

Invoke `superpowers:writing-plans` to convert this design into a bite-sized TDD plan at `docs/plans/2026-05-22-eventar-phase-4-checkin-impl.md`.
