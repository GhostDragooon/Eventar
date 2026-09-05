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

# Kill any pre-existing :3100 listener before we start our own. User-lens
# 2026-08-26 found a `pnpm dev` from four days earlier still on :3100, but
# pointed at Seoul PRODUCTION (started when this shell was carrying Seoul
# env). A self-check-in through that server would have posted a real,
# permanently-undeletable credit_ledger row on prod. This script exists to
# avoid exactly that, so refuse to co-exist with an unknown :3100 — the whole
# point is that :3100 means "local-stack Eventar".
PRE_PID="$(lsof -nP -iTCP:3100 -sTCP:LISTEN -t 2>/dev/null || true)"
if [ -n "$PRE_PID" ]; then
  echo "Killing existing :3100 listener (PID $PRE_PID) before starting local-stack server." >&2
  kill "$PRE_PID" 2>/dev/null || true
  # Give it a beat to release the port; fall back to SIGKILL if it lingers.
  for _ in 1 2 3 4 5; do
    sleep 1
    lsof -nP -iTCP:3100 -sTCP:LISTEN -t >/dev/null 2>&1 || break
  done
  if lsof -nP -iTCP:3100 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Process $PRE_PID did not release :3100; forcing." >&2
    kill -9 "$PRE_PID" 2>/dev/null || true
    sleep 1
  fi
fi

eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
if [ -z "${API_URL:-}" ]; then
  echo "Local Supabase stack is not running. Start it with: supabase start" >&2
  exit 1
fi

# Ensure a mail catcher is on the supabase network. Supabase CLI 2.109 marked
# the [inbucket] config section deprecated (in favour of a [local_smtp] block
# that isn't shipped yet), so `supabase start` no longer spawns
# `supabase_inbucket_Eventar` — the hostname GoTrue still tries to dial at
# port 1025 for every magic link, verify, and change-email confirmation. When
# that dial fails, Supabase surfaces `unexpected_failure` and our SAs return
# `db_error`; the local dev experience is completely broken for anything
# email-shaped. This spins a bare inbucket up on the same docker network
# under the exact hostname GoTrue expects. Web UI at http://localhost:54324.
# Idempotent — a healthy container is reused; a stopped one is restarted.
if command -v docker >/dev/null 2>&1; then
  MAIL_STATE="$(docker ps -a --filter 'name=^supabase_inbucket_Eventar$' --format '{{.State}}' | head -1)"
  case "$MAIL_STATE" in
    running) : ;;  # healthy, nothing to do
    exited|created|paused)
      docker start supabase_inbucket_Eventar >/dev/null
      echo "Restarted supabase_inbucket_Eventar (mail catcher, web UI :54324)." >&2 ;;
    "")
      # Only spawn if the supabase network exists — otherwise the stack isn't
      # really up and we should not paper over that.
      if docker network inspect supabase_network_Eventar >/dev/null 2>&1; then
        docker run -d --name supabase_inbucket_Eventar \
          --network supabase_network_Eventar \
          -p 54324:9000 \
          -e INBUCKET_SMTP_ADDR=0.0.0.0:1025 \
          -e INBUCKET_POP3_ADDR=0.0.0.0:1100 \
          -e INBUCKET_WEB_ADDR=0.0.0.0:9000 \
          inbucket/inbucket:sha-2d409bb >/dev/null
        echo "Spawned supabase_inbucket_Eventar (mail catcher, web UI :54324)." >&2
      fi ;;
  esac
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
