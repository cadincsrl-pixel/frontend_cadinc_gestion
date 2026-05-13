-- Papeles de cada vehículo de flota con vencimiento.
-- Mismo patrón que camion_documentos / batea_documentos: storage_path + hash
-- sha256 (para dedup), vence_el opcional, soft delete via deleted_at.

create table if not exists public.flota_documentos (
  id              bigserial primary key,
  vehiculo_id     integer    not null references public.flota_vehiculos(id) on delete cascade,
  tipo            text       not null
                  check (tipo in ('titulo','tarjeta_verde','vtv','rto','poliza_seguro','patente','oblea','otro')),
  storage_path    text       not null,
  nombre_archivo  text       not null,
  hash_sha256     text       not null,
  mime_type       text       not null,
  size_bytes      bigint     not null check (size_bytes > 0),
  numero_serie    text,
  vence_el        date,
  obs             text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_by      uuid,
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index flota_documentos_vehiculo_idx
  on public.flota_documentos (vehiculo_id) where deleted_at is null;
create index flota_documentos_vehiculo_tipo_idx
  on public.flota_documentos (vehiculo_id, tipo) where deleted_at is null;
create index flota_documentos_vence_idx
  on public.flota_documentos (vence_el) where deleted_at is null and vence_el is not null;
create unique index flota_documentos_hash_uq
  on public.flota_documentos (vehiculo_id, hash_sha256) where deleted_at is null;

create trigger trg_flota_documentos_touch
  before update on public.flota_documentos
  for each row execute function public._flota_touch_updated_at();

alter table public.flota_documentos enable row level security;
create policy flota_documentos_all on public.flota_documentos for all using (true) with check (true);
