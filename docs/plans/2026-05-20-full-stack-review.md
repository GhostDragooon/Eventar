# Full-stack review — 2026-05-20

**Repo state at review start:** 38 commits ahead of `origin/main`. Phase 1.5b complete (accordion form, Nominatim venue search, range-pill time picker). All gates green (tsc + lint + 52/52 tests + next build).

**Scope:** every backend layer (migrations, RLS, RPC, Server Actions, proxy, auth helpers) and every frontend layer (pages, form components, helpers). Skipped: shadcn-vendored `components/ui/*` (third-party).

**Method:** read every file, cross-check type contracts across the form → Zod → RPC → DB chain, look for silent failures (CLAUDE.md rule 12), check 3-layer validation alignment (rule 8), audit security boundaries.

---

## Findings

Severity scale: 🔴 Critical (silent failure or data integrity), 🟠 Important (UX confusion or audit failure), 🟡 Nice-to-have.

### 🔴 Critical (all 4 fixed)

| ID | Issue | Fix |
|---|---|---|
| C1 | [app/events/[id]/edit/actions.ts:publishEvent](../../app/events/[id]/edit/actions.ts) ignored RLS denials. `.update().eq()` returns 0 affected rows when an organizer tries to publish another organizer's event, but the action returned success and revalidated. Pure silent failure. | Commit [1270aa1](https://github.com/GhostDragooon/Eventar/commit/1270aa1): chain `.select('id').maybeSingle()` and throw when `data` is null. |
| C2 | [app/page.tsx](../../app/page.tsx) was the `create-next-app` boilerplate. Embarrassing root, surfaced during smoke. | Commit [7670f2c](https://github.com/GhostDragooon/Eventar/commit/7670f2c): `redirect('/dashboard')`; proxy bounces unauth. |
| C3 | [app/layout.tsx](../../app/layout.tsx) `metadata.title` was `'Create Next App'`. Browser tab. | Commit [7670f2c](https://github.com/GhostDragooon/Eventar/commit/7670f2c). |
| C4 | [proxy.ts](../../proxy.ts) `signOut()` wrote clear-cookies to `res`, but returned `NextResponse.redirect(...)` — a different response object. Same bug class as the [/auth/callback fix in 3e5a004](https://github.com/GhostDragooon/Eventar/commit/3e5a004). Browser stayed signed in; next visit triggered infinite redirect loop. | Commit [1270aa1](https://github.com/GhostDragooon/Eventar/commit/1270aa1): `redirectWithCookies()` helper copies `res.cookies` onto the redirect. |

### 🟠 Important (3 fixed, 4 deferred)

| ID | Issue | Action |
|---|---|---|
| I1 | DateTimeSection gave zero hint that times are interpreted in *user's* local tz, not the venue's. HK staff creating a Tokyo event "at 9am" gets a 1h offset on display. | **Fixed** in [780551a](https://github.com/GhostDragooon/Eventar/commit/780551a): hint text under the time picker. |
| I2 | [login/actions.sendMagicLink](../../app/login/actions.ts) masked Supabase errors with a generic message. Couldn't diagnose rate-limit / config failures. | **Fixed** in [780551a](https://github.com/GhostDragooon/Eventar/commit/780551a): `console.error` server-side; user message stays generic. |
| I7 | [AgendaSection.parallelIds](../../components/event-form/AgendaSection.tsx) computed `${date}T${time}` keys even when `date` was empty, producing surprising lexicographic comparisons. | **Fixed** in [780551a](https://github.com/GhostDragooon/Eventar/commit/780551a): guard `if (!date) return new Set()`. |
| I3 | [supabaseServer](../../lib/supabase/server.ts) try/catch swallows *all* cookie-set errors, not just the documented Server-Component-readonly case. | **Deferred** — current behaviour is defensive and the auth-critical paths (callback, proxy) use direct response.cookies.set, so this only affects best-effort cookie refresh from Server Components. Worth revisiting if we ever see stale auth state. |
| I4 | publishEvent revalidates `/events/[id]/edit` and `/dashboard` but missed `/events/[id]` (public). | **Partially fixed** in [1270aa1](https://github.com/GhostDragooon/Eventar/commit/1270aa1): now revalidates `/events/[id]` too. Public page also has `export const dynamic = 'force-dynamic'` so it always re-fetches anyway. |
| I5 | AgendaSection allows end < start in block HH:MM inputs; Zod rejects at submit. | **Deferred** — Zod catches at submit, error shown in sticky bar. Client-side per-block validation is a nice-to-have, not blocking. |
| I6 | Dashboard's events list doesn't show `created_by` for managers. Manager can't tell whose event is whose. | **Deferred** — affects only managers viewing multiple organizers' events. Post-MVP polish. |
| I8 | FillerEditor has no visual distinction between break and transition (only the placeholder text differs). | **Deferred** — minor UX. |

### 🟡 Nice-to-have (none applied this session)

- N1: `searchVenues()` fetch path has no tests (mocked-fetch integration could add 2–3 cases).
- N2: Edit page selects `event.topic` but doesn't render it. Public page does. Inconsistency.
- N5: `agendaValid` always returns true. For published events, should we require ≥1 agenda block? Product call.
- N7: `lib/nominatim.ts` `searchVenues` could log fetch errors for telemetry.
- N8: `lib/supabase/admin.ts` is currently imported nowhere. Future hook for service-role seeding. Acceptable.
- N9: Date input could default to "today" rather than empty.
- N10: Sticky bottom bar's positioning interaction with very tall content not visually verified.

---

## What was NOT a finding

Worth recording so the next reviewer doesn't re-investigate these false alarms:

- **Three-layer validation alignment:** form `required` attrs + Zod refines + DB check constraints all align cleanly. Verified field-by-field: title/start_time/end_time/venue/lat/lng/max_attendees all validated at each layer.
- **`security invoker` on `create_event_with_blocks`:** RLS applies during the RPC; the organizer-insert policy requires `created_by = current_staff_id()` which the RPC sets via the helper. `requireStaff()` in the Server Action is defense-in-depth.
- **Block envelope check:** Server Action does `blockFitsEnvelope` per block. RPC doesn't re-check this — acceptable gap since RPC is only callable via the Server Action which has already validated, and RLS forces `created_by` ownership. A direct RPC call by an organizer bypassing the Server Action could insert blocks outside the envelope, but they could only do it to their own events.
- **Cookie handling in `/auth/callback`:** the previously-shipped fix is correct. Verified by reading [auth/callback/route.ts](../../app/auth/callback/route.ts).
- **`publishEvent` ownership check via RLS:** the organizer-update policy already restricts to `created_by = current_staff_id()`. C1 is a *silent-failure* fix, not an ownership fix.
- **Email lowercase consistency:** staff table has a trigger; proxy lowercases; requireStaff lowercases. ✅ Triple-aligned.

---

## Cross-checks (the boring-but-load-bearing audits)

### Type contract: form → Zod → RPC → DB

| Field | Form (page.tsx) | Zod (actions.ts) | RPC arg | DB column |
|---|---|---|---|---|
| `title` | `basics.title: string` | `z.string().trim().min(1).max(200)` | `event_input->>'title'` | `text not null` |
| `topic` | `basics.topic || undefined` | `.optional().default('')` | `event_input->>'topic'` | `text` (nullable) |
| `description` | `basics.description` | `.optional().default('')` | `event_input->>'description'` | `text` |
| `start_time` | UTC-ISO from `new Date(...)` | `z.string().datetime()` | `(event_input->>'start_time')::timestamptz` | `timestamptz not null` |
| `end_time` | UTC-ISO | `z.string().datetime()` + `refine end > start` | `(event_input->>'end_time')::timestamptz` | `check (end_time > start_time)` |
| `timezone` | (server-derived from coords) | not in Zod (server adds via `tzFromCoords`) | `event_input->>'timezone'` | `text not null` |
| `venue_*`, `city`, `region`, `country` | from selected Venue | `min(1)` on required, `.optional()` on region/address | `event_input->>'…'` | `text` (NOT NULL on name/city/country) |
| `latitude` / `longitude` | `Venue` numbers | `z.coerce.number().min(-90).max(90)` / `±180` | `(…)::double precision` | `double precision not null` |
| `max_attendees` | `basics.capacity \|\| undefined` | `z.coerce.number().int().positive().optional()` | `nullif(…, '')::int` | `int` with `> 0` check |
| `status` | (server defaults 'draft') | not in Zod | `coalesce(…,'draft')` | `text check (status in (...))` |
| `created_by` | (server fills via RPC) | not in Zod | `current_staff_id()` | `uuid not null references staff(id)` |

All aligned. No type drift.

### Validation 3-layer alignment

| Constraint | Layer 1 (form) | Layer 2 (Zod) | Layer 3 (DB) |
|---|---|---|---|
| Title non-empty | `required` attr | `.min(1)` | `not null` |
| End > start | derived in helper; `dateTimeValid` blocks submit | `.refine end > start` | `check (end_time > start_time)` |
| Lat / lng in range | (Nominatim guarantees) | `min(-90).max(90)` / `±180` | (no DB constraint — relies on Zod) |
| Kind enum | hardcoded in form | `z.enum(KINDS)` | `check (kind in (…))` |
| Status enum | (server only) | (server only) | `check (status in (…))` |
| Block end > start | (none — submit catches) | `.refine end > start` | `check (end_time > start_time)` |

**Gap:** lat/lng range is only enforced at Zod. DB has no `check (latitude between -90 and 90)`. Low risk since Nominatim returns valid coords, but worth noting as a defense-in-depth gap if we ever accept manual lat/lng entry.

### Timezone handling end-to-end

1. **Form:** user picks `date: YYYY-MM-DD`, `startHour: 9`, `endHour: 17` in their browser locale.
2. **Submit:** `new Date(\`${date}T09:00:00\`)` — interpreted as 9am in the *browser's* local tz. `.toISOString()` converts to UTC.
3. **Server Action:** computes `timezone = tzFromCoords(lat, lng)` — the *venue's* IANA tz.
4. **DB:** stores `start_time: timestamptz` (UTC) + `timezone: text` (venue's tz).
5. **Render:** `formatInTz(start_time, timezone)` formats the UTC moment in the venue's tz.

**Footgun (documented in I1):** if browser tz ≠ venue tz, the user's "9am" is stored as the UTC equivalent of 9am-in-their-tz, not 9am-in-venue-tz. Display shows the venue-tz equivalent (which is *not* 9am if tzs differ). User-facing hint added in I1. Acceptable trade-off documented in Phase 1.5b design doc.

### Security boundaries

- **Service-role key:** only in [lib/supabase/admin.ts](../../lib/supabase/admin.ts) (with `import 'server-only'`). Not imported anywhere currently. ✅
- **Anon key:** in [lib/supabase/server.ts](../../lib/supabase/server.ts), [lib/supabase/browser.ts](../../lib/supabase/browser.ts), [proxy.ts](../../proxy.ts), [auth/callback/route.ts](../../app/auth/callback/route.ts). All client-instantiated with RLS active. ✅
- **`server-only` import:** present in `lib/auth.ts` and `lib/supabase/admin.ts`. Missing from `lib/supabase/server.ts` — but that helper uses `next/headers` (server-only by definition) so it would fail to import in a client component anyway. ✅
- **Email enumeration:** `sendMagicLink` returns generic error regardless of whether the email exists in `staff`. ✅
- **RLS:** every domain table (staff, events, agenda_blocks) has RLS enabled. Anon reads only published events + their published-event agenda blocks. Organizers CRUD only their own events. Managers read-only-all (no write policies — they have to act through `service_role` for writes, which is intentional). ✅
- **PII in logs:** `[sendMagicLink] supabase error` logs name/status/code but not the email. ✅
- **Cookies via `NextResponse.redirect`:** all known instances now use the pattern that copies cookies onto the manual redirect (commits 3e5a004 and 1270aa1).

No security gaps found.

---

## Recommended follow-up (not done this session)

1. **Tests for `searchVenues()` fetch path** — mock `fetch`, verify URL params, error handling. ~30 min.
2. **Per-block client-side validation** (I5) — show inline red when end ≤ start instead of waiting for submit. ~20 min.
3. **Manager dashboard `created_by` column** (I6) — small column addition, JOIN with `staff` table for the display name. ~30 min.
4. **Lat/lng DB check constraint** — add `check (latitude between -90 and 90 and longitude between -180 and 180)` as a defense-in-depth migration. ~10 min.
5. **Edit page should render `event.topic`** (N2) — 2-line addition.

None of these block the MVP. The MVP gap analysis is in [docs/plans/2026-05-20-mvp-gap.md](2026-05-20-mvp-gap.md) (written next).
