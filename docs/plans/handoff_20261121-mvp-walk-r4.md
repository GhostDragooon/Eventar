# Handoff 2026-11-21: MVP acceptance walk r4, consent copy reword

Prior handoffs: `handoff_20261121-coherence-batches-3-5-close.md`, `handoff_20261114-mvp-close.md`. Evidence: `docs/plans/mvp/REVIEW-FINAL-summary-r4.md` plus three lens files.

## §0 Ivan's action list

**STATUS 2026-11-21:** committed, not pushed. Code and review files: `3eba63a`. Tree sync: `354921c`, `70bc97e`, `6d8c710`. Handoff, state and graph commit follows.

**Decide (recommendation first)**
1. **F1: DB window gate on `speaker_checkins`.** Today only the Server Action refuses; a direct INSERT by any org member succeeds before the window. Recommend yes: one migration like the attendee gate, plus one test.
2. **Consent wording.** The reword says the full terms and privacy policy "are not published yet". Recommend: send it to the solicitor with the legal list in `docs/legal/README.md`. The strings `tos-0.1-draft` and `pp-0.2-draft` are not bumped.
3. **Push.** Four local commits on `main`. Recommend push after you read the consent copy frames.
4. **Role-gated UI leaks** (`body_admin` and `auditor` see a dead-end "New event" link, bulk Delete with the wrong refusal reason, an enabled "Edit event" link). Recommend a frontend card with before and after renders.
5. **Deploy** stays PAUSED. Needs your explicit go.

**Execute (only you):** nothing blocks Claude. Push needs your go.

**Queued for Claude**
1. Registrants CSV header says `Asia/Hong_Kong` but the times are UTC. Greyed Register gives no reason for an empty or whitespace name.
2. Stale red "Name required" after a whitespace-only attempt (unresolved; reproduce first).
3. Walk gaps: phone bottom pill, dark theme, a practitioner check-in inside the 60-minute window, the member's real create form.
4. `check:ui-primitives` 4 old hits: `ProfileClient.tsx:510`, `OrgOnboardingClient.tsx:120` and `:142`, `MultiBodyAccreditationWizard.tsx:245`.

**Other sessions:** peers "pick up from handoff and continue" and "Batch 2 radii" were idle. Their files were committed under your "commit them all" instruction: `.claude/skills/` (191 paths, including deletions of `eventar-add-dependency`, `eventar-commit-card-groups`, `eventar-gate-behaviour-sweep`, `eventar-graph-refresh`, which `git show 354921c^:` restores), `graphify-out/` output and caches, `GATES.md`.

---

## What happened

- Preflight clean: no product path modified. Gates on `1a7d2bf`: tsc 0; eslint 0 errors, 11 warnings; `check:ui-colours` pass; `check:ui-units` 152 (baseline 156); `check:ui-primitives` 4 old hits; `test:rls` 564 + 57; full vitest 2925 of 2925, exit 0; `next build` 0.
- :3100 ran with review mode ON (signed-out `/events/new` gave 200), held by a server I had not started. With your go I stopped it and restarted under `eventar-noreview`.
- Three lenses, one after another (shared cookie jar): organiser, practitioner, roles. No BLOCKER, no new MAJOR. The organiser lens hit the usage limit and was resumed.
- M1 re-run by me: `/terms`, `/privacy`, `/legal/terms`, `/legal/privacy` all 404. Reworded on your ruling; before and after frames sent.
- Lens fixtures: all counts 0; `audit_events` residue stays (Hard Rule 11).

## Gate chain after the reword

`vitest run app/account/complete` 38 of 38; `tsc` 0; eslint clean on touched files. The full chain was NOT re-run after the copy edit (the change is two strings, a test and a comment).

## Graph notes

- Repo graph: code-only AST refresh. The merge would have shrunk the graph by 115 nodes (106 dedup, 8 pruned for deleted files), so the shrink guard refused the write. I did not force it. `graph.json` keeps 11255 nodes and was re-clustered with `graphify cluster-only .`. The semantic pass for about 848 changed docs is still pending.
- Vault graph: merged the new note with `build_merge`, 920 to 921 nodes, curated edges kept (1585 to 1587), then `cluster-only`. Recent roadmap notes (MVP Close r3, coherence notes) are still absent from the vault graph.

Closing: repo graph done (2026-11-21) · vault note done (/Users/ivan/Desktop/Eventar/20 — Roadmap/MVP Acceptance Walk r4 + Consent Copy Reword (2026-11-21).md) · vault graph done (2026-11-21)
