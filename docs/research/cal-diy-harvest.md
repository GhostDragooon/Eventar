# Cal.diy → Eventar harvest assessment

**Date:** 2026-05-22
**Source:** `~/Downloads/cal.diy-main` (Cal.diy = MIT fork of Cal.com with EE/enterprise code removed)
**Status:** Reference document. No code lifted yet. Revisit at the timing points below.

---

## TL;DR

License-compatible (MIT), architecturally incompatible. Cal is a 1.5MB-yarn-lock Turborepo on tRPC + Prisma + NextAuth; Eventar is a single Next 16 app on Server Actions + supabase-js + Supabase Auth. Wholesale copy is off the table. Selective harvesting of three specific things is worth the effort; everything else is reference-only.

## Stack contrast

| | Cal.diy | Eventar |
|---|---|---|
| Repo shape | Turborepo monorepo (3 apps, 22 packages) | Single Next.js app |
| RPC | tRPC + tanstack-query | Server Actions (Decisions Log Q12) |
| ORM | Prisma | supabase-js + raw SQL migrations (Stack.md explicitly rules out ORMs) |
| Auth | NextAuth + many OAuth adapters | Supabase Auth magic-link (CLAUDE.md hard rule 1) |
| Date lib | dayjs (internal `@calcom/dayjs` wrapper) | `Intl.DateTimeFormat` + `lib/tz.ts` |
| Email | React Email | Stubbed until Phase 7 (Resend) |
| Scope of problem | Find mutually free slot across calendars + book | Manage who comes to a pre-scheduled workshop |

Three of Cal's stack choices (Prisma, tRPC, complex state libs) are on Stack.md's "What we deliberately avoided" list. Adopting Cal patterns wholesale would contradict CLAUDE.md rule 2 (simplicity first).

## What to harvest

### 🟢 High-value, low-friction (copy with adaptation, MIT attribution)

| What | From | Why | Effort |
|---|---|---|---|
| **React Email layout primitives** | `packages/emails/src/components/BaseEmailHtml.tsx`, `Info.tsx`, `CallToAction.tsx`, `Row.tsx`, `Separator.tsx` | Phase 7 needs the same 3-email pattern (confirmation + reminder + survey). Cal's layout shell is already responsive-tested across Gmail / Outlook / Apple Mail. | ~½ day to flatten `@calcom/lib` deps |
| **IANA timezone curated list** | `packages/lib/timeZones.ts` (423 lines, pure data) | The event-form already needs a TZ picker. Cal's list is curated — drops deprecated zones, groups by region. | ~1 hr |
| **`isProblematicTimezone()` heuristic** | `packages/lib/isProblematicTimezone.ts` (49 lines, pure function) | Catches IANA zones browsers can't reliably parse. Tiny, well-tested, drop-in. | ~15 min |

### 🟡 Useful patterns to read but probably rewrite

- **Booking confirmation/reschedule/cancel email templates** (`packages/emails/src/templates/Organizer*Email.tsx`, `Attendee*Email.tsx`) — read for tone + structure, write your own. Cal's are densely coupled to its booking domain.
- **Embed system** (`packages/embeds/embed-core/`, `embed-react/`, `embed-snippet/` + the `.mermaid` lifecycle diagrams) — directly relevant to the **Step-2 commercialisation path** (associations embedding Eventar registration in their member portals). Save the mermaid diagrams as architectural prior art.
- **ICS / iCal generation** (`packages/lib/CalEventParser.ts`, `CalendarService.ts`) — for `Out of Scope.md` item 5 (iCal invite on Email #1) when that ships. RFC 5545 has many edge cases; Cal has handled them.
- **i18n setup** (`packages/i18n/`) — `next-i18next.config.js` + `locales/` structure. Relevant only if Step-2 needs multi-language for international associations.

### 🔴 Don't bother

- **UI component library** (`packages/ui/`) — each component depends on `@calcom/ui/classNames`, `@calcom/lib/*`, `@calcom/dayjs`, internal Radix wrappers. Flattening one drags in 5+ files. Eventar already has `components/ui/button` — keep building outward from that with shadcn/ui patterns.
- **tRPC routers** (`packages/trpc/`) — incompatible with Server Actions.
- **Prisma schema** (`packages/prisma/`) — incompatible with raw SQL migrations.
- **NextAuth integration** — incompatible with Supabase Auth.
- **App-store integrations** (`packages/app-store/`) — third-party calendar/payment/video adapters; out of scope until well past Phase 6.
- **Availability/slot-finding logic** (`packages/lib/availability.ts`) — Cal's bread-and-butter; Eventar events are pre-scheduled.
- **Turborepo + monorepo structure** — directly violates Eventar's single-package principle.

## Recommended timing

| Phase | Harvest action |
|---|---|
| **Phase 4–6** (continue core MVP) | Nothing. Don't get sidetracked. |
| **Pre-Phase 7**, *if* a TZ picker is added to the event-form | `timeZones.ts` list + `isProblematicTimezone()` |
| **Phase 7** (Resend integration) | React Email layout primitives + read booking email templates for tone |
| **Step-2 commercialisation** (post Phase 6) | Embed system architecture (mermaid diagrams especially); i18n config if multi-language is needed |
| **When `Out of Scope.md` item 5 ships** | ICS parser |

## Licensing / attribution hygiene

When copying a file:

```ts
// Adapted from cal.diy (https://github.com/calcom/cal.diy)
// Original Copyright (c) Cal.com, Inc. — MIT licensed
// Modifications: <brief note>
```

And vendor Cal's `LICENSE` next to the borrowed code (it's at `~/Downloads/cal.diy-main/LICENSE`, ~1KB).

## Decision

**Don't act now.** Phase 4 (check-in tablet) is the next roadmap item per the deferred-fork decision (2026-05-22). This document is the bookmark for when the harvest moments above come up.
