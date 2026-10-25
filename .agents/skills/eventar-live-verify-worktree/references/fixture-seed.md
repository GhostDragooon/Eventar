# Fixture seed and probe (local stack only)

Source: `supabase status -o env` run from the main checkout, output to a 600-mode scratch file. Keep the scratch dir out of the repo.

## Seed

```sql
begin;
insert into organisations (name, slug) values ('ZZ-WEEKTILE probe org', 'zz-weektile-probe');
insert into staff (email, full_name, role, organisation_id, status) select '<probe email>', 'ZZ Weektile Organiser', 'organiser_admin', id, 'active' from organisations where slug='zz-weektile-probe';
with o as (select id from organisations where slug='zz-weektile-probe'), s as (select id from staff where email='<probe email>'),
f(title, st, status) as (values
  ('ZZ-WEEKTILE live (started 30m ago)', now() - interval '30 minutes', 'published'),
  ('ZZ-WEEKTILE upcoming +3d', now() + interval '3 days', 'published'),
  ('ZZ-WEEKTILE upcoming +6d', now() + interval '6 days', 'published'),
  ('ZZ-WEEKTILE ended -2d', now() - interval '2 days', 'published'),
  ('ZZ-WEEKTILE draft +3d', now() + interval '3 days', 'draft'),
  ('ZZ-WEEKTILE cancelled +3d', now() + interval '3 days', 'cancelled'))
insert into events (title, start_time, end_time, timezone, status, created_by, venue_name, city, country, latitude, longitude, organisation_id)
 select f.title, f.st, f.st + interval '2 hours', 'Asia/Hong_Kong', f.status, s.id, 'Probe Hall', 'Hong Kong', 'HK', 22.28, 114.16, o.id from f, o, s;
commit;
```

The auth user is created with `POST $API_URL/auth/v1/admin/users` (`email_confirm: true`, password from the scratch file). Use the same email for the staff row.

## Probe matrix (dashboard tile, 2026-10-15)

| Event | Expected |
|---|---|
| live (started 30 min ago) | counted, live |
| upcoming +3d | counted |
| upcoming +6d | counted |
| ended -2d | not counted |
| draft +3d | not counted |
| cancelled +3d | not counted |

Read the tile with `curl -s -H "Cookie: $(cat cookie.txt)" http://localhost:3100/dashboard` and grep the chip.

## Cleanup

```sql
delete from events where title like 'ZZ-WEEKTILE%';
delete from staff where email='<probe email>';
delete from organisations where slug='zz-weektile-probe';
```

Then `curl -X DELETE "$API_URL/auth/v1/admin/users/<id>"` with the service role key, and count the leftovers in each table.
