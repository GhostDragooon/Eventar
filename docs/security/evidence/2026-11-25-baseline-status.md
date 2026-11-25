# Baseline evidence / status — 2026-11-25

## Summary

Aligned documentation with `Eventar_Security_Baseline_Instruction` (2026-11-22).

| Work package | Result |
|--------------|--------|
| WP-1 Edge + managed WAF | **Blocked** — no public production hostname; Cloudflare zone not live; deploy paused |
| WP-2 Edge rate limits | **Blocked** — same; rule definitions prepared in `docs/security/EDGE_RULES_READY.md` |
| WP-3 Custom WAF | **Blocked** — same; expressions prepared in EDGE_RULES_READY |
| WP-4 Documentation | **Done** — `BASELINE.md`, `INCIDENT_RESPONSE_PLAYBOOK.md`, this note |
| WP-5 Evidence package | **Partial** — this status note + ready rules; no live Cloudflare screenshots or block events |

## Explicit confirmations

- Known check-in enumeration surface path: **`/checkin/confirm`** (`?code=` + `selfCheckIn` Server Action).
- Application/DB rate limiting exists for invalid-code guessing (IP) and valid-code per-event limits inside `self_check_in`.
- **Edge** rate limiting for that path is **not** yet active.
- ADR-0003 dual-package encryption remains **out of scope** for this baseline.
- No claim of external pen test, formal IR organisation, or completed 13-layer audit.

## Next step after spine is stable

1. Explicit deploy go → provision Singapore → put hostname on Cloudflare (orange cloud).
2. Apply EDGE_RULES_READY (managed WAF → rate limits with check-in first → custom rules).
3. Run verification commands; store screenshots under this `evidence/` folder.
4. Schedule external pen test only after real traffic patterns exist.
