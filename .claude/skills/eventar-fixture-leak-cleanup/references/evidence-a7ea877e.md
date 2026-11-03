psql:/private/tmp/claude-501/-Users-ivan-Eventar/d5042cd5-1db5-4a3e-9db8-6223deded5db/scratchpad/clean.sql:33: ERROR:  operator does not exist: character varying = uuid
LINE 1: delete from auth.refresh_tokens where user_id in (select id ...
QUERY:  delete from auth.refresh_tokens where user_id in (select id from lu)
planned: events|37
users|153
staff|41
orgs|2
regs|196