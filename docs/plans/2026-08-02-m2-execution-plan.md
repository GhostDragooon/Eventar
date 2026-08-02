# M2 remaining work — executable plan (2026-08-02)

_Written for **other agents** to execute task-by-task. Assumes no memory of the sessions that produced Stages 1–3. Everything needed to start is either here or named here._

> **Read before touching anything:** `CLAUDE.md` (13 rules + hard rules) → `docs/plans/PROJECT_STATE.md` → `docs/plans/2026-08-01-m2-frontend-unfreeze.md` (what shipped, and the findings this plan acts on) → `docs/architecture/BLOCK-ARCHITECTURE.md` (fitting rules + admission checklist) → `docs/DEFERRED.md`.
>
> Dispatch style: `superpowers:subagent-driven-development` — fresh implementer per task, independent reviewer per task, controller commits. Use `superpowers:test-driven-development` for every task that has a testable unit.

---

## 0. Current state (verified 2026-08-02, do not re-derive)

| Fact | Value |
|---|---|
| Branch | `main`, pushed to `origin/main` at `c0c7105` |
| Gates | tsc clean · eslint 0 errors (5 pre-existing `devEmailStub` warnings) · **vitest 480 passed \| 120 skipped** · `next build` clean, **19 routes** |
| Migrations | **78** local files; Seoul two-sided; latest `20260802022345_set_event_cpd_config_fn` |
| Shipped this milestone | Stage 1 tokens (`046b21c`) · Stage 2 shell + Stage 3 CPD config (`c291bce`) · patches (`56d5a7f`) · design audit (`c0c7105`) |

**Do not re-investigate these — they are closed:**
- The `NewEventForm.test.tsx` flake is **fixed at root cause** (`c291bce`). It was `findByRole` resolving on element *existence* while the button was `disabled={pending}`. If it reappears, that is a NEW bug.
- CSP is **Report-Only**; it does not block anything. Local dev fires `script-src` / `connect-src` violation reports because `connect-src` lists `https://*.supabase.co` and the local stack is `http://127.0.0.1:54321`. Harmless — but it means **the enforcement cutover (Sprint 3/4) will break local dev** unless localhost is added.
- Both `create_event_with_blocks` and `update_event_with_blocks` are **SECURITY INVOKER**, despite migration `20260725144446`'s comment claiming DEFINER. Trust this table, not that comment.

---

## 1. Environment setup (do this first — several traps here)

### 1.1 Node

The shell defaults to node v14 and will fail confusingly. **Every** command needs:

```bash
export PATH="/Users/ivan/.nvm/versions/node/v24.6.0/bin:$PATH"
```

### 1.2 Which server points at which database — the biggest trap

| Server | Port | Database | Use for |
|---|---|---|---|
| `pnpm dev` / launch config `eventar-dev` | 3000 | **Seoul (live)** via `.env.local` | never for destructive testing |
| launch config `demo-local` | 3100 | local stack | serves `/Users/ivan/Eventar-demo`, a **different checkout** — your edits are NOT there |
| the script in 1.3 | 3200 | local stack | **serves the main checkout — use this** |

`.env.local` points at **Seoul**, so `:3000` is a live-database server. Do not assume "localhost means local".

### 1.3 Verification harness (main checkout against the local stack)

Next 16 enforces **one dev server per directory** — stop any other before starting this, and note `pkill` is blocked by the sandbox classifier, so use `preview_stop` on a server you started.

```bash
#!/usr/bin/env bash
set -euo pipefail
export PATH="/Users/ivan/.nvm/versions/node/v24.6.0/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd /Users/ivan/Eventar
eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
[ -z "${API_URL:-}" ] && { echo "local stack down — run: supabase start" >&2; exit 1; }
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export NEXT_PUBLIC_SITE_URL="http://localhost:3200"
exec pnpm exec next dev -p 3200
```

### 1.4 Signing in as staff (staff routes are auth-gated)

Seeded local accounts (committed fixtures, `*.local.test` — not real credentials):
`demo-staff@local.test` (role `eventar_staff`), `demo-doctor@local.test`, `k.lau@demo.test`.

The login UI is **magic-link**, not password. Flow:
1. POST the email on `/login`.
2. Fetch the link from Mailpit: `curl -s "http://127.0.0.1:54324/api/v1/messages"` → take the message `ID` → `curl -s "http://127.0.0.1:54324/api/v1/message/<ID>"` → regex `https?://[^"'<>\s]+` out of `HTML`.
3. Navigate to that URL (it redirects through `/auth/callback` and sets the session).

### 1.5 psql gotcha

`set_config('request.jwt.claims', …, true)` is **transaction-local** and psql autocommits, so it vanishes before your call. Use session scope inside an explicit transaction:

```sql
begin;
select set_config('request.jwt.claims','{"role":"authenticated","email":"demo-staff@local.test"}',false);
set local role authenticated;
-- ... your test ...
rollback;
```

### 1.6 Browser-automation gotchas

- **Controlled inputs**: setting `.value` does not notify React. Use the native setter then dispatch: `Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true}))`. Same for `HTMLSelectElement` with `change`.
- **Clicking too early** submits the form natively (a GET with fields in the query string) because hydration has not attached handlers. Wait, or drive a form that uses `useActionState` (which works either way).
- **The measurement channel wedges**: `innerHeight` and all `getBoundingClientRect()` can return `0` while the page is fine. Cross-verify with a screenshot before believing a "broken layout". Distinguish instrument from subject.

---

## 2. Stage T — type-scale remediation  ⟵ **Tier 3, NOT first (see §7)**

### 2.1 What it is, and why it is deliberately deferred

**Do not start here.** Under the MVP-ASAP goal this is a 47-file polish sweep: no beta event fails because Text size does not scale. §7 is the authority on ordering. What follows is the analysis, kept ready for when Tier 1 and 2 are done.

`/settings → Text size` (Small / Default / Large) drives `--text-scale`, and every M3 type token is `calc(<px> * var(--text-scale))`. **190 arbitrary `text-[Npx]` values across 47 files are literals and do not scale.** The accessibility control is therefore a broken promise in shipped UI. That makes it real, but not urgent: browser zoom still works, and the cheap interim answer is to hide the control (§7) rather than sweep 47 files.

### 2.2 The trap that makes this non-mechanical

The existing scale has **no 11px or 13px step**, and those are the two most common arbitrary values (38 + 14 occurrences). A naive sweep to the nearest token silently resizes ~52 elements. **Extend the scale first, then sweep.**

Current steps: `display 48 · headline-lg 39 · headline-md 31 · headline-sm 25 · title-lg 20 · body-lg 16 · body-md 14 · label-md 12` (all `* var(--text-scale)`).

Observed arbitrary values, by frequency:
`11(38) 16(35) 18(34) 20(14) 13(14) 12(14) 30(8) 34(7) 26(5) 24(5) 14(4) 15(3) 44(2) 22(2) 56 40 32 28 10`

### 2.3 Tasks

**T1 — Extend the scale.** Add `--text-label-sm: calc(11px * var(--text-scale))` and `--text-body-sm: calc(13px * var(--text-scale))` (plus line-height/weight pairs) in `app/globals.css`'s `@theme` block, matching the existing token shape exactly. No component changes. *Verify:* `pnpm exec next build`; confirm `text-label-sm` / `text-body-sm` utilities resolve in a scratch page or via computed style.

**T2 — Write the mapping table before editing anything.** Produce `docs/plans/typescale-mapping.md`: every distinct arbitrary value → target token → the delta in px at scale 1. **Get Ivan's sign-off on any mapping whose delta ≠ 0** (e.g. 18→20 title-lg is a +2px visible change; 15→14 body-md is −1px). Do not proceed on deltas without approval.

**T3 — Sweep, in reviewable batches.** One commit per area, not one 47-file commit: (a) `components/details/*`, (b) `components/dashboard/*` + `components/analytics/*`, (c) `app/events/**`, (d) `app/(public)/**`, (e) the rest. After each batch: gates + a screenshot diff of one representative page.

**EXCLUDE from the sweep — these must keep literal sizes:**
- `app/(public)/events/[id]/poster/page.tsx` — print surface, light-always `--po-*` tokens by design.
- `emails/**` — email-safe HTML; CSS variables do not work in mail clients. **Never tokenise these.**
- Anything inside a `<style>` block scoped to a route.

**T4 — Prove the setting now works.** With Text size = Large, assert a sampled element's computed `font-size` actually changes on a page from each batch. This is the acceptance test for the whole stage; without it the stage has not delivered its point.

### 2.4 Roadblocks

| Roadblock | Mitigation |
|---|---|
| Responsive prefixes: `sm:text-[56px]` | Sweep must handle prefixed variants, not just bare ones. Grep `(sm:\|md:\|lg:)?text-\[` |
| Arbitrary line-heights/tracking paired with sizes (`leading-[1.05]`, `tracking-[-0.045em]`) | Tokens carry their own line-height/weight — removing the size but keeping a manual `leading-[…]` may fight the token. Review pairs together |
| Visual regressions invisible to gates | Screenshot each batch's representative page before/after; tsc/eslint/vitest cannot see type size |
| Scale multiplication surprises | `--text-scale` also multiplies the NEW tokens; check Small and Large, not just Default |

---

## 3. Stage 4 — roster licence eligibility

### 3.1 The goal

An operator at the door cannot currently see that a registrant's licence is lapsed and their credit will silently never post. Surface eligibility per registrant on the check-in roster and the event page.

### 3.2 CORRECTION to the earlier admission-checklist answer

An earlier session recorded this as "a cross-block RLS-scoped read, owns no table, needs no block-contract change." **That is wrong, and building on it would waste a task.** Verified against the live schema:

- `registrations` columns: `id, event_id, email, full_name, status, registered_at, registration_code, check_in_at, check_in_method` — **there is no `user_id`.**
- `public.users` columns: `id, full_name, locale, timezone, …` — **there is no email column.**
- Email lives **only** in `auth.users`, which the TS/PostgREST layer cannot read.
- `practitioner_licences` RLS has exactly two policies: `practitioner_licences_self_read` and `practitioner_licences_body_admin_read`. **Organiser staff have no read policy at all.**

So the identity chain `registration → user → licence` is **not expressible** from an organiser session. It requires a `SECURITY DEFINER` function, exactly as `award_attendance_credit()` already does:

```
registrations.email → lower(trim()) match → auth.users.id → practitioner_licences.user_id
```

**This makes Stage 4 a block-contract change (a new function in B2/B3's surface), not a free read.** Re-run the admission checklist and record the answer in the plan before writing SQL.

### 3.3 Tasks

**S4-1 — `get_event_roster_eligibility(p_event_id uuid)` definer function.** Returns one row per registration: `registration_id`, `eligibility` (`verified` / `no_licence` / `lapsed` / `no_account` / `not_cpd`), and nothing else identifying. Rules:
- Staff-gated via `app_private.require_active_staff(...)` **and** an owner check in the body (a definer bypasses RLS — without it any staff member reads any tenant's roster).
- Good standing is `status = 'verified'`. **It is NOT `'active'`** — `practitioner_licences.status` has no such value, and this exact mistake already required corrective migration `20260724170650`.
- If the event has no `accrediting_body_id`, every row is `not_cpd` — do not imply a licence problem on a non-CPD event.
- Read-only: **no audit event** (reads are not audited; adding one would pollute the chain on every page view).
- Grant hygiene: `revoke all … from public, anon, authenticated, service_role` **first** (revoking a named role is a no-op while bare `PUBLIC` holds it — Hard Rule 11), then grant to exactly the roles that call it.

**S4-2 — Return NO PII.** Hard Rule 10. Return `registration_id` and let the caller join to names it already has. `scripts/cpd/reconcile-event.ts` had to be fixed for exactly this (it printed `full_name`); do not reintroduce it.

**S4-3 — Surface it** on `app/events/[id]/checkin/` (the roster) and the event page, reusing the eligibility-chip vocabulary. Copy must state the consequence, not just the state: *"Licence lapsed — credits will not post"*.

**S4-4 — Tests.** RLS test asserting a non-owner staff member is refused (`42501`); a fixture covering each eligibility branch; assert no PII in the payload.

### 3.4 Roadblocks

| Roadblock | Mitigation |
|---|---|
| Email matching is fuzzy by nature | Mirror `award_attendance_credit` exactly (`lower(trim())`, `limit 1`) so the roster's prediction matches what issuance will actually do. **Divergence here is worse than no feature** — it would promise a credit that never posts |
| N+1 / perf on large rosters | Return a set for the whole event in one call; do not call per row |
| `credit_ledger` is not organiser-readable | Use the admin client for any issued-credit counts, as the event page already does |
| Local `credit_ledger` has residue from proof runs | Accepted debt per `DEFERRED.md`; do not "clean" live data to make a test pass |

---

## 4. Stage 5 — Participants + Audit log surfaces

Only after Stage 4 (they consume its data). Both are read-only.

- **Participants**: person-level view derived from event participation. **Not a CRM** — no cold-contact import, no campaign lists (PDPO purpose-limitation). Counted status tabs, filter row, row→drawer.
- **Audit log viewer**: `audit_events` is staff-readable (`audit_events_staff_read`). Real `event_type` values in use: `consent_granted`, `consent_withdrawn`, `dsr_transitioned`, `session_revoked`, `attendee_checked_in`, `event_published`, `licence_declared|verified|lapsed|revoked|superseded|marked_primary`, `staff_role_changed`, `event_cpd_config_set`. Show `chain_seq`, type, actor role, subject, and the payload behind progressive disclosure.
- **Do not** add nav items for surfaces that do not exist yet — the shell's nav lists only real routes, and a link to a 404 was already removed once.

---

## 5. M2 close-out (mandatory before calling M2 done)

The three-lens phase-completion protocol **has not run** for any M2 stage and is owed at the milestone boundary:

1. **Dev-lens review** — separate agent, reads the full diff + changed files, runs gates independently.
2. **User-lens review** — a *different* agent, cold-start operator journey: create an event → accredit it → publish → register → check in → confirm credit posts → read every error message in context.
3. **Backtest** — against real systems: execute the mutation, query the row back, assert the observable outcome. Not mocks.

Then update `PROJECT_STATE.md`, `DEFERRED.md`, and the vault note — **after** the checks, never before.

---

## 6. Cross-cutting landmines (learned the hard way; each cost a real defect)

1. **Adopting a design token's *value* without its *role* breaks contrast silently.** Stage 1 took every CTA from 4.55:1 (passing) to 4.23:1 (failing AA) by adopting `#0E79EC` for filled buttons. The ramp's own spec says that blue is "not small text". Compute WCAG before/after on every text-on-colour pair; expect the fix to be a *usage* sweep, not a token tweak.
2. **The token layer only reaches components that use it.** This has now bitten three times (serif → 37 of 59 headings; `bg-tertiary` → 24 call sites; type scale → 190 sites). Always grep for hand-rolled equivalents after any token change.
3. **`apply_migration` ignores your filename** and assigns a version from server time. After every call: `list_migrations`, then rename the local file to match. Non-negotiable.
4. **Column-level `REVOKE` is a no-op against a table-level grant.** Revoke the table privilege first, then grant back the columns you want.
5. **Audit insert is the LAST statement before commit** — the chain trigger holds `pg_advisory_xact_lock` until commit.
6. **Never report success when something was bypassed** (rule 12). A "degrade gracefully" swallow in Stage 3 hid a wrong column name and rendered an empty picker that read as "no accrediting bodies exist". Log the failure and surface a distinct state.
7. **Live verification finds what static gates cannot.** Every stage that touched a user-facing flow found a real bug in a browser that tsc/eslint/vitest passed clean. Budget for it; it is not optional polish.
8. **Do not fabricate chrome.** The shell deliberately omits a workspace switcher, venue-status pill, notification bell and ⌘K search because no backend provides them. A shell that lies about the product is worse than a plain one.

---

## 7. Order of execution — **MVP framing (confirmed by Ivan, 2026-08-02)**

> **The goal is an MVP, not a complete product. Ship ASAP: all functionality up and running, then debugged and backtested for a stable beta.** Judge every task against "does a beta event work without it?" — not against "is it right?".

**An earlier revision of this section recommended Stage T (type scale) first. That was wrong under this goal and is superseded.** Stage T is a 47-file sweep repairing a *polish* control; no beta event fails because Text size doesn't scale. It is quality work, not ship work.

### The distinction that governs this plan (Ivan, 2026-08-02)

> **"Things that require external validation can wait. The platform has to be functional. The info dependency is subject to future info injection — not a build issue."**

Sort every item into exactly one of these. Do not let the second list block the first.

**BUILD GAPS** — code that does not exist or does not work. **This is the job.**
**INJECTION POINTS** — code that is complete and waiting on a value (key, domain, approval). **Not blockers. Do not report them as such.**

An earlier revision of this section listed the Resend cutover and the D0 deploy as Tier-1 blockers. **Both are injection points and that framing was wrong.** Verified this session:

- **Email is already wired to switch itself.** `app/(public)/events/[id]/actions.ts:194` and `app/events/[id]/details/emailActions.ts:105` both do `const sendEmail = process.env.RESEND_API_KEY ? sendEmailReal : sendEmailStub;`. Set the key and real sending is live on both paths — registration confirmation and reminder/survey. Nothing to build.
- **Deploy** is configuration + an Ivan decision. The code is environment-agnostic (`NEXT_PUBLIC_SITE_URL` via `lib/origin.ts`).
- **Price, meeting dates, body answers** are content, injected later.

### Tier 1 — REAL build gaps in the core loop (no external input required)

| # | Item | Why it is a build gap |
|---|---|---|
| 1 | **No scheduler for reminder + survey** | There is no pg_cron job and no edge function. The 60-min-before reminder (carrying the personal QR pass) and the 10-min-after survey invite only fire when a human clicks them in `EmailSendControls`. The loop is therefore not self-running. `email_log` already has the `queued` partial index built for exactly this poller. **Caveat carried from the Phase-9 note: a `queued` reminder/survey row is TERMINAL under `email_log_dedup_idx` — the reconciler must not treat `queued` as "needs sending"** |
| 2 | **Stage 4 — roster eligibility** (§3) | A registrant with a lapsed licence checks in, the operator sees success, and the credit silently never posts. Trust failure in the core loop |
| 3 | **Event creation cannot set CPD config** | `create_event_with_blocks`' column whitelist omits `accrediting_body_id` / `cpd_hours`; CPD is only settable after creation. Reuse `set_event_cpd_config()` from the create action rather than widening the RPC |

### Tier 2 — beta hardening (do before real users, not before deploy)

5. **End-to-end backtest on the deployed environment** — the full loop against real systems: create → accredit → publish → register → email received → check in → credit posts → chain verifies. Not mocks.
6. **M2 close-out three-lens protocol** (§5).

### Tier 3 — after beta is stable

7. **Stage T (type scale)** — with one exception below.
8. **Stage 5** (Participants + Audit log surfaces).

### The one Stage-T decision that IS cheap and should be made now

The Text size setting currently promises something it does not deliver. Three options; the middle one is the MVP answer:

- (a) Full sweep — 47 files. **Not MVP.**
- (b) **Hide or remove the Text size control** until the sweep happens. ~15 minutes, removes a broken promise, ships honest. **Recommended — needs Ivan's yes, since removing a shipped control is a product call.**
- (c) Leave it visibly broken. Cheapest, but it is a live accessibility claim that does not hold.

Browser zoom still works regardless, so (b) costs users very little.

**Injection points — tracked, NOT blocking, never reported as blockers:** `RESEND_API_KEY` + verified sender domain (email switches itself the moment the key exists) · D0 deploy go + Singapore project + `NEXT_PUBLIC_SITE_URL` · price · first internal-meeting/body-review date · HKCP's answers to the 7+2 questions (which unlock Q26 and the evaluator, not the platform).

**Primary goal, standing:** the platform runs end to end on its own — create → accredit → publish → register → confirmation → reminder+QR → check in → credit posts → survey → chain verifies — with every external value injectable later and nothing stubbed that could be real.
