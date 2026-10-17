# UI-port hold, 2026-10-14

- Sweep: `2a64e18` (2026-08-30, 13 categories). The shadcn toggle pair and `lib/ui-port/foundation-contract.ts` predate it.
- Deletion: `48a4d48` on branch `claude/epic-cannon-6eafe9` removed 96 files: 50 source files and 46 test files (68 tests). It was approved as a batch under IS-20261014-14. Ivan then ruled the components a category library and asked for item-by-item rulings. The branch is held, not merged.
- Proposal: `docs/plans/2026-10-14-ui-port-library-proposal.md` (commits `b15a8fe`, `cfed81b`). 50 rows: 35 Keep, 9 Replace, 4 Delete, 2 for Ivan.
- Restore: follow `git-restore-deleted-files`. Use `git checkout 48a4d48^ -- <path>` and check with `git diff --stat`. The sweep commit `2a64e18` brings back older `components/forms/GroupedSelect.tsx` and `components/communications/TeammateInvitationForm.tsx`.
- Restore siblings together, or a restored file fails typecheck: `admin/ManagementTable` (needs `StatusBadge`), `admin/TeamTabs` (`IdentityAvatar`), `admin/UserManagementTable` (both), `forms/CategorySelectionForm` (`MultiSelectCombobox`), `forms/ContactEnquiryForm` (`ConsentCheckbox`), `help/CategorisedFaq` (`FaqAccordion`), `ui/toggle-group` (`ui/toggle`).
- Backtest recorded: all 96 restored into a scratch copy of the post-deletion tree passed tsc and their 68 tests.
- Dev preview: a peer session gated `app/dev-preview-uiport` in production (`de08711`) instead of deleting it. The proposal does not depend on it.
