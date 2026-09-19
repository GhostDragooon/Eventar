// THE HOLE THIS CLOSES: `registrations` was never added to the
// supabase_realtime publication — verified empty on BOTH the local stack
// and Seoul production (`select tablename from pg_publication_tables where
// pubname = 'supabase_realtime'` returned zero rows on both, 2026-09-19).
// RosterClient.tsx has subscribed to `postgres_changes` INSERT/UPDATE on
// this table since it was written, expecting a walk-in or a check-in from
// another tab to appear live — with the table never published, Postgres
// never emits WAL changes for it to Realtime, so the subscription has done
// nothing since day one, in every environment, for every session. The
// initial page load still renders correctly (a normal server-side fetch,
// unrelated to this publication), which is exactly why the gap went
// unnoticed for so long — only the "stays live without reloading" promise
// was silently broken.
//
// This test would have caught it immediately: it's a one-line catalog
// fact, cheap to assert, that no amount of UI testing reliably surfaces
// (the symptom only shows up as "I didn't reload, so I didn't see it
// update" — easy to misread as a slow network rather than a dead
// subscription).
//
// Safe to publish: postgres_changes respects each subscriber's own RLS
// (verified: registrations_org_member_select / registrations_manager_
// select_all / registrations_self_read are all `authenticated`-scoped, no
// `anon` SELECT policy exists), so adding a table to the publication grants
// no new visibility — a subscriber only ever receives change events for
// rows its existing SELECT policies already let it read.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect } from 'vitest';
import { sqlSuperuserQuery } from '../helpers/clients';

describe.skipIf(!process.env.RLS_TESTS)('supabase_realtime publication', () => {
  it('publishes registrations, so RosterClient\'s postgres_changes subscription can receive live updates', async () => {
    const rows = await sqlSuperuserQuery<{ tablename: string }>(
      `select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'registrations';`,
    );
    expect(rows).toHaveLength(1);
  });
});
