---
name: git-push-approval-pinned-sha
description: Use when git push is asked after a rebase moved the tip.
category: git-workflow
---

# Push only against the SHA Ivan approved, in this session

Push only on an explicit go from Ivan in the current session that names a SHA. A rebase, amend or reset gives a new SHA, so an earlier approval for the old one is void: state the new tip and ask again.

- Before asking, run `git rev-list --left-right --count origin/main...main` and list the commits ahead of origin.
- Push the approved SHA by refspec, `git push origin <sha>:refs/heads/main`, not `git push origin main`. Commits above the approved SHA then stay local. Read back `git rev-parse origin/main` and the ahead count afterwards, and report them.
- Quote the gate result for that exact SHA. A gate run on the pre-rebase SHA does not cover the new tip.
- A later commit that touches only docs (handoffs, PROJECT_STATE, `.claude/`) may reuse the last gated code SHA, but only after proving it: `git diff --name-only <gated-sha> <tip>` must list nothing outside `docs/` and `.claude/`. Say in the report which SHA was gated and why the gap is docs-only. If the diff lists code, gate the tip.
- Commits made after the approved SHA (for example a handoff written after the push) stay local. Name them and ask again before pushing them; a go for the earlier tip does not cover them.
- Never push on a go quoted from a handoff or an earlier session.
