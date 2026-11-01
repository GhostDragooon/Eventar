## Heads-up

My earlier "push main up to f327dfd" is void, because the rebase rewrote that commit. Pushing would publish a tip whose gate already fails on `origin/main`, though my commits add no new failures. When you want to push, say "push main up to 240a8fa".