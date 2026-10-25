cat > docs/plans/mvp/DB-01.md <<'EOF'
# DB-01 Seed drift re-assert and the CI grant assertion
STATUS: DONE
Changed: supabase/seed.sql (new re-assert block), scripts/ci/replay-and-verify.sh (step 3), tests/rls/seed_grant_posture.rls.test.ts (new)
Gates: tsc clean · eslint 0 errors / 11 warnings · vitest 187 files passed, 47 skipped / 1533 passed, 405 skipped · build not run (no app code) · test:rls 43 files / 362 passed
Live check: not applicable. Applied the new block to the live local DB ... no reset was run.
CI assertion: ... The script itself was NOT run (it calls `supabase db reset`, forbidden) [I: it will pass if the replay does].
Evidence tags: [X] unless marked.
Deviations from the card, and why: the wider table set above; a new test file instead of rows in audited_table_writes (reason above).
Open questions for Ivan: keep or trim the extra tables (see Findings).
Executor: Claude Sonnet 5.5, Claude Code
Committed:
EOF
rm docs/plans/mvp/LOCK-DB-01; ls docs/plans/mvp