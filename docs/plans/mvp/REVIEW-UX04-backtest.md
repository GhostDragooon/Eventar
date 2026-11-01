# REVIEW-UX04-backtest — per-event Registrations page (UX-04, partial)

Run 2026-11-01 against the LOCAL stack only (psql :54322, app on :3100, GoTrue :54321). No source edited, nothing staged. [X] = executed, [R] = read only.

Method: two fixture organisations (A, B), five disposable auth users (A admin who created the event, B admin of the other org, A `organiser_member` who is not the creator, A `auditor`, one attendee), one published event owned by A with 3 registrations. Real session cookies minted with `@supabase/ssr` `signInWithPassword` (the review-mode bypass only borrows ONE identity, `eventar_staff` "manager_email", because `demo-staff@local.test` does not exist locally; so cross-org needed real sessions). Server Actions invoked with `Next-Action` ids from `.next/dev/server/server-reference-manifest.json`.

## Results by claim

### 1. Page lists the 3 people, counts match DB — PASS [X]
- GET `/events/<id>/registrations` as A: HTTP 200. Heading "Registrations" with the event title beneath; rows: Alice (attended), Bob (cancelled), Carol (account-linked, registered), each with name and email.
- Status counts rendered: All (3), Registered (1), Attended (1), Cancelled (1). DB: 1 registered, 1 attended, 1 cancelled. Match.
- Review-mode unauthenticated request (borrowed `eventar_staff`): 200, rows present.
- Check-in page now carries a "Registrations →" link [X] (seen in the check-in flight payload).

### 2. Cross-org isolation — PASS [X]
- B (organiser_admin of another org) GET `/events/<id>/registrations`: HTTP 200 but the body is the streamed redirect (`NEXT_REDIRECT;replace;/events/<id>/details;307` + `meta refresh` to `/details`). Zero occurrences of any registrant name or email and of the event title in the HTML. (The 200-not-302 is the known loading.tsx streaming behaviour, see memory `eventar-streamed-redirect-notfound-oracle`; not a leak.)
- B via PostgREST with its own JWT: `registrations?event_id=eq.<A's event>` returns `[]` (RLS). B calling `update_registration_contact` on A's registration: SQLSTATE `42501` "is not in your organisation". Via the action: "You do not have access to this registration."
- B calling set/remove role on A's registration through the action: refused, `not_owner` text.
- Same-org `organiser_member` and `auditor` both reach the page (200 with rows). That is the stated design (org-scoped read).

### 3. Role chips — DB path works; two gaps
- A set chair/presenter on Carol: `registration_roles` rows written with `assigned_by` set; audit `registration_role_set` x2. Idempotent re-set: ok, no duplicate row, no second audit row. Remove chair: row gone, audit `registration_role_removed`. [X]
- Auditor: action message "This account can't make this change. Ask an organiser admin."; direct RPC SQLSTATE `42501` `require_active_staff: caller is not active staff in {organiser_admin,organiser_member,eventar_staff}`. Same for `body_admin`. [X]
- Page for the auditor renders read-only badges, not buttons (code path `!canEdit`) [R].
- Attended lock is UI only [X]: with Alice already `attended`, A called `setRegistrationRole(chair)` and `removeRegistrationRole(chair)` through the action; both returned `{ok:true}` and the row was written and removed. Neither `set_registration_role` nor `remove_registration_role` reads `registrations.status`. The rendered page does lock it for attended rows (`disabled`, `aria-label "... (locked: already attended)"`, title text) [X], so the lock only holds for a fresh page. A tab opened before check-in, or a direct action call, bypasses it.
- Cancelled registration accepts roles [X]: Bob (cancelled) got `presenter` through the action; the page also renders live, enabled chips on cancelled rows [X].

### 4. updateRegistrationContact — PASS with one inconsistency [X]
- A edits Alice (unlinked, attended): name and email changed (email lower-cased by the action), `registration_code` unchanged (`BTAA22`), status and check-in unchanged.
- No-op edit: `{ok:true}`, no audit row written.
- Audit rows: `{"fields": ["full_name","email"]}`, `{"fields": ["full_name"]}` only. A full-row text search of `audit_events` for the new/old emails, names ("Alice") and the attendee email found 0 rows. No raw email/name in the audit chain. Server log text not captured (dev server not started by this run); code logs only `registrationId` and `code` [R].
- Linked Carol: email change refused with "This registration belongs to an Eventar account, so its email cannot be changed here. The name can."; name-only change on Carol succeeded and audited `["full_name"]`.
- Duplicate email within the event: "Another registration for this event already uses that email." (23505 path). Bad email: "That is not an email address." (Zod).
- Auditor / body_admin: action "You do not have access to this registration."; RPC SQLSTATE `42501` `require_active_staff: ...` (exact text above). Direct PostgREST PATCH of `registrations` by the auditor: HTTP 403, `42501 permission denied for table registrations` (DB-05 grant revoke holds).
- Inconsistency (finding M1): `organiser_member` (same org, not the event's creator) edited Bob's name successfully, but the same member is refused role chips (below).

### 5. Check-in page — PASS [X]
- GET `/events/<id>/checkin` as A: 200, before and after roles existed on the event. Neither `page.tsx` nor `RosterClient.tsx` references `registration_roles` [R, grep returned nothing].
- `markAttended` round trip over HTTP: `BTAA22` manual -> `status=attended`, `check_in_at` set, method `manual`; second call "Already attended." with the original timestamp; cancelled code refused with the re-register message; `BTAA44` by `qr` returned `{ok:true,...,credit:{anyIssued:false}}` (event has no accrediting body). `credit_ledger` count unchanged (755). Check-in page shows the renamed attendees.

## Findings

### MAJOR
- **M1. The Registrations page offers role chips to people whose role action always fails.** `page.tsx` gates by organisation (`canManageEvent`) and `canEditRegistrations(role)`, so every `organiser_admin`/`organiser_member` of the org gets enabled chips and Edit. `set_registration_role` / `remove_registration_role` require `event.created_by = actor.id` (or `eventar_staff`) and raise `42501 not_owner`. Executed: member of org A (not creator) and admin B were refused ("Only the person who created this event, or Eventar staff, can make this change.") while the same member's contact edit succeeded (`update_registration_contact` is org-scoped). The failure surfaces as one page-level banner at the top (`roleError`), not at the chip, with no rollback needed but no hint why. Either the role RPCs move to org scope (migration, Ivan's call) or `canEdit` for chips must also check `event.created_by`. The `page.tsx` comment says "owner-only" and the gate is org-wide.

### MINOR
- **m1. "Chip locks once attended" is UI-only.** DB and both actions accept role set/remove on an attended registration (executed). A stale tab or direct action call defeats it, leaving a role row that the already-posted credit does not reflect. If the lock is a product rule, enforce it in `set/remove_registration_role` (and keep the UI). If it is only a convenience, say so in the tooltip rather than implying a rule.
- **m2. Cancelled registrations get active role chips, and the DB accepts roles on them** (executed). A chair/presenter on a cancelled registration is meaningless to speaker/credit logic; either lock the chips for `cancelled` or reject in the RPC.

### NIT
- n1. `app/events/[id]/registrations/page.tsx` header comment says "owner-only, others are sent to /details"; the code is organisation-scoped (`canManageEvent`).
- n2. Role-change errors render in a single banner above the whole list; with a long roster the message can be off-screen from the chip pressed (read of `RegistrationsClient.tsx`, not measured).

Counts: BLOCKER 0, MAJOR 1, MINOR 2, NIT 2.

## Fixtures and cleanup
- Created: orgs A and B, 4 staff rows, 5 auth users, 1 published event (window moved to include now so check-in is open), 3 registrations, 3 role rows (created during the run), 2 `participation_evidence` rows and 2 `registration_checkins` rows (written by the check-in round trip).
- `participation_evidence` is the hash-chained evidence ledger. The two fixture rows were the tail of fixture org A's own chain (no later row, no `previous_evidence_id` or `prev_hash` reference to them), so they were deleted as superuser inside a transaction to unblock the FK; the first teardown attempt rolled back at that FK and was redone. A future backtest that checks someone in must expect this.
- Not removable (append-only): 13 `audit_events` rows tied to the fixtures (attendee_checked_in x2, role set/removed, contact updates, and creation-side rows).
- Before / after:

| table | before | after |
|---|---|---|
| events | 440 | 440 |
| registrations | 887 | 887 |
| registration_roles | 1 | 1 |
| organisations | 25 | 25 |
| staff | 251 | 251 |
| credit_ledger | 755 | 755 |
| auth users `ux04bt-*` | 0 | 0 |
| audit_events | 43044 | 43057 (+13, append-only residue) |

Scratch cookies, tokens and password file were deleted from the scratchpad.
