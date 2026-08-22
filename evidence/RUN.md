# Running the Q2 slice

No database needed. The mock source reads `fixtures/mock-data.json`.

## With tsx (recommended)

From the **repo root**:

```bash
pnpm add -D tsx @types/node   # once if missing
pnpm tsx evidence/src/run.ts event-accredited-clean
```

## Events to try

| Argument | Expected package status |
|----------|-------------------------|
| `event-accredited-clean` | `ready` (2 verified claims) |
| `event-accredited-messy` | `blocked` (3 review claims) |
| `event-not-frozen` | `blocked` (rule not frozen) |
| `event-ordinary` | `refused` (wrong pathway) |

Exit code `1` on `blocked` / `refused`; `0` on `ready`.

## Wiring the real data layer

Open `src/ledger/participationSource.ts`. Implement `SupabaseParticipationSource`
with the service-role client inside a Server Action. Agent and orchestrator do
not change. `chain_verified` must come from the deterministic integrity check,
never computed in the agent.

## Python schema check (optional)

```bash
python scripts/validate_claim.py path/to/claim.json
```
