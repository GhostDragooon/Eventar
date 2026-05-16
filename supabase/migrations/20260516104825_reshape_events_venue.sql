alter table public.events drop column if exists format;
alter table public.events drop column if exists speakers;
alter table public.events drop column if exists agenda;
alter table public.events drop column if exists location;

alter table public.events add column venue_name    text not null;
alter table public.events add column venue_address text;
alter table public.events add column city         text not null;
alter table public.events add column region       text;
alter table public.events add column country      text not null;
alter table public.events add column latitude     double precision not null;
alter table public.events add column longitude    double precision not null;
