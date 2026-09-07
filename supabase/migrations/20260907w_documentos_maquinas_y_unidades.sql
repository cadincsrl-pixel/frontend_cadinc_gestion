-- Documentación (VTV, RTO, seguro, título…) para las máquinas de Alquiler y las
-- unidades de Áridos, con el mismo mecanismo que ya usan flota, camiones y bateas.
--
-- POR QUÉ DOS TABLAS Y NO UNA GENÉRICA: el repo ya resolvió el problema de
-- "la misma tabla de documentos para varias entidades" con `camion_documentos` +
-- `batea_documentos` y UN service compartido (`vehiculo-docs.service.ts`) que
-- traduce entidad → tabla. Las tablas quedan separadas para conservar la FK real
-- con ON DELETE CASCADE y los índices parciales; el código se escribe una vez.
-- Sumar una tabla genérica sería un modelo paralelo MÁS, que es justo la deuda
-- que CLAUDE.md §9 pide no agrandar.
--
-- TIPOS: el user pidió la misma lista para las dos entidades, la de flota
-- ("lleva todo lo mismo, si no lo tiene lo dejo en blanco"). Por eso el CHECK
-- copia el de `flota_documentos` y no el de camión/batea, que es más corto.
--
-- BUCKETS: uno por módulo, con el prefijo que cada uno ya venía usando.
--   maquina → alquiler-docs, prefijo `maquina/{id}/`   (ya existía)
--   unidad  → aridos-docs,   prefijo `unidad/{id}/`    (se crea acá)
-- Mantener el prefijo de alquiler permite migrar la póliza que ya está cargada
-- SIN mover el archivo de lugar: solo se muda el metadato.

-- ── Bucket de áridos ──────────────────────────────────────────────────
-- Privado, 10 MB, mismos MIME que el resto de los buckets de documentos.
-- Sin policies de storage.objects a propósito: el backend entra como
-- service_role y la subida va por signed upload token, igual que flota-docs
-- y alquiler-docs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'aridos-docs', 'aridos-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do nothing;

-- ── Las dos tablas ────────────────────────────────────────────────────
-- Estructura calcada de `camion_documentos` (misma forma, mismos índices,
-- mismo trigger de touch) para que el service compartido no tenga que
-- ramificar por entidad más allá del nombre de tabla y de la FK.
do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('alquiler_maquina_documentos', 'maquina_id', 'alquiler_maquinas'),
      ('aridos_unidad_documentos',    'unidad_id',  'aridos_unidades')
    ) as t(tabla, fk_col, tabla_padre)
  loop
    execute format($f$
      create table if not exists public.%I (
        id             bigserial primary key,
        %I             integer not null references public.%I(id) on delete cascade,
        tipo           text not null check (tipo in (
                         'titulo','tarjeta_verde','vtv','rto',
                         'poliza_seguro','patente','oblea','otro')),
        storage_path   text not null,
        nombre_archivo text not null,
        hash_sha256    text not null,
        mime_type      text not null,
        size_bytes     bigint not null check (size_bytes > 0),
        vence_el       date,
        obs            text,
        created_by     uuid,
        created_at     timestamptz not null default now(),
        updated_by     uuid,
        updated_at     timestamptz not null default now(),
        deleted_at     timestamptz
      )$f$, v.tabla, v.fk_col, v.tabla_padre);

    execute format('create index if not exists %I on public.%I (%I) where deleted_at is null',
                   v.tabla || '_fk_idx', v.tabla, v.fk_col);
    execute format('create index if not exists %I on public.%I (%I, tipo) where deleted_at is null',
                   v.tabla || '_fk_tipo_idx', v.tabla, v.fk_col);
    execute format('create index if not exists %I on public.%I (vence_el) where deleted_at is null and vence_el is not null',
                   v.tabla || '_vence_idx', v.tabla);
    -- El dedup: dos veces el MISMO archivo en la MISMA entidad se rechaza.
    -- El service lo cachea como 409 DOC_DUPLICADO y borra el objeto subido.
    execute format('create unique index if not exists %I on public.%I (%I, hash_sha256) where deleted_at is null',
                   v.tabla || '_hash_uq', v.tabla, v.fk_col);

    execute format('drop trigger if exists %I on public.%I', 'trg_' || v.tabla || '_touch', v.tabla);
    execute format('create trigger %I before update on public.%I for each row execute function public._vehiculo_docs_touch_updated_at()',
                   'trg_' || v.tabla || '_touch', v.tabla);

    -- RLS permisiva, como el resto de `public`: la seguridad real está en el
    -- backend (CLAUDE.md §5.4). Desde `20260906q` anon/authenticated no
    -- escriben igual.
    execute format('alter table public.%I enable row level security', v.tabla);
    execute format('drop policy if exists %I on public.%I', v.tabla || '_all', v.tabla);
    execute format('create policy %I on public.%I for all using (true) with check (true)',
                   v.tabla || '_all', v.tabla);
  end loop;
end $$;

-- ── Migrar la póliza que ya estaba cargada en la fila de la máquina ───
-- `alquiler_maquinas` guardaba UNA póliza en 6 columnas denormalizadas
-- (`seguro_poliza_*`). Pasa a ser una fila más de la tabla de documentos.
-- El archivo NO se mueve: mismo bucket y mismo path.
-- Las columnas viejas NO se borran todavía — se dan de baja en una migración
-- posterior, una vez verificado en prod que la pantalla nueva anda.
insert into public.alquiler_maquina_documentos
  (maquina_id, tipo, storage_path, nombre_archivo, hash_sha256, mime_type,
   size_bytes, vence_el, obs, created_by, created_at, updated_by)
select m.id, 'poliza_seguro', m.seguro_poliza_path, m.seguro_poliza_nombre,
       m.seguro_poliza_hash, m.seguro_poliza_mime, m.seguro_poliza_size,
       m.seguro_vence,
       'Migrada el 2026-09-07 desde las columnas seguro_poliza_* de la máquina.'
         || case when m.seguro is not null then ' Seguro: ' || m.seguro else '' end,
       m.created_by, m.created_at, m.updated_by
  from public.alquiler_maquinas m
 where m.seguro_poliza_path is not null
   and m.seguro_poliza_hash is not null
   and not exists (
     select 1 from public.alquiler_maquina_documentos d
      where d.maquina_id = m.id and d.hash_sha256 = m.seguro_poliza_hash
        and d.deleted_at is null);

-- ── La vista de vencimientos suma las dos entidades ───────────────────
-- Alimenta la campana del topbar y los banners por módulo. Un documento por
-- (entidad, id, tipo): el más reciente con fecha de vencimiento.
create or replace view public.v_vehiculo_documentos_vencimientos as
with camion_ult as (
  select distinct on (camion_id, tipo) id, camion_id, tipo, vence_el, nombre_archivo, created_at
    from camion_documentos where vence_el is not null and deleted_at is null
   order by camion_id, tipo, created_at desc
), batea_ult as (
  select distinct on (batea_id, tipo) id, batea_id, tipo, vence_el, nombre_archivo, created_at
    from batea_documentos where vence_el is not null and deleted_at is null
   order by batea_id, tipo, created_at desc
), flota_ult as (
  select distinct on (vehiculo_id, tipo) id, vehiculo_id, tipo, vence_el, nombre_archivo, created_at
    from flota_documentos where vence_el is not null and deleted_at is null
   order by vehiculo_id, tipo, created_at desc
), maquina_ult as (
  select distinct on (maquina_id, tipo) id, maquina_id, tipo, vence_el, nombre_archivo, created_at
    from alquiler_maquina_documentos where vence_el is not null and deleted_at is null
   order by maquina_id, tipo, created_at desc
), unidad_ult as (
  select distinct on (unidad_id, tipo) id, unidad_id, tipo, vence_el, nombre_archivo, created_at
    from aridos_unidad_documentos where vence_el is not null and deleted_at is null
   order by unidad_id, tipo, created_at desc
)
select cu.id as doc_id, 'camion'::text as entidad, cu.camion_id as entidad_id,
       c.patente as entidad_patente, cu.tipo, cu.vence_el, cu.nombre_archivo
  from camion_ult cu join camiones c on c.id = cu.camion_id
union all
select bu.id, 'batea'::text, bu.batea_id, b.patente, bu.tipo, bu.vence_el, bu.nombre_archivo
  from batea_ult bu join bateas b on b.id = bu.batea_id
union all
select fu.id, 'flota'::text, fu.vehiculo_id, f.patente, fu.tipo, fu.vence_el, fu.nombre_archivo
  from flota_ult fu join flota_vehiculos f on f.id = fu.vehiculo_id
union all
-- La máquina no tiene patente: se usa su identificación, y si no el nombre,
-- para que la campana tenga algo con qué nombrarla.
select mu.id, 'maquina'::text, mu.maquina_id,
       coalesce(nullif(m.identificacion, ''), m.nombre), mu.tipo, mu.vence_el, mu.nombre_archivo
  from maquina_ult mu join alquiler_maquinas m on m.id = mu.maquina_id
union all
select uu.id, 'unidad'::text, uu.unidad_id, u.patente, uu.tipo, uu.vence_el, uu.nombre_archivo
  from unidad_ult uu join aridos_unidades u on u.id = uu.unidad_id;

alter view public.v_vehiculo_documentos_vencimientos set (security_invoker = on);

comment on view public.v_vehiculo_documentos_vencimientos is
  'Último documento con vencimiento por (entidad, id, tipo). Entidades: camion, batea, flota, maquina, unidad. La consumen la campana del topbar y los banners de cada módulo.';
