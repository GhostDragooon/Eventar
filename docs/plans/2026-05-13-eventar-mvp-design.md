# Eventar — MVP Design

**Date:** 2026-05-13
**Status:** Approved — implementation can begin (phase 1)
**Source spec:** `PRD: Internal Workshop Manager (MVP)`

---

## 1. Overview

Eventar is an internal workshop manager. It replaces manual attendance sheets and fragmented tools with one end-to-end workflow:

```
registration → confirmation email → reminder email (with personal QR)
            → on-site check-in (QR scan or manual) → post-event survey email
```

Three emails per attendee. Email is the single source of truth — no attendee accounts, no passwords, no device pairing.

Three roles:

| Role | Capabilities |
|---|---|
| **Organizer** | Create + manage own events, generate QRs, view live roster, mark check-in, view per-event analytics |
| **Manager** | Read access across all events, aggregate analytics |
| **Attendee** | Register via public form, receive 3 emails, show personal QR at door, submit survey |

Target scale: up to 200 attendees per event. MVP timeline: 4–8 weeks.

---

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| Frontend + API | **Next.js (App Router) + TypeScript + Tailwind** | PRD-locked; one codebase for SSR public pages + authed staff pages + API routes |
| Database + Auth + Storage + Realtime + Cron | **Supabase** | One vendor for Postgres (with RLS), Auth (magic link now, MS SSO later), Storage (posters), Realtime (live check-in roster), and pg_cron (Email #2 and #3 timing) |
| Transactional email | **Resend** + **React Email** templates | Clean Next.js DX, generous free tier, React-component templates |
| QR generation (server) | `qrcode` (npm) | PRD-named; canonical |
| QR scanning (browser) | `html5-qrcode` | Built-in camera picker + torch + file-upload fallback — useful for dim rooms / tablet check-in |
| Deployment | **Vercel** | Default for Next.js App Router; free tier handles MVP load |

---

## 3. Architecture

```
                  ┌─────────────────────────────────────────┐
                  │            Vercel (Next.js App)         │
                  │                                         │
   Attendee ────► │  Public pages: /events/:id /register/:id│
                  │                /checkin/confirm         │
                  │                /survey/:id              │
   Organizer ───► │  Authed pages: /dashboard, /events/*    │
                  │                                         │
                  │  API routes:                            │
                  │   /api/registrations  (public POST)     │
                  │   /api/survey         (public POST)     │
                  │   /api/cron/send-reminders   ◄──┐       │
                  │   /api/cron/send-surveys     ◄──┤       │
                  └────────┬────────────────────────┼───────┘
                           │ supabase-js            │ HTTPS+secret
                           ▼                        │
                  ┌─────────────────────┐           │
                  │  Supabase           │           │
                  │  ─────────          │           │
                  │  • Postgres + RLS   │           │
                  │  • Auth (magic link)│           │
                  │  • Realtime channel │           │
                  │  • Storage (posters)│           │
                  │  • pg_cron ─────────┼───────────┘
                  │  • Vault (secrets)  │
                  └─────────┬───────────┘
                            │ Resend API (from Next.js)
                            ▼
                  ┌─────────────────────┐
                  │  Resend             │ ───► Attendee inboxes
                  │  + React Email tpls │     (Emails #1, #2, #3)
                  └─────────────────────┘
```

### Invariants

1. **Only the Next.js app calls Resend.** pg_cron's only job is to ping a Next.js route over HTTPS with a bearer secret. Email logic lives in one language/runtime.
2. **Idempotent email sends** via an `email_log` table with `unique(kind, registration_id)`. Cron re-runs are safe.
3. **Staff identity keyed by email** (not `auth.users.id`). MS-SSO migration later is a config flip; no user-record migration.
4. **Public pages SSR-only** (no client-side Supabase). Anon key never exposed in registration HTML.
5. **All public writes go through `/api/*` routes** with the service-role key server-side. RLS still enabled as defense in depth.
6. **Order of operations in email sending: insert `email_log` row FIRST, send via Resend SECOND.** A crash mid-flight means "no email" rather than "duplicate email."

---

## 4. Repo Structure

```
Eventar/
├─ app/                          # Next.js App Router
│  ├─ (public)/
│  │  ├─ events/[id]/page.tsx        # Info page (SSR)
│  │  ├─ register/[id]/page.tsx      # Registration form
│  │  ├─ checkin/confirm/page.tsx    # Personal QR landing
│  │  └─ survey/[id]/page.tsx        # Post-event survey
│  ├─ (staff)/                       # Auth-required (middleware-gated)
│  │  ├─ dashboard/page.tsx
│  │  ├─ events/new/page.tsx
│  │  ├─ events/[id]/edit/page.tsx
│  │  ├─ events/[id]/page.tsx
│  │  └─ events/[id]/checkin/page.tsx  # Tablet check-in
│  ├─ api/
│  │  ├─ registrations/route.ts        # Public POST
│  │  ├─ survey/route.ts               # Public POST
│  │  └─ cron/
│  │     ├─ send-reminders/route.ts
│  │     └─ send-surveys/route.ts
│  ├─ auth/callback/route.ts
│  └─ login/page.tsx
├─ components/                   # Shared UI (Tailwind)
├─ emails/                       # React Email templates
│  ├─ confirmation.tsx
│  ├─ reminder-with-qr.tsx
│  └─ survey-invite.tsx
├─ lib/
│  ├─ supabase/                  # Server + browser clients
│  ├─ auth.ts                    # requireStaff() — load-bearing helper
│  ├─ resend.ts
│  ├─ qr.ts                      # qrcode wrapper
│  ├─ codes.ts                   # registration_code generator (WK-9X7P)
│  └─ tz.ts                      # Timezone helpers
├─ supabase/
│  ├─ migrations/                # SQL migrations (one per phase)
│  └─ seed.sql                   # First manager email
├─ docs/plans/                   # Design + phase plans
└─ tests/                        # Vitest + Playwright
```

### Conventions

- **Staff mutations: Next.js Server Actions.** No parallel `/api/events` POST routes.
- **Public mutations: `/api/*` routes** (called from anon contexts without RSC).
- **One migration per phase**, applied via `supabase db push`.
- **Single branch (`main`)**, atomic commits per logical unit.

---

## 5. Data Model

### Tables

```sql
-- Who can log in, and what role.
-- Keyed on email so MS-SSO migration is painless.
create table staff (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  full_name  text,
  role       text not null check (role in ('organizer','manager')),
  created_at timestamptz not null default now()
);

create table events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  topic         text,
  format        text,                            -- workshop | seminar | roundtable | ...
  start_time    timestamptz not null,
  end_time      timestamptz not null,
  timezone      text not null,                   -- IANA, e.g. 'Europe/Berlin'
  location      text,
  speakers      jsonb not null default '[]'::jsonb,  -- [{name, role, affiliation}]
  description   text,
  agenda        text,
  poster_path   text,                            -- supabase-storage path
  max_attendees int,
  status        text not null default 'draft'
                check (status in ('draft','published','completed','cancelled')),
  created_by    uuid not null references staff(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index events_status_starttime_idx on events(status, start_time);

create table registrations (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references events(id) on delete cascade,
  name              text not null,
  email             text not null,
  department        text,
  registration_code text unique not null,        -- 'WK-9X7P'
  status            text not null default 'registered'
                    check (status in ('registered','attended','cancelled')),
  check_in_at       timestamptz,
  check_in_method   text check (check_in_method in ('qr','manual') or check_in_method is null),
  created_at        timestamptz not null default now(),
  unique (event_id, lower(email))                -- PRD §4.2 dup-prevent
);
create index registrations_event_id_idx on registrations(event_id);

create table survey_responses (
  id               uuid primary key default gen_random_uuid(),
  registration_id  uuid not null unique references registrations(id) on delete cascade,
  event_id         uuid not null references events(id) on delete cascade,
  speaker_rating   int not null check (speaker_rating between 1 and 5),
  content_rating   int not null check (content_rating between 1 and 5),
  structure_rating int not null check (structure_rating between 1 and 5),
  comments         text,
  submitted_at     timestamptz not null default now()
);

-- Idempotency ledger for cron-driven sends.
create table email_log (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('confirmation','reminder','survey')),
  event_id        uuid not null references events(id) on delete cascade,
  registration_id uuid references registrations(id) on delete cascade,
  resend_id       text,
  sent_at         timestamptz not null default now(),
  unique (kind, registration_id)
);
```

### Additions beyond PRD §5

- **`staff` table** — PRD assumes login but doesn't define how roles attach to users. Required.
- **`email_log` table** — idempotency for cron-driven sends. Required for correctness.
- **`timezone` on `events`** — supports organizers scheduling events in different time zones.
- **`updated_at` + `cancelled` status** — clean handling of event mutations.

### Row-Level Security

RLS enabled on every table. Helper functions:

```sql
create function auth_email() returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email','')
$$;

create function is_manager() returns boolean language sql stable as $$
  select exists(select 1 from staff where email = auth_email() and role = 'manager')
$$;

create function current_staff_id() returns uuid language sql stable as $$
  select id from staff where email = auth_email()
$$;
```

Policy summary:

| Table | Anon | Organizer | Manager |
|---|---|---|---|
| `events` | SELECT where `status = 'published'` | full CRUD where `created_by = current_staff_id()` | SELECT all |
| `registrations` | (none — public POSTs go through `/api/*` with service-role) | SELECT/UPDATE where event belongs to them | SELECT all |
| `survey_responses` | (none — public POST via `/api/*`) | SELECT where event belongs to them | SELECT all |
| `staff` | denied | SELECT own row only | SELECT all |
| `email_log` | denied | SELECT where event belongs to them | SELECT all |

**Public writes do not rely on permissive anon RLS.** They go through `/api/*` Next.js routes that use the service-role key. RLS still on for defense in depth.

---

## 6. Auth + Roles

**Magic link flow:**

```
1. Staff visits /login → types email → submits.
2. supabase.auth.signInWithOtp({ email, emailRedirectTo: /auth/callback })
3. Supabase mails the link. (Phase 7+: SMTP overridden to Resend so all email comes
   from one sender domain — fewer DMARC headaches.)
4. Click → /auth/callback → exchange code for session cookie.
5. Server middleware checks: is this email in `staff`?
     - YES → set session, redirect to /dashboard
     - NO  → sign out + redirect to /login?error=not_authorized
```

**Role enforcement: two layers.**

1. **Middleware** (`middleware.ts`) gates `(staff)/` routes. Joins session → `staff`, attaches `{ id, role, email }` to request headers.
2. **RLS policies** refuse to leak rows even if middleware is bypassed.

**`requireStaff()`** is the load-bearing helper. Every server-side staff action goes through it. Write once with full tests in phase 1, never touch again until MS-SSO lands.

---

## 7. Cron + Email Plumbing

### Email triggers

| Email | Trigger | Mechanism |
|---|---|---|
| #1 Confirmation | Registration submitted | Inline send during POST `/api/registrations`. No cron. |
| #2 Reminder + personal QR | 60 min before `event.start_time` | pg_cron polls every minute → pings `/api/cron/send-reminders` |
| #3 Survey invite | 10 min after `event.end_time`, only to `status = 'attended'` | pg_cron polls every minute → pings `/api/cron/send-surveys` |

### Cron mechanics

Supabase pg_cron with `pg_net.http_post`:

```sql
select cron.schedule('send-reminders', '* * * * *', $$
  select net.http_post(
    url := 'https://eventar.vercel.app/api/cron/send-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || vault.read_secret('cron_secret')),
    timeout_milliseconds := 50000
  );
$$);

select cron.schedule('send-surveys', '* * * * *', $$
  select net.http_post(
    url := 'https://eventar.vercel.app/api/cron/send-surveys',
    headers := jsonb_build_object('Authorization', 'Bearer ' || vault.read_secret('cron_secret')),
    timeout_milliseconds := 50000
  );
$$);
```

### Route skeleton (idempotency pattern)

```ts
// app/api/cron/send-reminders/route.ts
export async function POST(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }
  const supabase = serviceRoleClient();           // bypasses RLS
  const due = await supabase.rpc('registrations_due_reminders');

  for (const r of due) {
    try {
      // 1. Reserve the slot BEFORE sending — unique constraint = idempotent.
      const { data: log, error } = await supabase
        .from('email_log')
        .insert({ kind: 'reminder', event_id: r.event_id, registration_id: r.id })
        .select().single();
      if (error || !log) continue;                 // another worker got it

      // 2. Send.
      const { id: resendId } = await resend.emails.send(reminderEmail(r));

      // 3. Annotate with provider id (best-effort; no rollback if this fails).
      await supabase.from('email_log').update({ resend_id: resendId }).eq('id', log.id);
    } catch (e) {
      console.error('reminder failed', r.id, e);   // skipped permanently — manual recovery if needed
    }
  }
  return Response.json({ processed: due.length });
}
```

**Why insert-before-send.** Reversed order risks duplicates if the process crashes between send and log. The "miss one" failure mode is recoverable (operator can re-send manually); the "send twice" failure mode is visible to the user and undermines trust.

---

## 8. Phased Roadmap

External services (Resend, Vercel, pg_cron) are intentionally deferred. The core flow runs locally first; integrations are layered on once flow is proven.

| # | Phase | Local demo end-state | Real emails? |
|---|---|---|---|
| **1** | Foundation + create event | `localhost:3000` — magic-link login → create draft event → public `/events/:id` renders | No (Supabase's built-in auth mailer for magic links only) |
| **2** | Registration flow | Anon registers → row in DB → "would send confirmation" logged | Stubbed |
| **3** | Publish + static QRs | Publish action → two downloadable QRs (info + register) | — |
| **4** | Check-in (tablet) | QR scan or manual → live roster across browser tabs | — |
| **5** | Survey flow | Mark attended → manually navigate to `/survey/:id?code=...` → submit | Stubbed |
| **6** | Analytics | Per-event + manager dashboards | — |
| — | **End of core flow — entire MVP runs locally with no external service** | | |
| **7** | Add Resend | Replace all stubs with real `resend.emails.send` + React Email templates | Real |
| **8** | Deploy to Vercel | App at a public URL | Real |
| **9** | Add pg_cron | Email #2 (60-min) and Email #3 (10-min) fire automatically | Real, scheduled |
| **10** | (future) MS SSO | Microsoft Identity provider in Supabase Auth | — |

Each phase ends with a single commit on `main` and a manual smoke test.

---

## 9. Out of Scope (per PRD §9)

- Calendar invites (iCal / Outlook)
- Waitlist management
- Certificates / PDF generation
- Speaker database & historical ratings
- Advanced analytics & CSV/Excel exports
- Department-level permissions
- Device pairing / attendee self check-in

---

## 10. Open Questions / Risks

| Item | Status |
|---|---|
| Resend account + verified sender domain | Needed by phase 7 |
| Vercel project + deploy URL | Needed by phase 8 |
| First manager email (for seed.sql) | Needed by phase 1 (or insert manually) |
| Custom branding (logo, colors, email-template chrome) | None defined — defaults to clean Tailwind + Resend templates until provided |
| Production sender domain DMARC/SPF/DKIM | Required before high-volume sending — Resend guides this in dashboard |

---

## 11. Glossary

- **Static QR** — generated per event when published; points to a stable URL like `/events/:id` or `/register/:id`. Never expires.
- **Personal QR** — generated per registration; embeds the `registration_code` (e.g., `WK-9X7P`); URL is `/checkin/confirm?code=WK-9X7P`. Used at check-in.
- **`email_log`** — append-only ledger of sent emails. The unique constraint `(kind, registration_id)` is the idempotency guarantee for cron-driven sends.
- **`requireStaff()`** — load-bearing server helper. Returns `{id, role, email}` for the logged-in user, or throws `401`. Every staff Server Action begins with this call.
