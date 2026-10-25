---
name: eventar-org-scoped-event-lists
description: Use when adding a staff event list, picker or dashboard.
category: multi-tenancy
---

# Eventar org-scoped event lists

Every staff-side list of events reads through `ownEvents(supabase, staff, cols)` in `app/dashboard/data.ts`, then chains its own filters, order and limit. Do not write an inline `from('events')` with an `organisation_id` check, and do not treat RLS as the org scope.

Why: `events_public_read_published` lets any signed-in or anon session read every organisation's published events. RLS answers "can this role read this row", not "does this page want it". The three inline copies had already drifted before extraction.

- `eventar_staff` is the only role that sees all orgs. That exception lives only inside `ownEvents`.
- Adding a list: call `ownEvents`, then chain. Never re-select.
- `cols` must be a string literal of plain columns separated by `', '`. A non-literal string (a variable, a template, a union) fails to compile by design, because `ownEvents` types its row from the literal. Do not widen it to `string` to silence an error. Embeds, aliases and casts are not supported.
- Verify on :3100 (never :3000, which points at production) with two orgs. Sign in as each identity and confirm no other org's event title or count appears.
- Mutation check: remove the `eq` in `ownEvents`, confirm the scope tests fail, then restore.
- Select row typing: see the supabase skill, "supabase-js typing".

## Dashboard metric tiles

- A tile label names the window its number uses. A rolling window is "Next 7 days", not "this week" (which reads as Monday to Sunday).
- A footer must count the same set as the number above it, or say what it counts. "N closing in 7 days" counted registration deadlines on events of any date, so it could exceed the number. Use "N registration deadlines in 7 days".
- Reuse a sibling tile's predicate (`isOpen`) so tiles agree. Drafts and cancelled events never belong in a live-or-open count.
- `ownEvents` results are capped by the query limit. The dashboard loads the latest 300 by start time, so a count can be silently short for a large org. Say so or widen the query.
