-- ── Materiales por obra ──────────────────────────────────────────────────────
create table if not exists cert_materiales (
  id            bigserial primary key,
  obra_cod      text        not null references obras(cod) on delete cascade,
  fecha         date        not null,
  descripcion   text        not null,
  proveedor     text,
  cantidad      numeric(12,3) not null default 1,
  unidad        text        not null default 'unid',
  precio_unit   numeric(14,2) not null default 0,
  total         numeric(14,2) generated always as (cantidad * precio_unit) stored,
  obs           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id),
  updated_by    uuid references auth.users(id)
);

-- ── Adicionales con adjunto ──────────────────────────────────────────────────
create table if not exists cert_adicionales (
  id              bigserial primary key,
  obra_cod        text        not null references obras(cod) on delete cascade,
  fecha           date        not null,
  descripcion     text        not null,
  monto           numeric(14,2) not null default 0,
  adjunto_url     text,
  adjunto_nombre  text,
  obs             text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  updated_by      uuid references auth.users(id)
);

-- RLS
alter table cert_materiales  enable row level security;
alter table cert_adicionales enable row level security;

create policy "cert_materiales_all"  on cert_materiales  for all using (true) with check (true);
create policy "cert_adicionales_all" on cert_adicionales for all using (true) with check (true);

-- Storage bucket para adjuntos de adicionales
insert into storage.buckets (id, name, public)
values ('cert-adjuntos', 'cert-adjuntos', false)
on conflict (id) do nothing;

create policy "cert_adjuntos_upload" on storage.objects
  for insert with check (bucket_id = 'cert-adjuntos');
create policy "cert_adjuntos_read" on storage.objects
  for select using (bucket_id = 'cert-adjuntos');
create policy "cert_adjuntos_delete" on storage.objects
  for delete using (bucket_id = 'cert-adjuntos');
