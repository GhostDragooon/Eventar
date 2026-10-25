#!/bin/zsh
# Mutant harness: one SQL function plus its table's grants and policies.
# Required env: FN_HEAD (awk prefix of the function's create line), FN (regprocedure signature),
#   TABLE (table the function writes), MIGRATION (file that defines FN), TESTS (space-separated
#   test files), OUT (session scratch dir, not the repo).
# Add one line per mutant at the bottom: mut NAME 'sed-expression'.
set -u
: ${FN_HEAD:?set FN_HEAD} ${FN:?set FN} ${TABLE:?set TABLE} ${MIGRATION:?set MIGRATION} ${TESTS:?set TESTS} ${OUT:?set OUT}
PSQL=/opt/homebrew/opt/libpq/bin/psql
URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
mkdir -p "$OUT" && rm -f "$OUT"/*(N)
fp() { $PSQL "$URL" -Atc "select md5(pg_get_functiondef('$FN'::regprocedure)
  || coalesce((select string_agg(polname, '|' order by polname) from pg_policy where polrelid='public.$TABLE'::regclass), '')
  || coalesce((select relacl::text from pg_class where oid='public.$TABLE'::regclass), '')
  || coalesce((select proacl::text from pg_proc where oid='$FN'::regprocedure), ''))"; }
awk -v h="$FN_HEAD" 'index($0,h)==1{p=1} p{print} p && /^[$]function[$];/{exit}' "$MIGRATION" > "$OUT/fn.sql"
BASE=$(fp); echo "baseline $BASE"
run() {
  $PSQL "$URL" -v ON_ERROR_STOP=1 -q -f "$OUT/$1.sql" >/dev/null 2>&1 || { echo "MUTANT $1 DID NOT LOAD"; return 1; }
  pnpm exec vitest run ${=TESTS} 2>&1 | grep -E '^\s*×' | sed 's/^ *//' | sort -u > "$OUT/$1.fails"
  echo "== $1: $(wc -l < "$OUT/$1.fails" | tr -d ' ') failing"; cut -c1-160 "$OUT/$1.fails"
  $PSQL "$URL" -v ON_ERROR_STOP=1 -q -f "$MIGRATION" >/dev/null 2>&1
  [ "$(fp)" = "$BASE" ] && echo restored || echo '!!! NOT RESTORED: fingerprint moved, stop'
}
mut() { sed "$2" "$OUT/fn.sql" > "$OUT/$1.sql"; cmp -s "$OUT/fn.sql" "$OUT/$1.sql" && { echo "MUTANT $1 CHANGED NOTHING"; return 1; }; run "$1"; }
# mutants go here, e.g.:
# mut D8 's/ for update;/;/'
