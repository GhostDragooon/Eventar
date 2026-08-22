# Eventar evidence — Q2 executable slice

Build-time / CLI slice that produces **falsifiable participation claims** (Q2)
from a swappable data source. Not runtime code on the Vercel request path.

## What it proves

| Event id | Outcome |
|----------|---------|
| `event-accredited-clean` | `ready` — two `attendance_verified` claims |
| `event-accredited-messy` | `blocked` — rule mismatch, chain not run, hash mismatch + check-in overflow |
| `event-not-frozen` | `blocked` — rule version not frozen |
| `event-ordinary` | `refused` — ordinary pathway cannot produce a participation package |

Every blocking condition sets `human_review_required: true` and **never** pairs
that with `status: attendance_verified` (schema + validator enforce this).

## Layout

```
evidence/
  src/
    run.ts                      CLI entry
    orchestrator.ts             load → agent → validate → gate
    validateClaim.ts            schema mirror (no ajv/zod)
    types.ts
    agents/participationAgent.ts
    ledger/participationSource.ts   interface + Supabase stub comment
    ledger/mockParticipationSource.ts
  fixtures/mock-data.json
  out/                          written by the CLI
skills/eventar-evidence/SKILL.md
agents/eventar-*.md
schema/evidence-claim.schema.json
scripts/validate_claim.py
```

## Run

From the repo root:

```bash
pnpm add -D tsx   # once, if not present
pnpm tsx evidence/src/run.ts event-accredited-clean
pnpm tsx evidence/src/run.ts event-accredited-messy
pnpm tsx evidence/src/run.ts event-not-frozen
pnpm tsx evidence/src/run.ts event-ordinary
```

See `evidence/RUN.md`.

## Boundaries

- Deterministic truth (`chain_verified`, freeze) stays in Supabase/TypeScript.
  The agent **reads** the result; it does not compute the hash chain.
- Q1 (accreditation) and Q3 (submission) are seams in the orchestrator only —
  not faked in this slice.
- Presence-only registrations (walk-in, no licence) are out of scope for v0.1
  claims; do not narrate them as `attendance_verified`.
- No personal data in claims — subjects are licence UUIDs / opaque ids only.
