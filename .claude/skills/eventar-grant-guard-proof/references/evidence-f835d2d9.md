F2 (MINOR, pre-existing, same class as this card). `authenticated` still holds table-level DELETE on `registrations`. No DELETE policy exists, so it does nothing today. A signed-in DELETE returns HTTP 200 `[]`, not 42501, and the rows are untouched.

=== D18 no not-found after the lock
failing tests: 0
restored byte-identical

-- The blanket grant above gives UPDATE back, so it is re-asserted here.
revoke update on public.registrations from anon, authenticated;

(echo "begin;"; cat supabase/seed.sql; echo "select 'after seed: update=' || has_any_column_privilege('authenticated','public.registrations','UPDATE') || ' delete=' || has_table_privilege('authenticated','public.registrations','DELETE');"; echo "rollback;") | $P $U -q -At