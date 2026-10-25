# Grant matrix query (local stack)

Run inside `begin; ... rollback;` so no grant persists.

```sql
select coalesce(string_agg(r.role || ' ' || p.priv || ' ' || c.relname, ', '), '')
from pg_class c
cross join (values ('anon'),('authenticated'),('service_role')) r(role)
cross join (values ('TRUNCATE'),('TRIGGER')) p(priv)
where c.relnamespace = 'public'::regnamespace
  and c.relkind in ('r','p','f','v','m')
  and has_table_privilege(r.role, c.oid, p.priv);
```

For the injection proof, prefix with `grant truncate on public.events to anon;` and expect `anon TRUNCATE events` in the output. Any table or role missing from the expected matrix is a finding, not a pass.
