# REVIEW UX-04 (dev lens)

Date: 2026-11-01. Reviewer: dev-lens agent, read-only. Scope: commit `3fa0314` plus the uncommitted
`components/details/PublishedNextSteps.tsx` (+test) and `app/events/[id]/registrations/noRosterLabel.test.ts`.
Evidence tags: **[X]** verified by execution, **[R]** read only.

## Gates [X]
- `pnpm exec tsc --noEmit`: exit 0.
- `pnpm exec eslint` on every touched file: exit 0, no output.
- `pnpm exec vitest run` on the touched tests (registrations dir, RosterClient, PublishedNextSteps, auth, authDoor,
  emailSendSummary): 8 files, 205 tests passed.
- Not run, by instruction: `next build`, the full vitest suite.

## Auth trace: can another organisation's staff open /events/<id>/registrations? No.
1. Layer 1, `proxy.ts`: matcher has `/events/:id/registrations`; `lib/authDoor.ts` classifies it as organiser. The
   drift-guard test in `lib/authDoor.test.ts` covers it and passes. [X]
2. Layer 2, `app/events/[id]/registrations/page.tsx:20-36`: `requireStaff()` comes first and redirects to `/login`
   on NotAuthorizedError. The event is read with the session client. `canManageEvent` (same `organisation_id`, or
   `eventar_staff`) redirects other orgs to `/details`. That page calls `notFound()` for them (details/page.tsx:153),
   so the redirect cannot loop. The registrations read (line 41) runs only after this gate. [R]
3. Layer 3, RLS, probed in a rolled-back transaction as `authenticated` with JWT claims [X]:
   - An organiser_admin of org `...04b1` on event `4c09d408...` (org `...0001`, 200 registrations) got
     `registrations` 0 and `registration_roles` 0. `events` returned 1 row because published events are public, so
     layer 2 is what redirects them.
   - A same-org body_admin got 200 (the read-only role gets the list, as intended).
   Policies on both tables: `registrations_org_member_select`, `registrations_manager_select_all` and
   `registrations_self_read`, with matching ones on `registration_roles`.
4. Writes: `canEditRegistrations` only decides what to SHOW. `update_registration_contact` and
   `set_registration_role` both call `resolve_actor(..., 'organiser_admin','organiser_member','eventar_staff')` and
   check the org, so body_admin and auditor are refused in the DB. [X: function definitions read from the local DB]

Hard rules: no PII in logs. The only new log line (page.tsx:57) logs the error code only. No service-role import.
Three-layer validation holds on the edit path: form `required`/`maxLength`, Zod in `actions.ts`, then the RPC
checks. [R]

## Findings

### BLOCKER: none

### MAJOR

**M1. A role can be set after the person checked in, and nothing says the credit did not follow.**
- Files: `app/events/[id]/registrations/RegistrationsClient.tsx:207,213`, `app/events/[id]/registrations/page.tsx:43`.
  Backstop missing in DB function `set_registration_role` (and `remove_registration_role`).
- Before UX-04, chips sat on the check-in desk. There, `status` updated live through the
  `postgres_changes` channel (RosterClient.tsx:133-155), so the "attended, chip locked" state followed the door.
  On Registrations, `status` is a server snapshot with no realtime and no refresh. The live
  `set_registration_role` body has no attended or status guard: grepping its definition for
  `attended|status|check_in` matched nothing [X]. The lock is client-only and now runs on stale data.
- Failure scenario: during the live window an organiser opens Registrations at 09:55. Dr A checks in at the door at
  10:02, and `award_attendance_credit` posts attendee credit. At 10:05 the organiser marks Dr A "presenter". The RPC
  succeeds and the chip shows pressed. The record says presenter, the ledger holds attendee credit, and no message
  says so (rule 12). The chip's own `title` copy admits the change "would not change the credit already posted".
- Fix: add the guard where the write happens. In `set_registration_role` / `remove_registration_role`, refuse when
  the registration has `status = 'attended'` (errcode 22023, `attended:` prefix). Translate it in
  `translateCpdRpcError` to "Already attended: the role can no longer change the credit." That needs a `sql` card.
  Interim UI step: on that refusal, `router.refresh()` so the row shows Attended.
  Do not patch only the client: the DB gap predates UX-04, and every caller goes through the RPC.

### MINOR

**m1. The list silently stops at 1,000 rows.** `page.tsx:41-51`; `supabase/config.toml:18` sets `max_rows = 1000` [X: config read].
Neither read uses paging or a count. On an event with over 1,000 registrants, "All (1000)", the filter counts and
search silently leave out the rest. The roles read has the same cap. The comment at line 46 shows large events are
expected. Fix: `select(..., { count: 'exact' })`, then either page with `.range()` or show a banner when
`count > rows.length` (rule 12).

**m2. A signed-out role toggle no longer says so.** `RegistrationsClient.tsx:79-80`. The desk version called
`sessionEnded()` and offered a sign-in link (removed RosterClient code). The new catch always says "Please try
again", which a signed-out user cannot do. Fix: reuse `checkDoorSession`/`sessionEnded`, the same way
RosterClient.tsx:31-40 does, and link `/login?next=/events/<id>/registrations`.

**m3. The reason a chip is locked is not reachable.** `RegistrationsClient.tsx:213-216`. The reason is in `title` on a
`disabled` button, which cannot take focus. Keyboard, touch and screen-reader users get a dimmed chip with no
reason. Fix: when `locked`, render the role as text (as the read-only branch does), plus one visible line
"Attended: roles are locked". Or keep the button and point `aria-describedby` at visible text.

**m4. Copy still sends operators to "the roster" for check-in.** `components/details/PassDeliveryPanel.tsx:49,53`
("check them in from the roster"), `app/events/[id]/edit/page.tsx:446` ("Tablet-friendly roster"). The same commit
relabelled the identical sentence in `lib/emailSendSummary.ts`. These are not controls, so `noRosterLabel.test.ts`
passes, but the name contradicts the split (O6). Fix: "on the Check-in page" and "Tablet-friendly check-in desk".

**m5. Test gaps.**
- No test of the page gate: another org is redirected, and no registration read happens before the gate.
- No test that the check-in page header links to Registrations, or that the details toolbar shows both links.
- `noRosterLabel.test.ts:11,18` scans `.tsx` only and matches only `>Roster<` or `aria-label`. A
  `label: 'Roster'` in a `.ts` nav config, or a `title="Roster"`, would pass.
- Fix: a page test with mocked `requireStaff`/`supabaseServer`, as other page tests do. Widen the guard regex to
  `(title|label)\s*[:=]\s*['"]` and include `.ts`.

### NIT
- n1. `app/events/[id]/registrations/actions.ts:47`: the log tag `[roster]` belongs to DB-05, outside this diff.
  Rename it `[registrations]` for consistency.
- n2. `RegistrationsClient.tsx:126-133`: the search field's only visible label is its placeholder, though
  `aria-label` is set. Fine for SR; a visible label helps WCAG 3.3.2.
- n3. With a search active, saving a name that no longer matches removes the row. Dialog.tsx then restores focus
  to the removed Edit button, so focus falls to `<body>`. Fix: after save, focus the search field or the list.
- n4. Role chips stay enabled on `cancelled` rows (`RegistrationsClient.tsx:207`). Decide whether that is intended.
- n5. `details/page.tsx:633-638`: the toolbar links are `py-sm`, not `min-h-11`. Siblings use the same style, so
  this predates UX-04 (mechanical, flag only).
- n6. `noRosterLabel.test.ts` uses cwd-relative `'app'`/`'components'`, so it breaks if vitest runs from another
  cwd. Use `fileURLToPath(new URL('../../../..', import.meta.url))`.
- n7. `components/shell/StaffShell.tsx:70-74`: no nav row is active on `/events/<id>/registrations` (Events is
  not active either). That matches `/details`, so record it only.

## Checked, no finding
- RosterClient and the check-in page: nothing still reads `roles`. The prop, state, import and query are all gone,
  and tsc is clean [X]. The comment edits are accurate.
- revalidatePath: both role actions revalidate `/checkin` and `/registrations`. `updateRegistrationContact`
  revalidates checkin, details and registrations, using the event id the RPC returns. The role actions use the
  client-supplied `eventId`, which predates UX-04; a wrong id only costs a stale page, never data. [R]
- Stale state: `rows`/`roles` are seeded once from props. Every local write is applied locally after success, and a
  navigation remounts the page, so the only staleness is changes made by other people (M1 is the case that
  matters). The pending Set always clears in `finally`, and functional updates make two concurrent toggles safe. [R]
- Edit dialog: `<label>` wraps each field. The disabled email has `aria-describedby`. Escape and the scrim are
  blocked while saving. A lost reply never says "nothing saved". Dialog.tsx moves focus in, traps Tab and restores
  focus. Filters use `aria-pressed`. Interactive targets are `min-h-11`. [R]
- "Roster" grep over `app/`, `components/` and `lib/`: no control labelled Roster or "Open roster" remains.
  StickyLiveBar reads "Open check-in →", the details toolbar has Registrations and Check-in, and PublishedNextSteps
  links to `/registrations`. Remaining prose: m4. [X: grep]

## Counts
BLOCKER 0 · MAJOR 1 · MINOR 5 · NIT 7
