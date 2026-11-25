# Edge rules — ready to apply (Cloudflare)

_Prepared 2026-11-25 against `Eventar_Security_Baseline_Instruction`. Not applied: production hostname and Cloudflare zone are not live (deploy paused)._

## When to apply

1. Stage 8: production hostname exists.
2. Zone on Cloudflare, DNS proxied (orange cloud).
3. Origin not preferred as the public entry point for browser traffic.

## WP-1 — Managed WAF

- Enable **Cloudflare Managed Ruleset** (OWASP core).
- Action: **Block** for high-confidence rules. If a short Log observation window is required on day one, document the end date and switch to Block.
- Optional: extra managed rules only if noise is observed; start with core only.

## WP-2 — Rate limiting rules

Create rate limiting rules (Rules → Rate limiting) matching **URI path** (and method if needed). Server Actions often POST to the page URL; match path prefixes.

| Rule name | Match | Window | Threshold / IP | Action |
|-----------|-------|--------|----------------|--------|
| `rl-login-organiser` | `http.request.uri.path eq "/login"` | 1 min | 15 | Managed Challenge or Block |
| `rl-signin-attendee` | `http.request.uri.path eq "/account/sign-in"` | 1 min | 15 | Managed Challenge or Block |
| `rl-signup-attendee` | `http.request.uri.path eq "/account/sign-up"` | 1 min | 10 | Managed Challenge or Block |
| `rl-auth-callback` | `http.request.uri.path eq "/auth/callback"` | 1 min | 30 | Challenge |
| `rl-checkin-confirm` | `http.request.uri.path eq "/checkin/confirm"` | 1 min | 15 | **Block** |
| `rl-events-register` | `http.request.uri.path matches r"^/events/[^/]+$"` | 1 min | 30 | Challenge or Block |
| `rl-survey` | `http.request.uri.path eq "/survey"` | 1 min | 20 | Challenge |

**Critical:** `/checkin/confirm` is the short-code / personal QR surface. Keep Block, not Log, once production traffic exists.

No password-reset path exists (magic link only). Do not add a fictional reset rule.

Application limits in `lib/rateLimit.ts` and `self_check_in` remain as the second layer.

## WP-3 — Custom WAF expressions (high confidence only)

Prefer managed SQLi/XSS rules. Add custom **Block** rules only for gaps:

1. **Path traversal** — URI path contains `../` or `..%2f` (case-insensitive).
2. **Obvious XSS in query** — query string contains `<script` or `javascript:`.
3. **Obvious SQLi in query** — query contains `union select` or `' or 1=1` (case-insensitive), if managed rules do not already cover.

Avoid broad body inspection that will false-positive on agenda titles or event descriptions.

## Verification commands (run after apply)

Replace `https://app.example.com` with the real production origin.

```bash
# WP-1: Cloudflare in path
curl -sI "https://app.example.com/" | tr -d '\r' | grep -iE 'cf-ray|server:'

# WP-2: exceed check-in limit from one IP (expect block before origin)
for i in $(seq 1 25); do
  curl -s -o /dev/null -w "%{http_code}\n" "https://app.example.com/checkin/confirm?code=WK-INVALID0"
done

# WP-3: probes (expect 403 from Cloudflare)
curl -s -o /dev/null -w "%{http_code}\n" "https://app.example.com/events?q=%27%20OR%201%3D1"
curl -s -o /dev/null -w "%{http_code}\n" "https://app.example.com/events?q=%3Cscript%3Ealert(1)%3C/script%3E"
curl -s -o /dev/null -w "%{http_code}\n" "https://app.example.com/events/../../etc/passwd"
```

Record status codes, `cf-ray`, and Cloudflare Security Event screenshots under `docs/security/evidence/`.

Also confirm a normal page load and a single legitimate check-in still succeed.
