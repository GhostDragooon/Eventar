#!/usr/bin/env bash
# Local-stack psql for Eventar DB review. Hardcodes 127.0.0.1:54322 (no host argument)
# and opens a read-only session. Pass psql flags after the script: -c "<sql>".
set -euo pipefail
export PGOPTIONS='-c default_transaction_read_only=on'
exec /opt/homebrew/opt/libpq/bin/psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -At -v ON_ERROR_STOP=1 "$@"
