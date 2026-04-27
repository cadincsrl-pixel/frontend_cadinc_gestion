-- =====================================================================
-- Documentos del legajo de choferes (DNI, licencias, certificaciones).
-- Sigue el mismo patrón que personal_documentos (mig 20260424) pero
-- agrega vence_el (nullable) para los docs con expiración (licencia,
-- LNH, CNRT, aptitud psicofísica, ART, MOPP).
-- Bucket dedicado `chofer-docs` (privado).
-- =====================================================================

create table if not exists public.chofer_documentos (
  id              bigserial primary key,
  chofer_id       integer    not null references public.choferes(id) on delete cascade,
  tipo            text       not null check (tipo in (
    'dni',
    'licencia_conducir',
    'alta_temprana',
    'lnh',
    'cnrt',
    'aptitud_psicofisica',
    'art',
    'mopp',
    'cuil_afip',
    'cbu_bancario',
    'telegrama',
    'otro'
  )),
  storage_path    text       not null,
  nombre_archivo  text       not null,
  hash_sha256     text       not null,
  mime_type       text       not null,
  size_bytes      bigint     not null check (size_bytes > 0),
  vence_el        date,                       -- nullable: solo aplica a tipos con expiración
  obs             text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_by      uuid,
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- Índices para filtros frecuentes
create index if not exists chofer_documentos_chofer_idx
  on public.chofer_documentos (chofer_id)
  where deleted_at is null;

create index if not exists chofer_documentos_chofer_tipo_idx
  on public.chofer_documentos (chofer_id, tipo)
  where deleted_at is null;

-- Index para reportes de vencimiento próximo (alerta 30 días).
create index if not exists chofer_documentos_vence_el_idx
  on public.chofer_documentos (vence_el)
  where deleted_at is null and vence_el is not null;

-- Hash único por chofer: bloquea subir el mismo archivo dos veces.
create unique index if not exists chofer_documentos_chofer_hash_uq
  on public.chofer_documentos (chofer_id, hash_sha256)
  where deleted_at is null;

-- Trigger updated_at
create or replace function public._chofer_documentos_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_chofer_documentos_touch on public.chofer_documentos;
create trigger trg_chofer_documentos_touch
  before update on public.chofer_documentos
  for each row execute function public._chofer_documentos_touch_updated_at();

-- RLS permisiva (backend Hono valida permisos)
alter table public.chofer_documentos enable row level security;
drop policy if exists chofer_documentos_all on public.chofer_documentos;
create policy chofer_documentos_all on public.chofer_documentos
  for all using (true) with check (true);

-- ── Bucket `chofer-docs` (privado) ──────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chofer-docs',
  'chofer-docs',
  false,
  10485760,                                    -- 10 MB
  array[
    'image/jpeg','image/png','image/webp',
    'image/heic','image/heif','application/pdf'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chofer_docs_select_auth on storage.objects;
create policy chofer_docs_select_auth on storage.objects
  for select to authenticated
  using (bucket_id = 'chofer-docs');

drop policy if exists chofer_docs_insert_auth on storage.objects;
create policy chofer_docs_insert_auth on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chofer-docs');

drop policy if exists chofer_docs_delete_auth on storage.objects;
create policy chofer_docs_delete_auth on storage.objects
  for delete to authenticated
  using (bucket_id = 'chofer-docs');
