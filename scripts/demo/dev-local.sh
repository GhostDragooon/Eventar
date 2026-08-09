#!/usr/bin/env bash
# Demo/verification server: the app on :3100 against the LOCAL Supabase stack.
# The user's own `pnpm dev` on :3000 (against the remote project) is untouched.
# Env is derived live from `supabase status` — no keys stored in the repo.
# Process env wins over .env.local in Next, so these exports take precedence.
set -euo pipefail
cd "$(dirname "$0")/../.."

# PATH first: launch runners ship a minimal PATH without homebrew (supabase)
# or the nvm node this repo needs (system node is v14).
export PATH="/Users/ivan/.nvm/versions/node/v24.6.0/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
if [ -z "${API_URL:-}" ]; then
  echo "Local Supabase stack is not running. Start it with: supabase start" >&2
  exit 1
fi

export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export NEXT_PUBLIC_SITE_URL="${DEMO_SITE_URL:-http://localhost:3100}"

# Local-only placeholder so /api/cron/dispatch is exercisable here (it fails
# CLOSED with 503 when unset, which is correct but untestable). NOT a secret:
# this stack is a throwaway container on localhost. The real value is supplied
# by the deploy environment and must never live in the repo.
export CRON_SECRET="${CRON_SECRET:-local-dev-cron-not-a-secret}"

# Review bypass: lets every staff surface be walked without an account.
# Opt-out with EVENTAR_REVIEW_MODE=false. lib/reviewMode.ts refuses to engage
# when NODE_ENV=production, so this cannot follow the code to a deploy — and a
# banner is pinned to the viewport whenever it is on.
export EVENTAR_REVIEW_MODE="${EVENTAR_REVIEW_MODE:-true}"

exec pnpm exec next dev -p 3100
