---
name: eventar-card-git-workflow
description: Use when committing a card group, pushing, adding a dependency or refreshing the graph.
category: git-workflow
---

# Eventar card git: claim the card, commit by pathspec, push only the approved SHA

## Claim before building

- Before starting a card or spawning a session for it, run `list_sessions` with `linked: true` and search the titles for the card ID. If another session owns the card, message that session or stop. Never start a second one.
- If a duplicate session already started, name both session IDs to Ivan and let him pick. Never archive or kill either one yourself.
- A go or push approval belongs to the session where Ivan gave it. Do not forward it; send the task and state that approval is still pending.

## Commit a reviewed group by pathspec

- Commit from the main checkout with `export GIT_LITERAL_PATHSPECS=1`. Run `git reset -q -- <group paths>`, then `git add -- <group paths>`. Never a bare `git reset -q` with no paths: it unstages peer files already staged in the shared index. `git diff --cached --stat` must list exactly the group, or stop.
- Commit with `git commit -q -m "<msg>" -- <group paths>`, then `git log --oneline -1`. A new untracked file needs `git add` first. For a single docs file, `git add -- <file>` then `git commit -q -F - -- <file>` is enough, but still run `git diff --cached --name-only` first to confirm nothing peer-staged rides along.
- Next.js dynamic-route paths such as `app/events/[id]/checkin/...` contain brackets: keep `GIT_LITERAL_PATHSPECS=1` set and quote every path in a zsh array (`files=(... "app/events/[id]/checkin/SpeakersCard.tsx")`), then `git add -- "${files[@]}"`. After the commit, `git diff --cached --name-only | wc -l` must print 0 and `git status --porcelain` must show only peer files.
- Never `git add -A -- <dir>`: it stages every peer change in that directory. Size the change set from the full `git status --porcelain`, never from a truncated stat.
- `git add -- <file>` takes every hunk in that file, including unrelated edits left by earlier sessions, and `git diff --cached --name-only` cannot show that. Before staging a file, read `git diff -- <file>` and list each hunk. A hunk that is not yours goes to a temp index (see the split bullet below) or to Ivan. On 2026-11-14 a CLAUDE.md commit carried a pending Nov 7 hunk this way and was reported only after the push.
- A modified file that no hand-back or brief names belongs to a peer: leave it unstaged and name it to Ivan. A dependency change no card names (`package.json`, lockfile) stays unstaged unless Ivan rules to keep it.
- A file two cards changed: commit the earlier card's hunk alone (filtered patch into `git apply --cached`), then the rest, and check each with `git show --stat`.
- Splitting one file across two commits without touching the shared index: build each commit in a temp index. `export GIT_INDEX_FILE=<scratch>/index.tmp; git read-tree HEAD`, stage the group (`git add -- <paths>`, and for the split file `git update-index --cacheinfo 100644,$(git hash-object -w <staged-copy>),<path>`), compare `git diff --cached --name-only` with the expected list and stop on a mismatch, then `git write-tree`, `git commit-tree <tree> -p <parent> -F <msg>`, and `git update-ref refs/heads/main <new> <parent>`. The old-value argument makes the ref move refuse if HEAD changed. Unset `GIT_INDEX_FILE` afterwards.
- A temp-index commit leaves the shared index on the old blobs for those paths, so `git status --short` then shows them as `MM` or `D` even though HEAD moved. Run `git reset -q -- <group paths>` (paths only, never bare) to resync. `git status --short -- <group paths>` must then print nothing.
- Keep each staging step as a shell function (`stage2() { git add -- ...; }`), never as a string in a variable. An unquoted `$STAGE` with arguments fails as `command not found` and the commit never happens; check `git rev-parse HEAD` against the expected parent before each commit.
- A split commit is not compiled by itself. Run `pnpm exec tsc --noEmit` at that SHA in a detached worktree and remove the worktree, or report "not compiled alone". A fresh worktree has no `node_modules`: symlink the main checkout's first (`ln -s /Users/ivan/Eventar/node_modules <wt>/node_modules`), then run the tsc and the touched-file vitest there.
- `grep -c` exits 1 on zero matches and breaks `&&` chains. Guard it when zero is a valid answer.
- Before committing, grep the group's changed `.ts` and `.tsx` paths for `console.log` (`grep -n 'console.log' -- <paths>`, quoting each bracketed path). The Stop hook warns after a turn, and on 2026-11-19 the warning on `app/(public)/events/[id]/actions.ts` went unanswered in the closing report. Name each hit to Ivan before the commit. Do not commit it silently.
- Before committing a frontend or auth-facing change, run the live backtest on :3100 with a disposable signed-in user and name its result. Ivan asked for it on 2026-11-20: "well backtest it before committing". Delete the user and confirm the count is 0 in `auth.users` and `public.users` (match by `id`) before you report.
- Commit messages name only the gates that actually ran.
- A Bash commit can come back as "classifier gave no verdict ... a hook changed this call's input". The PreToolUse RTK hook rewrote the command to `rtk git ...` after the model wrote it. Reissue the identical command once. If it is denied again, stop, and tell Ivan that a hook rewrites the call and auto mode cannot evaluate it. Do not loop.

## Push only the approved SHA

- Push only on an explicit go from Ivan, in this session, that names a SHA. A rebase, amend or reset makes a new SHA, so state the new tip and ask again.
- Before asking, run `git rev-list --left-right --count origin/main...main` and list the commits ahead of origin.
- Push by refspec: `git push origin <sha>:refs/heads/main`. Then read back `origin/main` and the ahead count.
- Never a bare `git push`. It publishes every local commit, including a peer session's commit that sits above yours. Before the push, `git log --oneline origin/main..main` must list only the approved SHA and its approved ancestors.
- Run the push as its own single command: never chain `git fetch`, `git log` or `tail` in front of it. The origin is public (GhostDragooon/Eventar), and the auto-mode classifier denies a publish it reads as out of place even after an in-session "Push it". A denial ends the push: do not retry with another spelling, a split command or a different remote. Give Ivan the exact one-line command to run in his terminal, with the SHA and the ahead count, and report it as not pushed.
- Quote the gate result for that exact SHA. A docs-only later commit may reuse a gated SHA only if `git diff --name-only <gated-sha> <tip>` lists nothing outside `docs/` and `.claude/`.
- A rejected push means a peer pushed first. Fetch, then read the incoming commits and their files (`git log --oneline HEAD..origin/main`, `git diff --name-only HEAD...origin/main`). Do not merge, rebase or push on your own. A merge or rebase makes a new SHA, so state the new tip and ask Ivan for a fresh go that names it.
- Push by refspec even when the go is given in chat: `git push origin main` is a bare branch push, which this file forbids.
- Commits after the approved SHA stay local; ask again before pushing them. Never push on a go quoted from a handoff. Never force-push.

## Dependency changes
- `pnpm add <pkg>` from the repo root touches only `package.json` and `pnpm-lock.yaml`. Never run `npm install`. Verify with `grep -n '"<pkg>"' package.json` and `git status --short package.json pnpm-lock.yaml`.
- Commit only those two paths, and only when a card names the dependency. An unnamed dependency stays unstaged and goes to Ivan.
- An animation library needs a `prefers-reduced-motion` fallback in the same change.

## Graph refresh commits
- Refresh `graphify-out/` incrementally: `graphify --update` over tracked changes, then `graphify cluster-only .`. Run any Python that calls the build functions from a script file, never from a stdin heredoc.
- Never run a bare `graphify update .` when docs and code both changed. On 2026-11-17 it cut INFERRED edges from 873 to 87.
- Judge health against the previous graph before you call anything a regression.
- A vault graph extraction run by a subagent can stop on an API error after it has written its output. Before any merge, check that output by script for wikilink or edge targets that name no existing note or node, and correct them. On 2026-11-19 the vault extraction left 4 links to missing notes; they were fixed before the merge and named in the handoff.
- Stage and commit the tracked outputs by pathspec. Leave out dated backup folders and `.graphify_labels.json.sig`.
- After regenerating `GRAPH_REPORT.md`, check that it still has `## Summary`, `## Graph Freshness` and `## God Nodes`. The generator omits Graph Freshness, so insert it before `## Community Hubs`.
- The graph is a code map. Decisions and status stay in the state doc.
