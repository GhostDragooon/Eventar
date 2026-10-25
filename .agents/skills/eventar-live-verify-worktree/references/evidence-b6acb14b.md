(cd $MAIN && supabase status -o env 2>/dev/null | grep -E '^(API_URL|SERVICE_ROLE_KEY|ANON_KEY)=') > $S/local.env; chmod 600 $S/local.env; source $S/local.env
insert into events (title, start_time, end_time, timezone, status, created_by, venue_name, city, country, latitude, longitude, organisation_id)
 select f.title, f.st, f.st + interval '2 hours', 'Asia/Hong_Kong', f.status, s.id, 'Probe Hall', 'Hong Kong', 'HK', 22.28, 114.16, o.id from f, o, s;
left: events=0 staff=0 orgs=0 auth=0