# Handoff — 2026-10-09 — Cross-organisation reads on staff pages, and `get_org_participants`

Request: a read-only review (2026-10-01, at `d66daa8`) flagged, from code reading only, that the Check-in and Reports pickers list other organisations' events and that `/events/[id]/analytics` has no `canManageEvent` gate. Per Rule 14 this session established validity and extent first, then fixed.

Evidence tags: **[X]** executed against the LOCAL stack · **[R]** read in code/catalog · **[I]** inferred. Seoul (production) was not reachable, see §4.

## 1. Verdicts

| Item | Verdict |
|---|---|
| Pickers (`/checkin`, `/analytics`) list other orgs' events | **Real [X].** `events_public_read_published` (init_events.sql:36-38, never dropped) lets any signed-in session read every org's *published* events; child tables are org-scoped since the 2026-09-10 sweep. The other org's rows appeared with a wrong `0 / 0`. |
| `/events/[id]/analytics` ungated | **Gate missing [X], private-data leak NO [X].** Another org's staff got a page of zeros (their reads are RLS-scoped), not its registrants or survey answers. |
| *(found in extent check)* `/events/[id]/details` ungated | **Real, private [X].** Rendered another org's authorised accrediting-body names and credits-issued count (admin-client reads). `/checkin` and `/edit` redirect non-managers *to* this page. |
| *(found in extent check)* RPC `get_org_participants` | **Real, critical [X].** SECURITY DEFINER, caller-supplied org id, no membership check, EXECUTE to `authenticated`. A plain attendee JWT returned another org's registrant (names + emails). Open attendee sign-up makes that any throwaway account. |

## 2. What shipped (two commits on `main`, local, NOT pushed, NOT applied to Seoul)

- `ea5a6a7` fix(staff): both pickers scoped with `.eq('organisation_id', …)` for everyone but `eventar_staff` (same shape as `app/dashboard/data.ts`); `/events/[id]/analytics` and `/events/[id]/details` call `canManageEvent` and `notFound()` for other orgs (analytics also had to add `organisation_id` to its select, or every owner would be gated out); stale comment in `/events/[id]/checkin/page.tsx` corrected; 4 page tests + `tests/helpers/staffPageFakes.ts` (a fake that applies filters and projects the select list, so the missing-column trap fails as behaviour).
- `c8a0d77` fix(db): `20261009011823_get_org_participants_service_role_only.sql` revokes EXECUTE from anon/authenticated/public and switches the function to SECURITY INVOKER; `tests/rls/org_participants_grant.rls.test.ts`.
- **RLS policies are unchanged** (the public-read policy is right for public discovery).
- Decisions (Ivan, 2026-10-01): fix the RPC here; details page 404s other orgs; lower-severity items become follow-ups.

## 3. Verification

- **Live matrix, local stack, review mode OFF, two orgs [X]:** 14 probes (picker lists, foreign `/analytics` `/details` `/checkin` `/edit`, owner controls for both orgs, RPC as attendee / service_role, `/participants`). Before the fix 14/14 reproduced the bug; after, 14/14 fixed. Fixtures `XV-*` / `@xorg-verify.invalid`, deleted afterwards (0 rows left in any table).
- **Tests RED → GREEN [X]:** the 4 foreign-org page cases and the attendee RPC case failed on unmodified code for the intended reason (`expected notFound, received render`; call succeeded), pass now.
- **Catalog [X]:** `get_org_participants`: `prosecdef=f`, anon/authenticated `f`, service_role `t`, ACL `{postgres, service_role}`; `search_path` kept.
- **Gates:** `tsc` 0. Full vitest 1518 passed in the working tree; **1317 passed on a pristine checkout of `c8a0d77`** (no peer work) and `next build` there: exit 0, 39 routes. ESLint: 0 problems in my files.
- **Reviews:** dev-lens (separate agent): no blocker, SHIP WITH FIXES, all applied. User-lens (separate agent, real browser, sign-in via Mailpit): foreign URLs settle on one 404, B's data never appears (zero hits for B's title/org/body name in raw HTML), owners unaffected, no console errors.
- Decision taken from both reviewers independently: analytics calls `notFound()` directly (a redirect to `/details` only led to the same 404 through an extra hop).

## 4. Open for Ivan

1. **Apply to Seoul (yours to run).** `supabase migration list --linked` then `supabase db push --linked`. Pending there: my `20261009011823` AND the peer's two uncommitted local migrations `20261002000000`, `20261002010000` (older versions, so they go first; independent of mine). Decide whether you want those live first.
2. **Seoul exposure is UNVERIFIED.** My one approved probe failed twice (two MCP servers): Postgres `28P01` password authentication failed for `postgres`, i.e. the project's DB password the MCP uses is stale (2026-09-04 notes hit the same). `db push` from your terminal may need the password reset/relinked. Likely exposed **[I]**: the function arrived in `20260911010000`, and local and Seoul were recorded in lockstep at 141 migrations on 2026-09-24. Read-only check for the dashboard SQL editor:
   ```sql
   select p.prosecdef, has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
          has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_org_participants';
   ```
   If `authenticated_can_execute` is true, run `revoke execute on function public.get_org_participants(uuid) from anon, authenticated, public;` now rather than waiting for the push (the migration is idempotent).
3. **DECISION — DSR functions let any organiser_admin act across tenants [X].** In rolled-back transactions as org A's `organiser_admin` JWT (role `authenticated`): `pseudonymise_user(p_user_id, …)` erased an unrelated attendee (`ERASED-…`, irreversible if committed); `transition_dsr(p_id, …)` moved another subject's erasure request `pending → rejected`. Gate is `role in ('organiser_admin','eventar_staff')` with no relation to the target (a single-org-era design; `tests/rls/dsr_audited.rls.test.ts` asserts organiser_admin MAY transition). Neither has an app caller. Options: (a) revoke EXECUTE from `authenticated` now, no functional loss today, update the two tests, design the DSR console later (my recommendation as the stopgap); (b) narrow the gate to `eventar_staff`; (c) org-relate the target (subject must have a registration at the caller's org) — a product decision.
4. **DECISION — what a signed-in organiser sees for someone else's event.** It is `app/not-found.tsx`: attendee shell, a "Sign in" pill, "Upcoming events" CTA, copy "…the event it pointed at was removed" (user-lens IMPORTANT). Pre-existing chrome, new traffic; it is the Q32 audience boundary and a frontend DESIGN DECISION (locked pipeline), so not built here.
5. `git push origin main` when you want my commits (and this handoff) upstream; nothing of mine has been pushed.

## 5. Follow-ups (task chips created)

DSR functions (above) · definer-grant hygiene in one migration: `compute_accreditation_credit` and `verify_evidence_chain` (no app callers), `bulk_update_event_status` (caller-supplied `p_actor_user_id` is written to `audit_events`: audit forgery within own org; only caller uses service_role), plus the peer's `create_event_with_blocks` PUBLIC/anon item · nine RPCs still gate on `created_by` instead of organisation (safe cross-org, too strict same-org) · soft-deleted published events stay publicly readable (policy ignores `deleted_at`) and `walkInRegisterAndCheckIn` reveals lifecycle before its gate (collides with the core-UX lifecycle-gated check-in work) · organiser-aware 404 + `/checkin` `/edit` still redirect to a page that 404s (the peer owns `/edit`; its comment at :60-62 is stale) · malformed event id → chrome-less "SOMETHING BROKE" instead of 404 · ESLint has **1 error** at `HEAD` (`app/settings/page.tsx:84` `react/no-unescaped-entities`, reproduced on a pristine checkout) — the 09-25 note says 0. D5 (`creditsBlocked` platform-wide count) is already tracked.

## 6. Corrections to earlier records

- Local `supabase db advisors` (CLI 2.109.1) has no lint 0029; it showed 0 findings for `get_org_participants` before the fix, so it is NOT evidence either way. Use the catalog + the 42501 test.
- CLAUDE.md and the constitution say `pnpm test:rls` writes to production; `tests/helpers/clients.ts:29-35` now refuses a non-local URL under `RLS_TESTS`.
- 31 definer functions are `authenticated`-executable locally. Read for gates: `set_staff_role` (eventar_staff only), invite pair (org admin + DB CHECK on role), licence/credit family (role + caller org = body's org), supersede/set_primary/declare/claim/consent (self only): OK. `publish_event`, `mark_attended`, `set_event_cpd_config`: org-checked. Gaps are only those listed in §4.3 and §5.

## 7. Method notes

- `PROJECT_STATE.md` was NOT edited: it carries the peer's uncommitted entry. Suggested pointer: "2026-10-09 cross-org scoping, `ea5a6a7` + `c8a0d77`, see handoff_20261009-cross-org-scope.md".
- Working beside another session: commits were built with a temporary index (`git write-tree` / `commit-tree` / guarded `update-ref`) because another session had a file staged and the shared details page held its unstaged lines. Anything else in the tree is theirs.
- A streamed `notFound()` under the root `loading.tsx` is HTTP 200: extra `<meta name="robots" content="noindex">` beside the page's own, the 404 digest in the flight data, an empty server-rendered body. The "doesn't exist" copy is in EVERY page's payload, so text probes must strip `<script>` (my first oracle was wrong for exactly this reason).
- The live probe script was scratch (not committed). Recipe: admin `generateLink` + `verifyOtp` on an `@supabase/ssr` client captures the `sb-127-auth-token` cookies; fixtures by psql as superuser (the `set_event_organisation_trg` stamps the org from `created_by`). Worth capturing with `/run-skill-generator`.
- The planned background audit of all definer functions died on a usage limit; the writers were read and probed inline instead (so §6 is a targeted read, not exhaustive).
