-- Módulo Flota CADINC: vehículos internos (autos, camionetas, utilitarios).
-- Separado de logística (camiones/bateas) porque son entidades distintas
-- sin chofer/tramo/liquidación asociados.

create table if not exists public.flota_vehiculos (
  id                          serial primary key,
  patente                     text       not null,
  tipo                        text       not null
                              check (tipo in ('auto','camioneta','utilitario','pickup','moto','otro')),
  marca                       text,
  modelo                      text,
  anio                        integer    check (anio between 1950 and extract(year from now())::int + 1),
  color                       text,
  vin                         text,
  titular                     text,
  km_actuales                 numeric    not null default 0 check (km_actuales >= 0),
  estado                      text       not null default 'activo'
                              check (estado in ('activo','taller','baja')),
  mobilquest_device_id        text,
  mobilquest_ultima_sync_at   timestamptz,
  obs                         text,
  created_by                  uuid,
  created_at                  timestamptz not null default now(),
  updated_by                  uuid,
  updated_at                  timestamptz not null default now()
);

create unique index flota_vehiculos_patente_uq
  on public.flota_vehiculos (lower(patente));
create unique index flota_vehiculos_mobilquest_uq
  on public.flota_vehiculos (mobilquest_device_id)
  where mobilquest_device_id is not null;
create index flota_vehiculos_estado_idx on public.flota_vehiculos (estado);

create or replace function public._flota_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_flota_vehiculos_touch
  before update on public.flota_vehiculos
  for each row execute function public._flota_touch_updated_at();

alter table public.flota_vehiculos enable row level security;
create policy flota_vehiculos_all on public.flota_vehiculos for all using (true) with check (true);

-- Bucket privado para papeles de la flota (10 MB max, foto/PDF)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'flota-docs', 'flota-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
