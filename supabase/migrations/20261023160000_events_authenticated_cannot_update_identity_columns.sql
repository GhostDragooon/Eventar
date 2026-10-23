-- SEC-02 (2026-10-23): `authenticated` loses UPDATE on events.id, created_by, created_at, updated_at and
-- deleted_at.
--
-- Found by the UPD-01 backtest [X]: with the column grants below, and events_org_member_update admitting any
-- active staff member of the event's organisation, a colleague PATCHed `created_by` of a PUBLISHED event to
-- their own staff id (HTTP 204, row changed, no audit row). That defeats the creator rule (accreditation and
-- roster roles are creator-only, Ivan's ruling 2) and falsifies who made an event.
--
-- Nothing needs it: update_event_with_blocks never sets these columns, created_by is written at INSERT only
-- (INSERT keeps its grant), a soft delete goes through a definer function, and updated_at is assigned by the
-- events_touch_updated_at trigger (a trigger's assignment is not a column privilege). `id` can be rewritten by
-- an UPDATE today, which breaks every foreign key reference that cascades.
--
-- Pattern from 20260725144446 and the seed: a column-level REVOKE alone is a no-op while a table-level grant
-- stands, so revoke the table level (which also clears every column grant) and grant the column list back
-- WITHOUT the five. status, organisation_id, published_at, accrediting_body_id and cpd_hours stay definer-only
-- as before. service_role is untouched.
--
-- Not done here (DB-04 owns it, spec amended 2026-10-23): the draft-only rule below the Server Action, which
-- needs a BEFORE UPDATE trigger on events and a write guard on agenda_blocks.
--
-- Operations. No table lock. `supabase db push` runs this in one transaction; the self-check raises, and the
-- push rolls back, if a locked column is still writable or an ordinary one is not. Idempotent.
-- Rollback: grant update (id, created_by, created_at, updated_at, deleted_at) on public.events to authenticated;

revoke update on public.events from anon, authenticated;
grant update (
  title, topic, start_time, end_time, timezone, description, poster_path,
  max_attendees, venue_name, venue_address, city, region, country, latitude, longitude,
  registration_close_at, hosted_by, organized_by, hero_image_url, category,
  format, checkin_modes, registration_open_at
) on public.events to authenticated;

do $$
declare
  c text;
begin
  foreach c in array array['id', 'created_by', 'created_at', 'updated_at', 'deleted_at', 'status', 'organisation_id', 'published_at', 'accrediting_body_id', 'cpd_hours'] loop
    if has_column_privilege('authenticated', 'public.events', c, 'UPDATE') then
      raise exception 'SEC-02: authenticated can still UPDATE events.%', c;
    end if;
  end loop;
  foreach c in array array['title', 'start_time', 'end_time', 'max_attendees', 'registration_close_at', 'hero_image_url', 'checkin_modes'] loop
    if not has_column_privilege('authenticated', 'public.events', c, 'UPDATE') then
      raise exception 'SEC-02: authenticated lost UPDATE on events.% (the edit flow writes it)', c;
    end if;
  end loop;
end $$;
