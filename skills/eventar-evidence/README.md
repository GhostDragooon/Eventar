# Eventar evidence skill (Track 2 starter)

Authoring scaffold for Claude Code / agent runtimes, plus an **executable Q2
slice** under `evidence/`. Produces auditable evidence packages without
transferring trust.

## Layout

```
skills/eventar-evidence/   orchestrator skill (directive / orchestration / execution)
agents/                    Q1 / Q2 / Q3 specialist instructions
schema/evidence-claim.schema.json
scripts/validate_claim.py
evidence/                  executable Q2 CLI (mock data, no DB)
```

## Three permanently separate questions

1. Was the activity approved by an identified accreditor? (Q1)
2. Did the practitioner complete the approved activity? (Q2)
3. Did the receiving institution accept the record? (Q3 — never inferred)

## Honest limits

- Build-time authoring + CLI proof. Not the Vercel/Supabase request path.
- Subagent version stamps and jurisdiction mapping packs are placeholders.
- Q2 executable path is real; Q1/Q3 are specified seams only until wired.
- Presence-without-credit (walk-in / pending account) is out of scope for v0.1
  claim emission.

See `evidence/README.md` and `evidence/RUN.md` to run the Q2 slice.
