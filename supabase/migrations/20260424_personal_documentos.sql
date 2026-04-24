-- =====================================================================
-- Documentos del legajo de personal (DNI, alta temprana, baja, telegrama).
--
-- Tabla separada de `personal` para permitir múltiples docs por tipo
-- (ej: DNI frente + dorso, versión vieja de un telegrama).
-- Bucket privado dedicado; signed URLs para view/download.
-- =====================================================================

create table if not exists public.personal_documentos (
  id              bigserial primary key,
  leg             text       not null references public.personal(leg) on delete cascade,
  tipo            text       not null check (tipo in ('dni','alta_temprana','baja','telegrama')),
  storage_path    text       not null,
  nombre_archivo  text       not null,
  hash_sha256     text       not null,
  mime_type       text       not null,
  size_bytes      bigint     not null check (size_bytes > 0),
  obs             text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_by      uuid,
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- Índices para filtros frecuentes
create index if not exists personal_documentos_leg_idx
  on public.personal_documentos (leg)
  where deleted_at is null;

create index if not exists personal_documentos_leg_tipo_idx
  on public.personal_documentos (leg, tipo)
  where deleted_at is null;

-- Hash único por leg: evita que alguien suba el mismo archivo dos veces
-- al mismo legajo (aunque le ponga distinto tipo). Si quiere reemplazar,
-- borra primero y vuelve a subir.
create unique index if not exists personal_documentos_leg_hash_uq
  on public.personal_documentos (leg, hash_sha256)
  where deleted_at is null;

-- Trigger updated_at
create or replace function public._personal_documentos_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_personal_documentos_touch on public.personal_documentos;
create trigger trg_personal_documentos_touch
  before update on public.personal_documentos
  for each row execute function public._personal_documentos_touch_updated_at();

-- RLS permisiva (coherente con el resto del proyecto; backend Hono valida)
alter table public.personal_documentos enable row level security;
drop policy if exists personal_documentos_all on public.personal_documentos;
create policy personal_documentos_all on public.personal_documentos
  for all using (true) with check (true);

-- ── Bucket `personal-docs` (privado) ────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'personal-docs',
  'personal-docs',
  false,
  10485760,  -- 10 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Policies del bucket: authenticated puede insert/select/delete (backend
-- filtra por permisos vía requirePermisoOr personal/tarja).
drop policy if exists personal_docs_select_auth on storage.objects;
create policy personal_docs_select_auth on storage.objects
  for select to authenticated
  using (bucket_id = 'personal-docs');

drop policy if exists personal_docs_insert_auth on storage.objects;
create policy personal_docs_insert_auth on storage.objects
  for insert to authenticated
  with check (bucket_id = 'personal-docs');

drop policy if exists personal_docs_delete_auth on storage.objects;
create policy personal_docs_delete_auth on storage.objects
  for delete to authenticated
  using (bucket_id = 'personal-docs');
