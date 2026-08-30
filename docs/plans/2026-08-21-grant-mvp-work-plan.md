# Work plan — grant-MVP week of 2026-08-21

**Goal (archived).** Close the highest-leverage gaps between repo state and a defensible
grant / pilot story: real rule content behind the credit path, an evidence export an
organiser can hand over, an explicit sufficiency contract for dwell, and a pilot
deploy that does not depend on the dev email stub.

**Source documents, archived verbatim** (uploaded 2026-08-21, kept unedited per
`STAGES.md` rule 3 — historical records keep their own wording):

- `docs/plans/2026-08-21-source-week-todo.txt`
- `docs/plans/2026-08-21-source-presence-architecture.txt`

> **Terminology.** The source documents use their own `P0–P3` priority labels and a
> `Layer 0–4` analytics ladder. **Those labels are not adopted into this repo.**
> `STAGES.md` is the authority: roadmap vocabulary is Stage 1–13, sub-work is a
> numbered task (`Task 10.4/10.9`). Every item below already had a repo name before
> the documents arrived; the mapping is in the next section. Do not reintroduce
> `P0`/`P1`/`P2`/`P3` as a fifth naming axis — four retired ones (M1–M4, Sprint 0–5,
> Milestone A–E, Phase 7/8/9) stayed alive for a month precisely this way.

## Mapping — uploaded label → existing repo task

| Uploaded label | Repo task (pre-existing name) | Authority |
|---|---|---|
| P0 — rules content path | **Task 10.4/10.9 — Rule packs in `category_taxonomy`** | `~/.claude/plans/target-product-for-2026-proud-castle.md` |
| P1 — sufficiency gate contract | **Task 10.5/10.9 — Proration + check-out** | same (nearest existing home; dwell is a variant of `minutes_attended`) |
| P2 — evidence export v0 | **Task 10.7/10.9 — College → Academy export** | same |
| P3 — pilot infra | **Stage 8** (Resend / cron trigger / Turnstile / error tracking) | `STAGES.md`; `CLAUDE.md` "Phases 7–8 fold into Stage 8" |

Nothing here is a new stage or a renumber. Task 10.4 and 10.7 are already the named
homes; the `role_mappings` population is explicitly Task 10.4/10.9 per
`docs/DEFERRED.md:80`.

## Verified starting state (checked against code, not against docs)

| Claim in the uploaded goal | What is actually true |
|---|---|
| "Rules engine has code but no rule content" | Correct at body level: HKCP's `cycle_config` **and** `category_taxonomy` are both literal placeholder JSON (`{"_note": "provisional — per-College rule pack lands in Task 4"}`, `20260813000000_seed_hkam_colleges_and_mchk.sql:37`). |
| "…so the credit path is decorative" | **Not correct.** `award_attendance_credit` posts real `credit_ledger` rows today for wizard-configured events. What is empty is body-published rule content, not the engine. |
| "No evidence export" | Correct. Only `ExportRegistrantsButton.tsx` (registrant CSV) and `ExportAnalyticsCsv.tsx` exist. Neither emits ledger rows, licence references, or pack identity. |
| "Presence/dwell is a stub contract only" | Understated — **there is no stub**. `dwell`, `presence_samples`, `attendance_summary`, `evidence_tier`, `sufficiency`: zero occurrences repo-wide. Task 10.5 is greenfield. |
| "Pilot infra incomplete" | Correct. `app/api/cron/dispatch/route.ts:26` states in its own header "⚠️ THERE IS CURRENTLY NO TRIGGER." No Turnstile, no error tracking, `RESEND_API_KEY` unset (all sends stubbed). |

### Three findings the uploaded goal did not account for

1. **The pack hash it assumes has no column.** Task 10.4's own spec says the award
   function "snapshots the result plus a pack hash as values"; ADR-0002 R1 step 5
   says the same. **Neither is implemented** — `credit_ledger` has no such column and
   the strings `pack_hash` / `taxonomy_hash` appear nowhere in the codebase. Adding one
   touches the append-only hash-chained ledger, which is doctrine **D.1**, still open.
   Resolved by Decision 2 below.
2. **Task 10.8's C5 wizard shipped a silent-zero-credit path.** Verified producer and
   consumer: the wizard writes a free-text category
   (`MultiBodyAccreditationWizard.tsx:80`); with `category_code IS NOT NULL` the engine
   maps roles through `category_taxonomy->'role_mappings'` and, finding nothing (no body
   populates that key), returns `skipped:no_role_match` and posts nothing
   (`20260815030000_multi_body_award_engine.sql:220-236`); the check-in action calls
   `await awardAttendanceCredit(...)` and **discards the return value**
   (`app/events/[id]/checkin/actions.ts:69`). An organiser who fills in the category box
   gets zero credit for every attendee, with no signal anywhere but the server console.
   This is a rule-12 violation ("fail visibly, not silently") and it gets **more** likely
   the moment Task 10.4 seeds real mappings. Fixed as Step 2 below, ahead of the seed.
3. **`role_award_rule` is specified and unenforced — UPDATED 2026-08-22, was "unbuilt."**
   ADR-0002 R1 requires a per-body `role_award_rule` (`highest_only` / `cumulative` /
   `manual_selection`) with unresolved ties failing closed. Originally recorded as "zero
   occurrences in the repo" — that was true when written and stopped being true once the
   divergence merge landed `20260820090000_seed_hkcp_mchk_role_mappings.sql`, which writes
   `role_award_rule: 'highest_only'` for HKCP and MCHK. **The value exists now; the
   enforcement still does not** — grepped the full award engine, zero reads of the key
   anywhere outside that migration. That seed avoids exposing the gap by construction
   (every role maps to one category, so no tie is reachable for those two bodies), which
   means the missing enforcement is currently invisible rather than absent. Any pack
   mapping roles to *different* categories (chair → one category, attendee → another) hits
   this immediately — so the seeded pack stays single-role this week, and multi-role stays
   deferred with the gap named, same conclusion as before, corrected reasoning.

## Decisions taken 2026-08-21 (Ivan)

> ⚠️ These are four new decisions. Per `CLAUDE.md` they need flagging rather than silent
> adoption — **none is in the vault Decisions Log yet.** See "Open, needs Ivan" below.

**Decision 1 — HKCP pack sourced provisionally from public web sources.**
The HKCP manual is still missing (`PROJECT_STATE.md:419` records the sourcing item as
open). Rather than block the week, the pack is seeded from what HKCP publishes openly,
every number carrying its source URL and fetch date in the citation field Task 10.4
already requires, flagged `provisional: true` and surfaced to organisers as
staff-seeded, not body-confirmed. This matches Task 10.4's existing posture verbatim:
"Packs are provisional until a body signs off." Replaced by the real manual when it
arrives; `confirm_credit_entry()` (Q38/Q39) remains the correction path for anything
already posted.

**Decision 2 — the pack hash is computed at export time; no `credit_ledger` column.**
The evidence export hashes the taxonomy content it read and prints it alongside the
ledger rows. The ledger is untouched, so **doctrine D.1 stays genuinely open** rather
than being decided as a side effect of a week's work.

> **This amends Task 10.4/10.9's written spec**, which says the award function snapshots
> "the result plus a pack hash as values". It does not; after this decision it still
> does not. Accepted trade-off, stated plainly: **a `credit_ledger` row on its own cannot
> identify which pack version produced it** — only an export generated while that
> taxonomy was live carries that link. Input reproducibility, not verdict
> reproducibility. Revisit when D.1 is decided.

**Decision 3 — `min_dwell_ratio` (α) is a column on `event_accreditation_groups`.**
Nullable `numeric` with a `CHECK` constraint on the 0.50–0.75 band and a documented
0.60 default, per-event-per-body exactly as the presence record specifies. Chosen over a
`category_taxonomy` jsonb key because a numeric range cannot be `CHECK`-constrained
inside jsonb — this keeps three-layer validation (form → Zod → DB constraint, Hard Rule 8)
intact, and the C5 wizard already edits that table. Body-level defaults are **not** built
this week.

**Decision 4 — Task 10.8's C5 work is committed before any new code lands.**
The working tree holds 86 uncommitted paths: the reviewed C5 multi-body work plus an
unreviewed in-flight UI port from a concurrent session. C5 commits alone, so this week's
migrations land on a known base rather than compounding an already-tangled diff.

**Decision 5 — the α gate ships restricted to staff-scan check-in.**
Task 10.5's spec requires the venue-scan spec (`docs/plans/2026-08-06-venue-scan-checkin-spec.md`)
to ship *with* proration, because making presence a computed value pushes organisers
toward self-serve check-in — and `self_check_in` has **no location check** (DEFERRED 74),
contained only by `checkin_modes.self_serve` defaulting false. Rather than expand the week
to close that, the α gate applies **only where the check-in arrived through a staff scan**.
`self_serve` stays off; **DEFERRED 74 stays open and is not silently absorbed**. The
restriction is a stated limitation of this week's build, written into the code comment and
the pilot runbook — not a discovery for a pilot to make.

**Decision 6 — dwell/sufficiency stays inside Task 10.5/10.9; no new task number.**
Dwell is treated as a variant of `minutes_attended`, already Task 10.5's subject. Stage 10's
denominator stays `/10.9`; no reference sweep. Considered and declined: splitting presence
out as Task 10.10/10.10, which would force a sweep of every live `10.N/10.9` reference
(the repo has done exactly that once, 10.7 → 10.9 — a documented operation, not a rename).

**Decision 7 — the implementing agent touches repo working docs only.**
No vault writes, no `docs/adr/0003-*`. The four decisions above stay unlogged in the vault
Decisions Log until Ivan writes them himself; the ADR question for the presence record stays
open. Canonical decision records remain entirely in Ivan's hands.

**Decision 8 — CPD hours is prefilled from event duration, not derived from it.**
Ivan's request, relayed 2026-08-21 via the UI-port session: "CPD hour is how long the event
is (for now)." **Prefill, not derivation.** The hours field defaults to
`end_time - start_time` when the organiser opens an unset field; they can override it.
Considered and declined: making `cpd_hours` a computed value, which was investigated and
found to carry three concrete costs — (a) the compatibility bridge writes
`event_accreditations.credit_value = p_cpd_hours` (`20260821000000:140`), so deriving it
means deriving an **awarded credit value from wall-clock time**, the same class of inference
ADR-0002:86 forbids for `award_scheme`; (b) the freeze trigger
(`20260725073250:17-20`) raises when `cpd_hours` changes once any credit exists, so derived
hours would mean **organisers can no longer fix a typo'd end time after the first
check-in** — a failure mode that does not exist today; (c) `cpdActions.ts:30` caps hours at
`max(24)`, which a multi-day congress breaks immediately — and the ICI Summit is decision
D-A's own justification for multi-body existing at all.

> **Prefill constraints, non-negotiable.** It applies **only to an unset field** — an event
> with a saved `cpd_hours` shows the saved value, never a recomputed one, or reopening an
> edit page silently rewrites a deliberate number. If the duration exceeds 24h the field is
> left **blank**, not prefilled with a value that fails its own validation. Prefill must not
> fight the `frozen` lock when credits are already issued.

**Decision 9 — the multi-body wizard is wired into `/events/[id]/edit`.**
The wizard is currently mounted only on `/events/[id]/details`; `CpdAccreditationSection`
merely mentions it in a comment. Edit gets parity. This subsumes a live defect found while
investigating: `app/events/[id]/edit/page.tsx:150` renders `CpdAccreditationSection`
**without `multiBodyConfigured`** (which defaults false), so on a wizard-configured event the
edit page shows the legacy single-body field unlocked and prefilled with stale pre-wizard
values, and its status line reads "Accredited" rather than "Accredited (multiple bodies)" —
the same defect the C5 review fixed on details, fixed at one caller only. Not data
corruption: `set_event_cpd_config`'s guard raises `42501 / multi_body_configured` on submit,
so it fails closed. It is a UI that misstates accreditation state and then errors.

`/events/new` stays single-body. Wiring the wizard into create is **blocked on an
architecture decision, not a wiring job**: there is no event id at submit time, so
accreditation groups cannot be created before the event exists — it needs either a two-phase
save or a deferred-groups payload. Not decided, not scheduled.

> **Ownership.** Decisions 8 and 9 are **frontend, and assigned to the UI-port session
> (`eventar-d7`)**, not to this plan's Steps 2–7. C5's original session (`eventar-0a`) is
> gone and owns nothing. Footprints are disjoint by agreement: the UI-port session holds
> `CpdAccreditationSection.tsx`, `MultiBodyAccreditationWizard.tsx`, `NewEventForm.tsx`,
> `app/events/[id]/edit/page.tsx`; this plan's agent holds
> `app/events/[id]/checkin/actions.ts`, `app/(public)/checkin/confirm/actions.ts`, the
> check-in roster surfaces, and migrations.

## Sequence

Dependencies are real between steps 1→3→5; steps 6 and 7 are independent and can run in
any gap.

**Step 1 — Commit Task 10.8 C5 (Decision 4).**
Separate the reviewed C5 multi-body work from the unreviewed UI-port changes and commit
C5 alone. Gates were green at the 2026-08-21 review (tsc clean · eslint clean · RLS
201/201 · vitest 753 passed / 238 skipped · replay-from-zero PASS · 114 migrations) —
re-run before committing, on a replayed database, because the tree has moved since.
*Done when:* C5 is committed, the UI port is still uncommitted and untouched, gates green.

**Step 2 — Surface per-body award outcomes at check-in (finding 2). PARTIALLY DONE,
DISCOVERED ON MERGE 2026-08-22 — see the dated PROJECT_STATE.md entry.**
`origin/main` already fixed the **staff** check-in path before this plan existed:
`7ab2cfd` threads `awardAttendanceCredit`'s outcome through `checkin/actions.ts`,
`3a19b07` renders it on the roster toast (`res.credit?.lines`, `allSkipped`), `00cfc77`
tests it. **Remaining, unfixed anywhere:** `app/(public)/checkin/confirm/actions.ts:40`
(the public self-confirm path) still discards the return value — verified by grep across
all 15 merged commits, zero hits on that file. *Done when:* a self-confirming attendee
whose category-coded group has no mapping is shown that no credit posted, without
exposing the engine's internal skip reason or any other attendee's data — decide the
attendee-appropriate wording, it is not the same audience as staff.

**Step 3 — Task 10.4/10.9: seed one provisional HKCP pack. PARTIALLY DONE, DOES NOT
SATISFY DECISION 1 — remains open.**
`origin/main`'s `f751e62` (`20260820090000_seed_hkcp_mchk_role_mappings.sql`) already
seeded `role_mappings` for HKCP and MCHK — attendee/chair/presenter all map to a single
category (`'A'` / `'passive'`), plus a `role_award_rule: 'highest_only'` value. Its own
header is explicit about its status: *"Provisional data only — not Task 10.4's full rule
packs… safe to overwrite later when sourced packs land."* No `source_url`, no
`fetched_at`, no `cycle_config`, no real point table — **Decision 1's fetch-and-cite
requirement is not met**, and the migration says so itself. **New finding on read:**
`role_award_rule` is written as data but **consumed nowhere** — grepped the full engine,
zero hits outside this migration and its own rollback comment. The seed sidesteps the gap
by construction (every role maps to the same category, so the tie case in finding 3 below
never arises for these two bodies specifically), but the field is inert, not enforced.
Remaining work: replace the placeholder mapping with a real, sourced HKCP category table
(role→category **and** the point/hour values per category, `cycle_config`), each value
carrying `source_url` + `fetched_at`, object carrying `provisional: true` — the schema
Decision 1 specifies, which this seed does not use. Keyed as the award engine already
reads it (`category_taxonomy->'role_mappings'->>role_code` — live, load-bearing, ratified
by Q39). Attendee role only this week (finding 3 — still true: the enforcement gap is
real even though this particular seed doesn't expose it). Migration follows repo doctrine:
self-verifying assertions that prove the seed landed, never reading it back from migration
text — match `20260820090000`'s own pattern of asserting the value it just wrote via a
fresh `select`. *Done when:* a check-in at an HKCP-accredited event with a category-coded
group resolves through a **sourced** mapping and posts a real `credit_ledger` row, and the
pack's provenance is inspectable, not just its presence.

**Step 4 — Task 10.4/10.9: the provisional badge.**
Surface `provisional: true` wherever the pack's numbers are shown to an organiser. No new
UI surface — a badge on the existing accreditation display. Copy states staff-seeded, not
body-confirmed.

**Step 5 — Task 10.5/10.9: the sufficiency contract, with dwell stubbed.**
Add `min_dwell_ratio` per Decision 3 and gate the award on it: for a group with a
non-null α, credit requires a valid check-in **and** `dwell_seconds >= α × T`, where T is
the scheduled occurrence duration. Groups with a null α behave exactly as today — this is
what keeps the ordinary-event pathway (D-E) untouched. Dwell is supplied by test fixtures
only; no sensor client, no `presence_samples` table this week. Tests assert: below α → no
credit; at or above α with a verified licence → credit posted; α set but dwell absent →
fails closed, nothing posted, reason visible.

> ⚠️ **Prerequisite, resolved by Decision 5 — read before touching this step.** Task 10.5's
> own spec requires the venue-scan spec to ship *with* proration, because presence-as-a-computed-value
> pushes organisers toward self-serve check-in, and `self_check_in` has **no location check**
> (DEFERRED 74). **Resolution: α applies only to staff-scan check-ins this week.**
> `checkin_modes.self_serve` stays false, DEFERRED 74 **stays open** — not absorbed, not
> closed by implication — and the restriction is written into the code comment and the pilot
> runbook. Anyone widening α to self-serve check-in must close DEFERRED 74 first.

**Step 6 — Task 10.7/10.9: evidence export v0 — REVISED 2026-08-22 around the
existing `evidence/` track, per Ivan's ruling that it supersedes the original plan below.**

> **What changed and why.** The original Step 6 (an ad-hoc CSV+JSON built fresh from
> `credit_ledger`) was written without knowing 11 commits already existed on
> `origin/main` building `skills/eventar-evidence/` + `evidence/` — a Q1/Q2/Q3
> falsifiable-claims evidence-package architecture ("Eventar transfers evidence, not
> trust"; three permanently separate questions: was the activity approved, did the
> practitioner complete it, did the receiving institution accept it — Q3 only ever
> reported when independently confirmed, never inferred). Discovered and read in full
> after the divergence merge (see the dated PROJECT_STATE.md entry). **Investigated,
> not assumed:** `evidence/src/agents/participationAgent.ts` (Q2, the credit-ledger
> piece) contains **zero LLM calls** — grepped for `anthropic|claude|llm|generateText` —
> it is plain deterministic TypeScript despite "agent" in its name and its SKILL.md
> description. Only Q1 (`eventar-accreditation`) and Q3 (`eventar-submission`) are real
> subagent-dispatch seams, and both are already labelled "specified seams only" by the
> skill's own "Honest limits" section — nothing here asks this plan to wire an LLM call
> into a live request path.

**Scope this week: wire Q2 for real, ship it as a staff-triggered feature, leave Q1/Q3
exactly as unwired as their own docs already say.**

1. Implement `SupabaseParticipationSource` in `evidence/src/ledger/participationSource.ts`
   (currently a commented-out stub that throws `'wire to live schema'`) — read
   `credit_ledger` for the event, join `practitioner_licences`, and set `chain_verified`
   from `verify_ledger_chain()` (`20260709260000_credit_ledger_hardening.sql:73`,
   `service_role`-only — confirmed live). **Never compute the hash chain result inside
   the evidence code** — the seam's own comment says so, and it matches this repo's
   general rule that ledger integrity is deterministic code, never model output.
2. `rule_version` (the seam's placeholder for "which pack was in force") **is Decision
   2's export-time pack hash, not a second concept.** The seam's own comment already
   anticipates this: *"Until a real rule_version column exists, return null for
   frozen_rule_version when config is not frozen."* Feed it the taxonomy hash computed
   at export time. No new column, no new field — one existing decision satisfies both.
3. Call `orchestrateParticipation` (`evidence/src/orchestrator.ts`) from a real staff
   Server Action on the event-details page. The returned `evidence-claims.json` **is**
   the JSON deliverable — do not re-invent a JSON shape.
4. The CSV stays a **separate, flattened projection** built directly from
   `credit_ledger` — Task 10.7's own spec wants columns "shaped for the Academy
   Education Committee submission," which is a different, more tabular need than a
   claims array with nested `depends_on`/`evidence_refs`. Do not force the CSV out of
   the claims JSON; the two artefacts answer different questions for different readers.
5. Multi-body alignment already works with no extra code: C4's award engine posts one
   `credit_ledger` row per body per practitioner, so `orchestrateParticipation` iterating
   ledger entries already yields one Q2 claim per (licence, body) — matching
   SKILL.md §2's own multi-body note for Q1, without having built Q1.
6. **Fold in** Task 10.7's own noted prerequisite: registration codes still carry a `WK-`
   (workshop) prefix (DEFERRED 51), visible on every export — fix before anything reaches
   a College.

> **Found, not fixed — name it, don't fix it.** `evidence/src/types.ts` declares a fourth
> `PackageType`, `'participation_only'` (what the orchestrator actually defaults to and
> what both sample outputs use), that `SKILL.md`'s own orchestration layer never lists
> among its three types (`activity_accreditation` / `verified_participation` /
> `structured_submission`). Pre-existing drift inside the evidence track itself, not
> introduced by this plan. Out of scope to resolve here.

*Done when:* one dry run seeds an event, checks a practitioner in, posts a real credit
row, calls the real `orchestrateParticipation` against the live local stack (not the mock
source), and the resulting claims JSON plus the flattened CSV both open cleanly and
reconcile against the database — `chain_verified` must trace to an actual
`verify_ledger_chain()` call, not a mock value.

**Step 7 — Stage 8: pilot infra (independent, run in parallel).**
Confirm the Resend path (real key + verified domain, or document the sandbox limits);
choose and wire a trigger for `/api/cron/dispatch` — the endpoint is trigger-agnostic by
design, so pg_cron, a Vercel entry, or documented manual dispatch all satisfy it, but
deploying with none ships a dead scheduler that fails silently; Turnstile on public
registration if the pilot URL is public; basic error tracking. *Done when:* a dress
rehearsal runs without the dev email stub, with a written runbook.

**Close of week.** A short written note: what a funder demo shows in the product today
versus what remains slides-only.

## Out of scope this week (from the uploaded goal, unchanged)

RAG pipeline and association document upload UI · production BLE and geo client ·
KMS certificates (Stage 11) · versioned `body_rules` evaluator (Q26 / Stage 13) ·
analytics beyond the export's own fields · multi-role award resolution
(`role_award_rule`, finding 3) · body-level α defaults · PDF evidence pack.

The presence architecture stays **design-locked and unbuilt** — that is the intended
state, not a gap.

## Open, needs Ivan

1. **The nine decisions above are not in the vault Decisions Log.** They belong there as a
   Q-entry — Decision 2 in particular, because it amends a written task spec and takes a
   position adjacent to doctrine D.1. **Ivan writes this himself** (Decision 7); no agent
   drafts it.
2. **Does the presence record become ADR-0003?** `docs/plans/2026-08-21-source-presence-architecture.txt`
   describes itself as locked product direction, which is ADR-shaped. Ratifying someone's
   design record as repo architecture is a decision, not a filing action — **still open, and
   explicitly off the implementing agent's plate** (Decision 7).
3. ~~Does the dwell work get its own task number?~~ **Resolved 2026-08-21 by Decision 6** —
   it stays inside Task 10.5/10.9.
4. **DEFERRED 74 (`self_check_in` has no location check) stays open** and is now load-bearing
   for a *second* reason: it is what bounds α to staff-scan check-ins (Decision 5). Closing it
   is the precondition for self-serve dwell, and the venue-scan spec is the build.
5. **NEW 2026-08-22 — is `evidence/`'s Q1/Q3 subagent-dispatch model meant to become a live
   request path, ever?** Its own docs call it "Build-time authoring scaffold… not the Vercel
   or Supabase request path" and this plan takes that at face value for Q2 (wired for real,
   Step 6) while leaving Q1/Q3 as documented seams. Whether an organiser-facing accreditation
   narrative (Q1) or submission material (Q3) is meant to ever be generated by a live subagent
   dispatch, or stays a Claude-Code-authoring-time tool run by staff, is a real product/
   architecture question this plan does not answer and was not asked to.
6. **NEW 2026-08-22 — `evidence/src/types.ts`'s fourth `PackageType`.** `'participation_only'`
   is what the orchestrator actually defaults to and both sample outputs use, but it is not
   one of the three types `SKILL.md`'s own orchestration layer lists. Pre-existing drift
   inside the evidence track, found while re-planning Step 6, not introduced by this plan,
   not resolved by it.

## Reconciled 2026-08-22 — local `main` was 15 commits behind `origin/main`

Full account: the dated 2026-08-22 entry in `docs/plans/PROJECT_STATE.md`. In short: this
plan and its first agent dispatch were built against a stale local `main` — 15 commits
existed on GitHub, unpulled, covering the staff half of Step 2, an unsourced partial seed
for Step 3, and the entire `evidence/` track relevant to Step 6. Two agent dispatches were
caught before touching a file. Merged (commit `1183928`, one hand-resolved conflict in
`RosterClient.tsx`, backup ref `backup-pre-merge-2026-08-22`), all five gates re-run and
green against the verified-local stack. Steps 2, 3 and 6 above are revised in place to
reflect what actually exists post-merge — **Decision 4 (commit C5 before new code lands) is
now historical**: C5 committed independently of this plan, before the merge, and the ordering
question it addressed no longer applies.

## Execution

Steps 2–3 are dispatched to a subagent under a self-contained brief:
**`docs/plans/2026-08-21-agent-brief-steps-2-3.md`** — **STALE as of 2026-08-22, needs a
revision pass before its next dispatch:** it was written against the pre-merge state and
still directs the agent to build the staff-side check-in fix (already done, `origin/main`)
and treats Step 3 as fully greenfield (it is now "replace an unsourced placeholder," not
"seed from nothing"). ~~Step 1 (committing C5) is not delegated — separating the reviewed
C5 diff from the concurrent session's unreviewed UI port needs judgement about which hunks
belong to which piece of work.~~ **Resolved 2026-08-22 — moot.** C5 was committed
independently (`97e81b6`) before the merge; the merge itself is done, not delegated, and
the ordering problem this note described no longer exists. Steps 4–5 and the revised Step 6
are dispatched after the revised Steps 2–3 checkpoint reports and Ivan has read it.
