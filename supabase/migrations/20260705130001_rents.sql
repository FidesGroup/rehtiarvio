-- Rent estimate cache: one row per (postal_code OR town) x room class.
-- Source: StatFin asvu table 13eb (Rents of dwellings, non-subsidised,
-- quarterly), CC BY 4.0. Postal cells are pulled directly; town cells are
-- synthesized by the cron as a transaction-weighted average of populated
-- postal cells in the same town (see statfin-rents-refresh.ts).
--
-- Schema note: the rents engine keys its own map by `${pcOrTown}_${room}`
-- where `pcOrTown` is either a 5-digit postal code or a town name. We mirror
-- that as `key` (the engine's natural key) and ALSO split out postal_code
-- and rooms_type for analytics convenience — but postal_code is NULL for
-- synthesized town rows, so the primary key is (key) alone.

create table if not exists rents (
  key text primary key,
  postal_or_town text not null check (postal_or_town in ('postal', 'town')),
  postal_code text,
  rooms_type text not null check (rooms_type in ('yksiö', 'kaksio', 'kolmio+')),
  benchmark_eur_m2_kk numeric,
  n_4q integer not null default 0,
  latest_quarter text,
  series jsonb not null default '[]',
  refreshed_at timestamptz not null default now()
);

create index if not exists rents_postal_code_idx on rents (postal_code);
create index if not exists rents_rooms_type_idx on rents (rooms_type);

alter table rents enable row level security;
create policy "rents are public read" on rents for select using (true);
-- writes are server-side (service role) only, via /api/refresh