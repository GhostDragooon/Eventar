LOCK=/Users/ivan/Eventar/scratch-demo/locks/test-rls.lock
cleanup() { git -C /Users/ivan/Eventar worktree remove --force "$WT" >/dev/null 2>&1; rm -f "$LOCK"; echo "== cleanup done"; }
trap cleanup EXIT
[ -e "$LOCK" ] && { echo "REFUSE: test-rls lock held: $(cat $LOCK)"; echo "== done"; exit 1; }
echo "claude-baea5f tip gate $SHA $(date -u +%FT%TZ)" > "$LOCK"