    it('a registration deleted while an edit waits is not found: no success, no audit row', async () => {
      // Connection A deletes the row (as service_role erasure would) and holds the lock; B edits as the member, waits on
      // the row, then finds it gone.
        await a.query('begin');
        await a.query('delete from public.registrations where id = $1', [r.id]);
        await b.query('begin');
        await b.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'authenticated', email: member.email })]);
        await b.query('set local role authenticated');
        const pending = b
          .query('select public.update_registration_contact($1, $2, $3)', [r.id, 'Too late', r.email])
          .then(() => ({ ok: true as const }), (e: { code?: string; message: string }) => ({ ok: false as const, code: e.code, message: e.message }));
        let waiting = false;
        for (let i = 0; i < 100 && !waiting; i++) {
          const { rows } = await a.query(
            `select count(*)::int as n from pg_stat_activity
              where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid() and query like '%update_registration_contact%'`,
          );
          waiting = rows[0].n > 0;
          if (!waiting) await new Promise((res) => setTimeout(res, 50));
        }
        expect(waiting, 'the edit never waited on the row lock, so this test would prove nothing').toBe(true);
        await a.query('commit');
        const res = await pending;
        expect(res.ok).toBe(false);
        expect(res.ok === false && res.code).toBe('P0002');