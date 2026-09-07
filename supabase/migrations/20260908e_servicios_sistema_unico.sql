-- Un solo sistema de services para las cuatro entidades que los tienen.
--
-- HOY HAY DOS, con la misma intención y distinto alcance:
--   `flota_servicios`  (19 filas) — el completo: tipo del catálogo, km, costo,
--                       proveedor, comprobante, próximo por km y por fecha.
--   `camion_services`  (14 filas) — el pobre: fecha, km y comprobante. Sin tipo,
--                       sin costo, sin proveedor.
-- Y áridos y alquiler no tienen ninguno. Copiar uno de los dos dejaba TRES.
--
-- Decisión del user: un sistema único, y los camiones se migran a él (ganan
-- tipo, costo y proveedor, que hoy no pueden registrar).
--
-- EL MEDIDOR NO SIEMPRE SON KILÓMETROS. Una retroexcavadora hace service por
-- HORAS DE MOTOR, no por km. Por eso `km_service`/`km_proximo` se generalizan a
-- `medidor_valor`/`medidor_proximo` más una columna `medidor` que dice en qué
-- unidad están. Cada entidad tiene su fuente de verdad para el valor actual:
--   flota   → flota_vehiculos.km_actuales   (sync GPS)
--   camion  → camiones.km_actuales          (sync GPS)
--   unidad  → aridos_unidades.km_actuales   (sync GPS, agregado en 20260908d)
--   maquina → suma de horas de alquiler_partes  (ya se acumulan solas)
--
-- Las tablas viejas NO se borran: quedan de respaldo hasta verificar en prod.

-- ── Catálogo de tipos, ahora con intervalo en horas ───────────────────
create table if not exists public.tipos_servicio (
  id               serial primary key,
  nombre           text not null unique,
  intervalo_km     integer,
  intervalo_meses  integer,
  -- Para máquinas. Los valores sembrados abajo son los estándar de maquinaria
  -- vial y ESTÁN A CONFIRMAR con el user: son la única cifra de esta migración
  -- que no salió de un dato existente.
  intervalo_horas  integer,
  activo           boolean not null default true,
  created_at       timestamptz not null default now()
);

insert into public.tipos_servicio (nombre, intervalo_km, intervalo_meses, intervalo_horas, activo)
select t.nombre, t.intervalo_km, t.intervalo_meses,
       case t.nombre
         when 'Cambio de aceite'        then 250
         when 'Filtros (aire / aceite)' then 250
         when 'Service general'         then 500
         else null   -- frenos, neumáticos y correa no se miden por horas
       end,
       t.activo
  from public.flota_tipos_servicio t
 where not exists (select 1 from public.tipos_servicio n where n.nombre = t.nombre);

-- ── La tabla única ────────────────────────────────────────────────────
create table if not exists public.servicios (
  id              bigserial primary key,
  entidad         text not null check (entidad in ('flota','camion','maquina','unidad')),
  entidad_id      integer not null,
  tipo_id         integer references public.tipos_servicio(id),
  -- Cuando el service no encaja en ningún tipo del catálogo.
  tipo_libre      text,
  fecha           date not null,
  -- 'km' | 'horas' | null (service que solo se controla por fecha).
  medidor         text check (medidor in ('km','horas')),
  medidor_valor   numeric,
  medidor_proximo numeric,
  fecha_proximo   date,
  descripcion     text,
  costo           numeric,
  proveedor       text,
  -- El bucket viaja con la fila: así se migran los comprobantes de los dos
  -- sistemas viejos SIN mover un solo archivo de Storage.
  comprobante_bucket text,
  comprobante_path   text,
  comprobante_hash   text,
  obs             text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_by      uuid,
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint servicios_tipo_chk check (tipo_id is not null or tipo_libre is not null)
);

create index if not exists servicios_entidad_idx
  on public.servicios (entidad, entidad_id, fecha desc) where deleted_at is null;
create index if not exists servicios_proximo_idx
  on public.servicios (fecha_proximo) where deleted_at is null and fecha_proximo is not null;

create or replace function public._servicios_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_servicios_touch on public.servicios;
create trigger trg_servicios_touch before update on public.servicios
  for each row execute function public._servicios_touch_updated_at();

alter table public.servicios enable row level security;
drop policy if exists servicios_all on public.servicios;
create policy servicios_all on public.servicios for all using (true) with check (true);

-- ── Migrar los dos sistemas viejos ────────────────────────────────────
-- flota: se mapea 1 a 1, el tipo por NOMBRE (los ids del catálogo nuevo son otros).
insert into public.servicios
  (entidad, entidad_id, tipo_id, tipo_libre, fecha, medidor, medidor_valor, medidor_proximo,
   fecha_proximo, descripcion, costo, proveedor, comprobante_bucket, comprobante_path,
   comprobante_hash, obs, created_by, created_at, updated_by, updated_at)
select 'flota', s.vehiculo_id, tn.id, s.tipo_libre, s.fecha,
       case when s.km_service is not null or s.km_proximo is not null then 'km' end,
       s.km_service, s.km_proximo, s.fecha_proximo, s.descripcion, s.costo, s.proveedor,
       case when s.comprobante_path is not null then 'flota-servicios' end,
       s.comprobante_path, s.comprobante_hash, s.obs,
       s.created_by, s.created_at, s.updated_by, s.updated_at
  from public.flota_servicios s
  left join public.flota_tipos_servicio to_ on to_.id = s.tipo_id
  left join public.tipos_servicio tn on tn.nombre = to_.nombre
 where s.deleted_at is null
   and not exists (select 1 from public.servicios x
                    where x.entidad='flota' and x.entidad_id=s.vehiculo_id and x.fecha=s.fecha
                      and coalesce(x.medidor_valor,-1) = coalesce(s.km_service,-1));

-- camiones: no tenían tipo. Se les pone "Service general", que es lo que son
-- (cada 10.000 o 30.000 km según el camión), y el `obs` viejo se conserva.
insert into public.servicios
  (entidad, entidad_id, tipo_id, fecha, medidor, medidor_valor, medidor_proximo,
   comprobante_bucket, comprobante_path, comprobante_hash, obs,
   created_by, created_at, updated_by, updated_at)
select 'camion', s.camion_id,
       (select id from public.tipos_servicio where nombre = 'Service general'),
       s.fecha, 'km', s.km_service, s.km_proximo,
       case when s.comprobante_url is not null then 'services-camiones' end,
       s.comprobante_url, s.comprobante_hash,
       nullif(trim(coalesce(s.obs,'') || ' | Migrado de camion_services el 2026-09-07.'), ''),
       s.created_by, s.created_at, s.updated_by, s.updated_at
  from public.camion_services s
 where s.deleted_at is null
   and not exists (select 1 from public.servicios x
                    where x.entidad='camion' and x.entidad_id=s.camion_id and x.fecha=s.fecha
                      and coalesce(x.medidor_valor,-1) = coalesce(s.km_service,-1));

-- ── El medidor actual de cada entidad, en un solo lugar ───────────────
create or replace view public.v_entidad_medidor as
select 'flota'::text as entidad, v.id as entidad_id, v.patente as etiqueta,
       'km'::text as medidor, v.km_actuales as valor, v.km_actualizado_en as actualizado_en
  from public.flota_vehiculos v
union all
select 'camion', c.id, c.patente, 'km', c.km_actuales, c.km_actualizado_en
  from public.camiones c
union all
select 'unidad', u.id, u.patente, 'km', u.km_actuales, u.km_actualizado_en
  from public.aridos_unidades u
union all
-- La máquina no tiene odómetro: sus horas son las que ya cargan los partes de
-- trabajo. Por eso no hay nada que sincronizar ni que tipear.
select 'maquina', m.id, coalesce(nullif(m.identificacion,''), m.nombre), 'horas',
       (select sum(p.horas) from public.alquiler_partes p where p.maquina_id = m.id),
       (select max(p.fecha)::timestamptz from public.alquiler_partes p where p.maquina_id = m.id)
  from public.alquiler_maquinas m;

alter view public.v_entidad_medidor set (security_invoker = on);

-- ── Semáforo: cuánto falta para el próximo service ────────────────────
create or replace view public.v_servicios_estado as
with ultimo as (
  select distinct on (entidad, entidad_id) *
    from public.servicios
   where deleted_at is null
   order by entidad, entidad_id, fecha desc, id desc
)
select m.entidad, m.entidad_id, m.etiqueta, m.medidor,
       m.valor as medidor_actual, m.actualizado_en as medidor_actualizado_en,
       u.id as ultimo_servicio_id, u.fecha as ultimo_fecha,
       u.medidor_valor as ultimo_medidor, u.medidor_proximo, u.fecha_proximo,
       -- Cuánto falta. Negativo = ya se pasó.
       case when u.medidor_proximo is not null and m.valor is not null
            then u.medidor_proximo - m.valor end as restante,
       case when u.fecha_proximo is not null
            then u.fecha_proximo - current_date end as dias_restantes,
       case
         when u.id is null then 'sin_service'
         when (u.medidor_proximo is not null and m.valor is not null and m.valor >= u.medidor_proximo)
           or (u.fecha_proximo is not null and u.fecha_proximo < current_date) then 'vencido'
         -- "Cerca" es relativo a la unidad: 1.000 km o 50 horas.
         when (u.medidor_proximo is not null and m.valor is not null
               and u.medidor_proximo - m.valor <= case m.medidor when 'horas' then 50 else 1000 end)
           or (u.fecha_proximo is not null and u.fecha_proximo - current_date <= 30) then 'por_vencer'
         when u.medidor_proximo is null and u.fecha_proximo is null then 'sin_proximo'
         else 'ok'
       end as estado
  from public.v_entidad_medidor m
  left join ultimo u on u.entidad = m.entidad and u.entidad_id = m.entidad_id;

alter view public.v_servicios_estado set (security_invoker = on);

comment on view public.v_servicios_estado is
  'Semaforo de services por entidad: ultimo service, cuanto falta para el proximo y en que estado esta. El medidor es km o horas segun la entidad (ver v_entidad_medidor).';
