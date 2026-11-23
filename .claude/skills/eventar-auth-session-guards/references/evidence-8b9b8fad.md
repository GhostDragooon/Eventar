**MAJOR-2: eventar_staff cannot tick speakers on another organisation's event, though `canRunDoor` and the card say \"eventar_staff on every event\".**
  - Evidence [X]: eventar_staff of org B on an org A event: speaker INSERT returned `42501`, and the tick UPDATE touched 0 rows.
  - Cause: the `speaker_checkins_org_member_insert` and `_update` RLS policies require `e.organisation_id = current_staff_org_id()`, with no eventar_staff branch.
  - In the app: the desk shows enabled speaker controls, and the action returns 'You do not have access to this event.' or the NOT_FOUND line.
  ...
**MINOR-1: a door role can forge attribution and time on a colleague's speaker rows, and add any speaker name.**
  - Evidence [X]: an organiser_member on the admin's event ran `update speaker_checkins set checked_in_at='2001-01-01', updated_by=<admin's staff id>` → ok. The same member inserted `speaker_name='Junk'` directly → ok.