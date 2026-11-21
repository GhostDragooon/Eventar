{"prompt":"AskUserQuestion answers","answers":{"Who may change a registrant's role chips (Chair/Presenter)? ...":"Admin all, member own","Should body_admin and auditor be able to create and edit events? Today they can: ... RLS on events and agenda_blocks checks the organisation, not the role, so an auditor can edit any event's details and agenda in its org.":"Both read-only (Recommended)"}}

agenda_blocks_org_member_full|ALL|{authenticated}|(EXISTS ( SELECT 1 FROM events e WHERE ((e.id = agenda_blocks.event_id) AND (e.organisation_id = app_private.current_staff_org_id())))) 
events_org_member_insert|INSERT|{authenticated}| | (organisation_id = app_private.current_staff_org_id())
events_org_member_update|UPDATE|{authenticated}|(organisation_id = app_private.current_staff_org_id()) | (organisation_id = app_private.current_staff_org_id())

set_registration_role
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'organiser_member', 'eventar_staff');
  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then