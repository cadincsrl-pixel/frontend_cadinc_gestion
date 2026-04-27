-- =====================================================================
-- Bateas (semirremolques) + documentos del vehículo (camiones y bateas).
--
-- Bateas: bien registrable separado del camión, puede engancharse a uno.
-- Documentos para ambos tipos de vehículo (camion / batea):
--   - titulo (no vence)
--   - tarjeta_verde (no vence)
--   - rto (vence)
--   - poliza_seguro (vence)
-- Mismo patrón que chofer_documentos (mig 20260427): tabla aparte, hash
-- dedup, bucket privado, soft delete, signed URLs.
-- =====================================================================

-- ── 1. Tabla `bateas` ──
create table if not exists public.bateas (
  id            serial primary key,
  patente       text       not null,
  tipo          text       check (tipo in ('volcadora','plana','tanque','gondola','otro')),
  marca         text,
  modelo        text,
  anio          integer,
  capacidad_m3  numeric,
  capacidad_tn  numeric,
  titular       text,
  estado        text       not null default 'activo'
                check (estado in ('activo','mantenimiento','inactivo')),
  obs           text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_by    uuid,
  updated_at    timestamptz not null default now()
);

create index if not exists bateas_patente_idx on public.bateas (patente);
create index if not exists bateas_estado_idx  on public.bateas (estado);

create or replace function public._bateas_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_bateas_touch on public.bateas;
create trigger trg_bateas_touch
  before update on public.bateas
  for each row execute function public._bateas_touch_updated_at();

alter table public.bateas enable row level security;
drop policy if exists bateas_all on public.bateas;
create policy bateas_all on public.bateas for all using (true) with check (true);


-- ── 2. Helper compartido para tabla de documentos de vehículo ──
-- Estructura idéntica para camion_documentos y batea_documentos.
-- Tipos: titulo, tarjeta_verde, rto, poliza_seguro. RTO y póliza
-- pueden tener vence_el (el resto típicamente no).
do $$
declare
  v_tabla text;
  v_fk_col text;
  v_fk_tabla text;
  v_pares text[][] := array[
    array['camion_documentos', 'camion_id', 'camiones'],
    array['batea_documentos',  'batea_id',  'bateas']
  ];
  v_par text[];
begin
  foreach v_par slice 1 in array v_pares loop
    v_tabla    := v_par[1];
    v_fk_col   := v_par[2];
    v_fk_tabla := v_par[3];

    execute format($f$
      create table if not exists public.%I (
        id              bigserial primary key,
        %I              integer    not null references public.%I(id) on delete cascade,
        tipo            text       not null check (tipo in ('titulo','tarjeta_verde','rto','poliza_seguro')),
        storage_path    text       not null,
        nombre_archivo  text       not null,
        hash_sha256     text       not null,
        mime_type       text       not null,
        size_bytes      bigint     not null check (size_bytes > 0),
        vence_el        date,
        obs             text,
        created_by      uuid,
        created_at      timestamptz not null default now(),
        updated_by      uuid,
        updated_at      timestamptz not null default now(),
        deleted_at      timestamptz
      )
    $f$, v_tabla, v_fk_col, v_fk_tabla);

    execute format(
      'create index if not exists %I on public.%I (%I) where deleted_at is null',
      v_tabla || '_fk_idx', v_tabla, v_fk_col
    );
    execute format(
      'create index if not exists %I on public.%I (%I, tipo) where deleted_at is null',
      v_tabla || '_fk_tipo_idx', v_tabla, v_fk_col
    );
    execute format(
      'create index if not exists %I on public.%I (vence_el) where deleted_at is null and vence_el is not null',
      v_tabla || '_vence_idx', v_tabla
    );
    execute format(
      'create unique index if not exists %I on public.%I (%I, hash_sha256) where deleted_at is null',
      v_tabla || '_hash_uq', v_tabla, v_fk_col
    );

    execute format(
      'alter table public.%I enable row level security',
      v_tabla
    );
    execute format(
      'drop policy if exists %I on public.%I',
      v_tabla || '_all', v_tabla
    );
    execute format(
      'create policy %I on public.%I for all using (true) with check (true)',
      v_tabla || '_all', v_tabla
    );
  end loop;
end $$;

-- Trigger updated_at compartido
create or replace function public._vehiculo_docs_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_camion_documentos_touch on public.camion_documentos;
create trigger trg_camion_documentos_touch
  before update on public.camion_documentos
  for each row execute function public._vehiculo_docs_touch_updated_at();

drop trigger if exists trg_batea_documentos_touch on public.batea_documentos;
create trigger trg_batea_documentos_touch
  before update on public.batea_documentos
  for each row execute function public._vehiculo_docs_touch_updated_at();


-- ── 3. Bucket `vehiculo-docs` (privado) ──
-- Comparten bucket. Paths: vehiculo/camion/{id}/uuid.ext o
-- vehiculo/batea/{id}/uuid.ext.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehiculo-docs', 'vehiculo-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vehiculo_docs_select_auth on storage.objects;
create policy vehiculo_docs_select_auth on storage.objects
  for select to authenticated using (bucket_id = 'vehiculo-docs');

drop policy if exists vehiculo_docs_insert_auth on storage.objects;
create policy vehiculo_docs_insert_auth on storage.objects
  for insert to authenticated with check (bucket_id = 'vehiculo-docs');

drop policy if exists vehiculo_docs_delete_auth on storage.objects;
create policy vehiculo_docs_delete_auth on storage.objects
  for delete to authenticated using (bucket_id = 'vehiculo-docs');
