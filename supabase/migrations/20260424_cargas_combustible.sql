-- =====================================================================
-- Cargas de combustible — extensión 1:1 a gastos_logistica
--
-- Captura litros + odómetro + tipo de combustible + tanque_lleno para
-- filas de gastos_logistica con categoria.codigo='combustible'.
-- Permite calcular consumo (km/L) por camión (odómetro-based) y por
-- chofer/mes (tramos-based).
--
-- Decisiones clave (del review de seguridad):
--   - soft-delete cascade de gastos → carga (trigger) para evitar
--     cargas zombies en reportes cuando se soft-deletea un gasto.
--   - views excluyen AdBlue del denominador de km/L (aditivo, no combustible).
--   - views filtran gl.deleted_at IS NULL y cc.deleted_at IS NULL.
--   - warnings persistidos en jsonb para que reportes y auditoría los vean.
--   - categoría inmutable si el gasto tiene carga (trigger en update).
--   - RPC sp_crear_gasto_con_carga con SECURITY INVOKER para atomicidad
--     sin saltearse permisos.
-- =====================================================================


-- ── 1. Capacidad de tanque en camiones (opcional, para validación) ───
alter table camiones
  add column if not exists capacidad_tanque_l numeric(6,2);

comment on column camiones.capacidad_tanque_l is
  'Capacidad nominal del tanque (litros). Si está seteado, el backend valida que una carga no supere capacidad * 1.05. Nullable: valor desconocido desactiva la validación.';


-- ── 2. Tabla cargas_combustible ──────────────────────────────────────
create table if not exists cargas_combustible (
  id                serial primary key,
  gasto_id          integer not null unique
                    references gastos_logistica(id) on delete cascade,

  litros            numeric(10,3) not null check (litros > 0),
  odometro_km       integer check (odometro_km is null or odometro_km >= 0),

  tipo_combustible  text not null default 'gasoil'
                    check (tipo_combustible in ('gasoil','nafta','nafta_super','adblue')),

  tanque_lleno      boolean not null default true,

  -- Warnings persistidos del create (ODOMETRO_RETROCEDE, ODOMETRO_VS_TRAMOS_DISCREPANCIA,
  -- PRECIO_LITRO_ANOMALO, LITROS_MAS_QUE_TANQUE). Los reportes los muestran.
  warnings          jsonb not null default '[]'::jsonb,

  -- Accountability cuando el user fuerza override de un warning.
  odometro_forzado_por  uuid references auth.users(id),
  odometro_forzado_at   timestamptz,

  obs               text not null default '',

  -- Soft-delete (propagado desde gasto via trigger).
  deleted_at        timestamptz,

  created_by        uuid references auth.users(id),
  updated_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table cargas_combustible is
  'Extensión 1:1 a gastos_logistica para cargas de combustible. El gasto sigue siendo la unidad de negocio.';


-- ── 3. Integridad cross-table (triggers) ─────────────────────────────

-- 3a) Al INSERT/UPDATE de gasto_id en carga, validar que el gasto sea
--     de categoría 'combustible'.
create or replace function cargas_combustible_valida_categoria()
returns trigger language plpgsql as $$
declare v_codigo text;
begin
  select gc.codigo into v_codigo
  from gastos_logistica gl
  join gastos_categorias gc on gc.id = gl.categoria_id
  where gl.id = new.gasto_id;
  if v_codigo is null then
    raise exception 'gasto_id % no existe', new.gasto_id;
  end if;
  if v_codigo <> 'combustible' then
    raise exception 'gasto % no es de categoría combustible (es %)', new.gasto_id, v_codigo;
  end if;
  return new;
end;
$$;

drop trigger if exists cargas_combustible_valida_cat on cargas_combustible;
create trigger cargas_combustible_valida_cat
  before insert or update of gasto_id on cargas_combustible
  for each row execute function cargas_combustible_valida_categoria();

-- 3b) Al UPDATE de categoria_id en gastos_logistica, si el gasto tiene
--     una carga activa, bloquear el cambio a no-combustible.
create or replace function gastos_logistica_protege_categoria_con_carga()
returns trigger language plpgsql as $$
declare v_codigo_nuevo text;
begin
  if exists (
    select 1 from cargas_combustible
    where gasto_id = new.id and deleted_at is null
  ) then
    select codigo into v_codigo_nuevo
    from gastos_categorias where id = new.categoria_id;
    if v_codigo_nuevo <> 'combustible' then
      raise exception 'No se puede cambiar categoría del gasto % a % porque tiene carga de combustible asociada', new.id, v_codigo_nuevo;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists gastos_logistica_protege_cat on gastos_logistica;
create trigger gastos_logistica_protege_cat
  before update of categoria_id on gastos_logistica
  for each row
  when (old.categoria_id is distinct from new.categoria_id)
  execute function gastos_logistica_protege_categoria_con_carga();

-- 3c) Soft-delete cascade: al setear gastos_logistica.deleted_at,
--     propagar a la carga asociada. Al desarmar el soft-delete (NULL),
--     restaurar.
create or replace function gastos_logistica_soft_delete_cascade()
returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update cargas_combustible
       set deleted_at = new.deleted_at,
           updated_by = new.updated_by
     where gasto_id = new.id and deleted_at is null;
  elsif new.deleted_at is null and old.deleted_at is not null then
    update cargas_combustible
       set deleted_at = null,
           updated_by = new.updated_by
     where gasto_id = new.id and deleted_at is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists gastos_logistica_sd_cascade on gastos_logistica;
create trigger gastos_logistica_sd_cascade
  after update of deleted_at on gastos_logistica
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function gastos_logistica_soft_delete_cascade();

-- 3d) updated_at trigger
drop trigger if exists cargas_combustible_set_updated_at on cargas_combustible;
create trigger cargas_combustible_set_updated_at
  before update on cargas_combustible
  for each row execute function set_updated_at();


-- ── 4. Índices ───────────────────────────────────────────────────────
create index if not exists cargas_combustible_gasto_idx
  on cargas_combustible (gasto_id) where deleted_at is null;

create index if not exists cargas_combustible_odometro_idx
  on cargas_combustible (gasto_id)
  where odometro_km is not null and deleted_at is null;

create index if not exists cargas_combustible_tipo_idx
  on cargas_combustible (tipo_combustible) where deleted_at is null;


-- ── 5. RLS permisiva ─────────────────────────────────────────────────
alter table cargas_combustible enable row level security;
create policy "auth_all" on cargas_combustible
  for all to authenticated using (true) with check (true);


-- ── 6. Views de consulta y reporte ───────────────────────────────────

-- View de conveniencia: carga + campos heredados del gasto.
-- precio_litro calculado. Filtra ambos soft-deletes.
create or replace view v_cargas_combustible as
select
  cc.id,
  cc.gasto_id,
  gl.camion_id,
  gl.chofer_id,
  gl.tramo_id,
  gl.fecha,
  gl.monto,
  cc.litros,
  round(gl.monto::numeric / cc.litros, 2) as precio_litro,
  cc.odometro_km,
  cc.tipo_combustible,
  cc.tanque_lleno,
  cc.warnings,
  gl.proveedor,
  gl.estado as estado_gasto,
  cc.obs,
  cc.created_at
from cargas_combustible cc
join gastos_logistica   gl on gl.id = cc.gasto_id
where gl.deleted_at is null and cc.deleted_at is null;

comment on view v_cargas_combustible is
  'Vista consolidada carga+gasto, filtrada por soft-delete. Útil para listados y base de los reportes.';

-- Consumo por camión: pares consecutivos de tanque_lleno con odómetro.
-- AdBlue excluido (no combustible). La suma de litros del intervalo
-- incluye cargas parciales del mismo camión en el rango (fecha_prev, fecha].
create or replace view v_consumo_camion_odometro as
with llenas as (
  select
    v.camion_id,
    v.fecha,
    v.odometro_km,
    v.id as carga_id,
    lag(v.odometro_km) over w as odometro_prev,
    lag(v.fecha)       over w as fecha_prev
  from v_cargas_combustible v
  where v.odometro_km is not null
    and v.tanque_lleno
    and v.tipo_combustible in ('gasoil','nafta','nafta_super')
  window w as (partition by v.camion_id order by v.fecha, v.id)
),
litros_intervalo as (
  select
    l.camion_id,
    l.fecha,
    l.odometro_km,
    (l.odometro_km - l.odometro_prev) as km_recorridos,
    (
      select sum(v2.litros)
      from v_cargas_combustible v2
      where v2.camion_id = l.camion_id
        and v2.fecha > l.fecha_prev
        and v2.fecha <= l.fecha
        and v2.tipo_combustible in ('gasoil','nafta','nafta_super')
    ) as litros_intervalo
  from llenas l
  where l.odometro_prev is not null and l.odometro_km > l.odometro_prev
)
select
  camion_id,
  fecha,
  odometro_km,
  km_recorridos,
  litros_intervalo,
  round(km_recorridos::numeric / nullif(litros_intervalo, 0), 2) as km_por_litro
from litros_intervalo;

comment on view v_consumo_camion_odometro is
  'Rendimiento km/L por camión entre pares consecutivos de tanqueo lleno. Incluye litros parciales intermedios. Excluye AdBlue.';

-- Consumo por chofer y mes: km de tramos ÷ litros cargados.
-- AdBlue excluido del denominador.
create or replace view v_consumo_chofer_mes as
with km_tramos as (
  select
    t.chofer_id,
    date_trunc('month', t.fecha_operacion)::date as mes,
    sum(coalesce(r.km_ida_vuelta, 0)) as km_recorridos
  from tramos t
  left join rutas r
    on r.cantera_id = t.cantera_id
   and r.deposito_id = t.deposito_id
  where t.fecha_operacion is not null
  group by t.chofer_id, date_trunc('month', t.fecha_operacion)
),
litros_cargados as (
  select
    v.chofer_id,
    date_trunc('month', v.fecha)::date as mes,
    sum(v.litros) as litros,
    sum(v.monto)  as gasto_combustible,
    count(*)      as cargas_count
  from v_cargas_combustible v
  where v.chofer_id is not null
    and v.tipo_combustible in ('gasoil','nafta','nafta_super')
  group by v.chofer_id, date_trunc('month', v.fecha)
)
select
  coalesce(k.chofer_id, l.chofer_id) as chofer_id,
  coalesce(k.mes, l.mes)             as mes,
  k.km_recorridos,
  l.litros,
  l.gasto_combustible,
  l.cargas_count,
  round(k.km_recorridos / nullif(l.litros, 0), 2) as km_por_litro
from km_tramos k
full outer join litros_cargados l
  on l.chofer_id = k.chofer_id and l.mes = k.mes;

comment on view v_consumo_chofer_mes is
  'Rendimiento km/L por chofer y mes. Numerador: km de rutas cruzadas con tramos. Denominador: litros cargados (sin AdBlue).';


-- ── 7. RPC transaccional para crear gasto + carga ────────────────────
create or replace function sp_crear_gasto_con_carga(
  p_gasto jsonb,
  p_carga jsonb,
  p_user_id uuid,
  p_auto_aprobar boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
DECLARE
  v_gasto_id     integer;
  v_categoria    text;
  v_estado       text;
  v_aprobado_at  timestamptz;
  v_aprobado_por uuid;
  v_gasto        jsonb;
  v_carga        jsonb;
BEGIN
  -- Leer el código de categoría para validación cruzada
  SELECT gc.codigo INTO v_categoria
  FROM gastos_categorias gc
  WHERE gc.id = (p_gasto->>'categoria_id')::integer;

  IF v_categoria IS NULL THEN
    RAISE EXCEPTION 'CATEGORIA_INVALIDA' USING DETAIL = p_gasto->>'categoria_id';
  END IF;

  -- Validación cruzada: combustible ↔ carga
  IF v_categoria = 'combustible' AND p_carga IS NULL THEN
    RAISE EXCEPTION 'CARGA_REQUERIDA'
      USING DETAIL = 'Gasto de categoría combustible requiere objeto carga con litros.';
  END IF;
  IF v_categoria <> 'combustible' AND p_carga IS NOT NULL THEN
    RAISE EXCEPTION 'CARGA_NO_PERMITIDA'
      USING DETAIL = 'Solo gastos de categoría combustible admiten carga.';
  END IF;

  -- Estado inicial (admin auto-aprueba)
  v_estado      := CASE WHEN p_auto_aprobar THEN 'aprobado' ELSE 'pendiente' END;
  v_aprobado_por := CASE WHEN p_auto_aprobar THEN p_user_id ELSE NULL END;
  v_aprobado_at  := CASE WHEN p_auto_aprobar THEN now()      ELSE NULL END;

  -- Insertar gasto
  INSERT INTO gastos_logistica (
    camion_id, chofer_id, tramo_id, lugar_id,
    categoria_id, fecha, monto, descripcion, proveedor,
    metodo_pago, pagado_por,
    comprobante_url, comprobante_hash, comprobante_nro,
    obs, estado, aprobado_por, aprobado_at,
    created_by, updated_by
  ) VALUES (
    (p_gasto->>'camion_id')::integer,
    (p_gasto->>'chofer_id')::integer,
    (p_gasto->>'tramo_id')::integer,
    (p_gasto->>'lugar_id')::integer,
    (p_gasto->>'categoria_id')::integer,
    (p_gasto->>'fecha')::date,
    (p_gasto->>'monto')::numeric,
    coalesce(p_gasto->>'descripcion', ''),
    p_gasto->>'proveedor',
    coalesce(p_gasto->>'metodo_pago', 'efectivo'),
    coalesce(p_gasto->>'pagado_por', 'empresa'),
    p_gasto->>'comprobante_url',
    p_gasto->>'comprobante_hash',
    coalesce(p_gasto->>'comprobante_nro', ''),
    coalesce(p_gasto->>'obs', ''),
    v_estado, v_aprobado_por, v_aprobado_at,
    p_user_id, p_user_id
  )
  RETURNING id INTO v_gasto_id;

  -- Insertar carga si corresponde (el trigger cargas_combustible_valida_cat
  -- revalida la categoría — cinturón + tirantes).
  IF p_carga IS NOT NULL THEN
    INSERT INTO cargas_combustible (
      gasto_id, litros, odometro_km, tipo_combustible, tanque_lleno,
      warnings, obs, created_by, updated_by
    ) VALUES (
      v_gasto_id,
      (p_carga->>'litros')::numeric,
      (p_carga->>'odometro_km')::integer,
      coalesce(p_carga->>'tipo_combustible', 'gasoil'),
      coalesce((p_carga->>'tanque_lleno')::boolean, true),
      coalesce(p_carga->'warnings', '[]'::jsonb),
      coalesce(p_carga->>'obs', ''),
      p_user_id, p_user_id
    );
  END IF;

  -- Devolver gasto + carga joined como jsonb
  SELECT to_jsonb(gl.*) INTO v_gasto FROM gastos_logistica gl WHERE gl.id = v_gasto_id;
  SELECT to_jsonb(cc.*) INTO v_carga FROM cargas_combustible cc WHERE cc.gasto_id = v_gasto_id;

  RETURN jsonb_build_object(
    'gasto', v_gasto,
    'carga_combustible', v_carga
  );
END;
$$;

grant execute on function sp_crear_gasto_con_carga(jsonb, jsonb, uuid, boolean)
  to authenticated;

comment on function sp_crear_gasto_con_carga(jsonb, jsonb, uuid, boolean) is
  'Crea gasto + carga de combustible atómicamente. Valida cross-categoría. SECURITY INVOKER: respeta permisos del caller.';
