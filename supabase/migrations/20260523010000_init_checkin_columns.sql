-- Phase 4: per-attendee check-in identity + state.
-- Adds:
--   registration_code  WK-XXXX text; globally unique; backfilled in-migration
--                      so we can add NOT NULL + UNIQUE in the same DDL pass.
--   check_in_at        timestamptz; set by markAttended / selfCheckIn.
--   check_in_method    'qr' | 'manual'; matches the data the actions write.
--
-- RLS: no new policies. Existing organizer_select_own / organizer_update_own /
-- manager_select_all cover the new columns. Public self-checkin uses
-- supabaseAdmin() per the Phase 2 + 3.5 pattern.
--
-- Status column already includes 'attended' as a valid value from
-- 20260520010000_init_registrations.sql; no CHECK constraint change needed.

alter table public.registrations
  add column registration_code text,
  add column check_in_at       timestamptz,
  add column check_in_method   text
    check (check_in_method in ('qr','manual'));

-- Backfill existing rows BEFORE adding NOT NULL + UNIQUE.
-- Draws from the full 31-char alphabet (digits 2-9 + uppercase minus
-- 0 O 1 I L) so backfilled codes look visually identical to new
-- app-generated ones from lib/registrationCode.ts.
do $$
declare
  alphabet text[] := array[
    '2','3','4','5','6','7','8','9',
    'A','B','C','D','E','F','G','H','J','K','M','N','P','Q','R','S','T','U','V','W','X','Y','Z'
  ];
  r record;
  candidate text;
  attempts int;
begin
  for r in select id from public.registrations where registration_code is null loop
    attempts := 0;
    loop
      candidate := 'WK-'
        || alphabet[1 + floor(random() * 31)::int]
        || alphabet[1 + floor(random() * 31)::int]
        || alphabet[1 + floor(random() * 31)::int]
        || alphabet[1 + floor(random() * 31)::int];
      exit when not exists (select 1 from public.registrations where registration_code = candidate);
      attempts := attempts + 1;
      if attempts > 100 then
        raise exception 'backfill: 100 collisions for one row — namespace exhausted or RNG broken';
      end if;
    end loop;
    update public.registrations set registration_code = candidate where id = r.id;
  end loop;
end $$;

alter table public.registrations
  alter column registration_code set not null,
  add constraint registrations_code_unique unique (registration_code);

create index registrations_code_idx on public.registrations(registration_code);
