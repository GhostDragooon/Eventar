# Phase 6 — Analytics (design)

> Date: 2026-05-30 · Status: approved, ready for implementation plan
> Roadmap row: Phase 6 "Analytics" — Per-event + manager dashboards working. **Read-side queries only.**

## Goal / demo end-state

A staff member opens `/dashboard` and sees:
- Aggregate Layer-1 metric tiles at the top (Registered / Attended / Capacity / Arrival-latency, RLS-scoped)
- The existing event list, with each row carrying a compact strip: `Reg N · Att N · X%` and `Surveys N · Happy Y%`

Clicking an event row navigates to `/events/[id]/analytics` — a new route showing the full **Layer 2** feedback deep-dive: a 5-slice horizontal card (one slice per survey question, ranked distributions + Q4 "happy rate" headline + Q2 featured-quote card), plus two rule-based templated narrative info-cards at the bottom.

The page renders directly from `registrations` and `survey_responses` via `supabaseServer` (RLS-aware). No new tables, no new dependencies, no new RPC functions.

## Decisions locked this session

| # | Decision | Rationale |
|---|---|---|
| Surface | New route `/events/[id]/analytics` + dashboard event-list row strip | Roadmap demo line points at both: per-event drill-down and cross-event scanning. Keeps the edit page focused on configuration. |
| Layer model | Two layers: (1) Attendance funnel — `/dashboard` only; (2) Feedback — `/events/[id]/analytics` only | User direction: per-event page mirrors the supplied mockup (which has no Layer 1). Layer 1 aggregates at the top of `/dashboard` instead. |
| Per-event page surface | All 5 survey questions get a slice — Q1/Q3/Q4/Q5 distributions + Q2 featured-quote card | User: "stick with the template given." `lib/surveyTemplate.ts` is the locked SSOT for slugs + labels. |
| Q4 headline | "Met/Exceeded Expectations" big-number tile (45%+46% by default) as the slice's left-half display | Closest-to-NPS signal we collect — the one organizer-facing number worth featuring. |
| Q4 benchmark line | **Dropped** | No benchmark data source exists; computing "your past-event average" is out of scope for Phase 6. |
| Q2 free-text rendering | "Latest Highlight" eyebrow + most-recent quote in serif + timestamp chip + "View all" chip; right-card shows `Comments: N` | Faithful to the mockup's speaker-card visual idiom adapted to free-text data (no speaker name / rating exists). |
| Privacy floor | None — show distributions at any N including N=1 | Internal staff surface; staff already has DB access. Phase-5 anonymity copy is a separate concern (close-out item F7). |
| Response math | A "response" is any row in `survey_responses`; rate denominator = `attended` registrations | The DB row IS the response (empty submits allowed per Phase 5). Eligibility universe is `attended`. |
| Q2 comments filter | `coalesce(trim(key_highlights), '') <> ''` in the query | Filter blanks out of the comment count and quote list. Keeps Phase 6 unblocked by the Phase 5 close-out Zod fix (F9 deferred). |
| Chart idiom | Horizontal bars, sorted desc, `bg-primary` winner / `bg-primary-container` others, `border border-primary/20` on the winner | Matches user mockup verbatim. Reuses the existing `MetricCard` progress-bar idiom from `app/dashboard/page.tsx`. No charting dep. |
| Visual framework | User-supplied HTML mockup adopted **wholesale** | TopAppBar + hero + 5-slice card + slice anatomy + icon language + Q4 segmented legend + Q5 `bg-primary/5` highlight + bottom info-card narrative containers. Only places framework can't literally apply (Q2 speaker-rating data, Q3 4th slug, Q4 benchmark) substituted minimally. |
| Auto-narrative | **Rule-based templated text** in the two bottom info-cards (`Operational Insight` + `Key Operational Metric Analysis`) | ~20 LOC of if/else over computed metrics. Honest about not being smart, real organizer signal. |
| Query strategy | Server Component, parallel `Promise.all`, no SQL `GROUP BY`, no new RPC | At 200-attendee max, JS reducers over <50KB of rows are fast. Avoids re-triggering the search_path-pin lesson from this session's RPC fix. |
| Dashboard agg | Two queries with `event_id IN (…)`, joined to event list in JS | O(2) round-trips regardless of event count — no N+1. |
| Role branching | **None** in UI code paths | User direction: "no need to worry too much about manager or organizer, just add everything." RLS scopes naturally (organizer-own, manager-all); the page itself renders identically for both. |
| Dependencies | None added | Tailwind + existing M3 tokens cover everything. No charting library. |
| Sorting / filtering | Out of scope ("sorting comes later" per user) | Distributions sorted desc by count; otherwise no UI controls. |
| Export PDF button | Renders visually per the mockup; not wired in Phase 6 | Visual fidelity to the framework. Implementation deferred. |

## Architecture

**Two new surfaces, zero new tables, zero new dependencies.**

```
/dashboard (existing — extended)
  ├── Aggregate Layer-1 tiles (new row above existing event list)
  │     Total Registered · Total Attended · Capacity util % · Avg arrival latency
  └── Event list with per-row strip (existing list, added inline strip)
        Reg N · Att N · X% · Surveys N · Happy Y%

/events/[id]/analytics (NEW route)
  ├── Hero: "Post-Event Survey Analytics: {event title}" + Export PDF button (visual only)
  ├── 5-slice horizontal card (single bg-surface-container-lowest container):
  │     Slice 1 — Agenda (Q1)        — 4-bar grid, canonical labels, Priority Expansion pill on winner
  │     Slice 2 — Content (Q2)       — Latest Highlight + Comments count card
  │     Slice 3 — Value Drivers (Q3) — 3 bars (grid-cols-2, one empty cell)
  │     Slice 4 — Sentiment (Q4)     — Big % headline + segmented bar + 4-color legend
  │     Slice 5 — Requests (Q5)      — 4 bars stacked, bg-primary/5
  ├── Operational Insight info-card (rule-templated)
  └── Key Operational Metric Analysis info-card (rule-templated)
```

## Components

All under `components/analytics/`:

| Component | Responsibility |
|---|---|
| `LayerOneTiles` | Row of 4 metric tiles for `/dashboard` (Registered / Attended / Capacity / Arrival latency) |
| `EventRowStrip` | Compact `Reg · Att · % · Surveys · Happy%` rendered inline on each `/dashboard` event-list `<li>` |
| `Slice` | Generic slice container — left 1/3 (icon + title + prompt), right 2/3 (children) |
| `BarDistributionSlice` | Slice variant for Q1/Q3/Q5 — `Slice` + horizontal-bar grid/stack with winner highlight |
| `HighlightCommentSlice` | Slice variant for Q2 — Latest Highlight + Comments count card |
| `SentimentSlice` | Slice variant for Q4 — big % headline + segmented bar + legend |
| `OperationalInsightCard` | Rule-templated info card |
| `KeyMetricAnalysisCard` | Rule-templated info card |

`lib/analytics/` (pure functions, no I/O):

| Function | Signature |
|---|---|
| `countBySlug<T>(rows, key, options)` | `→ { slug: T, label, count, pct }[]` sorted desc |
| `happyRate(rows)` | `→ number \| null` — Q4 `exceeded + met` / Q4 non-null |
| `arrivalLatency(rows, eventStart)` | `→ number \| null` — % checked in within first 15 min |
| `operationalInsightText(metrics)` | `→ string` — rule branches over thresholds |
| `keyMetricAnalysisText(metrics)` | `→ string` — rule branches over thresholds |

## Data flow

### Per-event page (`/events/[id]/analytics`)

Server Component, `requireStaff()`, three parallel queries via `Promise.all`:

```ts
const [eventRes, regsRes, surveysRes] = await Promise.all([
  supabase.from('events').select('id, title, start_time, end_time, timezone, venue_name, max_attendees, status').eq('id', id).maybeSingle(),
  supabase.from('registrations').select('id, status, check_in_at').eq('event_id', id),
  supabase.from('survey_responses').select('id, session_format, key_highlights, value_proposition, expectations, future_preferences, submitted_at').eq('event_id', id).order('submitted_at', { ascending: false }),
]);
```

Distributions computed in-process from the survey rows. No SQL `GROUP BY`. No new RPC. At 200-attendee max, payload <50KB.

### Dashboard (`/dashboard` — extended)

Existing 3 metric cards stay. Add **one** new row of Layer-1 tiles + per-row event strip.

Two new aggregate queries (not N+1) keyed by visible event ids:

```ts
const eventIds = events.map(e => e.id);
const [regsByEvent, surveysByEvent] = await Promise.all([
  supabase.from('registrations').select('event_id, status, check_in_at').in('event_id', eventIds),
  supabase.from('survey_responses').select('event_id, expectations').in('event_id', eventIds),
]);
```

Joined to the event list in JS. O(2) round-trips regardless of event count.

## Error handling

| Failure | Behavior |
|---|---|
| Event id doesn't exist or RLS hides it | `notFound()` — same pattern as `/events/[id]/edit` |
| Not authenticated | `redirect('/login')` via `requireStaff` |
| No registrations yet | Layer-1 tiles render with zeros; Layer-2 slices show empty states inline |
| No survey responses yet | Q1/Q3/Q5 slices show "Awaiting responses"; Q4 headline shows `—`; Q2 latest highlight reads "No comments yet" |
| DB read error | Throws → Next error boundary (read-only surface, no structured-error UX needed; matches existing dashboard) |
| Dashboard row: event with no surveys | Strip renders `Surveys 0 · Happy —%` |

## Testing

Vitest, behavior-not-lines:

1. `countBySlug` — empty input, all-null column, sort order, percent rounding
2. `happyRate` — N=0 returns null, N≥1 returns correct fraction, all-Q4-null returns null
3. `arrivalLatency` — `check_in_at IS NULL` excluded; window edge (exactly 15:00)
4. `operationalInsightText` + `keyMetricAnalysisText` — each rule branch fires on its threshold

Running invariant after Phase 6 lands: **95+ tests across 12+ files, 13 build routes** (settled in the implementation plan).

No new integration tests beyond `next build` resolving the new route + the existing static gates. Phase 6 is read-only — no mutation surfaces, no race conditions, no idempotency considerations.

## Out of scope (deferred / explicitly skipped)

- Cross-event comparison (this event vs your average) — would feed a Q4 benchmark line
- Realtime updates on the analytics page — request-time only
- Filter/sort UI controls — "sorting comes later"
- Export PDF wiring — visual button only
- "Insights" top nav tab — visual only in the mockup; not wired to a real surface
- CSV export of survey responses — separate from Phase 6 scope
- Drill into individual respondent's answers — anonymity-preserving by design

## Visual reference

Mockup file: `docs/plans/phase-6-analytics-q2-mockup.html` (the full per-event analytics page render — visual framework locked).

## Vault writes (separate from this design doc)

- New: `/Users/ivan/Desktop/Eventar/20 — Roadmap/Phase 6 — Analytics.md` — phase note (designed, pending implementation)
- Append: `/Users/ivan/Desktop/Eventar/02 — Decisions Log.md` — new entry Q16 recording the two-layer + visual-framework + no-role-branching locks

## Next

Hand off to `superpowers:writing-plans` for the executable phase plan (TDD task list, commands, commits).
