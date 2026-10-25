---
name: eventar-commit-card-groups
description: Use when committing MVP card files by pathspec.
category: git-workflow
---

# Commit a reviewed card group by pathspec only, and split a shared file by hunk

Commit from the main checkout with `GIT_LITERAL_PATHSPECS=1` and list the group's paths on both `git add` and `git commit`. Peers' staged and unstaged files stay untouched.

1. Read the card's hand-back for its paths and `Suggested commit message`. Run `git diff -- package.json pnpm-lock.yaml`; a dependency no card names stays unstaged.
2. `export GIT_LITERAL_PATHSPECS=1`, then `git reset -q -- <group paths>` to clear this group's stale index entries only.
3. `git add -- <group paths>`, then `git diff --cached --stat`. The stat must list exactly the group. If it does not, stop and fix it before committing.
4. Quote Next routes that contain brackets, for example `'app/events/[id]/details/page.tsx'`.
5. `git commit -q -m "<msg>" -- <group paths>`, then `git log --oneline -1`.
6. A file two cards both changed: commit the earlier card's hunk alone (filtered patch into `git apply --cached`), then the rest for the later card. Verify each with `git show --stat <sha>` and `git show <sha> -- <file>`.
7. A split commit is not compiled by itself. Before calling it green, run `pnpm exec tsc --noEmit` at that SHA in a detached worktree (`git worktree add --detach $S/wt <sha>`) and remove the worktree. Otherwise report "not compiled alone".
8. Push only on Ivan's explicit go. Report SHAs, not outcomes you did not check.
9. `grep -c` exits 1 on zero matches and breaks `&&` chains. Read the count, or guard it with `|| true` when zero is a valid answer.
10. Leftover tree state with no card hand-back (ignore rules, a dependency Ivan ruled to keep, curator ledgers or mirrors): one commit per directory group, same pathspec steps 2 to 5. Commit a dependency only on Ivan's explicit keep ruling. The message names the gates that actually ran ("tsc and eslint only; full tip gate not run"). Fix the wording before any push, not after.
