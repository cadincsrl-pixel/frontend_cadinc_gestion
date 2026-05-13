-- Flota CADINC — Fase 2: catálogo de tipos de servicio (mantenimiento).
-- Cada tipo define un default de intervalo por kilometraje o por meses, que el
-- frontend usa al registrar un service para sugerir el próximo. Activable.

create table if not exists public.flota_tipos_servicio (
  id              serial primary key,
  nombre          text  not null unique,
  intervalo_km    integer,
  intervalo_meses integer,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table public.flota_tipos_servicio enable row level security;
drop policy if exists flota_tipos_servicio_all on public.flota_tipos_servicio;
create policy flota_tipos_servicio_all
  on public.flota_tipos_servicio for all
  using (true) with check (true);

-- Seed de tipos comunes; los intervalos son una guía editable.
insert into public.flota_tipos_servicio (nombre, intervalo_km, intervalo_meses) values
  ('Cambio de aceite',       10000,  6),
  ('Filtros',                10000,  6),
  ('Frenos',                 20000, 12),
  ('Neumáticos',             40000, 24),
  ('Correa de distribución', 80000, 60),
  ('Service general',        15000, 12)
on conflict (nombre) do nothing;
