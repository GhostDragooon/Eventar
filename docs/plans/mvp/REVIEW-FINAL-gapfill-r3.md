# MVP walk r3: gap-fill lens (G1, G2)

Date 2026-11-14. Server :3100 (review mode off), local stack. Built-in browser pane only. No screenshots taken: every step is "not on disk"; evidence is page text (`get_page_text`/`read_page`) and psql read-backs.

| Row | Verdict | Evidence |
|---|---|---|
| G1 cold-start from `/login`, no `next`, to wizard Done | PASS [X] with a detour (see F1) | Fresh user `zz-walk-gap1@example.test` typed on `/login`; **Enter worked** (Mailpit message to that address at 13:59:42, `auth.users` row created and confirmed in the same second). The Next button was not clicked, so its behaviour is untested here. Magic link landed on `http://localhost:3100/login?error=not_organiser&next=%2Fdashboard`, not the wizard. "Go to my account" led to `/account/record`, then `/account/complete`. Consent ticked, Identity (ZZWalk Gapone, +852 5555 0101), Professional (Medicine / General Medicine / Medical Officer / ZZ Walk Hospital / Medicine), Licence skipped, **Done** landed on `http://localhost:3100/account/registrations` (expected URL). Read-back: `consent_records` has `terms_of_service tos-0.1-draft` and `privacy_policy pp-0.2-draft`, both `withdrawn_at` null; `public.users.full_name = 'ZZWalk Gapone'`. |
| G2 member Enter-code check-in, then duplicate | PASS [X: creator only] | M = `organiser_member`, default org, created published `ZZ-WALK gap2 checkin` (start now-20m, end now+3h, `event_occurrences` moved too). Code `ZWK7M2` (format per `lib/registrationCode.ts`: 6 chars from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, optional `WK-`; the earlier 8-char code failed that regex). Enter-code dialog accepted it (auto-submits at 6 chars; Enter harmless): on-screen "Checked in / ZZ Walk Attendee is checked in." and "Marked ZZ Walk Attendee attended (ZZ-WALK gap2 checkin)." DB: `registrations.status = attended`, `check_in_method = manual`, `check_in_at 2026-11-14 14:03:10+00`, `user_id` null; `registration_checkins` count 1. Same code again: "Already attended at 14 Nov 2026, 22:03." (14:03 UTC = 22:03 HKT, correct); count still 1. Re-click of the stale roster row's "Check in →": same message, count still 1. Non-creator member path not walked. |

Tags: sign-in, wizard, check-in, duplicate, DB read-backs are [X]. Persona naming for G2: Mailpit `To` verified as `zz-walk-gap2@example.test`, and the desk opened for the creator; the staff shell shows no account name, so "signed in as M" is [I]. In G1 the page itself said "You're signed in as zz-walk-gap1@example.test" [X]. Profession, specialty and position selects were set with `form_input` (setup of a precondition only; the rows under test are the landing and the consent rows).

## Findings

### MAJOR (predates this phase, recorded once, parked per brief)
- **M1 consent copy names documents with no pages.** Wizard step 1: "By continuing you agree to the terms and privacy policy we will publish before launch." and checkbox "I agree to the Eventar terms and privacy policy once published." The copy now says "once published", so the dead end is disclosed, but the user still accepts text they cannot open. Rows written: `tos-0.1-draft`, `pp-0.2-draft`.

### MINOR
- **F1 practitioner who enters through the organiser door sees an error-styled page after a valid link.** URL `/login?error=not_organiser&next=%2Fdashboard`, heading "Organiser log in", text: "You're signed in as zz-walk-gap1@example.test. Organiser log in is for organiser emails only. Attending events? Your account is below. Invited as an organiser? Open the invite link your admin sent you." Buttons "Sign out and use another email" and "Go to my account". Recovery exists, so not a dead end. The sentence "Your account is below" is true only after the "Go to my account" click. The door's own copy before send reads "Check your inbox (...) for a log-in link." for any address, and it created a confirmed `auth.users` row for a non-staff email (by design per the `sendMagicLink` comment, noted for S4 review).
- **F2 check-in desk roster does not update after a successful Enter-code check-in.** After "ZZ Walk Attendee is checked in." and Done, the page still showed "0 / 1 checked in", tabs "Checked in (0)" / "Pending (1)", and the row "Check in →" with status "—", for the whole session (about 3 minutes, including after the duplicate attempt). After a manual reload: "1 / 1 checked in", row "✓ 14 Nov 2026, 22:03 Manual". [R] `RosterClient` holds `useState(initialRoster)` and updates only from a Supabase Realtime `postgres_changes` subscription; `revalidatePath` in `actions.ts:216` does not resync that state. No Realtime event arrived in this run; whether Realtime is off on the local stack or broken for a member is unverified [I]. Data is safe (the stale button returned "Already attended", count 1), but a desk operator sees a wrong total.

### NIT
- Enter-code check-ins are stored and shown as method "Manual" (`check_in_method = manual`).
- Enter-code dialog copy "It checks them in as soon as it's complete — no need to press anything." is accurate; Enter was harmless.

## Walk notes
- `file://` pages render as static snapshots in this pane (no scripts), so the magic link was delivered through a one-shot redirect server on 127.0.0.1:8765 reading a 0600 scratch file. The link was never printed. The server exited after one request and the scratch files are deleted.
- Cookies: `sb-127-auth-token` cleared before G1, between personas, and at the end.

## Cleanup (ids)
- auth users: G1 `a6e146af-3e1e-427d-814c-069640cee143`, M `ca4fe6ee-ebf5-40bc-9e07-11113b4e67d2` (admin API, both 200 on first try).
- staff `3672db70-97fc-4826-854f-b45d6e218b0e`; event `05a55637-2439-4d79-a51f-541ca17af69b`; occurrence `75b748d2-3d7a-4491-9e76-b49efaa2a164`; registration `382f2f59-d0da-4dfa-8070-f1fc0de31754`; registration_checkins `d50ffac8-761a-4fcb-8ea2-463350cd0f27`; 1 `participation_evidence` row for that event.
- Leftover counts (stderr visible): events 0, staff 0, auth 0, registrations 0, occurrences 0, checkins 0, evidence 0; `consent_records` orphans 0; `professional_profiles` orphans 0; my ids in `public.users` 0. `public.users` without an auth row: 240, none mine (pre-existing).
- Expected residue: `audit_events` rows (consent grants, sign-ins, check-in).
