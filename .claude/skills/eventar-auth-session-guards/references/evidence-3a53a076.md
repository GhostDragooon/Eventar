An UPDATE is checked against the event it leaves AND the event it lands on (a row moved onto your own event from a colleague's must not pass), INSERT against NEW, DELETE against OLD.

-   "member:move_speaker_row": "42501",
+   "member:move_speaker_row": "ok",

A staff account is also a practitioner account (one auth.users row). Its own claim of its own registration (claim_registrations_for_user: user_id null -> itself, profile_snapshot filled, nothing else) is not an organiser action, so the organiser rule does not apply to it.