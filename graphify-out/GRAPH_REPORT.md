# Graph Report - /Users/ivan/Eventar  (2026-07-08)

## Corpus Check
- 41 files · ~260,764 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1306 nodes · 2424 edges · 85 communities (76 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 53 edges (avg confidence: 0.85)
- Token cost: 158,665 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_CPD Security & Audit-Chain Design|CPD Security & Audit-Chain Design]]
- [[_COMMUNITY_Event Details Attendance Section|Event Details Attendance Section]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Public Survey Form & Schema|Public Survey Form & Schema]]
- [[_COMMUNITY_Staff Check-in Roster Client|Staff Check-in Roster Client]]
- [[_COMMUNITY_Event Form Basics & Registration|Event Form Basics & Registration]]
- [[_COMMUNITY_Dashboard Bulk Actions & Layout|Dashboard Bulk Actions & Layout]]
- [[_COMMUNITY_Event Details Email Actions|Event Details Email Actions]]
- [[_COMMUNITY_Legacy Auth Callback & Event Actions v1|Legacy Auth Callback & Event Actions v1]]
- [[_COMMUNITY_New Event Form Tests|New Event Form Tests]]
- [[_COMMUNITY_Public Event Registration Actions|Public Event Registration Actions]]
- [[_COMMUNITY_Settings Page & Client|Settings Page & Client]]
- [[_COMMUNITY_Check-in & Survey Actions|Check-in & Survey Actions]]
- [[_COMMUNITY_Design Decisions & Handoff (May 5)|Design Decisions & Handoff (May 5)]]
- [[_COMMUNITY_Analytics & Check-in Pages|Analytics & Check-in Pages]]
- [[_COMMUNITY_Event Edit Update Action|Event Edit Update Action]]
- [[_COMMUNITY_Public Check-in Confirm Page|Public Check-in Confirm Page]]
- [[_COMMUNITY_New Event Form Helpers|New Event Form Helpers]]
- [[_COMMUNITY_Login Magic-Link Actions|Login Magic-Link Actions]]
- [[_COMMUNITY_QRCSV Helpers & Cal-DIY Research|QR/CSV Helpers & Cal-DIY Research]]
- [[_COMMUNITY_Component Import Aliases|Component Import Aliases]]
- [[_COMMUNITY_Event Form Agenda Section|Event Form Agenda Section]]
- [[_COMMUNITY_Public Events List Page|Public Events List Page]]
- [[_COMMUNITY_Event Poster & Calendar ICS|Event Poster & Calendar ICS]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_CLAUDE.md Hard Rules|CLAUDE.md Hard Rules]]
- [[_COMMUNITY_Registration Window & Email Log|Registration Window & Email Log]]
- [[_COMMUNITY_Check-in Backtest & Camera Error|Check-in Backtest & Camera Error]]
- [[_COMMUNITY_ADR & Decisions Log Docs|ADR & Decisions Log Docs]]
- [[_COMMUNITY_Analytics Distribution Components|Analytics Distribution Components]]
- [[_COMMUNITY_Analytics CSV Export & Counting|Analytics CSV Export & Counting]]
- [[_COMMUNITY_Dashboard Page & Staff Shell|Dashboard Page & Staff Shell]]
- [[_COMMUNITY_Event Analytics Page|Event Analytics Page]]
- [[_COMMUNITY_Event Details & Live Scoreboard|Event Details & Live Scoreboard]]
- [[_COMMUNITY_QR Download & Hero Image|QR Download & Hero Image]]
- [[_COMMUNITY_Event Form DateTime Section|Event Form Date/Time Section]]
- [[_COMMUNITY_PosterCSV Phase Docs & lib_csv|Poster/CSV Phase Docs & lib_csv]]
- [[_COMMUNITY_Analytics Label & Session Distribution|Analytics Label & Session Distribution]]
- [[_COMMUNITY_Live Status Pill Components|Live Status Pill Components]]
- [[_COMMUNITY_Survey Schema Decisions (Q15)|Survey Schema Decisions (Q15)]]
- [[_COMMUNITY_Agenda Blocks RPC & Geocoder Swap|Agenda Blocks RPC & Geocoder Swap]]
- [[_COMMUNITY_Public Event Detail Page Formatters|Public Event Detail Page Formatters]]
- [[_COMMUNITY_Analytics Narrative Cards|Analytics Narrative Cards]]
- [[_COMMUNITY_Search-Path Lesson & Agenda Validation|Search-Path Lesson & Agenda Validation]]
- [[_COMMUNITY_Event Edit Page Sections|Event Edit Page Sections]]
- [[_COMMUNITY_New Event Actions & Schemas|New Event Actions & Schemas]]
- [[_COMMUNITY_app_private Schema Move & Next16 Bug|app_private Schema Move & Next16 Bug]]
- [[_COMMUNITY_Redesign Handoff & Vercel Deploy Phase|Redesign Handoff & Vercel Deploy Phase]]
- [[_COMMUNITY_Check-in Index Page & Timezone Lib|Check-in Index Page & Timezone Lib]]
- [[_COMMUNITY_Event Form Datepicker|Event Form Datepicker]]
- [[_COMMUNITY_M3 Indigo Design System (Phase 4.6)|M3 Indigo Design System (Phase 4.6)]]
- [[_COMMUNITY_Analytics Route & Q16 Decision|Analytics Route & Q16 Decision]]
- [[_COMMUNITY_Analytics Ring Gauge Math|Analytics Ring Gauge Math]]
- [[_COMMUNITY_Legal Docs (ToS, Privacy, Notice)|Legal Docs (ToS, Privacy, Notice)]]
- [[_COMMUNITY_Email Send Summary Lib|Email Send Summary Lib]]
- [[_COMMUNITY_Registration Window Lib|Registration Window Lib]]
- [[_COMMUNITY_Event Details Actions Tests|Event Details Actions Tests]]
- [[_COMMUNITY_Analytics Happy-Rate Lib|Analytics Happy-Rate Lib]]
- [[_COMMUNITY_Login Layout|Login Layout]]
- [[_COMMUNITY_pnpm Workspace & Ignored Build Deps|pnpm Workspace & Ignored Build Deps]]
- [[_COMMUNITY_proxy.ts Staff Gate|proxy.ts Staff Gate]]
- [[_COMMUNITY_Global Error Boundary|Global Error Boundary]]
- [[_COMMUNITY_Global Loading UI|Global Loading UI]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Next Config|Next Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_App Icon (Favicon)|App Icon (Favicon)]]
- [[_COMMUNITY_README|README]]
- [[_COMMUNITY_Vitest Config|Vitest Config]]
- [[_COMMUNITY_Vitest Setup|Vitest Setup]]
- [[_COMMUNITY_Project State & Sprint Tracking|Project State & Sprint Tracking]]
- [[_COMMUNITY_Login Page Layout|Login Page Layout]]
- [[_COMMUNITY_Next.js Config & CSP|Next.js Config & CSP]]
- [[_COMMUNITY_Workspace Build Deps|Workspace Build Deps]]
- [[_COMMUNITY_Auth Proxy Middleware|Auth Proxy Middleware]]
- [[_COMMUNITY_ESLint Configuration|ESLint Configuration]]
- [[_COMMUNITY_21st MCP Integration|21st MCP Integration]]
- [[_COMMUNITY_PostCSS Configuration|PostCSS Configuration]]
- [[_COMMUNITY_App Icon|App Icon]]
- [[_COMMUNITY_Project README|Project README]]

## God Nodes (most connected - your core abstractions)
1. `requireStaff()` - 51 edges
2. `supabaseServer()` - 38 edges
3. `CPD Sprint 2 Implementation Plan` - 32 edges
4. `supabaseAdmin()` - 29 edges
5. `formatInTz()` - 29 edges
6. `cn()` - 28 edges
7. `computeLifecycle()` - 20 edges
8. `registerForEvent()` - 17 edges
9. `getRequestOrigin()` - 16 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --semantically_similar_to--> `public.record_session_revocation()`  [INFERRED] [semantically similar]
  app/api/security/csp-report/route.ts → docs/plans/2026-07-04-cpd-sprint-2-implementation.md
- `ProgramSection component` --calls--> `findParallelBlockIds()`  [EXTRACTED]
  docs/plans/2026-05-17-eventar-phase-1.5b-form-redesign-impl.md → lib/agenda.ts
- `supabaseAdmin()` --conceptually_related_to--> `requireStaff() load-bearing helper (design)`  [INFERRED]
  lib/supabase/admin.ts → docs/plans/2026-05-13-eventar-mvp-design.md
- `Server-derived timezone rationale` --rationale_for--> `tzFromCoords()`  [EXTRACTED]
  docs/plans/2026-05-16-eventar-phase-1.5-design.md → lib/tz.ts
- `RosterClient component (staff tablet check-in)` --calls--> `formatInTz()`  [EXTRACTED]
  docs/plans/2026-05-22-eventar-phase-4-checkin-design.md → lib/tz.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Audited SECURITY DEFINER mutation functions (gate → mutation → write_audit_event LAST)** — supabase_migrations_20260704140200_consent_audited_fns_grant_consent, supabase_migrations_20260704140200_consent_audited_fns_withdraw_consent, supabase_migrations_20260704140300_dsr_audited_fn_transition_dsr, supabase_migrations_20260704140400_session_revocation_audit_record_session_revocation, supabase_migrations_20260704140500_self_check_in_fn_self_check_in, supabase_migrations_20260704140600_mark_attended_fn_mark_attended, supabase_migrations_20260704140700_publish_event_fn_publish_event [EXTRACTED 0.95]
- **Pinned P5 API-verification findings table** — docs_plans_2026_07_04_cpd_sprint_2_implementation_p5_1_finding, docs_plans_2026_07_04_cpd_sprint_2_implementation_p5_2_finding, docs_plans_2026_07_04_cpd_sprint_2_implementation_p5_3_finding, docs_plans_2026_07_04_cpd_sprint_2_implementation_p5_4_finding [EXTRACTED 0.95]
- **Sprint 2 cross-cutting security invariants** — docs_plans_2026_07_04_cpd_sprint_2_implementation_audit_insert_last_rule, docs_plans_2026_07_04_cpd_sprint_2_implementation_q18_rls_silent_fail_guard, docs_plans_2026_07_04_cpd_sprint_2_implementation_frontend_freeze, docs_plans_2026_07_04_cpd_sprint_2_implementation_default_acl_grant_issue [INFERRED 0.75]
- **Three-layer validation + three-layer auth pattern across Eventar Server Actions** — claude_hard_rules, lib_auth_requirestaff, app_events_new_actions_eventinputschema_v1, app_events_new_actions_eventinputschema_v2, supabase_migrations_init_events [INFERRED 0.85]
- **QR generation reuse chain (staff download, public page, poster)** — lib_qr_buildeventqrpng, app_events_id_edit_actions_geteventqrpng, app_public_events_id_poster_page, components_downloadqrbutton, lib_slugify_slugifytitle [EXTRACTED 0.90]
- **Check-in idempotent race-safety pattern (staff tablet + self-checkin)** — app_events_id_checkin_actions_markattended, app_public_checkin_confirm_actions_selfcheckin, lib_registrationcode_isvalid, docs_plans_phase4_checkin_idempotent_update_pattern, docs_plans_phase4_cross_event_scan_decision [EXTRACTED 0.90]
- **Check-in convergence: staff scan + manual entry + self-checkin all update one registration row** — app_events_id_checkin_actions_markattended, app_public_checkin_confirm_actions_selfcheckin, app_events_id_checkin_rosterclient, concept_idempotent_checkin_pattern [EXTRACTED 1.00]
- **Audit chain atomicity: gate → mutation → write_audit_event LAST, in one transaction, under advisory lock** — fn_write_audit_event, fn_compute_audit_hash, fn_pseudonymise_user, concept_audit_insert_last_pattern, concept_p2_global_audit_chain_lock_discipline [EXTRACTED 1.00]
- **Phase-completion protocol: dev-review + user-review + backtest** — phase_completion_protocol_concept, two_lens_review_pattern, eventar_backtest_recipe_memory, docs_plans_handoff_15062026_h2_three_checks [EXTRACTED 0.90]
- **Registration flow mutation surface: action, tables, RLS footgun** — registerforevent_action, registrations_table, email_log_table, rls_returning_footgun_rationale, supabase_admin_client [EXTRACTED 0.90]
- **Design system evolution: M3 indigo to Vercel-canonical Geist** — m3_indigo_design_tokens, docs_plans_handoff_05062026_vercel_canonical_palette, docs_plans_handoff_05062026_geist_font_system, instructional_color_system_7a [INFERRED 0.85]

## Communities (85 total, 9 thin omitted)

### Community 0 - "CPD Security & Audit-Chain Design"
Cohesion: 0.06
Nodes (34): ADR Finding 1 — PostgREST RPCs run as separate transactions, Audit-insert-last, same-transaction rule, BASELINE-DELTAS §3.2 — chain_seq drawn inside advisory lock, D1 — Restrict write_audit_event grant (revoke authenticated EXECUTE), P2 — Global audit-chain lock discipline, P3 — Behaviour-preserving TDD on rewritten surfaces, CPD Sprint 1 — Multi-tenancy + Identity + Audit-Chain Foundations, CPD Sprint 2 — Design: Security wrapper + audit path + attendee identity (+26 more)

### Community 1 - "Event Details Attendance Section"
Cohesion: 0.06
Nodes (43): submitSurvey(), RegRow, SubmitSurveyResult, SurveyInput, surveyInputSchema, GENERAL_SESSION_OPTION, SessionOption, State (+35 more)

### Community 2 - "Package Dependencies"
Cohesion: 0.06
Nodes (30): AttendanceSection(), CheckInRecord, countdown(), fmtDay(), fmtHM(), Props, baseProps, FeedbackSection() (+22 more)

### Community 3 - "Public Survey Form & Schema"
Cohesion: 0.07
Nodes (32): State, PartnerDraft, PartnersSection(), Props, serializePartners(), State, FormState, Props (+24 more)

### Community 4 - "Staff Check-in Roster Client"
Cohesion: 0.04
Nodes (48): dependencies, @base-ui/react, class-variance-authority, clsx, html5-qrcode, lucide-react, @mapbox/search-js-react, next (+40 more)

### Community 5 - "Event Form Basics & Registration"
Cohesion: 0.06
Nodes (36): AGENTS.md — Next 16 breaking-changes warning, markAttended(), RosterClient component (staff tablet check-in), publishEvent() Server Action (Phase 1), selfCheckIn(), State, CLAUDE.md — Eventar repo agent contract, Coding Behavior Contract (13 Rules) (+28 more)

### Community 6 - "Dashboard Bulk Actions & Layout"
Cohesion: 0.08
Nodes (26): BulkResult, bulkUpdate(), cancelEvents(), restoreEvents(), softDeleteEvents(), geistMono, geistSans, metadata (+18 more)

### Community 7 - "Event Details Email Actions"
Cohesion: 0.10
Nodes (29): assembleVenue(), authorizeEvent(), buildMapsUrl(), Envelope, EventRow, formatCountdown(), readRecipients(), Recipient (+21 more)

### Community 8 - "Legacy Auth Callback & Event Actions v1"
Cohesion: 0.12
Nodes (18): exportRegistrantsCsv(), getEventQrPng(), publishEvent(), metadata, StaffEventEditPage(), blockArraySchema, blockFitsEnvelope(), createEvent() (+10 more)

### Community 9 - "New Event Form Tests"
Cohesion: 0.07
Nodes (31): Capacity optional, blank = unlimited decision, Delete events — Deleted bucket (soft delete), Design Language.md (vault) — comprehensive design system, Design Session Log — 2026-06-19.md (vault), Handoff 2026-06-05 (Geist + Vercel redesign exploration), By Eventar footer pattern, Event meta 2-column grid pattern, Geist font system decision (+23 more)

### Community 10 - "Public Event Registration Actions"
Cohesion: 0.11
Nodes (18): RosterClient(), RosterRow, RosterRowItem(), ScannerPanel(), Toast, Scoreboard(), countCheckedIn(), SpeakerCheckinRow (+10 more)

### Community 11 - "Settings Page & Client"
Cohesion: 0.10
Nodes (22): hhmmLocal(), initialBasicsFrom(), initialBlocksFrom(), initialDateTimeFrom(), InitialEvent, initialPartnersFrom(), initialVenueFrom(), Intent (+14 more)

### Community 12 - "Check-in & Survey Actions"
Cohesion: 0.13
Nodes (18): RadioOption, SettingsClient(), subscribeStorage(), STAFF, TEXT_OPTIONS, TextOpt, THEME_OPTIONS, ThemeOpt (+10 more)

### Community 13 - "Design Decisions & Handoff (May 5)"
Cohesion: 0.10
Nodes (9): sendMagicLink(), captured, { jar }, OtpRequest, LoginForm(), URL_ERROR_MESSAGES, metadata, SiteShell() (+1 more)

### Community 14 - "Analytics & Check-in Pages"
Cohesion: 0.13
Nodes (16): BarDistributionSlice(), ExportAnalyticsCsv(), HighlightCommentSlice.tsx, Q4Slug, SentimentSlice(), SLUG_LABEL, SLUG_OPACITY, SLUG_ORDER (+8 more)

### Community 15 - "Event Edit Update Action"
Cohesion: 0.14
Nodes (15): Props, venueValid(), HK_VIEWBOX, Props, VenueSearchBox.tsx (Mapbox SearchBox wrapper, v1), VenueSearchBox.tsx (HK-biased proximity + language options), VenueSearchBox(), Mapbox HK proximity-bias rationale (+7 more)

### Community 16 - "Public Check-in Confirm Page"
Cohesion: 0.18
Nodes (14): metadata, StaffCheckinPage(), inputSchema, ToggleResult, toggleSpeakerCheckin(), deriveInitials(), EventPosterPage(), PrintPosterButton() (+6 more)

### Community 17 - "New Event Form Helpers"
Cohesion: 0.15
Nodes (13): registerForEvent(), EventRow, { mockSendReal, mockSendStub }, valid, RegisterResult, RegistrationInput, registrationInputSchema, Phase 4 — Check-in (Tablet) + Self-checkin Implementation Plan (+5 more)

### Community 18 - "Login Magic-Link Actions"
Cohesion: 0.10
Nodes (22): lib/qr.ts::buildEventQrPng helper, docs/research/cal-diy-harvest.md, cal.diy (MIT fork of Cal.com, EE code removed), Task G.2 — poster redesign, Handoff 2026-05-23 (Phase 3.5 + Phase 4 + process rules), Cal.diy to Eventar harvest assessment, Cal.diy embed system architecture (embed-core, embed-react, embed-snippet), exportRegistrantsCsv Server Action (+14 more)

### Community 19 - "QR/CSV Helpers & Cal-DIY Research"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 20 - "Component Import Aliases"
Cohesion: 0.16
Nodes (19): AgendaSection(), agendaSummary(), agendaValid(), BlockEditor(), BlockErrors, blockHasErrors(), BlockHeader(), emptyBlock() (+11 more)

### Community 21 - "Event Form Agenda Section"
Cohesion: 0.14
Nodes (13): ScanAndManual(), CheckedInView(), EventCard(), EventRow, formatClock(), formatDate(), formatTimeRange(), metadata (+5 more)

### Community 22 - "Public Events List Page"
Cohesion: 0.17
Nodes (12): CATEGORIES, EventsListClient(), PublicEventCard, metadata, PublicEventsPage(), computeLifecycle(), EventLifecycleRow, empty() (+4 more)

### Community 23 - "Event Poster & Calendar ICS"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 24 - "TypeScript Config"
Cohesion: 0.15
Nodes (16): DraftEditFormPanel(), blockArraySchema, blockFitsEnvelope(), eventIdSchema, updateEvent(), UpdateResult, zodErrors(), validEvent (+8 more)

### Community 25 - "CLAUDE.md Hard Rules"
Cohesion: 0.14
Nodes (19): Audit insert last (pivot-era hard rule), Eventar → CPD Platform Pivot (2026-07-03), Frontend freeze rule, Measurement vs inference (automation rule), Multi-tenancy rule (organisation_id + RLS), BASELINE-DELTAS.md — CPD Baseline Deltas, Abuse-control design — measurement vs inference, Audit hash chain race + ordering fix (+11 more)

### Community 26 - "Registration Window & Email Log"
Cohesion: 0.18
Nodes (18): registerForEvent server-side registration window enforcement, Handoff 2026-05-20 (Phase 2 registration flow shipped), Handoff 2026-05-21 (Phase 2 complete, awaiting smoke), email_log table, docs/plans/2026-05-20-full-stack-review.md, D2 — multi-step Server Action over single RPC decision, D3 — email_log row is service-role-only, D5 — registrations status enum (registered/attended/cancelled) (+10 more)

### Community 27 - "Check-in Backtest & Camera Error"
Cohesion: 0.15
Nodes (17): A1-A3 real-DB backtest items (markAttended TZ, selfCheckIn error, CSV count), humanizeCameraError() helper, /checkin/confirm public self-checkin route, Check-in two-path policy (staff-default + self-serve opt-in), /events/[id]/checkin staff tablet page, CSPRNG for registration codes (Math.random to crypto.randomInt), Task B.1 — live = ops window (start - CHECKIN_OPEN_MINUTES), Handoff 2026-05-24 (phase-completion-protocol first exercise) (+9 more)

### Community 28 - "ADR & Decisions Log Docs"
Cohesion: 0.17
Nodes (16): Frontend freeze, Handoff 04-07-2026 (Sprint 1 retrospective), Staff.role widen to 'eventar_staff' — deferred to Sprint 3, Task 1 split decision: requireStaff reconciliation (1a shipped / 1b deferred), Supabase advisor perf WARNs (multiple_permissive_policies / auth_rls_initplan), CPD Sprint 0, CPD Sprint 1, Project State — Eventar (+8 more)

### Community 29 - "Analytics Distribution Components"
Cohesion: 0.15
Nodes (15): docs/architecture/decisions/, docs/architecture/BASELINE-DELTAS.md (authoritative amendment list), Decisions Log Q20 — CPD pivot canonical decision, docs/data/, docs/security/, docs/source-buildpack/README.md — Slice 0.x build pack source documents, 20 — Roadmap/Pivot — CPD Platform (2026-07-03).md (vault), docs/architecture/sad.md (+7 more)

### Community 30 - "Analytics CSV Export & Counting"
Cohesion: 0.17
Nodes (12): Q18 RLS-silent-fail guard, Two-layer security architecture (TS wrapper + DB definer fns), Three-layer validation (form→Zod→DB constraint), Staff, ActionResult, RLS_SILENT_FAIL, SecurityCtx, FAKE_STAFF (+4 more)

### Community 31 - "Dashboard Page & Staff Shell"
Cohesion: 0.20
Nodes (11): DashboardPage(), fmtDate(), fmtTime(), metadata, isActive(), StaffShell(), StaffShellBackProps, StaffShellBaseProps (+3 more)

### Community 32 - "Event Analytics Page"
Cohesion: 0.15
Nodes (10): AgendaBlockRow, metadata, Q1_LABELS, Q3_LABELS, Q4_LABELS, Q5_LABELS, RegRow, SurveyRow (+2 more)

### Community 33 - "Event Details & Live Scoreboard"
Cohesion: 0.21
Nodes (8): EventDetailsPage(), fmtHM(), metadata, fmtDur(), LiveScoreboard(), fmtDur(), StickyLiveBar(), deriveLeadingSession()

### Community 34 - "QR Download & Hero Image"
Cohesion: 0.20
Nodes (14): blockInputSchema, createEvent() Server Action (Phase 1), createEvent() Server Action (Phase 1.5, calls RPC), eventInputSchema (Phase 1, Zod), eventInputSchema (Phase 1.5, structured venue + blocks), Eventar Phase 1.5 — Create-Event Redesign Implementation Plan, Eventar Phase 1.5 Design (Create-Event Redesign), Server-derived timezone rationale (+6 more)

### Community 35 - "Event Form Date/Time Section"
Cohesion: 0.19
Nodes (8): metadata, SurveyPage(), PublicShell(), PublicShellPill, Geist + Vercel-canonical palette redesign, Material 3 indigo design system (Phase 4.6), Phase 4.6 — Design System Reskin — Design, firstName()

### Community 36 - "Poster/CSV Phase Docs & lib_csv"
Cohesion: 0.16
Nodes (8): Handoff — 2026-07-01 (MVP email gaps closed), cardStyle, eyebrowStyle, ReminderEmailProps, renderReminderEmail(), renderSurveyInviteEmail(), SurveyInviteEmailProps, Migration: email_log_dedup_idx (partial unique index)

### Community 37 - "Analytics Label & Session Distribution"
Cohesion: 0.23
Nodes (8): EmailSendControls(), Kind, ConfirmDialog(), baseProps, composeSendMessage(), EmailKind, EmailSendCounts, formatSendResult()

### Community 38 - "Live Status Pill Components"
Cohesion: 0.28
Nodes (9): GET(), buildIcs(), CalendarEventInput, googleCalendarUrl(), icsEscape(), outlookCalendarUrl(), input, utcStamp() (+1 more)

### Community 39 - "Survey Schema Decisions (Q15)"
Cohesion: 0.26
Nodes (10): formatClock(), formatDate(), formatTimeRange(), generateMetadata(), normalizePartners(), PartnerEntry, PartnerStrip(), PublicEventPage() (+2 more)

### Community 40 - "Agenda Blocks RPC & Geocoder Swap"
Cohesion: 0.29
Nodes (13): Audit-insert-last invariant, Default ACL auto-grants EXECUTE to anon/authenticated/service_role, Q19 owner-only mutation surfaces, public.write_audit_event(), app_private.require_active_staff(), D1: revoke write_audit_event EXECUTE from authenticated, public.grant_consent(), public.withdraw_consent() (+5 more)

### Community 41 - "Public Event Detail Page Formatters"
Cohesion: 0.32
Nodes (10): Rate-limit new public Server Actions / GET endpoints rule, composeRateKey(), getClientIp(), parseClientIp(), rateLimit(), rateLimitByIp(), rateLimitBySession(), rateLimitByUser() (+2 more)

### Community 42 - "Analytics Narrative Cards"
Cohesion: 0.26
Nodes (7): labelForBlock(), LabelSourceBlock, speakerForBlock(), trimOrNull(), sessionDistribution(), SessionDistributionBlock, SessionDistributionRow

### Community 43 - "Search-Path Lesson & Agenda Validation"
Cohesion: 0.21
Nodes (8): EventAnalyticsPage(), Phase 6 — Analytics Implementation Plan, Phase 6 — Analytics (design), countBySlugMulti(), labels, Row, happyRate(), Row

### Community 44 - "Event Edit Page Sections"
Cohesion: 0.20
Nodes (10): livePillBgPulse keyframe (.live-pill-pulse), EventRowStrip component (Phase 6 dashboard per-row strip — later removed Phase 6.5), LayerOneTiles component (Phase 6 dashboard aggregate — later removed Phase 6.5), LABELS, StatusPill(), STYLES, Q16 Decision A reopen (LayerOneTiles relocation), Phase 6.5 — Dashboard Redesign Implementation Plan (+2 more)

### Community 45 - "New Event Actions & Schemas"
Cohesion: 0.32
Nodes (9): DateTimeSection(), dateTimeSummary(), durationOrNull(), formatDateShort(), Props, formatDurationMinutes(), formatMinutes12h(), formatMinutes24h() (+1 more)

### Community 46 - "app_private Schema Move & Next16 Bug"
Cohesion: 0.21
Nodes (12): Decisions Log Q15 — survey schema (5 categorical questions replaces 3-rating spec), Handoff 2026-06-11 (Redesign implementation Phases 0-C.2), Task C.1 — survey Q3 4th option, Task C.2 — survey Q2 to session MC, docs/plans/phase-5-survey-mockup.html, components/analytics/HighlightCommentSlice.tsx, Phase 5 — Survey flow, docs/plans/2026-06-11-redesign-implementation.md (+4 more)

### Community 47 - "Redesign Handoff & Vercel Deploy Phase"
Cohesion: 0.20
Nodes (11): agenda_blocks table + RLS, create_event_with_blocks RPC, createEvent Server Action rewrite + Zod, Handoff 2026-05-16 (Phase 1.5 mid-execution), findParallelBlockIds helper (TDD), @mapbox/search-js-react dependency, Mapbox to OSM Nominatim geocoder swap, docs/plans/2026-05-16-eventar-phase-1.5-create-event-redesign.md (+3 more)

### Community 48 - "Check-in Index Page & Timezone Lib"
Cohesion: 0.20
Nodes (11): AGENTS.md (Next 16 breaking changes), BASELINE-DELTAS.md, docs/DEFERRED.md, docs/legal/privacy-policy.md, docs/legal/terms-and-conditions.md, 200-concurrent burst throughput backtest, CPD Sprint 2 Design Doc (the WHY), Handoff Sprint 2 (planned deliverable) (+3 more)

### Community 49 - "Event Form Datepicker"
Cohesion: 0.33
Nodes (7): AnalyticsIndexPage(), metadata, CheckinIndexPage(), metadata, browserTz(), formatInTz(), tzFromCoords()

### Community 50 - "M3 Indigo Design System (Phase 4.6)"
Cohesion: 0.42
Nodes (6): KeyMetricAnalysisCard(), OperationalInsightCard(), keyMetricAnalysisText(), NarrativeMetrics, operationalInsightText(), pct()

### Community 51 - "Analytics Route & Q16 Decision"
Cohesion: 0.31
Nodes (9): agendaValid(blocks, eventStartMinutes, eventEndMinutes) validator, create_event_with_blocks unqualified current_staff_id() bug (500 error), DatePicker (calendar grid) component, Handoff 2026-05-30 (Phase 4.6 reskin complete + Phase 5 survey), Pickers expand inline, not floating popovers (base-ui Accordion.Panel constraint), components/shell/PublicShell.tsx, CREATE OR REPLACE discards search_path pin lesson, components/shell/StaffShell.tsx (+1 more)

### Community 52 - "Analytics Ring Gauge Math"
Cohesion: 0.22
Nodes (7): InitialBlock, initialBlocks, initialEvent, initialVenue, pushMock, refreshMock, SubmitPayload

### Community 53 - "Legal Docs (ToS, Privacy, Notice)"
Cohesion: 0.31
Nodes (9): Auth helper functions moved to app_private schema, Commercialisation Proposal.md (vault), Handoff 2026-05-21 v2 (Phase 3 QR code shipped), DownloadQrButton client component, 20260521010000_fix_security_lints.sql migration, getEventQrPng server action, Next 16 'use server' non-async export violation (Zod schemas, type literals), qrcode npm dependency (+1 more)

### Community 54 - "Email Send Summary Lib"
Cohesion: 0.22
Nodes (9): Handoff 2026-06-15 (Redesign + gap closure complete), H.2 mandatory three checks (phase-completion protocol), Task F.3 — survey restyle (2x2 chip-grid), Task G.1 — email rebuild (Geist fallback, Vercel palette), Task H.1 — delete 6 mockup scratch files, Eventar backtest recipe (Supabase MCP + curl + Next-Action header), Phase 8 — Vercel deploy, /survey?code=WK-XXXX public route (+1 more)

### Community 55 - "Registration Window Lib"
Cohesion: 0.29
Nodes (6): inputSchema, mockEventRow, mockUpdatedRow, revalidatePathMock, updateRegistrationClose(), UpdateResult

### Community 56 - "Event Details Actions Tests"
Cohesion: 0.43
Nodes (6): DatePicker(), formatDateLong(), monthCells(), parseIso(), sameDay(), stripTime()

### Community 57 - "Analytics Happy-Rate Lib"
Cohesion: 0.32
Nodes (8): docs/plans/phase-6.5-mockup.html — Visual decisions (locked picks + variant comparison), docs/plans/phase-6-analytics-q2-mockup.html, live-pill-pulse CSS keyframe animation (locked status pill), Material 3 indigo design tokens (primary #142175), Material Symbols Outlined icon font, Phase 4.6 — Design System Reskin decision (Material 3 indigo mockups), docs/plans/phase-6-analytics-q2-mockup.html (locked framework), Status pill set — all 6 states (Drafted/Registering/Upcoming/Live/Completed/Cancelled)

### Community 58 - "Login Layout"
Cohesion: 0.33
Nodes (7): /events/[id]/analytics route, Decisions Log Q16 — analytics two-layer model + no role-branching, Handoff 2026-05-31 (Phase 6 analytics shipped), lib/analytics/ pure helper functions, narrative.ts (rule-templated insight narrative), Phase 6 — Analytics, SentimentSlice component

### Community 59 - "pnpm Workspace & Ignored Build Deps"
Cohesion: 0.29
Nodes (4): EventRow, { mockSendReal, mockSendStub }, Reg, Staff

### Community 60 - "proxy.ts Staff Gate"
Cohesion: 0.29
Nodes (6): mockRpcResult, requireStaffMock, revalidatePathMock, rpcCalls, validBlock, validEvent

### Community 61 - "Global Error Boundary"
Cohesion: 0.40
Nodes (3): POST(), P5.3 — Next 16 headers mechanism, next.config.ts headers() + CSP_REPORT_ONLY

### Community 62 - "Global Loading UI"
Cohesion: 0.33
Nodes (5): BlockRow, eqCalls, mockBlocks, requireStaffMock, revalidatePathMock

### Community 63 - "ESLint Config"
Cohesion: 0.40
Nodes (6): app/events/new/page.tsx (accordion rewrite), ProgramSection component, Phase 1.5b — New-event form redesign (design doc), Phase 1.5b — Form redesign implementation plan, Accordion-over-wizard navigation rationale, deriveEnd()

### Community 64 - "Next Config"
Cohesion: 0.80
Nodes (3): RingGauge(), ringDashArray(), ringFraction()

### Community 65 - "PostCSS Config"
Cohesion: 0.60
Nodes (6): Eventar — Legal Notice & Disclaimer (draft), Office of the Privacy Commissioner for Personal Data, Hong Kong (PCPD), Personal Data (Privacy) Ordinance (Cap. 486) — PDPO, Eventar — Privacy Policy / PICS (draft v0.2), docs/legal/README.md — legal drafts index, Eventar — Terms & Conditions (draft v0.1)

### Community 66 - "App Icon (Favicon)"
Cohesion: 0.33
Nodes (5): Measurement vs inference (deterministic automation only), P5.1 — single-session-targeted revoke verification, recordAbuseHitAndMaybeRevoke(), ARGS, { mockRateLimitBySession, mockSignOut, mockRpc }

### Community 67 - "README"
Cohesion: 0.47
Nodes (4): P5.4 — consent version strings, CONSENT_TYPES, ConsentType, LEGAL_VERSIONS

### Community 68 - "Vitest Config"
Cohesion: 0.50
Nodes (3): P5.2 — OTP admin generateLink shape, requestAttendeeOtp(), signInWithOtp

### Community 69 - "Vitest Setup"
Cohesion: 0.70
Nodes (3): HK_PUBLIC_HOLIDAYS, registrationWindow, ymdUtc()

### Community 70 - "Project State & Sprint Tracking"
Cohesion: 0.50
Nodes (4): CPD/CME/CE platform pivot (Q20), CPD Sprint 2, Phase 8 — Vercel deploy (paused), write_audit_event caller-identity gap (Sprint1 carried-forward #1)

## Ambiguous Edges - Review These
- `app/events/new/page.tsx (accordion rewrite)` → `app/events/new/page.tsx (accordion rewrite)`  [AMBIGUOUS]
  docs/plans/2026-05-17-eventar-phase-1.5b-form-redesign-impl.md · relation: references

## Knowledge Gaps
- **357 isolated node(s):** `State`, `metadata`, `EventRow`, `{ mockSendReal, mockSendStub }`, `EventRow` (+352 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `app/events/new/page.tsx (accordion rewrite)` and `app/events/new/page.tsx (accordion rewrite)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `requireStaff()` connect `Legacy Auth Callback & Event Actions v1` to `Event Analytics Page`, `Event Details & Live Scoreboard`, `QR Download & Hero Image`, `Event Form Basics & Registration`, `Dashboard Bulk Actions & Layout`, `Event Details Email Actions`, `Survey Schema Decisions (Q15)`, `Search-Path Lesson & Agenda Validation`, `Public Check-in Confirm Page`, `Event Form Datepicker`, `Check-in Index Page & Timezone Lib`, `Registration Window Lib`, `TypeScript Config`, `ADR & Decisions Log Docs`, `Analytics CSV Export & Counting`, `Dashboard Page & Staff Shell`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Why does `ADR Finding 1 — PostgREST RPCs run as separate transactions` connect `CPD Security & Audit-Chain Design` to `Analytics CSV Export & Counting`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **What connects `State`, `metadata`, `EventRow` to the rest of the system?**
  _400 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CPD Security & Audit-Chain Design` be split into smaller, more focused modules?**
  _Cohesion score 0.06078316773816481 - nodes in this community are weakly interconnected._
- **Should `Event Details Attendance Section` be split into smaller, more focused modules?**
  _Cohesion score 0.06196078431372549 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.062040816326530614 - nodes in this community are weakly interconnected._