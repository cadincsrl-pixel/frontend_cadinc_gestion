-- =====================================================================
-- Adjuntos del cobro: liquidación del líquido producto + comprobante.
-- Mismo patrón que personal_documentos / chofer_documentos: tabla
-- aparte con FK CASCADE, hash SHA-256 dedup, soft delete, signed URLs.
-- =====================================================================

create table if not exists public.cobros_adjuntos (
  id              bigserial primary key,
  cobro_id        integer    not null references public.cobros(id) on delete cascade,
  tipo            text       not null check (tipo in ('liquidacion', 'comprobante')),
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

create index if not exists cobros_adjuntos_cobro_idx
  on public.cobros_adjuntos (cobro_id) where deleted_at is null;

create index if not exists cobros_adjuntos_cobro_tipo_idx
  on public.cobros_adjuntos (cobro_id, tipo) where deleted_at is null;

create unique index if not exists cobros_adjuntos_cobro_hash_uq
  on public.cobros_adjuntos (cobro_id, hash_sha256) where deleted_at is null;

create or replace function public._cobros_adjuntos_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_cobros_adjuntos_touch on public.cobros_adjuntos;
create trigger trg_cobros_adjuntos_touch
  before update on public.cobros_adjuntos
  for each row execute function public._cobros_adjuntos_touch_updated_at();

alter table public.cobros_adjuntos enable row level security;
drop policy if exists cobros_adjuntos_all on public.cobros_adjuntos;
create policy cobros_adjuntos_all on public.cobros_adjuntos
  for all using (true) with check (true);

-- ── Bucket `cobros-docs` (privado) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cobros-docs', 'cobros-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cobros_docs_select_auth on storage.objects;
create policy cobros_docs_select_auth on storage.objects
  for select to authenticated using (bucket_id = 'cobros-docs');

drop policy if exists cobros_docs_insert_auth on storage.objects;
create policy cobros_docs_insert_auth on storage.objects
  for insert to authenticated with check (bucket_id = 'cobros-docs');

drop policy if exists cobros_docs_delete_auth on storage.objects;
create policy cobros_docs_delete_auth on storage.objects
  for delete to authenticated using (bucket_id = 'cobros-docs');
