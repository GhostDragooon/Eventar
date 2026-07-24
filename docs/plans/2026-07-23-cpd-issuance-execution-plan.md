# Execution Plan — CPD Attendance-Verified Issuance (MVP) — 2026-07-23 (rev. 1)

> ⚠️ **OPEN / FOR REVIEW — subject to update.** rev.1 folds in the second technical review (2026-07-23). Do not start Task 0 until Ivan gives the build go.
> Architecture: `docs/plans/2026-07-23-cpd-mvp-architecture.md` (repo) · `20 — Roadmap/CPD MVP — Architecture (2026-07-23)` (vault, canonical).
> Scope = 🟢 MVP-Primary + reconcile (promoted to core). Config-free B3 issuance (signed off pre-Q26). Frontend frozen — **backend + seed only, zero `.tsx`**.

## Runtime Contract (the design invariants — also in the architecture doc)
1. **Attendance is authoritative for presence.** A credit failure must never change the attendance outcome or roll it back.
2. **Credit is best-effort + eventually consistent.** Issued inline on a fresh check-in; a transient miss is healed by **reconcile [Task 6]**, which also posts credits retroactively once an attendee resolves to a licence later.
3. **Idempotency is enforced at the DB** (partial unique index) — not trusted to app control flow alone.
4. **Two transactions by design, not by defect.** Attendance (B1) and credit (B3) stay decoupled so B1 never depends on B3 and attendance never rolls back on a credit error. (Decision A, confirmed.)

## Issues Raised → Resolution / Mitigation (2nd review, 2026-07-23)
| # | Issue raised | Resolution / Mitigation |
|---|---|---|
| **Main / A** | Decoupled 2-transaction split → realistic "attended but no credit" window (serverless can kill un-awaited promises; transient PostgREST/network blips) | **Keep decoupled.** Merging would invert authority (a credit error would roll back attendance) and couple B1→B3 (block-dependency breach). Award is **awaited inside try/catch** (serverless-safe — not un-awaited). **Reconcile promoted 🟡→🟢 [Task 6]** as the recovery + retroactive-post path. |
| 1 | try/catch is wrong for supabase-js (returns `{data,error}`, doesn't throw) | Helper uses `{ data, error }` per call; idempotency via `error?.code === '23505'`. `failed` = unexpected technical error, `skipped` = every business case. |
| 2 | Server Action needs an explicit try/catch boundary | Task 3 shape: `if (result==='ok') { try { await award } catch { log; do NOT rethrow } } return attendanceResult`. |
| 3 | Idempotency key — consider `registration_id` / `(licence_id,event_id)` | **Rejected — keep `(user_id, event_id)`.** Invariant is *one credit per practitioner per event*; `registration_id` would mint duplicates for a 2nd registration. (No `registration_id` in ledger anyway.) Scope documented: index only guards resolved attendees (unresolved never reach issuance). |
| 4 | `effective_date` timezone — UTC `::date` misdates an early HK event | `(start_time AT TIME ZONE event.timezone)::date` — uses the event's **stored** `timezone` column, no hardcoded constant. |
| 5 | Nondeterministic licence pick (`limit 1`, no order) | `order by created_at desc limit 1`. Stronger option flagged to B2: partial unique `(user_id,body_id) WHERE status='active'`. |
| 6 | `registration_code` in logs is a capability token | Log `registration_id` + resolution booleans only; **never** the raw code (extends Hard Rule 10). |
| 7 | Migration re-runnability (db-push after a classifier block → `42701`/`42P07` on re-run) | Every DDL `... if not exists`; rollback note in-file. |
| 8 | DEFINER safety only implicit | Asserted in Ground truth: `record_credit_entry` has pinned `search_path`, schema-qualified refs, `execute` → `service_role` only (all true since 3a — verify, don't rebuild). Default posture: `security invoker` unless a privileged op justifies definer. |
| 9 | Concurrency test only sequential | Task 5 adds a `Promise.all` of two issues against one registration (proves the unique index under a real race). |
| 10 | Real-world issuance rate bounded by S-Attendee | Documented: config-free issuance is fully exercised only for **pre-resolved** identities; the dominant real outcome pre-self-serve is `skip('no_licence')`; reconcile is the retroactive bridge. |
| 11 | Global ledger lock at peak (spiky live-event arrivals queue behind held lock, on the check-in request) | Documented ceiling. `SET LOCAL lock_timeout` → degrade-to-`skip` **recommended before real events** (`ponytail:` cheap knob, not seeded-MVP-blocking; per-body chains stay ⚪). |
| 12 / C | Reconcile tier | **Promoted 🟡→🟢 [Task 6].** Event-freeze **[Task 8] stays 🟡** (snapshot already makes issued credits immutable; it only guards future-credit consistency). |
| 13 | Doctrine phrasing | "Config-free issuance admissible pre-Q26" stated as **implementation doctrine** (may change when body_rules land), not a universal truth. |
| 14 | State vs readiness labels conflated | Two axes kept distinct: **state** (✅/🟡/⏳/📋) vs **tier** (🟢/🟡/🔵/⚪). |
| B | Kill-switch runtime (env needs redeploy on Vercel) | **Env `CPD_ISSUANCE_ENABLED` for MVP** (deploy-time; redeploy to change). Live mid-event toggle (config-row/flag) deferred, documented. |
| D | Placement | `{data,error}` + action-boundary code → **this plan only**; the Runtime Contract → **both** docs. |
| lock/wording | Advisory lock conflated with idempotency | Idempotency = attendance row-lock + unique index. Advisory lock = **chain ordering only**. Diagram wording corrected. |
| ok-framing | `ok` vs `already` inversion risk | Both docs key issuance off `result === 'ok'` (the fresh transition). |

## Ground truth (verified this session)
- `credit_ledger`: `licence_id`,`user_id`,`body_id`,`effective_date` **NOT NULL**; `event_id`,`points`,`hours`,`category`,`attestation_status` nullable. Append-only (HR11: INSERT/UPDATE/DELETE revoked from all incl. service_role).
- `record_credit_entry(p_licence_id,p_user_id,p_event_id,p_body_id,p_entry_type,p_points,p_hours,p_category,p_effective_date,p_attestation_status,p_actor_id?,p_references_entry_id?,p_reason?)` → sole writer, **SECURITY DEFINER**. **Invariants to verify (not rebuild):** pinned `search_path`, schema-qualified refs, `execute` granted to `service_role` only.
- Attendance fns return `result ∈ {ok, already, not_recognised}` — **`ok` = fresh, row-locked transition** (the idempotency lever). Files: `app/(public)/checkin/confirm/actions.ts` (self), `app/events/[id]/checkin/actions.ts` (staff) — both backend `actions.ts`, freeze-safe.
- `events` has a `timezone` column (seed sets `Asia/Hong_Kong`). `accrediting_bodies` seeded (incl. HKAM). `practitioner_licences(user_id,body_id,status)`.

---

## Task 0 — Baseline
Gates green; `list_migrations` count; `select count(*) from credit_ledger`. No code.

## Task 1 — Migration: event CPD config + ledger idempotency index 🟢
**File:** `supabase/migrations/<ts>_cpd_event_config_and_issuance_idempotency.sql`
```sql
alter table public.events
  add column if not exists accrediting_body_id uuid references public.accrediting_bodies(id),
  add column if not exists cpd_hours numeric check (cpd_hours is null or cpd_hours > 0);

-- Business rule: at most ONE attendance credit per practitioner per event.
-- Keyed on (user_id,event_id) NOT registration_id — a person with two
-- registrations still earns one credit. Only guards resolved attendees;
-- unresolved ones never reach issuance.
create unique index if not exists credit_ledger_attendance_uniq
  on public.credit_ledger (user_id, event_id)
  where entry_type = 'attendance';

do $$ begin
  if to_regclass('public.credit_ledger_attendance_uniq') is null then
    raise exception 'attendance idempotency index missing'; end if;
end $$;
-- Rollback: drop index credit_ledger_attendance_uniq; alter table events drop column cpd_hours, drop column accrediting_body_id;
```
**Apply:** MCP `apply_migration` → if classifier-blocked, `supabase db push`. Reconcile filename to `list_migrations`.
**Verify:** `execute_sql` — columns on `events`, partial unique index on `credit_ledger`.

## Task 2 — `awardAttendanceCredit` helper 🟢 (thin; all rules inside)
**File:** `lib/cpd/awardAttendanceCredit.ts`
`awardAttendanceCredit(admin, { eventId, registrationCode, actorId? }): Promise<{ status:'issued'|'skipped'|'failed'; reason?:string; creditId?:string }>`
Every DB call uses the supabase **`{ data, error }`** pattern — check `error` on each; a real error → `failed`, a business condition → `skipped`.
1. **[KS]** `if (process.env.CPD_ISSUANCE_ENABLED !== 'true') return skip('disabled')`.
2. Load event `accrediting_body_id, cpd_hours, start_time, timezone`.
3. **[D]** `if (!body_id || !cpd_hours) return skip('not_cpd')`.
4. Load registration by code → `email`; none → `skip('no_registration')`.
5. **[E]** user = `users where lower(email)=lower(trim(reg.email))` → none → `skip('no_user')`. licence = `practitioner_licences where user_id=? and body_id=? and status='active' order by created_at desc limit 1` → none → `skip('no_licence')`.
6. **[G]** effective_date = compute `(start_time AT TIME ZONE event.timezone)::date` (do it in SQL/RPC arg, not JS). `record_credit_entry(licence.id, user.id, eventId, body_id, 'attendance', null, cpd_hours, null, effective_date, 'attendance_verified', actorId ?? null)`.
7. **[C]** on RPC `error?.code === '23505'` → `skip('already_issued')`; other `error` → `fail(error.code)`.
8. **[F]** structured `console.info/error` of `{ event_id, registration_id, user_found, licence_found, status, reason }` — **no email, no registration_code** (Hard Rule 10 + capability-token rule).
**`ponytail:` global ledger lock serialises concurrent issues — fine at MVP volume; `SET LOCAL lock_timeout` degrade-to-skip before real events; per-body chains ⚪.**
**Test:** `tests/cpd/awardAttendanceCredit.test.ts` — stubbed admin: disabled / not_cpd / no_user / no_licence. Live invariants in Task 5.

## Task 3 — Wire the two attendance paths 🟢 (explicit serverless-safe boundary)
**Files:** `app/(public)/checkin/confirm/actions.ts`, `app/events/[id]/checkin/actions.ts`
```ts
const result = /* self_check_in | mark_attended RPC result */;
if (result === 'ok') {                       // fresh transition only
  try {
    await awardAttendanceCredit(admin, { eventId, registrationCode, actorId });
  } catch (err) {
    console.error('credit issuance threw after successful attendance', { eventId, /* ids only */ });
    // do NOT rethrow — attendance is authoritative
  }
}
return result;                               // always the attendance outcome
```
Staff path passes `actorId = staff.id`. `admin` client (service_role) required — `record_credit_entry` is service_role-only.
**Verify:** attendance response bytes unchanged for `ok`/`already`/`not_recognised`; existing action tests green.

## Task 4 — Seed the identity chain 🟢
`scripts/demo/seed-demo.ts`: event `accrediting_body_id`=HKAM, `cpd_hours`=3; Karen Lau gets a `users` row (email = her registration email) + an active `practitioner_licences` @ HKAM.
**Verify:** `reset-demo.ts` → seed prints body+hours; `select` shows Karen's active licence @ HKAM.

## Task 5 — Live invariant tests 🟢 + backtest
`tests/cpd/attendance_issuance.rls.test.ts` (env-gated, live): (a) seeded practitioner attends CPD event → **exactly one** `attendance_verified` credit, `verify_ledger_chain()` clean; (b) attend again both paths → **still one**; (b2) **`Promise.all` two simultaneous issues** on one registration → **still one** (proves the index under race); (c) non-CPD event → **zero**, attendance ok; (d) no-licence attendee → **zero**, `skip('no_licence')`. (RLS-writer already HR11-covered — don't duplicate.) Use throwaway seeded fixtures (ledger is append-only — don't try to clean credit rows; dev-project residue only).
**Backtest:** drive run-sheet beats 3–4 → a real credit posts live.

## Task 6 — Reconcile 🟢 (promoted to core — the recovery + retroactive path)
`scripts/cpd/reconcile-event.ts <eventId>`: for every `attended` registration of the event, call `awardAttendanceCredit` (idempotent). Heals: a transient insert failure, a kill-switch-off window, and any registration that resolves to a licence only after the event. Structured summary (issued / skipped / already).
**Verify:** run against the seeded event after a simulated miss (kill-switch toggled) → fills exactly the gap, no duplicates.

## Task 7 — Run-sheet beat, gates, close-out
Run-sheet "credit logged" beat (ledger readout, no UI) · full gates (note the pre-existing NewEventForm flake) · `DEFERRED.md` rows for every ⚪ (retry-queue+`pending_credit`, `creditIssued` API field, live kill-toggle, self-serve accounts+wallet, per-body chains + lock-timeout, roster ingestion, UX/perf polish) · update `PROJECT_STATE.md` + vault note status.

## Task 8 (🟡 — only if Ivan includes it) — event-config freeze trigger
BEFORE UPDATE on `events`: if `cpd_hours`/`accrediting_body_id` change AND a credit already references the event, raise. (Ledger already tamper-safe via snapshot; guards future-credit consistency only.)

---

## Definition of done (MVP)
Seeded practitioner checks in (self or staff) to a CPD event → exactly one tamper-evident `attendance_verified` credit; idempotent across both paths, retries, and a true race; guarded against non-CPD/no-licence; observable (ids only); killable; **reconcilable** (transient misses + retroactive resolution heal without duplicates). Gates green, invariants tested live, run-sheet drives it end-to-end. Everything ⚪ in `DEFERRED.md`.

## Not in this plan (⚪ Full / 🔵 deploy-gate)
Accreditation (B3 evaluator/`body_rules`, Q26) · signing (B4) · payment (B9) · auditor (B6) · AI/detection (B7/B8) · self-serve accounts + wallet (S-Attendee) · advanced finder · UX polish (skeleton/caching/optimistic/tooltips, post-M2) · retry-queue + `pending_credit` + live kill-toggle · per-body chains + lock-timeout · deploy-gates (Turnstile, real email, TOTP, privacy-notice, Singapore).
