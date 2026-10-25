assistant Bash: "export GIT_LITERAL_PATHSPECS=1; git add -A -- .claude/skills && git diff --cached --name-only | grep -v '^\.claude/skills/'; git commit -q -m \"chore(skills): autoharness notes from the session-pause and Node patch work\" -- .claude/skills"

tool result (before the commit, prior status): " M .claude/skills/design-decision-specimen-round/.ledger.jsonl
 M .claude/skills/design-decision-specimen-round/SKILL.md
?? .claude/skills/design-decision-specimen-round/references/evidence-5cf19511.md
?? .claude/skills/parallel-session-card-claim/"