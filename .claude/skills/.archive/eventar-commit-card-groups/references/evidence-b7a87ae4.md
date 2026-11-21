git add -- components/ui/Dialog.tsx components/ui/Dialog.test.tsx components/event-form/PublishConfirmDialog.tsx ... 'app/events/[id]/details/page.tsx' 'app/events/[id]/details/page.test.ts' docs/plans/mvp/UX-03.md && git diff --cached --stat && git diff --cached --name-only | wc -l
ok 25 files changed, 1166 insertions(+), 93 deletions(-)
...
      25
git commit -q -m "feat(publish): confirm before publishing, ..." -- components/ui/Dialog.tsx components/ui/Dialog.test.tsx ... docs/plans/mvp/UX-03.md
Unverified: edc338f has not been compiled on its own. That rests on the one-line diffs and the existing import. I only ran tsc on the final tree.