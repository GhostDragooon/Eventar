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

exec pnpm exec next dev -p 3100
