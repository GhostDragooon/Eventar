# Account + Professional Profile — Execution Plan (First Slice)

_Pasted 2026-08-29 by Ivan. Source of truth for the account/profile slice; Stage A schema shipped under this._
_Priority order: **(1) this plan, (2) RAG/B9** — RAG continues in parallel or after Stage A lands._

---

EVENTAR — ACCOUNT + PROFESSIONAL PROFILE
Execution Plan (First Slice)
Date: 2026-08-29
Status: Ready to implement
Scope authority: Scientific Meeting Input Model (attached) + decisions locked 2026-08-29

=======================================================================
0. PURPOSE
=======================================================================

Build the reusable identity layers the platform is missing:

  Layer A — Account profile (login identity + stable contact)
  Layer B — Professional profile (changeable workplace / position / specialty / etc.)
            with licences as child rows (profile → many practitioner_licences)

Enable:

  1. Guest registration and walk-in without blocking attendance
  2. Claim / link registration email → account later
  3. Profile as source of truth for every event after account exists
  4. Registration-time profile snapshot (immutable history)
  5. CPD/CME points held until full account setup is complete

Explicit non-goals for this slice are listed in §11.

=======================================================================
1. LOCKED PRODUCT DECISIONS
=======================================================================

1.1 Identity model — Hybrid (C)
  - Guest may register with email + name (current path remains valid).
  - Account may be created before an event, or after walk-in / guest register.
  - Once email is linked to an account, subsequent events reuse profile data
    unless the user updates the profile.

1.2 Two operational streams
  Regular
    - Self-serve registration (guest or logged-in).
    - Prefer account when present; do not force account to take a seat.
  Walk-in
    - Staff-driven fast path so the person is not delayed at the door.
    - Minimal capture → registration + check-in (and evidence where required).
    - Attendance is recorded immediately.
    - CPD/CME is NOT released until full account setup is complete.

1.3 Profile ownership of licences
  - One professional profile (per user).
  - Multiple licence rows: profile/user → practitioner_licences (existing table).
  - Multi-body membership and credit_ledger.licence_id stay intact.
  - Do NOT collapse licence numbers into a single profile row.

1.4 Snapshot rule
  - When a registration is linked to a user who has a profile, store an
    immutable snapshot of the relevant professional fields at registration
    (or at claim time if the registration was guest and is claimed later —
    see §5.4; claim does not rewrite a snapshot that already exists).
  - Profile updates affect future registrations only.
  - Guest / unlinked registrations may have null snapshot until claim.

1.5 CPD / CME release gate
  - Attendance and evidence may exist without an account.
  - Points are not awarded (or not released) until full account setup
    is complete for that person (definition in §2).
  - Walk-in does not block attendance; it only defers credit release.

1.6 Email
  - Confirmation / reminder templates stay as today (name + event + calendar).
  - No workplace / position / licence content in email in this slice.

1.7 Legacy data
  - Existing registrations: user_id null, snapshot null.
  - Claim later allowed (email match + verified ownership).

1.8 Name fields (structured + canonical)
  - Canonical display name: full_name (required, NOT NULL).
    Used for emails, roster, badges, and any human-facing list so
    existing templates and exports do not break.
  - Structured fields (all optional at schema level, encouraged in UI):
      first_name   text
      last_name    text
      salutation   text   -- controlled list in app layer (Dr, Prof, Mr, Ms, …)
  - On write of first_name / last_name the application MAY refresh
    full_name = trim(first_name || ' ' || last_name) when both are present.
    Never blank an existing full_name.
  - Preferred_name remains available for informal display.

1.9 Phone
  - phone and phone_country_code are optional on the account for this slice.
  - No OTP / SMS verification work in this slice.
  - Still subject to Hard Rule 10 (no PII in logs).

1.10 Out of this slice
  - Organizer-configured event questions (Layer D)
  - Faculty / speaker engagement model
  - Free-text custom questions
  - Email template redesign
  - Society / hospital master directory (controlled pickers can start as
    text + "Other"; directory is a later slice)

=======================================================================
2. FULL ACCOUNT SETUP — DEFINITION (CPD RELEASE GATE)
=======================================================================

A person is eligible for CPD/CME award / release on an event when ALL of
the following are true. This is the single source of truth for the gate.

  F1. Account identity
      - public.users row exists
      - Linked to auth.users (same id)
      - Email on auth.users is verified (Supabase email confirmed)

  F2. Core account profile complete
      - full_name present (non-empty)
      - Privacy / terms acceptance recorded on consent_records
        (at least privacy_policy + terms_of_service, current version pins)

  F3. Professional profile present
      - professional_profiles row exists for that user
      - For scientific / accredited events, the following are non-empty
        unless the event is explicitly non-accredited ordinary pathway:
          - workplace_text (or workplace_organisation_id when directory exists)
          - position_code (or position_other)
          - profession_code

  F4. Licence path for the awarding body
      - At least one practitioner_licences row for the accrediting body
        (or bodies) that will receive credit on that event
      - status IN ('declared', 'verified') — not lapsed / revoked / superseded
      - Award engine continues to key on licence_id as today
      - Product rule: claimed membership is not treated as verified;
        verification may remain async; 'declared' is enough to release
        points unless a specific body later requires 'verified' only
        (body-level override is a later config, not this slice)

  F5. Registration linkage
      - The registration for that event is linked to the user
        (registrations.user_id = users.id)
      - Either registered while logged in, or claimed after the fact

If any of F1–F5 fail:
  - Attendance / check-in / evidence may still be stored
  - award_attendance_credit (or release path) must skip / hold with a
    clear reason code (e.g. skipped:account_incomplete, skipped:no_licence,
    skipped:registration_unlinked)
  - No silent no-op that looks like success without credit

"Full account setup" is therefore:

  verified auth email
  + users profile (full_name + required consents)
  + professional profile minimum
  + at least one active licence for the body being awarded
  + registration linked to that user.

This definition is intentionally strict so walk-in attendance can be
recorded immediately while credit is held until identity, profile and
licence are complete.

=======================================================================
3. CURRENT REPO BASELINE (GAP SUMMARY)
=======================================================================

Exists today
  - public.users: full_name, preferred_name, display_language, locale, timezone
  - practitioner_licences: multi-body, status, primary-per-body
  - registrations: event_id, email, full_name, status, registration_code, …
  - consent_records: terms_of_service, privacy_policy, ai_processing_notice, marketing
  - registration_roles: attendee | chair | presenter
  - Public register: full_name + email only
  - Walk-in / staff check-in paths already record attendance

Missing for this slice
  - first_name, last_name, salutation, phone (optional), country/region
  - professional_profiles table (workplace, position, profession, specialty, …)
  - registrations.user_id (nullable FK)
  - registration profile snapshot store
  - claim / link registration → user flow
  - Explicit CPD hold when full account setup incomplete
  - Account / profile edit surfaces (minimal)

=======================================================================
4. TARGET DATA MODEL (THIS SLICE)
=======================================================================

4.1 public.users — extend (Layer A)

  Add columns (all nullable unless noted):
    first_name          text
    last_name           text
    salutation          text          -- controlled list in app layer
    phone               text          -- optional; E.164 preferred later
    phone_country_code  text          -- optional
    country_code        text          -- ISO 3166-1 alpha-2, optional this slice
    -- full_name remains NOT NULL / required for display
    -- preferred_name, display_language already exist

  Rules
    - On write of first_name/last_name, application may refresh full_name
      as trim(first || ' ' || last) when both present; never blank full_name
    - Email remains on auth.users only (do not duplicate as source of truth)

4.2 public.professional_profiles — new (Layer B)

  One row per user (1:1 with users).

  Columns (minimum):
    id                      uuid PK
    user_id                 uuid NOT NULL UNIQUE REFERENCES users(id)
    workplace_text          text
    workplace_organisation_id uuid NULL  -- reserved for future directory
    position_code           text          -- controlled + Other
    position_other          text
    profession_code         text          -- controlled taxonomy
    specialty_code          text
    specialty_other         text
    department_text         text
    biography               text
    expertise_codes         text[] or jsonb  -- optional
    presentation_languages  text[] or jsonb  -- optional
    speaker_discovery_opt_in boolean NOT NULL DEFAULT false
    speaker_discovery_opt_in_at timestamptz
    created_at, updated_at

  Society memberships (optional in profile; not required for CPD gate):
    Either
      professional_memberships (user_id, society_code, membership_number,
        status claimed|verified|expired|unknown, …)
    Or defer society table to a follow-up if time-boxed — profile ships
    without society rows first; licences remain the CPD credential path.

  Recommendation for this slice
    - Ship professional_profiles without a full society membership table
      if schedule is tight.
    - practitioner_licences already covers registration body + number.
    - Society membership for fee/eligibility is Layer D / later.

4.3 practitioner_licences — unchanged ownership model

  - Remain keyed on user_id (and thus on the same person as the profile).
  - No schema move required if user_id stays the FK; document
    "profile owns licences" as product language, not a table rename.
  - Optional later: professional_profile_id FK if you want explicit
    profile-level ownership; not required if user_id is 1:1 with profile.

4.4 public.registrations — extend

  Add:
    user_id                 uuid NULL REFERENCES users(id)
    profile_snapshot        jsonb NULL
    -- suggested snapshot shape:
    -- {
    --   "full_name", "first_name", "last_name", "salutation",
    --   "workplace_text", "position_code", "position_other",
    --   "profession_code", "specialty_code",
    --   "licence_summaries": [{ "body_id", "licence_number", "status" }],
    --   "snapshotted_at": iso
    -- }
    source                  text  -- if not already present:
                                  -- self_registration | staff_walk_in |
                                  -- invitation_import | system_migration

  Indexes
    - registrations_user_id_idx
    - existing (event_id, email) unique retained

4.5 Claim audit

  Prefer write_audit_event on successful claim:
    event_type = registration_claimed
    subject = registration
    payload = { email, user_id, previous_user_id }

=======================================================================
5. BEHAVIOUR BY STREAM
=======================================================================

5.1 Regular — guest
  1. Submit email + full_name (existing form).
  2. Create registration with user_id NULL, profile_snapshot NULL.
  3. Send confirmation email (unchanged).
  4. Attendance possible via existing check-in when applicable.
  5. CPD held (no licence / no user).

5.2 Regular — logged-in
  1. Prefill from users + professional_profiles.
  2. Confirm or update profile (update profile vs event-only is a
     later UX refinement; this slice may update profile only).
  3. Create registration with user_id set + profile_snapshot written.
  4. If full account setup complete for the event's bodies → existing
     award path may run on check-in as today.
  5. If incomplete → attendance OK, award skips with reason.

5.3 Walk-in — staff
  1. Staff creates registration (minimal: name, email) + check-in
     (+ evidence when accredited), source = staff_walk_in.
  2. user_id NULL until claim / signup.
  3. Person attends; data retained.
  4. CPD not released until F1–F5 satisfied.
  5. After account setup + claim, a controlled release / reconcile
     path may award from existing attendance (reuse reconcile-event
     patterns; do not invent a second ledger writer).

5.4 Claim registration → account
  1. Authenticated user with verified email.
  2. Match registrations where email = auth email AND user_id IS NULL.
  3. Set user_id; if profile_snapshot IS NULL and profile exists,
     write snapshot once from current profile.
  4. Never overwrite a non-null profile_snapshot.
  5. Audit registration_claimed.
  6. Optionally offer "complete profile / add licence" if F2–F4 incomplete.

=======================================================================
6. CPD HOLD / RELEASE RULES (ENGINE TOUCHPOINTS)
=======================================================================

6.1 On award_attendance_credit (or wrapper)
  Before posting credit_ledger:
    - Resolve registration.user_id
    - If null → skip:registration_unlinked
    - Evaluate full account setup (§2) for the body_id being awarded
    - If fail → skip with specific reason (account_incomplete / no_licence / …)
    - If pass → existing award logic

6.2 Do not change
  - credit_ledger append-only posture
  - licence_id as ledger key
  - Hard Rule 11 grants
  - Attendance write path success when credit is skipped (attendance is
    authoritative; credit is conditional)

6.3 Reconcile after claim
  - Extend or document scripts/cpd/reconcile-event.ts (or equivalent)
    so staff can release held credits once F1–F5 are met for walk-ins
  - Idempotent: never double-post (existing uniqueness)

=======================================================================
7. APPLICATION SURFACES (MINIMAL)
=======================================================================

7.1 Account profile edit (authenticated)
  - first_name, last_name, salutation, preferred_name, phone (optional),
    country, display_language
  - Keep full_name in sync when structured names change

7.2 Professional profile edit (authenticated)
  - workplace, position, profession, specialty, department
  - Licence declare / list (existing licence mutation functions)
  - Speaker discovery opt-in (boolean + timestamp) — storage only;
    no discovery product in this slice

7.3 Registration
  - Guest path: unchanged fields
  - Logged-in path: prefill + snapshot on submit
  - Staff walk-in: existing staff tools + source flag

7.4 Claim UI (minimal)
  - "Link my past registrations" for matching email
  - Or automatic link on first login when email matches unlinked rows
    (prefer explicit confirm if multiple events — product choice;
     default: auto-link all unlinked rows for that verified email,
     audited per row)

7.5 No change
  - Confirmation email content
  - Organizer event question builder
  - Faculty workflow

=======================================================================
8. SECURITY / RLS / HARD RULES
=======================================================================

8.1 professional_profiles
  - RLS: self read/update; staff read per existing staff patterns
  - No cross-tenant leak of profile to other organisations' staff
    beyond what registrations already expose for their own events

8.2 registrations.user_id
  - Set only via definer function or trusted Server Action
    (claim + register-while-logged-in)
  - Guest must not set arbitrary user_id

8.3 profile_snapshot
  - Immutable from client: no direct client UPDATE of snapshot
  - Written only by register / claim server paths

8.4 Phone
  - Optional; no OTP in this slice
  - Still subject to Hard Rule 10 (no PII in logs)

8.5 Consent
  - Reuse consent_records; pin versions via existing legalVersions

8.6 Tests required
  - RLS / grant tests for professional_profiles
  - Claim: only owner email can link; cannot steal another email's rows
  - Snapshot immutability after write
  - Award skip when F1–F5 fail; award when pass
  - Legacy null user_id rows still registrable / check-inable

=======================================================================
9. IMPLEMENTATION ORDER
=======================================================================

Stage A — Schema
  A1. Migration: users columns (first_name, last_name, salutation, phone, …)
  A2. Migration: professional_profiles + RLS + grants
  A3. Migration: registrations.user_id, profile_snapshot, source (if needed)
  A4. Seed / backfill: user_id null, snapshot null on existing rows
  A5. Replay-and-verify green

Stage B — Server paths
  B1. Profile read/update Server Actions (withSecurity / requireStaff or
      authenticated self as appropriate)
  B2. Register-while-logged-in: set user_id + snapshot
  B3. claim_registrations_for_user() definer or Server Action
  B4. Wire award path skip reasons for incomplete account
  B5. Reconcile path notes / script update for post-claim release

Stage C — Minimal UI
  C1. Account settings fields
  C2. Professional profile form
  C3. Claim / "link past events" entry point (or silent auto-link + toast)
  C4. Staff walk-in: ensure source = staff_walk_in where applicable

Stage D — Verification
  D1. Unit + RLS tests
  D2. Live backtest: guest register → signup → claim → complete profile
      → add licence → reconcile → credit_ledger row
  D3. Live backtest: walk-in attend → still no credit → complete setup
      → credit released once
  D4. Phase-completion protocol (dev-lens + user-lens + backtest)

=======================================================================
10. SUCCESS CRITERIA
=======================================================================

  1. Guest can still register with email + name only.
  2. Walk-in can be checked in without an account; attendance stored.
  3. No CPD row is posted while full account setup (§2) is incomplete.
  4. After setup + claim, credit can be released once, idempotently.
  5. Logged-in registration stores user_id + profile_snapshot.
  6. Profile change does not alter prior snapshots.
  7. first_name / last_name / salutation stored; full_name still drives
     email and roster display so existing templates do not break.
  8. Phone optional; no new OTP dependency.
  9. Email templates unchanged.
  10. tsc / eslint / vitest / RLS suite / next build gates hold.

=======================================================================
11. NON-GOALS (DO NOT BUILD IN THIS SLICE)
=======================================================================

  - Organizer question library / event responses (Layer D)
  - Faculty profile / engagement / COI / travel / honorarium
  - Society or hospital master data directory
  - Free-text arbitrary organizer questions
  - Confirmation email content changes
  - Phone OTP / SMS verification
  - S-Attendee full wallet app
  - Changing credit_ledger schema or multi-body award math
  - RAG / B9 work

=======================================================================
12. OPEN ITEMS DEFERRED (DOCUMENTED, NOT BLOCKING)
=======================================================================

  - When a body requires verified-only licences for award (body config)
  - Event-only profile override ("use different workplace for this event
    without updating my profile") — product refinement
  - Society membership table for fee tiers
  - Encrypted phone at rest (prior KMS deferral)
  - Auto-link vs explicit confirm when many historical registrations match

=======================================================================
13. HANDOFF NOTES FOR IMPLEMENTER
=======================================================================

  - Read CLAUDE.md Hard Rules 3, 10, 11 and BLOCK-ARCHITECTURE fitting rules.
  - professional_profiles is B2 (Professional Registry) adjacent; do not
    write credit_ledger from profile forms.
  - Prefer existing declare_licence / licence mutation RPCs for F4.
  - Prefer existing consent_records for F2.
  - Walk-in product rule already stated in project doctrine: accredited
    walk-in → staff registration + check-in + evidence now; CPD pending
    full account. This plan implements the account half of that rule.
  - .env.local points at Seoul; use local stack for RLS tests.

=======================================================================
END OF PLAN
=======================================================================
