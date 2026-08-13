-- 2026-08-14 full-stack review — cosmetic grant-hygiene-adjacent cleanup.
-- PT_BOARD was the only accrediting_bodies.short_name using an underscore-slug
-- style; all 21 siblings (7 pre-existing + the 14 HKAM Colleges/MCHK seeded
-- 2026-08-13) read as clean short codes. Renamed to PTB, matching VSB's own
-- "<initial><Board→B>" abbreviation style.
--
-- Safe: short_name is a display label only — grepped the whole repo (app code,
-- tests, migrations) for the literal string 'PT_BOARD'; nothing outside
-- migration seed files references it, and no foreign key or app logic keys on
-- it (accrediting_bodies.id is the real FK target everywhere).
update public.accrediting_bodies
   set short_name = 'PTB'
 where short_name = 'PT_BOARD';

do $$
begin
  if not exists (select 1 from public.accrediting_bodies where short_name = 'PTB') then
    raise exception 'PT_BOARD -> PTB rename did not apply';
  end if;
  if exists (select 1 from public.accrediting_bodies where short_name = 'PT_BOARD') then
    raise exception 'PT_BOARD row still present after rename';
  end if;
end $$;

-- Rollback:
--   update public.accrediting_bodies set short_name = 'PT_BOARD' where short_name = 'PTB';
