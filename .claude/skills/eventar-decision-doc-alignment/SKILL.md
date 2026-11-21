---
name: eventar-decision-doc-alignment
description: Use when Ivan logs a decision or deferral in Eventar docs.
category: documentation
---

# Eventar: one decision lands in every live doc in one pass, labelled with its true status

Write a decision to every live document in the same run, and label it exactly as Ivan labelled it. "Direction, not locked" stays "direction, not locked" everywhere. A cold reader must never mistake a direction for a built fact or a locked rule.

## Pass order

1. **Status label first.** Quote Ivan's wording. If he said "not carved in stone", write DIRECTION, not locked. `docs/plans/STAGES.md` stays the stage authority until he decides. Do not renumber stages on a direction. A decision and its deployment are two labels: write `DECIDED (built locally; not applied to the hosted DB)` when the code exists but no hosted push has happened. Quote Ivan's phrase exactly (e.g. "Start Decide 0") and name the recommendation it accepted. Mark the matching decision-list item in the map doc DECIDED with a link to the new entry, and keep the item text.
2. **Strategy doc** (`docs/plans/<date>-<slug>.md`): open questions in one section, breakers in another. Each breaker is marked Fixed, Deferred, or Open.
3. **Vault Decisions Log** (`/Users/ivan/Desktop/Eventar/02 — Decisions Log.md`): take the next free Q number from `grep -n "^## Q"`. A Q number written into a draft before this grep is a guess. The B9 draft said Q41 on 2026-08-29; by 2026-11-16 Q41 was the Core-UX round and the highest entry was Q52. Re-run the grep before pasting any draft. Do not put a `|` alias inside a wiki link written through a shell heredoc.
4. **Vault Index** (`00 — Index.md`): one callout above the newest one.
5. **PROJECT_STATE.md**: one dated top entry. Name what is built, what is not, and "Not committed" if so.
6. **DEFERRED.md**: every item Ivan waves off ("not an issue at this stage") becomes a row with the decision, a re-entry trigger, and the stage it waits for. Bump the `_Last updated:_` line. Never drop a flagged item because Ivan deferred it. "Flag X as to do" or "finish it later" is a deferral: the row carries the trigger, and the handoff §0 carries the action. It does not close anything.
7a. **Closure needs Ivan's ruling, not his agreement to a step.** "Sure" to a sign-off step, followed by "finish the MVP first", means the milestone stays open. Write "NOT closed" in PROJECT_STATE and name what remains.
7. **BLOCK-ARCHITECTURE.md**: annotate affected block rows. Do not change their shipped status.
8. **Verify before writing.** Migration names, commit hashes and file paths come from `ls` or `git log`, not memory.
9. **Cold read.** After the edits, dispatch a reader-lens review with a `Budget:` line (see `subagent-dispatch`). It checks for locked-vs-built misreads and retired vocabulary: M1–M4, Sprint, Milestone, Phase 7/8/9.
10. **Sweep state words after every landing.** After a commit, push or hosted migration apply, grep the live docs for `uncommitted`, `not committed`, `Seoul untouched`, `not applied`, `local only`, `locally only`, `Seoul awaits`, `not on Seoul` and `still open`. Fix every hit in the same pass. Wording left from before the change is a false status. When a hosted apply lands, rewrite the item 1 label in the same pass, from `built locally; not applied` to `applied to <host> <date>`, in every doc that carried it. The vault (`/Users/ivan/Desktop/Eventar`) sits outside the repo's git, so `git commit` never carries its edits. Name the vault edits separately in the hand-back, and list them as not committed.
11. **An external fact Ivan reports is his report, not a verification.** A terse "yup" to "is X ON in the dashboard?" answers about a system Claude cannot see. Write "ON (Ivan, dashboard, YYYY-MM-DD)", never "verified", and keep any linked question open until Ivan answers it in full sentences.

12. **A frontend pick lands on PICKS.md in the same turn.** When Ivan picks keep, replace or sheet for a surface, write the pick line to `docs/plans/mvp/PICKS.md` and rewrite any stale reason on that surface (for example a line still saying "NOT built" after he kept the popover). Name the file as uncommitted if it is.

Do not commit or push. Ivan decides both.

Worked example, Q48 breakers: references/q48-alignment-example.md
