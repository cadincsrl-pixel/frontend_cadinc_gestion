-- Gastos del área de Áridos: combustible, taller, VTV, cubiertas, seguro.
--
-- Es un clon RECORTADO de `gastos_logistica`, que es el único sistema de gastos
-- de la empresa con adopción real (912 filas). El otro, `flota_gastos`, lleva
-- 0 filas en 112 días con 14 vehículos elegibles: se descarta como molde.
--
-- QUÉ SE CLONA: sujeto opcional (el gasto puede ser de una unidad o del área),
-- catálogo de categorías data-driven, `metodo_pago`, dedup de comprobante por
-- hash, borrado suave, y los índices parciales con `where deleted_at is null`.
--
-- QUÉ NO SE CLONA, a propósito:
--  · estado / aprobado_por / aprobado_at / motivo_rechazo. En logística el
--    gasto que carga un no-admin nace 'pendiente' y los reportes solo suman
--    aprobado+pagado. Si se copiara, todo lo que cargue Alina quedaría INVISIBLE
--    en el resultado hasta que alguien apruebe. Además hoy hay 0 pendientes en
--    logística: el workflow existe y no se usa.
--  · pagado_por / adelanto_id / liquidacion_id. Áridos no liquida choferes por
--    esta vía: su paga se calcula por días trabajados (migración `20260908f`).
--  · `aplica_a` de las categorías: en logística se devuelve en todas las
--    respuestas y no lo consulta ni una validación ni la UI. Código muerto.
--
-- DÓNDE VA EL COSTO DE UN SERVICE: acá, como un gasto más. El módulo de
-- servicios (`servicios`, migración `20260908e`) queda para el CALENDARIO — qué
-- toca y cuándo — y su columna `costo` es informativa. Una sola fuente de plata
-- evita contar el mismo service dos veces en el resultado del mes.

-- ── Catálogo de categorías ────────────────────────────────────────────
create table if not exists public.aridos_gastos_categorias (
  id                   serial primary key,
  codigo               text not null unique check (codigo ~ '^[a-z0-9_]{2,30}$'),
  nombre               text not null,
  activo               boolean not null default true,
  orden                smallint not null default 100,
  -- Si el monto trae IVA. Lo usa el reporte para netear; las categorías de
  -- monotributista o de tributo (patente, multa) son precio final.
  lleva_iva            boolean not null default true,
  -- Peaje y gomería son hechos consumados: no se cargan adelantados.
  permite_fecha_futura boolean not null default true,
  created_at           timestamptz not null default now()
);

insert into public.aridos_gastos_categorias (codigo, nombre, orden, lleva_iva, permite_fecha_futura) values
  ('combustible',   'Combustible',            10,  true,  true),
  ('gomeria',       'Gomería',                20,  false, false),
  ('cubiertas',     'Cubiertas',              25,  true,  true),
  ('lavadero',      'Lavadero',               30,  false, true),
  ('taller',        'Taller / mantenimiento', 40,  true,  true),
  ('service',       'Service',                45,  true,  true),
  ('vtv_rto',       'VTV / RTO',              50,  true,  true),
  ('peaje',         'Peaje',                  60,  true,  false),
  ('seguro',        'Seguro',                 70,  false, true),
  ('patente',       'Patente e impuestos',    80,  false, true),
  ('multa',         'Multa',                  90,  false, true),
  ('otros',         'Otros',                 999,  true,  true)
on conflict (codigo) do nothing;

-- ── Los gastos ────────────────────────────────────────────────────────
create table if not exists public.aridos_gastos (
  id             bigserial primary key,
  fecha          date    not null,
  categoria_id   integer not null references public.aridos_gastos_categorias(id) on delete restrict,
  -- NULL a propósito = gasto del ÁREA, no de un camión (ej. un seguro anual
  -- contratado en conjunto). El reporte lo muestra en su propio renglón en vez
  -- de repartirlo con una regla inventada.
  unidad_id      integer references public.aridos_unidades(id) on delete set null,
  monto          numeric not null check (monto > 0),
  descripcion    text,
  proveedor      text,
  metodo_pago    text check (metodo_pago in ('efectivo','transferencia','tarjeta','cheque','cta_cte','otro')),
  comprobante_nro    text,
  comprobante_bucket text,
  comprobante_path   text,
  comprobante_hash   text,
  obs            text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_by     uuid,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- La misma foto de factura no se carga dos veces.
create unique index if not exists aridos_gastos_comprobante_hash_uq
  on public.aridos_gastos (comprobante_hash)
  where comprobante_hash is not null and deleted_at is null;
create index if not exists aridos_gastos_unidad_idx
  on public.aridos_gastos (unidad_id, fecha desc) where deleted_at is null;
create index if not exists aridos_gastos_categoria_idx
  on public.aridos_gastos (categoria_id, fecha desc) where deleted_at is null;
create index if not exists aridos_gastos_fecha_idx
  on public.aridos_gastos (fecha desc) where deleted_at is null;

-- ── Metadata del combustible ──────────────────────────────────────────
create table if not exists public.aridos_cargas_combustible (
  id                bigserial primary key,
  gasto_id          bigint not null unique references public.aridos_gastos(id) on delete cascade,
  litros            numeric not null check (litros > 0),
  odometro_km       integer check (odometro_km >= 0),
  tipo_combustible  text not null default 'gasoil' check (tipo_combustible in ('gasoil','nafta')),
  tanque_lleno      boolean not null default true,
  -- Heurísticas que fallaron al cargar (odómetro que retrocede, consumo
  -- imposible). Se persisten para que el que mira el reporte sepa de qué
  -- desconfiar, en vez de descartar la fila en silencio.
  warnings          jsonb not null default '[]'::jsonb,
  obs               text,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_by        uuid,
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists aridos_cargas_gasto_idx on public.aridos_cargas_combustible (gasto_id);

-- ── Los tres triggers que blindan la relación ─────────────────────────
-- Sin estos se puede terminar con una carga colgada de un gasto de "seguro", o
-- con un gasto de combustible sin litros. Es el trío que en logística evitó
-- que las 353 cargas se ensuciaran.
create or replace function public._aridos_carga_valida_categoria()
returns trigger language plpgsql as $$
declare v_cod text;
begin
  select c.codigo into v_cod
    from public.aridos_gastos g
    join public.aridos_gastos_categorias c on c.id = g.categoria_id
   where g.id = new.gasto_id;
  if v_cod is distinct from 'combustible' then
    raise exception 'CARGA_NO_PERMITIDA: el gasto % no es de categoria combustible', new.gasto_id;
  end if;
  return new;
end $$;

create or replace function public._aridos_gasto_protege_categoria()
returns trigger language plpgsql as $$
begin
  if new.categoria_id is distinct from old.categoria_id
     and exists (select 1 from public.aridos_cargas_combustible k
                  where k.gasto_id = old.id and k.deleted_at is null) then
    raise exception 'CATEGORIA_BLOQUEADA: el gasto % tiene una carga de combustible asociada', old.id;
  end if;
  return new;
end $$;

create or replace function public._aridos_gasto_soft_delete_cascade()
returns trigger language plpgsql as $$
begin
  if new.deleted_at is distinct from old.deleted_at then
    update public.aridos_cargas_combustible
       set deleted_at = new.deleted_at, updated_at = now()
     where gasto_id = old.id;
  end if;
  return new;
end $$;

create or replace function public._aridos_gastos_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_aridos_carga_valida_categoria on public.aridos_cargas_combustible;
create trigger trg_aridos_carga_valida_categoria before insert on public.aridos_cargas_combustible
  for each row execute function public._aridos_carga_valida_categoria();

drop trigger if exists trg_aridos_gasto_protege_categoria on public.aridos_gastos;
create trigger trg_aridos_gasto_protege_categoria before update on public.aridos_gastos
  for each row execute function public._aridos_gasto_protege_categoria();

drop trigger if exists trg_aridos_gasto_soft_delete on public.aridos_gastos;
create trigger trg_aridos_gasto_soft_delete after update on public.aridos_gastos
  for each row execute function public._aridos_gasto_soft_delete_cascade();

do $$
declare t text;
begin
  foreach t in array array['aridos_gastos','aridos_cargas_combustible'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_'||t||'_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public._aridos_gastos_touch()', 'trg_'||t||'_touch', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_all', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t||'_all', t);
  end loop;
  execute 'alter table public.aridos_gastos_categorias enable row level security';
  execute 'drop policy if exists aridos_gastos_categorias_all on public.aridos_gastos_categorias';
  execute 'create policy aridos_gastos_categorias_all on public.aridos_gastos_categorias for all using (true) with check (true)';
end $$;

-- ── Alta atómica de gasto + carga ─────────────────────────────────────
-- Sin esto, un fallo en el segundo insert deja un gasto de combustible sin
-- litros, que es exactamente el dato por el que se carga.
create or replace function public.sp_aridos_gasto_con_carga(
  p_gasto jsonb, p_carga jsonb, p_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cod    text;
  v_gasto  public.aridos_gastos;
  v_carga  public.aridos_cargas_combustible;
begin
  select codigo into v_cod from public.aridos_gastos_categorias
   where id = (p_gasto->>'categoria_id')::int;
  if v_cod is null then
    raise exception 'CATEGORIA_INVALIDA';
  end if;
  if v_cod = 'combustible' and p_carga is null then
    raise exception 'CARGA_REQUERIDA: un gasto de combustible necesita litros';
  end if;
  if v_cod <> 'combustible' and p_carga is not null then
    raise exception 'CARGA_NO_PERMITIDA: solo combustible lleva litros';
  end if;

  insert into public.aridos_gastos (
    fecha, categoria_id, unidad_id, monto, descripcion, proveedor, metodo_pago,
    comprobante_nro, obs, created_by, updated_by)
  values (
    (p_gasto->>'fecha')::date, (p_gasto->>'categoria_id')::int,
    nullif(p_gasto->>'unidad_id','')::int, (p_gasto->>'monto')::numeric,
    p_gasto->>'descripcion', p_gasto->>'proveedor', p_gasto->>'metodo_pago',
    p_gasto->>'comprobante_nro', p_gasto->>'obs', p_user_id, p_user_id)
  returning * into v_gasto;

  if p_carga is not null then
    insert into public.aridos_cargas_combustible (
      gasto_id, litros, odometro_km, tipo_combustible, tanque_lleno, warnings, obs,
      created_by, updated_by)
    values (
      v_gasto.id, (p_carga->>'litros')::numeric, nullif(p_carga->>'odometro_km','')::int,
      coalesce(p_carga->>'tipo_combustible','gasoil'),
      coalesce((p_carga->>'tanque_lleno')::boolean, true),
      coalesce(p_carga->'warnings', '[]'::jsonb), p_carga->>'obs',
      p_user_id, p_user_id)
    returning * into v_carga;
  end if;

  return jsonb_build_object('gasto', to_jsonb(v_gasto), 'carga', to_jsonb(v_carga));
end $$;

revoke all on function public.sp_aridos_gasto_con_carga(jsonb, jsonb, uuid) from public;
grant execute on function public.sp_aridos_gasto_con_carga(jsonb, jsonb, uuid) to service_role;

-- ── Vistas ────────────────────────────────────────────────────────────
create or replace view public.v_aridos_cargas_combustible as
select k.id, k.gasto_id, g.fecha, g.unidad_id, u.nombre as unidad, u.patente,
       g.monto, k.litros, k.odometro_km, k.tipo_combustible, k.tanque_lleno,
       k.warnings, g.proveedor,
       round(g.monto / nullif(k.litros, 0), 2) as precio_litro
  from public.aridos_cargas_combustible k
  join public.aridos_gastos g on g.id = k.gasto_id
  left join public.aridos_unidades u on u.id = g.unidad_id
 where k.deleted_at is null and g.deleted_at is null;

alter view public.v_aridos_cargas_combustible set (security_invoker = on);

-- Gastos del mes por unidad y categoría, que es como se lee el resultado.
create or replace view public.v_aridos_gastos_mes as
select date_trunc('month', g.fecha)::date as mes,
       g.unidad_id,
       coalesce(u.nombre, 'Del área (sin camión)') as unidad,
       c.codigo as categoria_codigo,
       c.nombre as categoria,
       count(*)     as movimientos,
       sum(g.monto) as total
  from public.aridos_gastos g
  join public.aridos_gastos_categorias c on c.id = g.categoria_id
  left join public.aridos_unidades u on u.id = g.unidad_id
 where g.deleted_at is null
 group by 1, 2, 3, 4, 5;

alter view public.v_aridos_gastos_mes set (security_invoker = on);

comment on view public.v_aridos_gastos_mes is
  'Egresos de aridos por mes, unidad y categoria. unidad_id NULL = gasto del area, no de un camion.';
