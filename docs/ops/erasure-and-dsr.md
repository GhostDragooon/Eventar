# Erasure and data subject requests: interim runbook

**Status: interim, written 2026-10-10 from the behaviour of migration `20261010000725`.** No screen in the app calls any of this; there is no DSR console yet (see the 2026-10-10 DSR-review rows in `docs/DEFERRED.md`). Terms are in `CONTEXT.md` ("People's data and their requests"). The reasoning is in the vault Decisions Log, Q42.

## Who can do what

| Who | Read requests | Move a request (`transition_dsr`) | Erase a person (`pseudonymise_user`) |
|---|---|---|---|
| Platform operator (`eventar_staff`, active) | all | any, to any status | any |
| Organiser admin (`organiser_admin`, active) | only people with a **linked registration** at their own organisation's events | the same people. On an **erasure** request: `in_progress` and `escalated` only, not `completed` or `rejected` | **no** |
| Organiser member, body admin, auditor, suspended or removed staff | none | no | no |
| The data subject | their own | no | no. They can file their own request (type and notes only) |

Nobody except `service_role` and the database owner writes the `data_subject_requests` table directly. `transition_dsr` is the only audited way a request changes. Its audit event records who did it, their role and organisation, the request id and the new status. It does **not** record the notes, the previous status or the person's id.

## What "erasure" does today. Read this before telling anyone "done"

`pseudonymise_user` renames **one profile field**: `users.full_name` becomes `ERASED-<hex>`, and `pseudonymised_at` and `deleted_at` are stamped. A `204` means only that.

It does **not** touch: the person's sign-in (auth email, sessions: they can still log in), first, last and preferred name, phone, avatar, professional profile, appointments, licences, society memberships, consent records, the name and email on their registrations, or the credit ledger. The person can also clear the two flags themselves (`users_self_update`), and nothing in the app reads them. Their name still flows into every organisation's college export, as `ERASED-…`.

So: do not mark an erasure request `completed` on the strength of the call, and do not tell the person their data is erased. Tell them what was and was not done.

## Platform operator: handling a request

1. Verify the requester's identity yourself; the API does not.
2. **Recording an emailed request.** Nobody but `service_role` can file a request on someone's behalf (staff lost that on 2026-10-10). As the database owner, `insert into public.data_subject_requests (subject_user_id, request_type, request_notes) values (...)`; every other column takes its default. There is no screen for a person to file one themselves yet, so in practice this is how a request gets recorded.
3. **Moving it.** `POST /rest/v1/rpc/transition_dsr` with `{"p_id": "<request id>", "p_status": "in_progress", "p_notes": "<what you checked>"}`, authenticated as **yourself** (your own access token) so the audit event carries your user id. The Supabase SQL editor runs as the database owner with no login, and both functions refuse it. Notes **overwrite** the previous notes at every step, so write the whole story each time. **The person can read the notes and your staff id** on their own request.
4. **Erasure only.** `POST /rest/v1/rpc/pseudonymise_user` with `{"p_user_id": "<user id>", "p_reason": "<reason>"}`. Do not put personal data in the reason: the audit log is permanent and cannot be edited. Once migration `20261010083221` is applied, only the platform operator can read it through the API (Decisions Log Q43). It is local-only until Ivan pushes it; until then, on Seoul, every organisation's admins can read it.
5. The rest of an erasure (the list above) has **no tested procedure yet**. Do not improvise on production data: deleting the auth user cascades into other tables, and the credit ledger and licences can block it. Escalate to Ivan.
6. **Closing it.** `transition_dsr` with `completed` (or `rejected`) and notes saying **what was done and what was not**. Re-opening a closed request leaves the old `resolved_at` behind; there is no state machine yet.

## Organiser admin: someone asks you to erase or export their data

- You cannot erase anyone, and you cannot complete or reject an erasure request. **Hand it on:** set the request to `escalated` with a note saying what was asked. The platform operator sees it, and so does the person.
- You can read and move a request only if the person has a **linked registration** at one of your organisation's events, i.e. they registered while signed in, or they pressed "Claim past events" for it. If the API answers "not permitted", the person is probably a guest, or was registered by an organiser or an import: ask them to sign in and claim the registration, or send the request to the platform operator by email. Do not work around it by matching on email: unverified email is exactly how an organisation could otherwise reach people it has no relationship with.
- A cancelled registration, and a registration at a deleted event, still count as a link.
- If another organisation is also linked to the same person, it sees and can move the same request, and each of you overwrites the other's notes.
- You cannot file a request for someone. Refused attempts are not logged.
- Once migration `20261010083221` is applied you cannot read a person's profile, consent or appointments, or the audit log, through the API (Decisions Log Q43). Identify the person from your own registrations (name and email are there), and ask a guest to claim their registration.
