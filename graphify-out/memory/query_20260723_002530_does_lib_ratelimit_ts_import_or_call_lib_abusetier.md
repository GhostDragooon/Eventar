---
type: "query"
date: "2026-07-23T00:25:30.821767+00:00"
question: "Does lib/rateLimit.ts import or call lib/abuseTier.ts?"
contributor: "graphify"
outcome: "corrected"
correction: "abuseTier.ts -> rateLimit.ts is the only real direction; rateLimit.ts -> abuseTier.ts does not exist"
source_nodes: ["lib_ratelimit_ratelimitbysession", "lib_abusetier_recordabusehitandmayberevoke", "lib_withsecurity_withsecurity"]
---

# Q: Does lib/rateLimit.ts import or call lib/abuseTier.ts?

## Answer

NO — verified by grep against source 2026-07-23. The graph edges 'rateLimit.ts --imports--> abuseTier.ts' and 'rateLimitBySession() --calls--> recordAbuseHitAndMaybeRevoke()' are PHANTOM/REVERSED (tagged EXTRACTED but false). The real dependency is one-directional: abuseTier.ts imports and calls rateLimit.ts (recordAbuseHitAndMaybeRevoke calls rateLimitBySession); rateLimit.ts has zero reference to abuseTier (a reverse edge would be a circular import). The reversal came from doc-based extraction of the Sprint 2 plan describing both libs adjacently. Also confirmed: withSecurity() and recordAbuseHitAndMaybeRevoke() both have ZERO live call sites in app/ — substrate pre-positioned for the first authenticated attendee mutation surface (post-freeze), per DEFERRED.md.

## Outcome

- Signal: corrected
- Correction: abuseTier.ts -> rateLimit.ts is the only real direction; rateLimit.ts -> abuseTier.ts does not exist

## Source Nodes

- lib_ratelimit_ratelimitbysession
- lib_abusetier_recordabusehitandmayberevoke
- lib_withsecurity_withsecurity