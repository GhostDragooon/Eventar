-- Task 10.4 data half (Step 3b in the 2026-08-26 dispatch brief).
-- Sourced HKCP pack, supersedes 20260820090000's unsourced placeholder.
--
-- Provenance: three URLs supplied by Ivan 2026-08-26. Both PDFs were fetched
-- this session (2026-08-26) via WebFetch and then decoded via the Read tool
-- (WebFetch alone returns the compressed byte stream). The landing page
-- confirms the two PDFs are the current in-force documents and the 2026-2028
-- cycle is active. NOTHING in this migration was recalled from training data
-- — every numeric value below traces to a fetched-this-session document, and
-- every claim carries its own source_refs entry.
--
--   HKCP Principles & Guidelines 2026-2028 (Version 1, header stamp
--     "Updated on 27 May 2025", 7 pages) — sections 3, 4, 5.2, 6, 7
--     supply cycle length, hour-to-point rate, per-day/per-conference
--     caps, active/passive minimums and maximums.
--     https://www.hkcp.org/docs/FellowsArea/GUIDELINES%20ON%20CME%20CPD%202026-2028.pdf
--
--   HKCP CME/CPD Operational Guidelines 2026 (dated 27 May 2025, 11 pages)
--     — the point table (categories A/B/C/D/E/F with subcategories A1-A6,
--     B1-B2, C1-C4, D, E1-E2, F1-F9), fixing A as "Formal College
--     Approved Activities" and A3 as "Local or overseas Conference".
--     https://www.hkcp.org/docs/FellowsArea/CME%20Operational%20guidelines%202026-2028.pdf
--
--   HKCP CME landing page — currency/version confirmation only, NEVER
--     used as a value source. Landing page description says "updated
--     in Jan 2026"; the PDFs themselves stamp "Updated on 27 May 2025
--     Version 1". Both statements have been captured verbatim; do not
--     silently pick one.
--     https://www.hkcp.org/hkcp/fellows/cme.html
--
-- SUPERSESSION MODEL — this migration OVERWRITES the placeholder pack from
-- 20260820090000. The row structure is unchanged (still one row per
-- (organisation_id, short_name = 'HKCP')); category_taxonomy jsonb is
-- replaced wholesale rather than merged, because the sourced object
-- explicitly does not carry the older `_note`/`_seed` keys and merging
-- would confuse "what's in the current sourced pack" with "what stale
-- keys did an earlier pack write". `pack_version_seq: 1` marks this as
-- the FIRST sourced pack (the placeholder is version 0 by omission).
--
-- ROLE MAPPING CHOICE — attendee/chair/presenter all map to category 'A'.
-- This matches the shipped placeholder shape (all roles → 'A') by design,
-- for THREE separate reasons:
--   1. HKCP's own Operational Guidelines table places both chairing/
--      presenting (Active) AND passive attendance (Passive) inside the
--      same A category (see A1/A2/A3 rows: "Category: Active (Chairman
--      & Speaker) OR Passive"). The role-differentiated subtreatment
--      (2 pts/session chairman vs 1 pt/hour passive) lives in the point
--      TABLE, not in role→category mapping.
--   2. The role_award_rule enforcement shipped in
--      20260826000000_role_award_rule_enforcement.sql fails closed when
--      more than one category is satisfied for one body. Mapping roles
--      to genuinely different categories today (e.g. attendee → 'A3',
--      chair → 'A3-active') would still resolve to a single satisfied
--      category per configured group, but any future body with a
--      role-splitting mapping and multiple category-coded groups would
--      hit the enforcement — that's fine, since fail-closed is the
--      right posture, but it deserves its own dispatch to design.
--   3. The shipped index `event_accreditation_groups_event_body_uniq`
--      (20260821020000) prevents multiple groups per (event, body)
--      anyway, so multi-role differentiation is not a live threat.
-- The full A/B/C/D/E/F structure is captured in `categories` and
-- `cycle_config.fcaa_attendance` so a future dispatch (post-priority
-- publication + potential index widening) can differentiate without
-- re-fetching the source.
--
-- WHAT IS NOT SOURCED, NAMED HERE RATHER THAN FILLED:
--   * `retention_years` — HKCP's public docs do not name a retention
--     window; the accrediting_bodies.retention_years column stays as
--     whatever 20260813000000_seed_hkam_colleges_and_mchk.sql set it to
--     (this migration does not touch that column).
--   * `source_hash` — spec-review §5 names this field; deferred per
--     brief §5 ("computing a stable document-slice hash requires a
--     canonicalisation choice that belongs to A3/D.1, not this
--     dispatch"). Field is OMITTED entirely, not written as null or "".
--   * per-body priority for `role_award_rule: 'highest_only'` — none is
--     published by HKCP in the fetched documents. Not invented (brief
--     §4 boundary: priority-publish is ADR-0003 territory). The
--     enforcement will fail closed if a >1-satisfied case ever arises;
--     the current single-role mapping makes it unreachable in normal use.

-- ---------------------------------------------------------------------------
-- Replace HKCP's category_taxonomy with the sourced pack. Keep MCHK's own
-- placeholder untouched (that body's real pack is separate work).
-- ---------------------------------------------------------------------------

update public.accrediting_bodies
   set category_taxonomy = $sourced$
{
  "provisional": true,
  "pack_version_seq": 1,
  "primitive_catalogue_version": 0,
  "effective_from": "2026-01-01",
  "cycle_label": "2026-2028",
  "role_mappings": {
    "attendee":  "A",
    "chair":     "A",
    "presenter": "A"
  },
  "role_award_rule": "highest_only",
  "categories": [
    { "code": "A", "name": "Formal College Approved Activities (FCAA)", "active_or_passive": "both" },
    { "code": "B", "name": "Self-study",                                "active_or_passive": "active" },
    { "code": "C", "name": "Publications",                              "active_or_passive": "active" },
    { "code": "D", "name": "Quality Assurance report",                  "active_or_passive": "active" },
    { "code": "E", "name": "Question setting / Examiner",               "active_or_passive": "active" },
    { "code": "F", "name": "Exclusions",                                "active_or_passive": "none" }
  ],
  "subcategories": [
    { "code": "A1", "parent": "A", "name": "FCAA organised by hospitals: Grand Round, Journal Club in Internal Medicine or its subspecialties" },
    { "code": "A2", "parent": "A", "name": "FCAA organised by professional societies/associations" },
    { "code": "A3", "parent": "A", "name": "Local or overseas Conference (in-person or virtual)" },
    { "code": "A4", "parent": "A", "name": "Certificate course" },
    { "code": "A5", "parent": "A", "name": "Viewing of recorded lectures or seminars or workshops locally or overseas online or from DVD" },
    { "code": "A6", "parent": "A", "name": "Participation in other non-medical/non-clinical professional development activities" }
  ],
  "cycle_config": {
    "cycle_length_years": 3,
    "total_points_required_per_cycle": 90,
    "min_annual_points": 10,
    "min_active_per_cycle": 30,
    "max_active_per_cycle": 60,
    "min_passive_per_cycle": 30,
    "max_passive_per_cycle": 60,
    "units": "points",
    "fcaa_attendance": {
      "passive_points_per_hour": 1,
      "passive_max_per_day": 8,
      "passive_max_per_conference": 35,
      "active_speaker_max_per_presentation": 2,
      "active_chairman_max_per_session": 2
    }
  },
  "source_refs": [
    {
      "source_url": "https://www.hkcp.org/docs/FellowsArea/GUIDELINES%20ON%20CME%20CPD%202026-2028.pdf",
      "fetched_at": "2026-08-26T08:00:00Z",
      "source_quote": "A Cycle of CME/CPD assessment shall span three years.",
      "source_document_version": "Version 1 · Updated on 27 May 2025",
      "source_support": "COMPLETE",
      "ambiguity": "NONE",
      "covers": ["cycle_config.cycle_length_years"]
    },
    {
      "source_url": "https://www.hkcp.org/docs/FellowsArea/GUIDELINES%20ON%20CME%20CPD%202026-2028.pdf",
      "fetched_at": "2026-08-26T08:00:00Z",
      "source_quote": "The minimum CME/CPD requirement is 90 Points in each three-year Cycle.",
      "source_document_version": "Version 1 · Updated on 27 May 2025",
      "source_support": "COMPLETE",
      "ambiguity": "NONE",
      "covers": ["cycle_config.total_points_required_per_cycle"]
    },
    {
      "source_url": "https://www.hkcp.org/docs/FellowsArea/GUIDELINES%20ON%20CME%20CPD%202026-2028.pdf",
      "fetched_at": "2026-08-26T08:00:00Z",
      "source_quote": "The minimum annual CME/CPD requirement is 10 Points regardless of the proportion of active and passive categories.",
      "source_document_version": "Version 1 · Updated on 27 May 2025",
      "source_support": "COMPLETE",
      "ambiguity": "NONE",
      "covers": ["cycle_config.min_annual_points"]
    },
    {
      "source_url": "https://www.hkcp.org/docs/FellowsArea/GUIDELINES%20ON%20CME%20CPD%202026-2028.pdf",
      "fetched_at": "2026-08-26T08:00:00Z",
      "source_quote": "Every Fellow should attain a minimum of 30 active CME/CPD Points per 3-year cycle.",
      "source_document_version": "Version 1 · Updated on 27 May 2025",
      "source_support": "COMPLETE",
      "ambiguity": "NONE",
      "covers": ["cycle_config.min_active_per_cycle"]
    },
    {
      "source_url": "https://www.hkcp.org/docs/FellowsArea/GUIDELINES%20ON%20CME%20CPD%202026-2028.pdf",
      "fetched_at": "2026-08-26T08:00:00Z",
      "source_quote": "Active Participation may be accredited a maximum of 60 Points per 3-year Cycle.",
      "source_document_version": "Version 1 · Updated on 27 May 2025",
      "source_support": "COMPLETE",
      "ambiguity": "NONE",
      "covers": ["cycle_config.max_active_per_cycle"]
    },
    {
      "source_url": "https://www.hkcp.org/docs/FellowsArea/GUIDELINES%20ON%20CME%20CPD%202026-2028.pdf",
      "fetched_at": "2026-08-26T08:00:00Z",
      "source_quote": "Every Fellow should attain a minimum of 30 passive CME/CPD Points per 3-year cycle.",
      "source_document_version": "Version 1 · Updated on 27 May 2025",
      "source_support": "COMPLETE",
      "ambiguity": "NONE",
      "covers": ["cycle_config.min_passive_per_cycle"]
    },
    {
      "source_url": "https://www.hkcp.org/docs/FellowsArea/GUIDELINES%20ON%20CME%20CPD%202026-2028.pdf",
      "fetched_at": "2026-08-26T08:00:00Z",
      "source_quote": "Passive Participation as defined above may be accredited a maximum of 60 Points per 3-year cycle.",
      "source_document_version": "Version 1 · Updated on 27 May 2025",
      "source_support": "COMPLETE",
      "ambiguity": "NONE",
      "covers": ["cycle_config.max_passive_per_cycle"]
    },
    {
      "source_url": "https://www.hkcp.org/docs/FellowsArea/GUIDELINES%20ON%20CME%20CPD%202026-2028.pdf",
      "fetched_at": "2026-08-26T08:00:00Z",
      "source_quote": "One CME/CPD Point is awarded for each hour of audience participation in a FCAA, up to a maximum of eight CME/CPD Points per day, and a maximum of 35 CME/CPD Points per conference/meeting.",
      "source_document_version": "Version 1 · Updated on 27 May 2025",
      "source_support": "COMPLETE",
      "ambiguity": "NONE",
      "covers": [
        "cycle_config.fcaa_attendance.passive_points_per_hour",
        "cycle_config.fcaa_attendance.passive_max_per_day",
        "cycle_config.fcaa_attendance.passive_max_per_conference"
      ]
    },
    {
      "source_url": "https://www.hkcp.org/docs/FellowsArea/GUIDELINES%20ON%20CME%20CPD%202026-2028.pdf",
      "fetched_at": "2026-08-26T08:00:00Z",
      "source_quote": "Active participation as speaker may be awarded a maximum of two CME/CPD Points per presentation. Active participation as Chairman may be awarded a maximum of two CME/CPD Points per session.",
      "source_document_version": "Version 1 · Updated on 27 May 2025",
      "source_support": "COMPLETE",
      "ambiguity": "NONE",
      "covers": [
        "cycle_config.fcaa_attendance.active_speaker_max_per_presentation",
        "cycle_config.fcaa_attendance.active_chairman_max_per_session"
      ]
    },
    {
      "source_url": "https://www.hkcp.org/docs/FellowsArea/CME%20Operational%20guidelines%202026-2028.pdf",
      "fetched_at": "2026-08-26T08:00:00Z",
      "source_quote": "A · Formal College Approved Activities (FCAA); A1 FCAA organised by hospitals: Grand Round, Journal Club in Internal Medicine or its subspecialties; A2 FCAA organised by professional societies/associations; A3 Local or overseas Conference (in-person or virtual); A4 Certificate course; A5 Viewing of recorded lectures or seminars or workshops; A6 non-medical/non-clinical professional development",
      "source_document_version": "27 May 2025 · CME/CPD Operational guidelines 2026",
      "source_support": "COMPLETE",
      "ambiguity": "NONE",
      "covers": [
        "categories",
        "subcategories",
        "role_mappings.attendee",
        "role_mappings.chair",
        "role_mappings.presenter"
      ]
    },
    {
      "source_url": "https://www.hkcp.org/docs/FellowsArea/CME%20Operational%20guidelines%202026-2028.pdf",
      "fetched_at": "2026-08-26T08:00:00Z",
      "source_quote": "A Fellow may not claim both active and passive CME/CPD Points for the same session in which he/she is a Chairman.",
      "source_document_version": "27 May 2025 · CME/CPD Operational guidelines 2026",
      "source_support": "COMPLETE",
      "ambiguity": "NONE",
      "covers": ["role_award_rule"]
    },
    {
      "source_url": "https://www.hkcp.org/hkcp/fellows/cme.html",
      "fetched_at": "2026-08-26T08:00:00Z",
      "source_quote": "Principles & Guidelines 2026-2028 (updated in Jan 2026); Operational Guidelines 2026-2028 (updated in Jan 2026). Both documents were updated in January 2026 and apply to the 2026-2028 cycle.",
      "source_document_version": "landing page as fetched 2026-08-26",
      "source_support": "PARTIAL",
      "ambiguity": "VERSION_CONFLICT",
      "covers": ["effective_from", "cycle_label"],
      "_note": "The landing page says 'updated in Jan 2026'; the PDFs themselves stamp 'Updated on 27 May 2025 Version 1'. Both statements captured verbatim rather than silently picked. effective_from uses the cycle start (2026-01-01) — the earliest date under which the 2026-2028 rules apply to a Fellow's activity — because a domain-time key needs to reflect when the pack's CONTENT becomes valid, not when the document was published (see docs/doctrine.md bitemporal separation)."
    }
  ]
}
$sourced$::jsonb
 where short_name = 'HKCP'
   and status = 'active';

-- ---------------------------------------------------------------------------
-- Self-verifying assertions.
-- Structural: the sourced pack landed with the right shape, and every
-- non-null numeric under cycle_config plus every role in role_mappings is
-- named in at least one source_refs entry's `covers` list (brief §5 A1
-- gate — a jsonb-path presence check, not a data comparison).
-- ---------------------------------------------------------------------------
do $$
declare
  v_tax jsonb;
  v_covers text[];
  v_unref text[] := array[]::text[];
  v_check_path text;
  v_role text;
begin
  select category_taxonomy into v_tax
    from public.accrediting_bodies where short_name = 'HKCP' and status = 'active';

  if v_tax is null then
    raise exception 'seed_hkcp_sourced_pack: HKCP body not present as active — nothing to seed';
  end if;

  -- 1. Structural — the sourced pack replaced the placeholder cleanly.
  if v_tax -> 'provisional' is distinct from 'true'::jsonb then
    raise exception 'seed_hkcp_sourced_pack: provisional flag missing or not true';
  end if;
  if v_tax ->> 'pack_version_seq' is distinct from '1' then
    raise exception 'seed_hkcp_sourced_pack: pack_version_seq expected 1, got %', v_tax ->> 'pack_version_seq';
  end if;
  if v_tax ->> 'primitive_catalogue_version' is distinct from '0' then
    raise exception 'seed_hkcp_sourced_pack: primitive_catalogue_version expected 0, got %', v_tax ->> 'primitive_catalogue_version';
  end if;
  if v_tax ->> 'effective_from' is distinct from '2026-01-01' then
    raise exception 'seed_hkcp_sourced_pack: effective_from expected 2026-01-01, got %', v_tax ->> 'effective_from';
  end if;

  -- 2. The prior placeholder keys (_note, _seed) are GONE — this is a
  -- supersession, not a merge. If a keys shows up here the update was
  -- accidentally a merge, which would leave stale text alongside the new pack.
  if v_tax ? '_seed' then
    raise exception 'seed_hkcp_sourced_pack: prior _seed key still present — write was a merge, not a supersession';
  end if;

  -- 3. Role mapping unchanged from placeholder shape (single-satisfied,
  -- brief §5 constraint) — attendee/chair/presenter all map to 'A'.
  if v_tax #>> array['role_mappings','attendee'] is distinct from 'A' then
    raise exception 'seed_hkcp_sourced_pack: role_mappings.attendee expected A';
  end if;
  if v_tax #>> array['role_mappings','chair'] is distinct from 'A' then
    raise exception 'seed_hkcp_sourced_pack: role_mappings.chair expected A';
  end if;
  if v_tax #>> array['role_mappings','presenter'] is distinct from 'A' then
    raise exception 'seed_hkcp_sourced_pack: role_mappings.presenter expected A';
  end if;

  -- 4. source_refs is a jsonb array of at least one entry.
  if jsonb_typeof(v_tax -> 'source_refs') is distinct from 'array' then
    raise exception 'seed_hkcp_sourced_pack: source_refs missing or not an array';
  end if;
  if jsonb_array_length(v_tax -> 'source_refs') < 1 then
    raise exception 'seed_hkcp_sourced_pack: source_refs is empty';
  end if;

  -- 5. Coverage — collect the union of every source_refs[].covers[] entry,
  -- then verify each seeded numeric cycle_config path and each role is
  -- present. A raise here means a fact was seeded without a citation, or a
  -- citation names a path that no longer exists. Brief §5 A1 gate.
  select array_agg(distinct c) into v_covers
    from jsonb_array_elements(v_tax -> 'source_refs') sr,
         jsonb_array_elements_text(sr -> 'covers') c;
  if v_covers is null then
    v_covers := array[]::text[];
  end if;

  foreach v_check_path in array array[
    'cycle_config.cycle_length_years',
    'cycle_config.total_points_required_per_cycle',
    'cycle_config.min_annual_points',
    'cycle_config.min_active_per_cycle',
    'cycle_config.max_active_per_cycle',
    'cycle_config.min_passive_per_cycle',
    'cycle_config.max_passive_per_cycle',
    'cycle_config.fcaa_attendance.passive_points_per_hour',
    'cycle_config.fcaa_attendance.passive_max_per_day',
    'cycle_config.fcaa_attendance.passive_max_per_conference',
    'cycle_config.fcaa_attendance.active_speaker_max_per_presentation',
    'cycle_config.fcaa_attendance.active_chairman_max_per_session'
  ]
  loop
    if not (v_check_path = any(v_covers)) then
      v_unref := array_append(v_unref, v_check_path);
    end if;
  end loop;

  foreach v_role in array array['attendee','chair','presenter']
  loop
    if not (('role_mappings.' || v_role) = any(v_covers)) then
      v_unref := array_append(v_unref, 'role_mappings.' || v_role);
    end if;
  end loop;

  if cardinality(v_unref) > 0 then
    raise exception 'seed_hkcp_sourced_pack: seeded jsonb paths NOT covered by any source_refs entry: %', array_to_string(v_unref, ', ');
  end if;

  raise notice 'seed_hkcp_sourced_pack self-check: all assertions passed (% source_refs entries covering % paths)',
    jsonb_array_length(v_tax -> 'source_refs'),
    cardinality(v_covers);
end $$;

-- Rollback:
--   update public.accrediting_bodies
--      set category_taxonomy = '{"_note": "provisional — per-College rule pack lands in Task 4 (docs/adr/0001)",
--                                "_seed": "20260820090000 provisional — full pack is Task 10.4",
--                                "role_mappings": {"attendee": "A", "chair": "A", "presenter": "A"},
--                                "role_award_rule": "highest_only"}'::jsonb
--    where short_name = 'HKCP';
--   -- This restores the 20260820090000 placeholder shape. Note that the pre-
--   -- 20260820090000 shape (`{"_note": "..."}` alone) is even earlier and this
--   -- rollback deliberately does NOT restore it — rolling back this migration
--   -- reverts to the merged-in placeholder, not the empty state.
