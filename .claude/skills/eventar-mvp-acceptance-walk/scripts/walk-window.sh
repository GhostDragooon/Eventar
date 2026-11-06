#!/bin/sh
# Shift a ZZ- fixture event into a check-in window state. Local stack only.
# Usage: walk-window.sh <event_id> before|inside|after
set -eu
EV=$1; STATE=$2
case $STATE in
  before) S="now() + interval '5 hours'"; E="now() + interval '8 hours'";;
  inside) S="now() + interval '30 minutes'"; E="now() + interval '3 hours'";;
  after)  S="now() - interval '5 hours'"; E="now() - interval '1 hour'";;
  *) echo "state must be before|inside|after" >&2; exit 2;;
esac
/opt/homebrew/opt/libpq/bin/psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -Atc "
begin;
do \$\$ begin if (select title from events where id='$EV') not like 'ZZ-%' then raise exception 'not a ZZ- fixture'; end if; end \$\$;
update event_occurrences set starts_at=$S, ends_at=$E where event_id='$EV';
update events set start_time=$S, end_time=$E where id='$EV';
commit;
select start_time, end_time from events where id='$EV';"
