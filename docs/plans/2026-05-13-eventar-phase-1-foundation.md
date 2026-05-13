# Eventar Phase 1: Foundation + Create-Event Slice

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Local-only Next.js + Supabase app where an authorized staff member can magic-link login, create a draft event, view it on a staff page, publish it, and have it render at a public `/events/:id` URL.

**Architecture:** Next.js App Router with route groups `(public)` and `(staff)`. Supabase Postgres holds `staff` + `events` with RLS enabled. Magic-link auth via Supabase's built-in mailer (no Resend yet). All staff mutations are Server Actions; public reads are SSR; no client-side Supabase calls in this phase.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind v4, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `vitest` (unit), `pnpm` (package manager), Supabase CLI (migrations).

**Out of scope for phase 1:** registrations, emails, QR codes, surveys, cron, Vercel deploy, Resend, analytics. All come in later phases per the design doc.

**Reference:** [Eventar MVP Design](./2026-05-13-eventar-mvp-design.md)

---

## Pre-flight

**Working directory for every command:** `/Users/ivan/Eventar`
Every shell snippet assumes you `cd /Users/ivan/Eventar` first (or prefix with it).

**You will need from the user before Task 6:**
- One staff email address to seed as the first **manager** (your own work email is fine).

**Credentials to put in `.env.local` (Task 3):**
- `NEXT_PUBLIC_SUPABASE_URL` = `https://muieupgkpbxpqsrjjwol.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon JWT *(from Supabase Dashboard → Settings → API, or paste from chat where it was shared)*
- `SUPABASE_SERVICE_ROLE_KEY` = service-role JWT *(same source; server-only, never expose to browser)*

> **Security:** the actual key values are NOT in this committed plan — they live only in your local `.env.local` (gitignored) and in the dashboard. If you rotated the service-role key after sharing it in chat, paste the new one.

---

## Task 1: Verify toolchain

**Files:** none

**Step 1:** Verify Node ≥ 20, pnpm, supabase CLI.

```bash
node -v               # expect v20.x or v22.x
pnpm -v               # expect 9.x+; if missing: corepack enable && corepack prepare pnpm@latest --activate
supabase --version    # expect 1.x or 2.x; if missing: brew install supabase/tap/supabase
```

**Step 2:** If anything is missing, install before proceeding. Do not commit yet.

---

## Task 2: Scaffold Next.js project in-place

**Files:** the whole tree will be created by the CLI.

**Step 1:** Init Next.js into the existing repo (`.` keeps the existing `README.md` and `docs/`).

```bash
cd /Users/ivan/Eventar
pnpm create next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias "@/*" \
  --turbopack \
  --use-pnpm
```
If it prompts about non-empty dir, answer **Yes** to continue (preserves `README.md`, `docs/`).

**Step 2:** Verify dev server boots.

```bash
pnpm dev   # in one terminal; ctrl-C after seeing "Ready in <ms>"
```
Expected: starts on `http://localhost:3000`.

**Step 3:** Confirm `.gitignore` already includes `.env*.local` (Next.js scaffold sets this). If not, add it.

```bash
grep -E '\.env.*\.local' .gitignore || echo '.env*.local' >> .gitignore
```

**Step 4:** Commit.

```bash
git add .
git commit -m "feat(phase-1): scaffold Next.js app (App Router + TS + Tailwind)"
```

---

## Task 3: Environment configuration

**Files:**
- Create: `.env.local` *(gitignored — local secrets)*
- Create: `.env.example` *(committed — template for next dev)*

**Step 1:** Write `.env.local` with the real keys. The values come from chat / Supabase Dashboard → Settings → API. **Do not commit this file.**

```bash
cat > .env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://muieupgkpbxpqsrjjwol.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste anon key here>
SUPABASE_SERVICE_ROLE_KEY=<paste service-role key here>
EOF
```

Then open `.env.local` in an editor and paste the actual values for the two `<paste …>` placeholders.

**Step 2:** Write `.env.example` (committed; placeholder values).

```bash
cat > .env.example <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server-side only, never expose
EOF
```

**Step 3:** Confirm `.env.local` is NOT staged.

```bash
git status
# Expected: only .env.example shows as a new file
```

**Step 4:** Commit (template only).

```bash
git add .env.example .gitignore
git commit -m "feat(phase-1): env template + ensure .env.local is gitignored"
```

---

## Task 4: Install Supabase + Zod

**Files:** `package.json`, `pnpm-lock.yaml`.

**Step 1:** Install.

```bash
pnpm add @supabase/supabase-js @supabase/ssr zod
```

**Step 2:** Commit.

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(phase-1): add @supabase/{supabase-js,ssr} + zod"
```

---

## Task 5: Supabase server + browser clients

**Files:**
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/browser.ts`
- Create: `lib/supabase/admin.ts`

**Step 1:** Create the **server client** (RSC + Server Actions, uses cookies for session).

```ts
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component without a writable cookie store — ignore
          }
        },
      },
    },
  );
}
```

**Step 2:** Create the **browser client** (used only by client components).

```ts
// lib/supabase/browser.ts
import { createBrowserClient } from '@supabase/ssr';

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

**Step 3:** Create the **admin client** (bypasses RLS — service-role; SERVER ONLY).

```ts
// lib/supabase/admin.ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
```

**Step 4:** Install `server-only` (Next's import-time guard for server modules).

```bash
pnpm add server-only
```

**Step 5:** Type-check.

```bash
pnpm tsc --noEmit
# Expected: no errors
```

**Step 6:** Commit.

```bash
git add lib/supabase/ package.json pnpm-lock.yaml
git commit -m "feat(phase-1): supabase clients (server, browser, admin)"
```

---

## Task 6: Link Supabase project + init migrations

**Files:** `supabase/config.toml` (CLI-generated), `supabase/.gitignore`, possibly `supabase/seed.sql`.

**Step 1:** Init Supabase locally (creates `supabase/` dir).

```bash
supabase init
```
Answer **No** to "Generate VS Code workspace settings" unless wanted.

**Step 2:** Link to the remote project. You'll be prompted for the **database password** (from Supabase Dashboard → Settings → Database → "Connection string" → reveal password).

```bash
supabase link --project-ref muieupgkpbxpqsrjjwol
```
Expected: `Finished supabase link.`

**Step 3:** Verify there are no existing remote migrations.

```bash
supabase migration list
# Expected: empty or "Local | Remote | Time" headers only
```

**Step 4:** Commit the Supabase scaffolding.

```bash
git add supabase/
git commit -m "feat(phase-1): init Supabase project + link to remote"
```

---

## Task 7: Migration 0001 — staff + RLS helpers

**Files:**
- Create: `supabase/migrations/<timestamp>_init_staff.sql` (use `supabase migration new` to get the timestamp).

**Step 1:** Generate the migration file.

```bash
supabase migration new init_staff
# Note the created filename, e.g. supabase/migrations/20260513120000_init_staff.sql
```

**Step 2:** Write the migration. Open the generated file and paste:

```sql
-- Helper functions read JWT claims set by Supabase Auth.
-- Keeping these in their own migration so later migrations can depend on them.
create or replace function public.auth_email() returns text
  language sql stable security definer set search_path = public, pg_temp as
$$ select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email','') $$;

-- staff: email -> role, the single source of truth for who can use the app.
-- Keyed on email (not auth.users.id) so MS-SSO migration later is a config flip.
create table public.staff (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  full_name  text,
  role       text not null check (role in ('organizer','manager')),
  created_at timestamptz not null default now()
);

-- Normalize email on write.
create or replace function public.lowercase_email() returns trigger
  language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;
create trigger staff_lowercase_email
  before insert or update on public.staff
  for each row execute function public.lowercase_email();

create or replace function public.is_manager() returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$ select exists(select 1 from public.staff where email = auth_email() and role = 'manager') $$;

create or replace function public.current_staff_id() returns uuid
  language sql stable security definer set search_path = public, pg_temp as
$$ select id from public.staff where email = auth_email() $$;

alter table public.staff enable row level security;

create policy "staff_self_read" on public.staff
  for select using (email = auth_email() or is_manager());
-- No write policy: staff inserts happen via service-role only (seed or admin UI).
```

**Step 3:** Apply to remote.

```bash
supabase db push
# Expected: "Applying migration <timestamp>_init_staff.sql..." then "Finished supabase db push."
```

**Step 4:** Verify the table exists.

```bash
# Load env so SUPABASE_SERVICE_ROLE_KEY is available without inlining it.
set -a; source .env.local; set +a
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/staff?select=*" | head -c 200
# Expected: [] (empty array — RLS allows service-role to read; no rows yet)
```

**Step 5:** Commit.

```bash
git add supabase/migrations/
git commit -m "feat(phase-1): staff table + RLS helpers (auth_email, is_manager, current_staff_id)"
```

---

## Task 8: Seed first manager

**Files:**
- Modify: `supabase/seed.sql`

**Prerequisite:** the email address to use. Ask the user if not yet provided. For this plan we'll use a placeholder `MANAGER_EMAIL` — replace before applying.

**Step 1:** Write the seed.

```sql
-- supabase/seed.sql
-- Idempotent: re-running is safe.
insert into public.staff (email, role, full_name)
values ('MANAGER_EMAIL', 'manager', 'First Manager')
on conflict (email) do nothing;
```

**Step 2:** Edit the file: replace `MANAGER_EMAIL` with the real email. **Do not commit the real email** unless the user is OK with it being in git history. (Alternative: insert via SQL editor in Supabase Dashboard and skip committing `seed.sql` with real value.)

**Step 3:** Apply seed.

```bash
# Option A — via Supabase CLI (re-applies seed):
supabase db reset --linked       # WARNING: this is destructive on remote; do NOT use on prod data
# Option B — recommended: paste the INSERT into Supabase Dashboard → SQL Editor → Run
```
Use **Option B** for safety in phase 1. We're on a fresh DB; in later phases we'll have real data and Option A becomes unsafe.

**Step 4:** Verify.

```bash
set -a; source .env.local; set +a
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/staff?select=email,role"
# Expected: [{"email":"<your email>","role":"manager"}]
```

**Step 5:** Commit seed file with a placeholder (NOT the real email).

```bash
# Revert the file to use 'MANAGER_EMAIL' placeholder before committing
git add supabase/seed.sql
git commit -m "feat(phase-1): seed.sql template for first manager"
```

---

## Task 9: Migration 0002 — events table + RLS

**Files:**
- Create: `supabase/migrations/<timestamp>_init_events.sql`

**Step 1:** Generate.

```bash
supabase migration new init_events
```

**Step 2:** Write the migration.

```sql
create table public.events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  topic         text,
  format        text,
  start_time    timestamptz not null,
  end_time      timestamptz not null check (end_time > start_time),
  timezone      text not null,
  location      text,
  speakers      jsonb not null default '[]'::jsonb,
  description   text,
  agenda        text,
  poster_path   text,
  max_attendees int check (max_attendees is null or max_attendees > 0),
  status        text not null default 'draft'
                check (status in ('draft','published','completed','cancelled')),
  created_by    uuid not null references public.staff(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index events_status_starttime_idx on public.events(status, start_time);

-- updated_at autobump
create or replace function public.touch_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

alter table public.events enable row level security;

-- Public can read PUBLISHED events.
create policy "events_public_read_published" on public.events
  for select to anon, authenticated
  using (status = 'published');

-- Organizers: full CRUD on their own events.
create policy "events_organizer_select_own" on public.events
  for select to authenticated
  using (created_by = current_staff_id());
create policy "events_organizer_insert_own" on public.events
  for insert to authenticated
  with check (created_by = current_staff_id());
create policy "events_organizer_update_own" on public.events
  for update to authenticated
  using (created_by = current_staff_id())
  with check (created_by = current_staff_id());
create policy "events_organizer_delete_own" on public.events
  for delete to authenticated
  using (created_by = current_staff_id());

-- Managers can read everything.
create policy "events_manager_read_all" on public.events
  for select to authenticated
  using (is_manager());
```

**Step 3:** Apply.

```bash
supabase db push
```

**Step 4:** Verify schema present.

```bash
set -a; source .env.local; set +a
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/events?select=*&limit=1"
# Expected: []
```

**Step 5:** Commit.

```bash
git add supabase/migrations/
git commit -m "feat(phase-1): events table + RLS (public read published, organizer own, manager all)"
```

---

## Task 10: `requireStaff()` helper (TDD)

**Files:**
- Create: `lib/auth.ts`
- Create: `lib/auth.test.ts`
- Modify: `package.json` (add vitest scripts + dev deps)

**Step 1:** Install Vitest.

```bash
pnpm add -D vitest @vitest/coverage-v8
```

Add scripts to `package.json`:

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

**Step 2:** Write the failing test.

```ts
// lib/auth.test.ts
import { describe, expect, it, vi } from 'vitest';
import { requireStaff, NotAuthorizedError } from './auth';

// Helper to fabricate a supabase client mock.
function mockClient({ user, staffRow }: {
  user: { email: string } | null;
  staffRow: { id: string; email: string; role: 'organizer' | 'manager' } | null;
}) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: staffRow, error: null }),
        }),
      }),
    }),
  } as any;
}

describe('requireStaff', () => {
  it('returns staff record when user is logged in and listed in staff', async () => {
    const c = mockClient({
      user: { email: 'a@b.com' },
      staffRow: { id: 's-1', email: 'a@b.com', role: 'organizer' },
    });
    const staff = await requireStaff(c);
    expect(staff).toEqual({ id: 's-1', email: 'a@b.com', role: 'organizer' });
  });

  it('throws NotAuthorizedError when no session', async () => {
    const c = mockClient({ user: null, staffRow: null });
    await expect(requireStaff(c)).rejects.toBeInstanceOf(NotAuthorizedError);
  });

  it('throws NotAuthorizedError when user is logged in but not in staff', async () => {
    const c = mockClient({ user: { email: 'unknown@x.com' }, staffRow: null });
    await expect(requireStaff(c)).rejects.toBeInstanceOf(NotAuthorizedError);
  });
});
```

**Step 3:** Run; expect failure.

```bash
pnpm test
# Expected: failures — "Cannot find module './auth'" or similar.
```

**Step 4:** Implement.

```ts
// lib/auth.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from './supabase/server';

export type Staff = { id: string; email: string; role: 'organizer' | 'manager' };

export class NotAuthorizedError extends Error {
  constructor(message = 'not authorized') {
    super(message);
    this.name = 'NotAuthorizedError';
  }
}

export async function requireStaff(client?: SupabaseClient): Promise<Staff> {
  const supabase = client ?? (await supabaseServer());

  const { data: userRes } = await supabase.auth.getUser();
  const email = userRes?.user?.email?.toLowerCase();
  if (!email) throw new NotAuthorizedError('no session');

  const { data: staff } = await supabase
    .from('staff')
    .select('id, email, role')
    .eq('email', email)
    .maybeSingle();

  if (!staff) throw new NotAuthorizedError('email not in staff table');
  return staff as Staff;
}
```

**Step 5:** Run; expect pass.

```bash
pnpm test
# Expected: 3 tests passing.
```

**Step 6:** Commit.

```bash
git add lib/auth.ts lib/auth.test.ts package.json pnpm-lock.yaml
git commit -m "feat(phase-1): requireStaff() + tests (load-bearing auth gate)"
```

---

## Task 11: Timezone helper (TDD)

**Files:**
- Create: `lib/tz.ts`
- Create: `lib/tz.test.ts`

**Step 1:** Write tests.

```ts
// lib/tz.test.ts
import { describe, expect, it } from 'vitest';
import { formatInTz, browserTz } from './tz';

describe('formatInTz', () => {
  it('formats UTC ISO in Europe/Berlin', () => {
    expect(formatInTz('2026-06-15T09:00:00Z', 'Europe/Berlin'))
      .toBe('15 Jun 2026, 11:00');                       // Berlin is UTC+2 in summer
  });
  it('formats UTC ISO in America/New_York', () => {
    expect(formatInTz('2026-06-15T09:00:00Z', 'America/New_York'))
      .toBe('15 Jun 2026, 05:00');                       // NYC is UTC-4 in summer
  });
});

describe('browserTz', () => {
  it('returns a string', () => {
    expect(typeof browserTz()).toBe('string');
  });
});
```

**Step 2:** Run; expect failure.

```bash
pnpm test lib/tz.test.ts
# Expected: module not found
```

**Step 3:** Implement.

```ts
// lib/tz.ts
const FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

export function formatInTz(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
  }).formatToParts(new Date(iso));

  const lookup = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${lookup.day} ${lookup.month} ${lookup.year}, ${lookup.hour}:${lookup.minute}`;
}

export function browserTz(): string {
  if (typeof Intl === 'undefined') return 'UTC';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
```

**Step 4:** Run; expect pass.

```bash
pnpm test lib/tz.test.ts
```

**Step 5:** Commit.

```bash
git add lib/tz.ts lib/tz.test.ts
git commit -m "feat(phase-1): tz helpers (formatInTz, browserTz)"
```

---

## Task 12: Auth — login page + callback route + middleware

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/login/actions.ts`
- Create: `app/auth/callback/route.ts`
- Create: `middleware.ts`

**Step 1:** Login Server Action.

```ts
// app/login/actions.ts
'use server';
import { supabaseServer } from '@/lib/supabase/server';
import { headers } from 'next/headers';

export async function sendMagicLink(formData: FormData): Promise<{ ok: true } | { error: string }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Please enter a valid email.' };
  }
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };
  return { ok: true };
}
```

**Step 2:** Login page UI.

```tsx
// app/login/page.tsx
'use client';
import { useState, useTransition } from 'react';
import { sendMagicLink } from './actions';

export default function LoginPage() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-gray-50">
      <form
        action={(fd) => start(async () => {
          setMsg(null); setErr(null);
          const res = await sendMagicLink(fd);
          if ('error' in res) setErr(res.error);
          else setMsg('Check your inbox for a sign-in link.');
        })}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 space-y-4"
      >
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-gray-600">We'll email you a one-tap link.</p>
        <input
          name="email" type="email" required placeholder="you@company.com"
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
        <button
          disabled={pending}
          className="w-full rounded-md bg-black text-white py-2 disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Email me a link'}
        </button>
        {msg && <p className="text-sm text-green-700">{msg}</p>}
        {err && <p className="text-sm text-red-700">{err}</p>}
      </form>
    </main>
  );
}
```

**Step 3:** Auth callback.

```ts
// app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/login?error=missing_code', url));

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL('/login?error=exchange_failed', url));

  return NextResponse.redirect(new URL('/dashboard', url));
}
```

**Step 4:** Middleware — refreshes session + gates staff routes.

```ts
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const STAFF_PREFIXES = ['/dashboard', '/events'];   // events here = /(staff)/events; /(public)/events/:id is rendered via app/(public) and NOT matched because we exclude /events/[id] via the matcher below

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    },
  );

  const isStaffRoute = STAFF_PREFIXES.some(p => req.nextUrl.pathname === p || req.nextUrl.pathname.startsWith(p + '/'));
  if (!isStaffRoute) return res;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const { data: staff } = await supabase
    .from('staff').select('id').eq('email', user.email!.toLowerCase()).maybeSingle();
  if (!staff) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=not_authorized', req.url));
  }
  return res;
}

export const config = {
  // Run on /dashboard, /events/new, /events/:id/edit, /events/:id/checkin.
  // Public /events/:id is matched too, but middleware lets it through (not in STAFF_PREFIXES — wait, it IS).
  // We split via path-level allowlist below.
  matcher: ['/dashboard/:path*', '/events/new', '/events/:id/edit', '/events/:id/checkin'],
};
```

**Note on the matcher:** the public `/events/[id]` page lives in `app/(public)/events/[id]/page.tsx` and the staff event detail in `app/(staff)/events/[id]/page.tsx`. Next.js route groups in parens are *URL-invisible*, so both render at the URL `/events/:id`. We resolve the conflict by NOT having a staff `/events/[id]/page.tsx` — staff use `/events/[id]/edit` and `/events/[id]/checkin` instead. The plain `/events/[id]` URL always serves the public page.

**Step 5:** Verify the dev server still boots and middleware compiles.

```bash
pnpm dev
# Visit http://localhost:3000/login — page should render.
# Visit http://localhost:3000/dashboard — should redirect to /login.
# Ctrl-C.
```

**Step 6:** Commit.

```bash
git add app/login app/auth middleware.ts
git commit -m "feat(phase-1): magic-link login, auth callback, middleware staff-gate"
```

---

## Task 13: Smoke-test the auth flow

**Files:** none — manual verification.

**Step 1:** Configure Supabase Auth redirect URLs.

In **Supabase Dashboard → Authentication → URL Configuration**:
- Site URL: `http://localhost:3000`
- Redirect URLs: add `http://localhost:3000/auth/callback`

Save.

**Step 2:** Run dev server, sign in as the seeded manager.

```bash
pnpm dev
```
- Open `http://localhost:3000/login`
- Enter the **seeded manager email** from Task 8
- Click submit; check inbox; click link
- Should land at `http://localhost:3000/dashboard` (which 404s for now — that's fine; Task 14 creates it)

**Step 3:** Try a NON-staff email.

- Sign out (clear cookies or visit `/login` again)
- Submit an email NOT in `staff`
- Click link from inbox
- Should redirect to `/login?error=not_authorized`

If both work, auth is operational. No commit (no code changed).

---

## Task 14: Dashboard skeleton

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `app/dashboard/SignOutButton.tsx`

**Step 1:** Dashboard.

```tsx
// app/dashboard/page.tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';
import SignOutButton from './SignOutButton';

export default async function DashboardPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }

  const supabase = await supabaseServer();
  const { data: events } = await supabase
    .from('events')
    .select('id, title, start_time, timezone, status')
    .order('start_time', { ascending: false })
    .limit(50);

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm text-gray-600">Signed in as {staff.email} ({staff.role})</p>
        </div>
        <div className="flex gap-2">
          <Link href="/events/new" className="rounded-md bg-black text-white px-4 py-2 text-sm">
            New event
          </Link>
          <SignOutButton />
        </div>
      </header>

      {(events?.length ?? 0) === 0 ? (
        <p className="text-gray-500">No events yet. Create one.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {events!.map((e) => (
            <li key={e.id} className="p-4 flex items-center justify-between">
              <div>
                <Link href={`/events/${e.id}/edit`} className="font-medium hover:underline">
                  {e.title}
                </Link>
                <p className="text-sm text-gray-600">
                  {formatInTz(e.start_time, e.timezone)} · {e.timezone}
                </p>
              </div>
              <span className="text-xs uppercase tracking-wide text-gray-500">{e.status}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

**Step 2:** Sign-out button (Server Action via client wrapper).

```tsx
// app/dashboard/SignOutButton.tsx
'use client';
import { useTransition } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

export default function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => {
        await supabaseBrowser().auth.signOut();
        window.location.href = '/login';
      })}
      className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
    >
      {pending ? '…' : 'Sign out'}
    </button>
  );
}
```

**Step 3:** Visit `/dashboard` while signed in — should render empty state.

**Step 4:** Commit.

```bash
git add app/dashboard
git commit -m "feat(phase-1): dashboard skeleton (event list + sign-out)"
```

---

## Task 15: Create-event flow (form + Server Action)

**Files:**
- Create: `app/events/new/page.tsx`
- Create: `app/events/new/actions.ts`
- Create: `app/events/new/actions.test.ts`

**Step 1:** Write the validation test FIRST.

```ts
// app/events/new/actions.test.ts
import { describe, expect, it } from 'vitest';
import { eventInputSchema } from './actions';

describe('eventInputSchema', () => {
  const base = {
    title: 'Intro to TDD',
    start_time: '2026-06-15T09:00:00.000Z',
    end_time:   '2026-06-15T10:30:00.000Z',
    timezone:   'Europe/Berlin',
  };
  it('accepts a minimal valid input', () => {
    expect(eventInputSchema.safeParse(base).success).toBe(true);
  });
  it('rejects end before start', () => {
    const bad = { ...base, end_time: '2026-06-15T08:00:00.000Z' };
    expect(eventInputSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects empty title', () => {
    expect(eventInputSchema.safeParse({ ...base, title: '' }).success).toBe(false);
  });
  it('rejects bad timezone', () => {
    expect(eventInputSchema.safeParse({ ...base, timezone: 'Mars/Olympus' }).success).toBe(false);
  });
});
```

**Step 2:** Run — expect failure.

```bash
pnpm test app/events/new/actions.test.ts
# Expected: module not found
```

**Step 3:** Implement the Server Action with Zod schema.

```ts
// app/events/new/actions.ts
'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }).format(0); return true; }
  catch { return false; }
}

export const eventInputSchema = z.object({
  title: z.string().trim().min(1, 'Title required').max(200),
  topic: z.string().max(80).optional().default(''),
  format: z.enum(['workshop', 'seminar', 'roundtable', 'other']).optional(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  timezone: z.string().refine(isValidTimezone, 'Invalid IANA timezone'),
  location: z.string().max(200).optional().default(''),
  description: z.string().max(4000).optional().default(''),
  agenda: z.string().max(8000).optional().default(''),
  max_attendees: z.coerce.number().int().positive().optional(),
}).refine(d => new Date(d.end_time) > new Date(d.start_time), {
  message: 'End time must be after start time',
  path: ['end_time'],
});

export type EventInput = z.infer<typeof eventInputSchema>;

export async function createEvent(formData: FormData) {
  const staff = await requireStaff();

  const parsed = eventInputSchema.safeParse({
    title: formData.get('title'),
    topic: formData.get('topic'),
    format: formData.get('format') || undefined,
    start_time: formData.get('start_time'),
    end_time: formData.get('end_time'),
    timezone: formData.get('timezone'),
    location: formData.get('location'),
    description: formData.get('description'),
    agenda: formData.get('agenda'),
    max_attendees: formData.get('max_attendees') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('events')
    .insert({ ...parsed.data, created_by: staff.id, status: 'draft' })
    .select('id')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  redirect(`/events/${data.id}/edit`);
}
```

**Step 4:** Run tests — expect pass.

```bash
pnpm test app/events/new/actions.test.ts
```

**Step 5:** Form UI.

```tsx
// app/events/new/page.tsx
'use client';
import { useState, useTransition, useEffect } from 'react';
import { createEvent } from './actions';
import { browserTz } from '@/lib/tz';

export default function NewEventPage() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [tz, setTz] = useState('UTC');
  useEffect(() => setTz(browserTz()), []);

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">New event</h1>

      <form
        action={(fd) => start(async () => {
          setErr(null);
          const res = await createEvent(fd);
          if (res && 'error' in res) setErr(res.error);
        })}
        className="space-y-4"
      >
        <Field name="title" label="Title" required />
        <Field name="topic" label="Topic" />
        <div>
          <label className="block text-sm font-medium mb-1">Format</label>
          <select name="format" className="w-full rounded-md border border-gray-300 px-3 py-2">
            <option value="workshop">Workshop</option>
            <option value="seminar">Seminar</option>
            <option value="roundtable">Roundtable</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field name="start_time" label="Start (UTC ISO)" required type="datetime-local" />
          <Field name="end_time"   label="End (UTC ISO)"   required type="datetime-local" />
        </div>
        <Field name="timezone" label="Timezone (IANA)" defaultValue={tz} required />
        <Field name="location" label="Location" />
        <TextArea name="description" label="Description" />
        <TextArea name="agenda" label="Agenda" />
        <Field name="max_attendees" label="Max attendees (optional)" type="number" />

        <button
          disabled={pending}
          className="rounded-md bg-black text-white px-4 py-2 disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create event'}
        </button>
        {err && <p className="text-sm text-red-700">{err}</p>}
      </form>
    </main>
  );
}

function Field(p: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{p.label}</label>
      <input
        name={p.name} type={p.type ?? 'text'} required={p.required} defaultValue={p.defaultValue}
        className="w-full rounded-md border border-gray-300 px-3 py-2"
      />
    </div>
  );
}
function TextArea(p: { name: string; label: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{p.label}</label>
      <textarea name={p.name} rows={4} className="w-full rounded-md border border-gray-300 px-3 py-2" />
    </div>
  );
}
```

**Gotcha:** `datetime-local` inputs return local time strings without timezone, but Zod's `.datetime()` requires ISO with Z. We'll convert in a follow-up commit; for now, the user enters times like `2026-06-15T09:00:00.000Z` manually for testing. (Real datetime picker UX is phase 7 polish.)

**Step 6:** Commit.

```bash
git add app/events/new
git commit -m "feat(phase-1): create-event form + Server Action + zod schema"
```

---

## Task 16: Event edit stub + public info page

**Files:**
- Create: `app/events/[id]/edit/page.tsx` *(staff view; minimal for phase 1)*
- Create: `app/(public)/events/[id]/page.tsx`

**Step 1:** Staff event edit stub (just shows the event; real editing comes in phase 3).

```tsx
// app/events/[id]/edit/page.tsx
import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';
import { publishEvent } from './actions';

export default async function StaffEventPage({ params }: { params: Promise<{ id: string }> }) {
  try { await requireStaff(); } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: event } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
  if (!event) notFound();

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <p className="text-sm text-gray-500">Status: <strong>{event.status}</strong></p>
      <h1 className="text-3xl font-semibold">{event.title}</h1>
      <p className="text-gray-700">
        {formatInTz(event.start_time, event.timezone)} → {formatInTz(event.end_time, event.timezone)} ({event.timezone})
      </p>
      {event.location && <p>{event.location}</p>}
      {event.description && <p className="whitespace-pre-wrap">{event.description}</p>}

      {event.status === 'draft' && (
        <form action={async () => { 'use server'; await publishEvent(event.id); }}>
          <button className="rounded-md bg-black text-white px-4 py-2">Publish</button>
        </form>
      )}
      {event.status === 'published' && (
        <a className="text-blue-700 underline" href={`/events/${event.id}`} target="_blank">
          View public page →
        </a>
      )}
    </main>
  );
}
```

**Step 2:** Publish action.

```ts
// app/events/[id]/edit/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

export async function publishEvent(id: string) {
  await requireStaff();
  const supabase = await supabaseServer();
  const { error } = await supabase.from('events').update({ status: 'published' }).eq('id', id);
  if (error) throw error;
  revalidatePath(`/events/${id}/edit`);
  revalidatePath('/dashboard');
}
```

**Step 3:** Public info page (RSC, no client JS, only renders if `status='published'`).

```tsx
// app/(public)/events/[id]/page.tsx
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';

export const dynamic = 'force-dynamic';   // phase 1: always fresh; ISR later

export default async function PublicEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: event } = await supabase
    .from('events')
    .select('id, title, topic, format, start_time, end_time, timezone, location, description, agenda, speakers, status')
    .eq('id', id)
    .maybeSingle();

  // RLS already filters to published; this 404s drafts + non-existent.
  if (!event || event.status !== 'published') notFound();

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-gray-500">{event.format ?? event.topic ?? 'Event'}</p>
        <h1 className="text-4xl font-semibold mt-1">{event.title}</h1>
        <p className="text-gray-700 mt-2">
          {formatInTz(event.start_time, event.timezone)} → {formatInTz(event.end_time, event.timezone)} ({event.timezone})
        </p>
        {event.location && <p className="text-gray-700 mt-1">📍 {event.location}</p>}
      </header>
      {event.description && (
        <section><h2 className="text-lg font-medium mb-2">About</h2>
          <p className="whitespace-pre-wrap text-gray-800">{event.description}</p>
        </section>
      )}
      {event.agenda && (
        <section><h2 className="text-lg font-medium mb-2">Agenda</h2>
          <p className="whitespace-pre-wrap text-gray-800">{event.agenda}</p>
        </section>
      )}
      <footer className="pt-6 text-sm text-gray-500">Registration opens here in phase 2.</footer>
    </main>
  );
}
```

**Step 4:** Commit.

```bash
git add app/events/\[id\]/edit "app/(public)/events/[id]/page.tsx"
git commit -m "feat(phase-1): staff event view + publish + public info page (status-gated)"
```

---

## Task 17: End-to-end smoke test

**Files:** none — manual.

**Step 1:** Restart dev server.

```bash
pnpm dev
```

**Step 2:** Walk the full flow:

1. Open `http://localhost:3000/login` → enter your seeded manager email → submit.
2. Open the magic link from your inbox → land on `/dashboard`.
3. Click **New event** → fill the form with:
   - Title: `Test Workshop`
   - Format: `Workshop`
   - Start: `2026-06-15T09:00:00.000Z` (in the form's text input)
   - End: `2026-06-15T10:30:00.000Z`
   - Timezone: (defaults to your browser TZ)
   - Description: any text
   - Click **Create event**.
4. Should land on `/events/<uuid>/edit` showing the event with status **draft**.
5. Try `http://localhost:3000/events/<uuid>` in an incognito window — should 404 (it's still draft).
6. Back in the staff window, click **Publish**.
7. Refresh the incognito window — should now render the public info page with title, time, description.
8. Sign out from the dashboard.

If all steps pass, phase 1 is functionally complete.

**Step 3:** Run the full test suite.

```bash
pnpm test
# Expected: all suites green (auth, tz, eventInputSchema).
```

**Step 4:** Type-check + build.

```bash
pnpm tsc --noEmit
pnpm build
# Expected: both succeed with no errors.
```

**Step 5:** Final phase-1 commit (if anything needs touching from the smoke test).

```bash
git status
# If anything changed, commit with: "fix(phase-1): smoke-test corrections"
```

---

## Done with Phase 1

**What works:**
- Magic-link login, only for emails listed in `staff`.
- Staff can create draft events.
- Staff can publish events.
- Published events render at a public, SSR-only `/events/:id` URL.
- RLS enforces all access (drafts invisible to public, organizers see only their own).

**What's intentionally missing (deferred):**
- Registration (phase 2)
- Emails of any kind (phase 7)
- QR codes (phases 3 + 4)
- Check-in (phase 4)
- Survey (phase 5)
- Analytics (phase 6)
- Deploy (phase 8)
- pg_cron (phase 9)

**Next step:** open a new plan for phase 2 (`docs/plans/2026-05-13-eventar-phase-2-registration.md`) when ready. Don't start phase 2 until phase 1 smoke test fully passes.
