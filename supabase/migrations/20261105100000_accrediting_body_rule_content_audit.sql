-- Rule-content history for accrediting bodies (2026-11-05, Ivan).
--
-- Why: a body's rule content (category_taxonomy, which carries role_mappings,
-- and cycle_config, which carries prior_approval and cycle shape) is plain
-- jsonb edited in place. credit_ledger rows snapshot the award VALUES, but
-- nothing recorded which rule content produced them, and there is no pack
-- hash (2026-08-21 decision: hash at export time only). After an edit, an
-- older award could not be traced to the rules in force when it posted, and
-- that is exactly what an audit or dispute will ask for. The spine-first
-- strategy (docs/plans/2026-11-05-spine-first-strategy.md) adds rule content
-- per partner, so these edits are about to become routine.
--
-- What: an AFTER INSERT / UPDATE trigger on accrediting_bodies writes one
-- audit_events row whenever rule content is created or changes. The payload
-- holds the full old and new content and a sha256 hash of each, so the
-- content in force at any time can be rebuilt from the hash chain, and an
-- award can be matched to rules by its posting time. A baseline row per
-- existing body anchors that history at today's content.
--
-- Covers every writer: migrations, the admin client, raw SQL. The trigger,
-- not a definer function, is the layer where the write happens.
--
-- Not a versioned evaluator. That stays Stage 13 (Q26, doctrine D.1). This
-- makes rule history provable; it does not version the rules themselves.
-- ponytail: history is reconstructed from audit_events by time; add a pack id
-- on credit_ledger only when Stage 13 versions body_rules.
--
-- "Audit insert last": the audit row is written inside the statement that
-- changes the body, so a later statement in the same transaction runs while
-- the chain lock is held. Accepted: body rule edits are rare migration or
-- admin operations, never on a request path.
--
-- Limits (dev review 2026-11-05):
-- * service_role holds EXECUTE on public.write_audit_event, so a server-side
--   caller could still write a fake rule-content row (anon/authenticated
--   cannot). To check a body, recompute app_private.body_rule_content_hash()
--   on its live content and compare it to the newest row's new_hash.
-- * DELETE is not audited. A body referenced by credit_ledger cannot be
--   deleted (FK), so no award loses its rules this way.
--
-- Rollback: drop trigger accrediting_bodies_rule_content_audit on
-- public.accrediting_bodies; drop function app_private.audit_body_rule_content();
-- drop function app_private.body_rule_content_hash(jsonb, jsonb);
-- All three objects are new here; there is no earlier definition to restore.
-- Baseline audit rows stay (audit_events is append-only by design).

create or replace function app_private.body_rule_content_hash(
  p_category_taxonomy jsonb,
  p_cycle_config jsonb
) returns text
language sql
immutable
set search_path = ''
as $$
  -- jsonb::text is canonical (keys sorted, whitespace normalised), so equal
  -- content always hashes equal.
  select encode(
    sha256(convert_to(
      jsonb_build_object(
        'category_taxonomy', p_category_taxonomy,
        'cycle_config', p_cycle_config
      )::text, 'UTF8')),
    'hex');
$$;

create or replace function app_private.audit_body_rule_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  -- A trigger WHEN clause cannot name OLD on INSERT, so the no-op filter
  -- lives here: an UPDATE that sets the columns to the same value is no change.
  if tg_op = 'UPDATE'
     and old.category_taxonomy is not distinct from new.category_taxonomy
     and old.cycle_config is not distinct from new.cycle_config then
    return null;
  end if;

  perform public.write_audit_event(
    'body_rule_content_changed',
    nullif(v_claims ->> 'sub', '')::uuid,
    coalesce(v_claims ->> 'role', session_user::text),
    new.organisation_id,
    'accrediting_body',
    new.id,
    jsonb_build_object(
      'short_name', new.short_name,
      'operation', lower(tg_op),
      'old', case when tg_op = 'UPDATE' then jsonb_build_object(
               'category_taxonomy', old.category_taxonomy,
               'cycle_config', old.cycle_config) end,
      'new', jsonb_build_object(
               'category_taxonomy', new.category_taxonomy,
               'cycle_config', new.cycle_config),
      'old_hash', case when tg_op = 'UPDATE' then
               app_private.body_rule_content_hash(old.category_taxonomy, old.cycle_config) end,
      'new_hash', app_private.body_rule_content_hash(new.category_taxonomy, new.cycle_config)
    )
  );
  return null;
end;
$$;

revoke execute on function app_private.audit_body_rule_content()
  from public, anon, authenticated, service_role;
revoke execute on function app_private.body_rule_content_hash(jsonb, jsonb)
  from public, anon, authenticated, service_role;

drop trigger if exists accrediting_bodies_rule_content_audit on public.accrediting_bodies;
create trigger accrediting_bodies_rule_content_audit
  after insert or update of category_taxonomy, cycle_config
  on public.accrediting_bodies
  for each row
  execute function app_private.audit_body_rule_content();

-- Baseline: one row per existing body, so history starts at today's content.
do $$
declare
  b record;
begin
  for b in select * from public.accrediting_bodies order by created_at, id loop
    perform public.write_audit_event(
      'body_rule_content_baseline',
      null,
      session_user::text,
      b.organisation_id,
      'accrediting_body',
      b.id,
      jsonb_build_object(
        'short_name', b.short_name,
        'new', jsonb_build_object(
                 'category_taxonomy', b.category_taxonomy,
                 'cycle_config', b.cycle_config),
        'new_hash', app_private.body_rule_content_hash(b.category_taxonomy, b.cycle_config)
      )
    );
  end loop;
end;
$$;

-- Self-checks: the replay proves privileges and wiring.
do $$
begin
  if has_function_privilege('anon', 'app_private.audit_body_rule_content()', 'EXECUTE')
     or has_function_privilege('authenticated', 'app_private.audit_body_rule_content()', 'EXECUTE')
     or has_function_privilege('service_role', 'app_private.audit_body_rule_content()', 'EXECUTE') then
    raise exception 'audit_body_rule_content is executable by an API role';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'accrediting_bodies_rule_content_audit'
      and tgrelid = 'public.accrediting_bodies'::regclass
  ) then
    raise exception 'accrediting_bodies_rule_content_audit trigger missing';
  end if;
  if (select count(*) from public.audit_events where event_type = 'body_rule_content_baseline')
     < (select count(*) from public.accrediting_bodies) then
    raise exception 'baseline audit rows missing for some bodies';
  end if;
end;
$$;
