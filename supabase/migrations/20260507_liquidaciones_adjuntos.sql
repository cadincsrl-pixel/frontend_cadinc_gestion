-- =====================================================================
-- Adjuntos de la liquidación: comprobante de pago + recibo firmado.
-- Mismo patrón que cobros_adjuntos: FK CASCADE, hash SHA-256 dedup,
-- soft delete, signed URLs sobre bucket privado.
-- =====================================================================

create table if not exists public.liquidaciones_adjuntos (
  id              bigserial primary key,
  liquidacion_id  integer    not null references public.liquidaciones(id) on delete cascade,
  tipo            text       not null check (tipo in ('comprobante_pago', 'recibo_firmado')),
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

create index if not exists liquidaciones_adjuntos_liq_idx
  on public.liquidaciones_adjuntos (liquidacion_id) where deleted_at is null;

create index if not exists liquidaciones_adjuntos_liq_tipo_idx
  on public.liquidaciones_adjuntos (liquidacion_id, tipo) where deleted_at is null;

create unique index if not exists liquidaciones_adjuntos_liq_hash_uq
  on public.liquidaciones_adjuntos (liquidacion_id, hash_sha256) where deleted_at is null;

create or replace function public._liquidaciones_adjuntos_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_liquidaciones_adjuntos_touch on public.liquidaciones_adjuntos;
create trigger trg_liquidaciones_adjuntos_touch
  before update on public.liquidaciones_adjuntos
  for each row execute function public._liquidaciones_adjuntos_touch_updated_at();

alter table public.liquidaciones_adjuntos enable row level security;
drop policy if exists liquidaciones_adjuntos_all on public.liquidaciones_adjuntos;
create policy liquidaciones_adjuntos_all on public.liquidaciones_adjuntos
  for all using (true) with check (true);

-- ── Bucket `liquidaciones-docs` (privado) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'liquidaciones-docs', 'liquidaciones-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists liquidaciones_docs_select_auth on storage.objects;
create policy liquidaciones_docs_select_auth on storage.objects
  for select to authenticated using (bucket_id = 'liquidaciones-docs');

drop policy if exists liquidaciones_docs_insert_auth on storage.objects;
create policy liquidaciones_docs_insert_auth on storage.objects
  for insert to authenticated with check (bucket_id = 'liquidaciones-docs');

drop policy if exists liquidaciones_docs_delete_auth on storage.objects;
create policy liquidaciones_docs_delete_auth on storage.objects
  for delete to authenticated using (bucket_id = 'liquidaciones-docs');
