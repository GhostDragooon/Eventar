# Card: role rights (Q51, Ivan 2026-11-06)

**Ruling (Ivan, 2026-11-06):** organiser_admin acts on every event in its organisation; organiser_member acts only on events it created; body_admin and auditor are read-only (no create, no edit); eventar_staff acts on every event. Block: K1 Identity & Access (5-role model + RLS regime), so it is constitutional: Decisions Log Q51.

## Today (inventory 2026-11-06, live DB + code)

| Write path | Today | After |
|---|---|---|
| create event (`create_event_with_blocks`, INVOKER, no role list; RLS org only) | all 5 roles | admin, member, eventar |
| edit draft + agenda (`update_event_with_blocks`, INVOKER; RLS org only) | all 5 roles, any org event | admin any; member own |
| registration close (`updateRegistrationClose`, direct update, `requireStaff` only) | all 5 roles | admin any; member own |
| publish (`publish_event`) | admin, member, any org event | admin any; member own |
| cancel / delete / restore (`bulk_update_event_status`) | admin, member, any org event | admin any; member own; a batch containing any event the actor cannot change is refused whole, naming those events (Ivan 2026-11-07) |
| contact edit (`update_registration_contact`; action lacks app gate) | admin, member, any org event | admin any; member own |
| check-in (`mark_attended`; eventar_staff not exempt from org check) | admin, member own org | admin any; member own; eventar any |
| walk-in (admin-client insert, then `mark_attended`) | admin, member | same as check-in, checked before the insert |
| speaker check-in (RLS org only) | all 5 via PostgREST | admin any; member own |
| role chips (`set/remove_registration_role`) | creator only (+eventar) | admin any; member own |
| single-body CPD (`set_event_cpd_config`) | admin, any org event | unchanged (admin any) |
| multi-body CPD (6 RPCs) | admin, creator only | admin any |
| hero image bucket (storage policies: any active staff, any object) | all 5, any org's images | same rule as events: objects under `<eventId>/` writable when `can_write_event`; new-event uploads go to `pending/<auth uid>/`, writable only by that user (Ivan 2026-11-07) |
| direct PostgREST insert with spoofed `created_by` | possible within org | refused: `created_by` must be the caller |

## Build

1. **Migration** `2026110612xxxx_role_rights_q51.sql`:
   - `app_private.can_write_event(p_event_id uuid, p_actor_id uuid) returns boolean`, SECURITY DEFINER, pinned `search_path`: true when the actor is active and is eventar_staff, or organiser_admin in the event's org, or organiser_member in the event's org who created it.
   - Every definer RPC above calls it after `resolve_actor` and raises 42501 `not_event_writer`. `mark_attended` gains the eventar_staff exemption. Multi-body RPCs drop the creator check for admins.
   - RLS: events INSERT requires role admin/member/eventar and `created_by = current_staff_id()`; events UPDATE, agenda_blocks ALL, speaker_checkins INSERT/UPDATE use `can_write_event(..., current_staff_id())`.
   - `create_event_with_blocks`: revoke EXECUTE from anon.
   - Storage: hero-image insert/update/delete: first folder an event id → `can_write_event`; first folder `pending` → second folder must be the caller's auth user id and role admin/member/eventar. Upload path in `HeroImageSection.tsx` changes from `pending/` to `pending/<auth uid>/`.
   - Self-asserts at the end; audit insert last where a function already writes one; replay-from-zero and rollback per `eventar-migration-replay-rollback`.
2. **App:** `canWriteEvent(event, staff)` in `lib/auth.ts`, mirroring the SQL helper; called before any read or write in every action above (adds the missing gates on registration close and contact edit). `/events/new` refuses body_admin and auditor with one sentence. Controls a member cannot use on another member's event are shown disabled with the reason (existing pattern), copy: "Only the organiser who created this event, or an organiser admin, can change it."
3. **Tests:** an RLS matrix test (5 roles × own/other event × each path) asserting SQLSTATE 42501 on every refusal and a round trip on every allowed cell; app-helper unit tests; each written to fail on today's code first.
4. **Checks:** full gate chain incl. `test:rls`; dev-lens and user-lens reviews (separate agents); backtest on :3100 as each role.

Estimate: about 4 hours of build and test, then reviews.
