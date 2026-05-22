# Phase 4 — Check-in (Tablet) + Self-checkin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Ship the tablet-optimized staff check-in page (Realtime roster, html5-qrcode camera scanner, search, manual entry, one-tap toggle) AND a parallel public self-checkin path at `/checkin/confirm?code=WK-XXXX`. Both paths converge on idempotent UPDATEs of the same `registrations` row.

**Architecture:** Generate globally-unique `WK-NNNN` codes at registration time (Phase 2 patch + backfill of existing rows). Staff tablet subscribes to Supabase Realtime `postgres_changes` on `registrations` for the event. All mutations go through Server Actions that do `UPDATE ... WHERE status != 'attended'` so a second writer cleanly returns "already attended" rather than silently re-stamping the timestamp (CLAUDE.md rule 12).

**Tech Stack:** Next.js 16 App Router, TypeScript, existing `supabase-js` + `@supabase/ssr` (for `createBrowserClient` in the Realtime channel), existing `requireStaff()` gate, new dependency `html5-qrcode` (~120KB unpacked, dynamic-imported on the staff route only), vitest for unit tests.

**Design doc:** [`docs/plans/2026-05-22-eventar-phase-4-checkin-design.md`](./2026-05-22-eventar-phase-4-checkin-design.md). Read before starting if you don't have the design in working memory.

---

## Pre-flight

- Working directory: `/Users/ivan/Eventar`
- Branch: `main` (single-branch policy per CLAUDE.md rule 6)
- Confirm tree is clean: `git status` → "nothing to commit, working tree clean" (`.claude/launch.json` modification is pre-existing and unrelated; leave unstaged)
- Confirm gates pass at start: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run`
- User's `pnpm dev` is already running on port 3000 — do NOT start another dev server (port conflict + user direction)
- Expected starting vitest count: **78/78 pass** across 9 files (Phase 3.5 close-out state)
- Expected starting `next build` route count: **9 routes** (8 from Phase 1–3 + `/events/[id]/poster` from 3.5)

---

## Task 1: Schema migration — `registration_code` + check-in columns

**Files:**
- Create: `supabase/migrations/20260523010000_init_checkin_columns.sql`

**Why first:** Every downstream task depends on the new columns existing. Backfill happens here so the NOT NULL + UNIQUE constraints can land in the same migration.

**Step 1: Create the migration file**

```sql
-- Phase 4: per-attendee check-in identity + state.
-- Adds:
--   registration_code  WK-XXXX text; globally unique; backfilled in-migration
--                      so we can add NOT NULL + UNIQUE in the same DDL pass.
--   check_in_at        timestamptz; set by markAttended / selfCheckIn.
--   check_in_method    'qr' | 'manual'; matches the data the actions write.
--
-- RLS: no new policies. Existing organizer_select_own / organizer_update_own /
-- manager_select_all cover the new columns. Public self-checkin uses
-- supabaseAdmin() per the Phase 2 + 3.5 pattern.
--
-- Status column already includes 'attended' as a valid value from
-- 20260520010000_init_registrations.sql; no CHECK constraint change needed.

alter table public.registrations
  add column registration_code text,
  add column check_in_at       timestamptz,
  add column check_in_method   text
    check (check_in_method in ('qr','manual'));

-- Backfill existing rows BEFORE adding NOT NULL + UNIQUE.
-- Draws from the full 31-char alphabet (digits 2-9 + uppercase minus
-- 0 O 1 I L) so backfilled codes look visually identical to new
-- app-generated ones from lib/registrationCode.ts.
do $$
declare
  alphabet text[] := array[
    '2','3','4','5','6','7','8','9',
    'A','B','C','D','E','F','G','H','J','K','M','N','P','Q','R','S','T','U','V','W','X','Y','Z'
  ];
  r record;
  candidate text;
  attempts int;
begin
  for r in select id from public.registrations where registration_code is null loop
    attempts := 0;
    loop
      candidate := 'WK-'
        || alphabet[1 + floor(random() * 31)::int]
        || alphabet[1 + floor(random() * 31)::int]
        || alphabet[1 + floor(random() * 31)::int]
        || alphabet[1 + floor(random() * 31)::int];
      exit when not exists (select 1 from public.registrations where registration_code = candidate);
      attempts := attempts + 1;
      if attempts > 100 then
        raise exception 'backfill: 100 collisions for one row — namespace exhausted or RNG broken';
      end if;
    end loop;
    update public.registrations set registration_code = candidate where id = r.id;
  end loop;
end $$;

alter table public.registrations
  alter column registration_code set not null,
  add constraint registrations_code_unique unique (registration_code);

create index registrations_code_idx on public.registrations(registration_code);
```

**Step 2: Apply the migration**

```bash
pnpm exec supabase db push
```

Expected: migration applies cleanly; 1 migration listed as Applied. If the existing 7 registrations rows fail backfill (constraint violation), STOP and investigate — the loop should self-resolve.

**Step 3: Sanity-check the backfill**

```bash
pnpm exec supabase db remote sql "select id, registration_code from public.registrations order by registered_at limit 10;"
```

Expected: every row has a non-null `registration_code` matching `WK-[2-9A-HJKMNP-Z]{4}`. All unique.

**Step 4: Commit**

```bash
git add supabase/migrations/20260523010000_init_checkin_columns.sql
git commit -m "$(cat <<'EOF'
feat(phase-4)!: add registration_code + check-in columns to registrations

Adds:
  registration_code  text NOT NULL UNIQUE  (backfilled in-migration via
                                            plpgsql collision loop)
  check_in_at        timestamptz NULLABLE
  check_in_method    text CHECK in ('qr','manual')

Backfill strategy: plpgsql loop self-resolves collisions for existing 7
rows. Strip-ambiguous-chars in the SQL mirror the app-side alphabet
in lib/registrationCode.ts (no 0 O 1 I L). Constraint + index added in
same migration so the schema is fully wired in one DDL pass.

No RLS policy changes — existing organizer_select_own / organizer_
update_own / manager_select_all already cover the new columns.

BREAKING: requires fresh DB push. Local devs run `pnpm exec supabase
db push`. Production push will run on next deploy.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `lib/registrationCode.ts` (TDD)

**Files:**
- Create: `lib/registrationCode.ts`
- Create: `lib/registrationCode.test.ts`

**Why second:** Every Server Action below uses `generateRegistrationCode()` and `isValidRegistrationCode()`. Lock the contract with tests before any caller depends on it.

**Step 1: Write the failing tests**

```ts
// lib/registrationCode.test.ts
import { describe, expect, it } from 'vitest';
import { generateRegistrationCode, isValidRegistrationCode } from './registrationCode';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const FORMAT_RE = /^WK-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

describe('generateRegistrationCode', () => {
  it('always returns the WK-XXXX format', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateRegistrationCode()).toMatch(FORMAT_RE);
    }
  });

  it('only uses characters from the 31-char ambiguity-stripped alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRegistrationCode();
      const body = code.slice(3); // strip "WK-"
      for (const ch of body) {
        expect(ALPHABET).toContain(ch);
      }
    }
  });

  it('covers most of the alphabet over a large sample (distribution sanity)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      for (const ch of generateRegistrationCode().slice(3)) seen.add(ch);
    }
    // 10k iterations × 4 chars = 40k char draws; ~99.999% chance every
    // alphabet char appears at least once. If <28 of 31 appear, RNG is
    // probably broken.
    expect(seen.size).toBeGreaterThanOrEqual(28);
  });
});

describe('isValidRegistrationCode', () => {
  it('accepts every output of generateRegistrationCode', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(isValidRegistrationCode(generateRegistrationCode())).toBe(true);
    }
  });

  it('rejects lowercase variants', () => {
    expect(isValidRegistrationCode('wk-2345')).toBe(false);
  });

  it('rejects banned alphabet chars', () => {
    expect(isValidRegistrationCode('WK-0OIL')).toBe(false);
    expect(isValidRegistrationCode('WK-1L1L')).toBe(false);
  });

  it('rejects wrong-length codes', () => {
    expect(isValidRegistrationCode('WK-AB')).toBe(false);
    expect(isValidRegistrationCode('WK-ABCDE')).toBe(false);
  });

  it('rejects wrong prefix', () => {
    expect(isValidRegistrationCode('XX-2345')).toBe(false);
    expect(isValidRegistrationCode('WK2345')).toBe(false);  // missing dash
  });

  it('rejects empty string', () => {
    expect(isValidRegistrationCode('')).toBe(false);
  });
});
```

**Step 2: Run to verify it fails**

```bash
pnpm exec vitest run lib/registrationCode.test.ts
```

Expected: FAIL with "Cannot find module './registrationCode'".

**Step 3: Implement `lib/registrationCode.ts`**

```ts
// 31-char alphabet: digits 2-9 + uppercase letters minus 0 O 1 I L.
// Picked for visual unambiguity on hand-written / printed backup codes
// AND so the SQL backfill in 20260523010000_init_checkin_columns.sql can
// mirror the strip with REPLACE chains.
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

**Step 4: Run to verify it passes**

```bash
pnpm exec vitest run lib/registrationCode.test.ts
```

Expected: PASS, 10/10.

**Step 5: Run full suite**

```bash
pnpm exec vitest run
```

Expected: **88/88 pass** across 10 files (78 prior + 10 new).

**Step 6: Static gates**

```bash
pnpm exec tsc --noEmit
pnpm exec eslint lib/registrationCode.ts lib/registrationCode.test.ts
```

Both clean.

**Step 7: Commit**

```bash
git add lib/registrationCode.ts lib/registrationCode.test.ts
git commit -m "$(cat <<'EOF'
feat(phase-4): registration code generator + validator (TDD)

Pure helpers in lib/registrationCode.ts:
  generateRegistrationCode()    -> WK-XXXX from 31-char alphabet
                                   (digits 2-9 + uppercase minus 0 O 1 I L)
  isValidRegistrationCode(c)    -> regex match against the same shape

31^4 = ~924k codes per namespace; collision probability stays microscopic
at 200-attendee scale for many years. Unique constraint in the DB is the
source of truth; the generator just minimises retries in the caller.

10 vitest cases including a 10k-iteration distribution sanity check.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Patch `registerForEvent` to generate a code per registration

**Files:**
- Modify: `app/(public)/events/[id]/actions.ts`

**Why third:** New registrations after this lands MUST get a code; Task 1's NOT NULL constraint will reject any insert that doesn't have one filled in. Backfill covered existing rows; this task covers the going-forward path.

**Step 1: Add the import**

At the top of `app/(public)/events/[id]/actions.ts`, in the existing import block:

```ts
import { generateRegistrationCode } from '@/lib/registrationCode';
```

(Place near other `@/lib/...` imports.)

**Step 2: Replace the registration INSERT to include the code with retry**

The current Step 5 in the action (the `admin.from('registrations').insert(...)` block) needs to include `registration_code` in the inserted row. Replace the entire Step 5 block with:

```ts
  // Step 5 — the actual registration row. MUST use admin: anon's RLS policy
  // grants INSERT but not SELECT, and Postgres's RETURNING (which .select()
  // triggers) requires SELECT on the row. Trying as anon fails with the
  // misleading "new row violates row-level security policy" error.
  //
  // The unique(event_id,email) constraint still fires under admin -> 23505.
  //
  // Generate a registration_code inline and retry on 23505 from the
  // registrations_code_unique constraint specifically (NOT from the
  // event_id+email constraint — that's the duplicate-registration error and
  // it has its own handling below). Up to 5 attempts; 31^4 namespace makes
  // 5 collisions in a row astronomically rare.
  let reg: { id: string } | null = null;
  let regErr: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateRegistrationCode();
    const insertResult = await admin
      .from('registrations')
      .insert({ event_id, email, full_name, registration_code: candidate })
      .select('id')
      .single();
    if (insertResult.error) {
      // Inspect the constraint name in the error.message; if it's
      // registrations_code_unique we retry, otherwise we bail.
      const isCodeCollision =
        insertResult.error.code === '23505' &&
        insertResult.error.message.includes('registrations_code_unique');
      if (isCodeCollision) continue; // retry with a new candidate
      regErr = insertResult.error;
      break;
    }
    reg = insertResult.data;
    break;
  }

  if (!reg) {
    // Either all 5 collision retries exhausted (astronomically unlikely) or
    // a non-collision error fell through.
    // Mark the email_log row failed so the ledger doesn't keep a stale entry.
    await admin
      .from('email_log')
      .update({ status: 'failed', error: regErr?.message ?? 'registration insert failed after retries' })
      .eq('id', log.id);

    // Duplicate email -> friendly message; everything else -> generic.
    if (regErr?.code === '23505' && regErr.message.includes('event_id_email_key')) {
      return { error: "You're already registered for this event." };
    }
    return { error: 'Registration failed. Please try again.' };
  }
```

This replaces the entire prior Step 5 block (lines 83–111 of the existing file as of HEAD `da6f62e`). DO NOT leave the old block in place.

**Step 3: Verify the action still type-checks + lints**

```bash
pnpm exec tsc --noEmit
pnpm exec eslint 'app/(public)/events/[id]/actions.ts'
```

Both clean.

**Step 4: Verify vitest still passes (no test for this action — manual smoke per project convention)**

```bash
pnpm exec vitest run
```

Expected: **88/88** (unchanged from Task 2).

**Step 5: Quick local smoke**

Open `http://localhost:3000/events/<some-published-id>` in a private window, register a new attendee. Then via Supabase Dashboard or `supabase db remote sql`, confirm the new row has a non-null `registration_code` matching `WK-XXXX`. If it's NULL, the patch didn't land in the INSERT branch.

```bash
# Example check:
pnpm exec supabase db remote sql "select email, registration_code from public.registrations order by registered_at desc limit 3;"
```

**Step 6: Commit**

```bash
git add 'app/(public)/events/[id]/actions.ts'
git commit -m "$(cat <<'EOF'
feat(phase-4): registerForEvent generates registration_code per row

Replaces Phase 2's plain INSERT with a generate-and-retry loop:
  - generate WK-XXXX via lib/registrationCode
  - insert with the code; on 23505 from registrations_code_unique only,
    retry up to 5 times
  - on 23505 from event_id+email, surface the existing "already
    registered" message (unchanged behaviour)
  - on any other error, mark email_log failed and bail (unchanged)

After this lands, every new registration row carries a code. Existing
rows were backfilled in 20260523010000_init_checkin_columns.sql.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `markAttended` Server Action (staff)

**Files:**
- Create: `app/events/[id]/checkin/actions.ts`

This is a NEW 'use server' file in a new route directory. Next 16 requires the file to export ONLY async functions.

**Step 1: Create the file**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidRegistrationCode } from '@/lib/registrationCode';

/**
 * Mark a registrant as attended by their registration_code.
 *
 * Three-layer auth: middleware (proxy.ts) → requireStaff() → RLS-via-admin
 * (we use admin because the staff tablet doesn't carry event-id context
 * when scanning a code; the code itself routes us to the right row).
 *
 * The action does NOT enforce that the staff member owns the event the
 * code belongs to. A manager running check-in for multiple concurrent
 * events from one tablet is a real use case; cross-event scans are made
 * visible via the success toast showing the event title.
 *
 * Idempotent via WHERE status != 'attended': a second writer for the
 * same code returns { error: 'Already attended at ...' } rather than
 * silently re-stamping check_in_at (CLAUDE.md rule 12).
 */
export async function markAttended(
  code: string,
  method: 'qr' | 'manual',
): Promise<
  | { ok: true; registration: { id: string; full_name: string; event_id: string; event_title: string } }
  | { error: string }
> {
  await requireStaff();
  if (!isValidRegistrationCode(code)) return { error: 'Invalid code format.' };

  const admin = supabaseAdmin();

  const { data: updated, error: updateErr } = await admin
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
  if (updateErr) throw updateErr;

  if (!updated) {
    // Distinguish "code doesn't exist" from "code exists but already attended"
    // so the staff toast can be specific. Admin SELECT so RLS doesn't hide
    // the row from a manager scanning another organiser's code.
    const { data: existing, error: lookupErr } = await admin
      .from('registrations')
      .select('id, full_name, event_id, check_in_at')
      .eq('registration_code', code)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (!existing) return { error: 'Code not recognised.' };
    return { error: `Already attended at ${existing.check_in_at}.` };
  }

  const { data: event, error: evtErr } = await admin
    .from('events')
    .select('title')
    .eq('id', updated.event_id)
    .maybeSingle();
  if (evtErr) throw evtErr;

  revalidatePath(`/events/${updated.event_id}/checkin`);
  return {
    ok: true,
    registration: {
      id: updated.id,
      full_name: updated.full_name,
      event_id: updated.event_id,
      event_title: event?.title ?? '',
    },
  };
}
```

**Step 2: Static gates**

```bash
pnpm exec tsc --noEmit
pnpm exec eslint 'app/events/[id]/checkin/actions.ts'
```

Both clean.

**Step 3: Verify vitest still passes**

```bash
pnpm exec vitest run
```

Expected: **88/88** (no new tests — server actions covered by manual smoke).

**Step 4: Commit**

```bash
git add 'app/events/[id]/checkin/actions.ts'
git commit -m "$(cat <<'EOF'
feat(phase-4): markAttended server action (staff, idempotent)

New 'use server' file at app/events/[id]/checkin/actions.ts with single
exported function:
  markAttended(code, method) -> { ok, registration } | { error }

Three-layer auth: middleware → requireStaff() → admin client. Admin used
because the tablet doesn't carry event-id context when scanning; the code
routes us to the right row. Idempotent via WHERE status != 'attended' so
a double-fire returns "Already attended at ..." rather than re-stamping
check_in_at (CLAUDE.md rule 12).

Cross-event scans intentionally succeed (a manager may run check-in for
multiple concurrent events from one tablet); success payload returns the
event_title so the staff toast can surface the cross-event nature.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Staff tablet page — server portion

**Files:**
- Create: `app/events/[id]/checkin/page.tsx`

**Step 1: Create the server component shell**

```tsx
import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';
import RosterClient from './RosterClient';

export default async function StaffCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }
  const { id } = await params;

  const supabase = await supabaseServer();
  const { data: event } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, timezone, venue_name, status')
    .eq('id', id)
    .maybeSingle();
  if (!event) notFound();

  // Initial roster paint: organiser/manager RLS already gates this read.
  // The client subscribes to Realtime postgres_changes for live updates.
  const { data: initialRoster } = await supabase
    .from('registrations')
    .select('id, full_name, email, registration_code, status, check_in_at, check_in_method')
    .eq('event_id', id)
    .order('full_name', { ascending: true });

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <header className="space-y-1">
        <p className="text-sm text-gray-600">
          {formatInTz(event.start_time, event.timezone)} → {formatInTz(event.end_time, event.timezone)} ({event.timezone})
        </p>
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <p className="text-sm text-gray-600">📍 {event.venue_name}</p>
      </header>

      <RosterClient
        eventId={event.id}
        eventTimezone={event.timezone}
        initialRoster={initialRoster ?? []}
      />
    </main>
  );
}
```

**Step 2: Static gates** (with the `RosterClient` import unresolved — Task 6 creates it; for now tsc will complain and that's expected. Skip to Task 6, then come back to verify gates after Task 6 lands.)

Skip ahead to Task 6.

---

## Task 6: Staff tablet page — `RosterClient` (client component)

**Files:**
- Create: `app/events/[id]/checkin/RosterClient.tsx`

This is the meaty one. Implements the Realtime subscription, search filter, manual toggle, "Scan QR" panel (dynamic-imported `html5-qrcode`), and "Enter code" modal.

**Step 1: Install `html5-qrcode`**

```bash
pnpm add html5-qrcode
```

Verify it lands in `package.json` under `dependencies`.

**Step 2: Create the client component**

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
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
    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
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
          setRoster(prev => [...prev, newRow].sort((a, b) => a.full_name.localeCompare(b.full_name)));
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

  // Filter roster by search.
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
      setToast({ kind: 'err', message: res.error });
      return;
    }
    setToast({ kind: 'ok', message: `Marked ${res.registration.full_name} attended (${res.registration.event_title}).` });
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
  const [lastScanned, setLastScanned] = useState<{ code: string; at: number } | null>(null);

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
            if (lastScanned && lastScanned.code === code && now - lastScanned.at < 3000) return;
            setLastScanned({ code, at: now });

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
```

**Step 3: Static gates** (after Task 5 created `page.tsx`, both files should now type-check)

```bash
pnpm exec tsc --noEmit
pnpm exec eslint 'app/events/[id]/checkin/page.tsx' 'app/events/[id]/checkin/RosterClient.tsx'
```

Both clean.

**Step 4: Verify build picks up the new route**

```bash
pnpm exec next build 2>&1 | tail -20
```

Expected: **10 routes** total (was 9). `/events/[id]/checkin` appears as `ƒ` (dynamic).

**Step 5: Verify vitest unchanged**

```bash
pnpm exec vitest run
```

Expected: **88/88** (no new tests).

**Step 6: Commit Tasks 5 + 6 together** (they're a single logical unit — server shell + its only client consumer)

```bash
git add 'app/events/[id]/checkin/page.tsx' 'app/events/[id]/checkin/RosterClient.tsx' package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(phase-4): staff tablet check-in page with Realtime + scanner

New route /events/[id]/checkin — tablet-optimised staff page with:
  - search by name / email (client-side filter)
  - Realtime subscription on registrations (postgres_changes UPDATE +
    INSERT, filtered by event_id) so multiple tablets stay in sync
  - manual one-tap "Mark Attended" toggle per row (method='manual')
  - "Enter code" modal with WK-XXXX format validation (method='manual')
  - "Scan QR" panel with html5-qrcode (dynamic import; ~120KB only loads
    when the panel mounts), debounce same-code-within-3s, falls back to
    "Enter code" if camera permission denied (method='qr')

All three input modalities converge on markAttended(code, method); UI
updates from the Realtime broadcast rather than optimistically (handles
the cross-tab + self-checkin sync cases for free).

Adds html5-qrcode dependency.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Public self-checkin page + `selfCheckIn` Server Action

**Files:**
- Create: `app/(public)/checkin/confirm/page.tsx`
- Create: `app/(public)/checkin/confirm/actions.ts`
- Create: `app/(public)/checkin/confirm/ConfirmButton.tsx`

**Step 1: Create the server action**

`app/(public)/checkin/confirm/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidRegistrationCode } from '@/lib/registrationCode';

/**
 * Public self-checkin via the personal QR URL /checkin/confirm?code=WK-XXXX.
 *
 * No auth — the code IS the bearer token. Admin client because anon has no
 * UPDATE policy on registrations. The WHERE status != 'attended' clause
 * makes the action idempotent so re-tapping the link doesn't re-stamp.
 *
 * Mirrors markAttended's idempotency pattern but with method='qr' hard-coded
 * (self-checkin always counts as QR — the attendee got here via their
 * personal QR URL).
 */
export async function selfCheckIn(
  code: string,
): Promise<{ ok: true; eventId: string } | { error: string }> {
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

  if (!updated) {
    // Either bad code or already attended. The page-side render distinguishes
    // these cases at load time; here we just return a generic error.
    return { error: 'Already checked in or code not recognised.' };
  }

  revalidatePath('/checkin/confirm');
  return { ok: true, eventId: updated.event_id };
}
```

**Step 2: Create the client confirm button**

`app/(public)/checkin/confirm/ConfirmButton.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { selfCheckIn } from './actions';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

export default function ConfirmButton({ code }: { code: string }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  function onClick() {
    setState({ kind: 'loading' });
    startTransition(async () => {
      const res = await selfCheckIn(code);
      if ('error' in res) {
        setState({ kind: 'error', message: res.error });
        return;
      }
      setState({ kind: 'ok' });
    });
  }

  if (state.kind === 'ok') {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 p-6 text-center space-y-2">
        <p className="text-2xl">✓</p>
        <p className="text-lg font-medium text-green-900">You're checked in!</p>
        <p className="text-sm text-green-800">See you at the event.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={state.kind === 'loading'}
        className="w-full rounded-md bg-blue-600 text-white px-4 py-3 text-base font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {state.kind === 'loading' ? 'Checking in…' : "I'm here — confirm check-in"}
      </button>
      {state.kind === 'error' && (
        <p className="text-sm text-red-700">⚠ {state.message}</p>
      )}
    </div>
  );
}
```

**Step 3: Create the server page**

`app/(public)/checkin/confirm/page.tsx`:

```tsx
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTz } from '@/lib/tz';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import ConfirmButton from './ConfirmButton';

export const dynamic = 'force-dynamic';

export default async function SelfCheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!code || !isValidRegistrationCode(code)) {
    return <UnrecognisedCode />;
  }

  const admin = supabaseAdmin();
  const { data: reg } = await admin
    .from('registrations')
    .select(
      'id, full_name, status, check_in_at, ' +
        'events!inner(id, title, start_time, end_time, timezone, venue_name, status)',
    )
    .eq('registration_code', code)
    .maybeSingle();

  if (!reg || !reg.events) return <UnrecognisedCode />;

  // The supabase-js typing for embedded selects can return the relation as
  // an object OR an array depending on relationship cardinality.
  // registrations.event_id -> events.id is many-to-one, so it's always an
  // object here, but TS doesn't know that. Narrow:
  const event = Array.isArray(reg.events) ? reg.events[0] : reg.events;
  if (!event || event.status !== 'published') return <UnrecognisedCode />;

  if (reg.status === 'attended') {
    return (
      <Layout>
        <EventCard event={event} />
        <div className="rounded-xl bg-gray-50 border p-6 text-center space-y-1">
          <p className="text-lg font-medium">You're already checked in.</p>
          <p className="text-sm text-gray-600">
            Checked in at {reg.check_in_at ? formatInTz(reg.check_in_at, event.timezone) : 'an earlier time'}.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <p className="text-sm text-gray-600 text-center">
        Hi <strong>{reg.full_name}</strong>, you're registered for:
      </p>
      <EventCard event={event} />
      <ConfirmButton code={code} />
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-md mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold text-center">Check-in</h1>
      {children}
    </main>
  );
}

function EventCard({
  event,
}: {
  event: {
    title: string;
    start_time: string;
    end_time: string;
    timezone: string;
    venue_name: string;
  };
}) {
  return (
    <section className="rounded-xl border p-4 space-y-1">
      <p className="font-medium">{event.title}</p>
      <p className="text-sm text-gray-600">
        {formatInTz(event.start_time, event.timezone)} → {formatInTz(event.end_time, event.timezone)}
      </p>
      <p className="text-sm text-gray-600">📍 {event.venue_name}</p>
    </section>
  );
}

function UnrecognisedCode() {
  return (
    <main className="max-w-md mx-auto p-6 space-y-4 text-center">
      <h1 className="text-xl font-semibold">Code not recognised</h1>
      <p className="text-sm text-gray-600">
        Please show this code (or your QR) to the event organiser. They can
        check you in manually.
      </p>
    </main>
  );
}
```

**Step 4: Static gates**

```bash
pnpm exec tsc --noEmit
pnpm exec eslint 'app/(public)/checkin/confirm/page.tsx' 'app/(public)/checkin/confirm/actions.ts' 'app/(public)/checkin/confirm/ConfirmButton.tsx'
```

Both clean.

**Step 5: Verify build picks up the new route**

```bash
pnpm exec next build 2>&1 | tail -20
```

Expected: **11 routes** total (was 10). `/checkin/confirm` appears as `ƒ` (dynamic — has `force-dynamic` export).

**Step 6: Vitest unchanged**

```bash
pnpm exec vitest run
```

Expected: **88/88**.

**Step 7: Commit**

```bash
git add 'app/(public)/checkin/'
git commit -m "$(cat <<'EOF'
feat(phase-4): public self-checkin at /checkin/confirm

Three new files under app/(public)/checkin/confirm/:
  page.tsx           server component, force-dynamic, admin SELECT of
                     registration + embedded event, renders one of three
                     states (unrecognised / already-attended / ready)
  actions.ts         'use server' file with selfCheckIn(code) — admin
                     UPDATE with WHERE status != 'attended' for
                     idempotency, mirrors markAttended pattern
  ConfirmButton.tsx  client component, idle | loading | ok | error state
                     machine, swaps to a success card on response

QR encodes /checkin/confirm?code=WK-XXXX. Anyone with the link can
self-check-in (code is the bearer token), but the explicit "I'm here"
button gates accidental clicks (forwarded link, premature taps in the
QR email). check_in_method hard-coded to 'qr' (always — that's the path
that got the attendee here).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire "Open check-in →" link into the staff edit page

**Files:**
- Modify: `app/events/[id]/edit/page.tsx`

**Step 1: Add a new section after the QR section, before the Registrant export section**

The edit page currently renders, in this order: Status + Title, Venue, About, Agenda, Publish/Draft buttons, View public page link, QR section (Phase 3 + 3.5 wiring), Registrant export section (Phase 3.5).

Add a new section BETWEEN the QR section and the Registrant export section. Find the closing `)}` of the QR section (which currently sits before `{event.status === 'published' && ( <section> <h2 ...>Registrant export</h2>`) and insert:

```tsx
{event.status === 'published' && (
  <section>
    <h2 className="text-sm font-medium text-gray-700 mb-1">On-site check-in</h2>
    <p className="text-sm text-gray-600 mb-3">
      Tablet-friendly roster with live updates, QR scanner, and manual mark-attended toggle.
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

DO NOT touch any other section. Surgical change.

**Step 2: Static gates**

```bash
pnpm exec tsc --noEmit
pnpm exec eslint 'app/events/[id]/edit/page.tsx'
pnpm exec vitest run
pnpm exec next build 2>&1 | tail -15
```

Expected: clean / 88/88 / 11 routes.

**Step 3: Commit**

```bash
git add 'app/events/[id]/edit/page.tsx'
git commit -m "$(cat <<'EOF'
feat(phase-4): edit page wiring — "Open check-in →" link

Add a new "On-site check-in" section between the QR and Registrant
export sections on the staff edit page. Visible only on published
events. Primary blue button opens /events/[id]/checkin in a new tab
so the organiser can keep the edit page open as a reference.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Verification + manual smoke + push + vault sync

**Step 1: Full gate sweep**

```bash
pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build
```

Expected:
- tsc: clean
- eslint: clean
- vitest: **88/88 pass** across 10 files (78 prior + 10 registrationCode)
- next build: **11 routes** total. New routes: `/events/[id]/checkin`, `/checkin/confirm`.

**Step 2: Manual smoke** (user runs in browser with `pnpm dev` on port 3000)

Pre-conditions:
- Logged in as `ahf.ivan@gmail.com`
- A published event exists with ≥ 2 registrations from the Phase 3.5 smoke (or register two new attendees fresh)
- Two browsers handy (e.g. Chrome regular + Chrome incognito) for the Realtime test

**A. Code generation (Task 3):**
1. Register a new attendee through the public page. Check via Supabase Dashboard: the new row has a non-null `registration_code` matching `WK-XXXX`.

**B. Self-checkin happy path (Task 7):**
2. Open `http://localhost:3000/checkin/confirm?code=WK-XXXX` (use a code from step 1). Verify: event card + attendee name + "I'm here — confirm check-in" button.
3. Click the button. Verify: page swaps to the green ✓ "You're checked in!" card.

**C. Self-checkin already-attended (Task 7):**
4. Reload the same URL. Verify: page shows "You're already checked in" with the timestamp.

**D. Self-checkin bad code (Task 7):**
5. Open `http://localhost:3000/checkin/confirm?code=WK-ZZZZ` (an unused code). Verify: "Code not recognised" page.

**E. Staff tablet manual toggle (Task 5/6):**
6. Open `http://localhost:3000/events/<published-id>/checkin` in browser A. Verify: roster shows all registrants, each with code displayed.
7. Find a NOT-attended row, tap "Mark Attended". Verify: toast says "Marked {name} attended…", row updates to "✓ HH:MM".

**F. Staff tablet manual code entry (Task 5/6):**
8. Tap "Enter code". Modal opens. Type a valid `WK-XXXX` code. Submit. Verify: toast + row updates.

**G. Staff tablet scanner (Task 5/6):**
9. Tap "Scan QR". Browser asks for camera permission — allow. Scanner panel shows live camera feed.
10. Print or display on another screen a QR encoding `http://localhost:3000/checkin/confirm?code=WK-XXXX` (use the lib/qr.ts via a quick `next dev` snippet, or use any online QR generator). Hold QR up to camera. Verify: toast + roster updates.

**H. Realtime cross-tab sync (Task 5/6):**
11. Open the same checkin URL in browser B (incognito, logged in as same staff). Verify: roster matches A.
12. Mark someone attended in A. Verify: within ~1s, B's row updates without reload.
13. Mark someone attended via self-checkin (open /checkin/confirm in a 3rd browser/private window). Verify: both A and B update.

**I. Race condition (Task 4):**
14. In two tabs, click "Mark Attended" for the same not-yet-attended row at the same time. Verify: one succeeds with the "Marked X attended" toast; the other shows "Already attended at HH:MM".

**J. Backfill (Task 1):**
15. Check Supabase Dashboard: all 7 pre-Phase-4 registrations rows have non-null, unique, format-valid `registration_code` values.

**Step 3: If anything fails**

Fix the cause, re-commit per atomic-commit pattern, re-run gates. Do NOT skip the gate sweep.

**Step 4: Push**

```bash
git push origin main
```

Expected: ~8 commits pushed (Tasks 1–8; Task 9 is verification-only).

**Step 5: Update vault**

After push, mark Phase 4 in the vault:
- Update `20 — Roadmap/Phased Roadmap.md` — change Phase 4 row from ⏳ to ✅
- Create `20 — Roadmap/Phase 4 — Check-in tablet.md` summary note (mirror the Phase 3.5 note structure)
- Update `00 — Index.md` Status block — tick Phase 4 ✅, point Next action at Phase 5 (Survey flow)
- Update `10 — Architecture/Data Model.md` — mark the "Phase 4 follow-up migration" note as done (the note that currently says `registration_code`, `check_in_at`, `check_in_method` are deferred — they're now in the schema)

---

## Out-of-scope reminders (do NOT add in this slice)

- Email #2 with the personal QR — Phase 9 (cron + Resend).
- Multi-event "today's events" tablet view — Phase 6 candidate.
- Bulk import / re-import of attendees — out.
- Offline-capable PWA — flagged in vault for future.
- NFC / Bluetooth / face matching — out.
- "Undo check-in" / `unmarkAttended` — Phase 6 candidate (audit story needed first).

---

## Verification before completion

Per `superpowers:verification-before-completion`:
1. All gates pass (tsc/eslint/vitest 88/88/next build with 11 routes)
2. All 15 manual smoke scenarios pass end-to-end
3. All commits pushed to `origin/main`
4. Vault updated (Phase 4 note + roadmap row + Index Status + Data Model note)

If smoke fails at any step, the cause is a real bug — don't paper over it.
