-- FRACCIONAR BULTOS: abrir un tambor y que salgan litros.
--
-- Pedido del user (10/09): *"las cosas que vienen en bidones o tachos como es
-- pintura, tambores de aguarrás… la arena la compramos por m3 y eso equivale a
-- 60 bolsas. A veces los pedidos son en cantidades menores y se despacha esa
-- cantidad en otros envases y se descuentan de los tachos o kg que tenemos"*.
--
-- Hoy no existe NINGUNA conversión. `unidad_compatible()` es un guardarraíl
-- nominal (dice sí solo si las unidades son idénticas, o si el renglón dice
-- 'unid' y la ficha es un envase contable) y no convierte nada. Cada
-- presentación es una ficha con stock independiente: el aguarrás tiene SEIS
-- fichas que no se hablan. Si entra un tambor de 200 y hay que despachar 4, se
-- despacha de "Aguarrás x 4lts" que está en cero y se va a −1.
--
-- Y el workaround ya ocurre solo: "Thinner x 200lts (tambor)" está en 0 y
-- "Thinner (diluyente) x litro" en 180 — alguien convirtió un tambor a mano,
-- sin dejar escrita la equivalencia ni el rastro.
--
-- ── EL MODELO ELEGIDO ───────────────────────────────────────────────────
-- Se descartó llevar todo el stock a una "unidad base" por ficha: obligaba a
-- consolidar el stock ya repartido entre fichas hermanas (y ahí aparece o
-- desaparece material) y cambiaba cómo se ve el stock en todas las pantallas.
--
-- En su lugar, FRACCIONAR es una operación explícita, que es lo que pasa
-- físicamente: alguien abre el tambor. Descuenta 1 tambor, suma 200 litros, y
-- después los despachos salen normal de la ficha de litros. Es aditivo: no
-- toca el stock existente, ni los precios de nadie, ni la cuenta del cliente,
-- ni ninguno de los 17 lugares donde se calcula un total.
--
-- EL PRECIO NO SE TOCA. Primero se había decidido prorratear el costo del bulto
-- sobre lo fraccionado, pero al ver el número el user lo corrigió: la arena a
-- granel está a $28.000 la tonelada (= $700 la bolsa, flete incluido) y la
-- bolsa a $5.000, y esa diferencia NO es un error — es que **ensacar cuesta**.
-- Su palabra: "la bolsa sí debería ir a 5000 por el costo de fraccionado, no se
-- tendría que facturar respecto al m3".
--
-- Y hay una razón de fondo: en este sistema `precio_ref` es un precio de VENTA
-- (final, con IVA), no un costo. Fraccionar no cambia a cuánto se vende. Si
-- pisara el precio, abrir un tambor le cambiaría la tarifa al cliente.
--
-- Así que fraccionar mueve SOLO stock. El prorrateo se calcula igual y se
-- devuelve como dato, para que quien mira sepa a cuánto le salió — pero no se
-- escribe en ningún lado.

-- ── 1) Los dos motivos nuevos ───────────────────────────────────────────
alter table public.stock_movimientos drop constraint if exists stock_movimientos_motivo_check;
alter table public.stock_movimientos add constraint stock_movimientos_motivo_check
  check (motivo = any (array[
    'compra', 'despacho_obra', 'devolucion', 'ajuste_inventario', 'consumo_interno',
    'fraccionamiento'  -- 20260913n: las dos patas de abrir un bulto
  ]));

-- La fuente nueva hay que declararla en DOS lados: la valida `fijar_precio_ref`
-- y además la tabla de historial tiene su propio CHECK. El primer test del
-- fraccionamiento reventó justo ahí, en el trigger que escribe el historial.
alter table public.stock_materiales_precios drop constraint if exists stock_materiales_precios_fuente_check;
alter table public.stock_materiales_precios add constraint stock_materiales_precios_fuente_check
  check (fuente = any (array['manual','compra','ultima_compra','migracion','sql','backfill','fraccionamiento']));

-- `fijar_precio_ref` valida la fuente contra una lista cerrada.
create or replace function public.fijar_precio_ref(
  p_material_id integer, p_precio numeric, p_fuente text default 'manual',
  p_item_id integer default null, p_user_id uuid default null
) returns numeric
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_anterior numeric;
begin
  if p_precio is null or p_precio < 0 then
    raise exception 'PRECIO_INVALIDO' using errcode = 'P0001';
  end if;
  if p_fuente not in ('manual','compra','ultima_compra','migracion','sql','backfill','fraccionamiento') then
    raise exception 'FUENTE_INVALIDA' using errcode = 'P0001', detail = p_fuente;
  end if;
  select precio_ref into v_anterior from stock_materiales where id = p_material_id for update;
  if not found then
    raise exception 'MATERIAL_INEXISTENTE' using errcode = 'P0001';
  end if;
  perform set_config('cadinc.precio_fuente', p_fuente, true);
  perform set_config('cadinc.precio_item',   coalesce(p_item_id::text, ''), true);
  perform set_config('cadinc.precio_user',   coalesce(p_user_id::text, ''), true);
  update stock_materiales
     set precio_ref = p_precio,
         updated_by = coalesce(p_user_id, updated_by)
   where id = p_material_id;
  return v_anterior;
end $function$;

-- ── 2) Las equivalencias ────────────────────────────────────────────────
create table if not exists public.material_equivalencias (
  id          serial primary key,
  origen_id   integer not null references public.stock_materiales(id) on delete cascade,
  destino_id  integer not null references public.stock_materiales(id) on delete cascade,
  -- Cuántas unidades de DESTINO salen de UNA de origen. 1 tambor → 200 litros.
  factor      numeric not null check (factor > 0),
  obs         text,
  activo      boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  constraint material_equivalencias_no_espejo check (origen_id <> destino_id)
);

-- Una sola equivalencia viva por par: si no, fraccionar no sabría cuál usar.
create unique index if not exists material_equivalencias_par_uidx
  on public.material_equivalencias (origen_id, destino_id) where activo;

alter table public.material_equivalencias enable row level security;
drop policy if exists material_equivalencias_all on public.material_equivalencias;
create policy material_equivalencias_all on public.material_equivalencias
  for all using (true) with check (true);

comment on table public.material_equivalencias is
  'Cuántas unidades de destino salen de una de origen: 1 tambor de 200 lts = 200 litros, 1 tn de arena = 40 bolsas de 25 kg.';

-- ── 3) La operación ─────────────────────────────────────────────────────
-- Transaccional con lock sobre las dos fichas, en orden de id para no
-- deadlockear con otro fraccionamiento cruzado.
create or replace function public.fraccionar_material(
  p_origen_id  integer,
  p_cantidad   numeric,
  p_user_id    uuid default null,
  p_obs        text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_eq       record;
  v_origen   record;
  v_destino  record;
  v_unidades numeric;
  v_costo    numeric;
  v_precio   numeric;
  v_stock_d  numeric;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA' using errcode = 'P0001';
  end if;

  select * into v_eq from public.material_equivalencias
   where origen_id = p_origen_id and activo limit 1;
  if not found then
    raise exception 'SIN_EQUIVALENCIA' using errcode = 'P0001',
      detail = 'Esa ficha no tiene definido en qué se fracciona.';
  end if;

  -- Lock en orden de id: dos fraccionamientos cruzados no se traban.
  if p_origen_id < v_eq.destino_id then
    select * into v_origen  from public.stock_materiales where id = p_origen_id      for update;
    select * into v_destino from public.stock_materiales where id = v_eq.destino_id  for update;
  else
    select * into v_destino from public.stock_materiales where id = v_eq.destino_id  for update;
    select * into v_origen  from public.stock_materiales where id = p_origen_id      for update;
  end if;
  if v_origen.id is null or v_destino.id is null then
    raise exception 'MATERIAL_INEXISTENTE' using errcode = 'P0001';
  end if;

  if v_origen.stock_actual < p_cantidad then
    raise exception 'STOCK_INSUFICIENTE' using errcode = 'P0001',
      detail = format('hay %s y se quiere fraccionar %s', v_origen.stock_actual, p_cantidad);
  end if;

  v_unidades := p_cantidad * v_eq.factor;
  v_costo    := p_cantidad * coalesce(v_origen.precio_ref, 0);

  -- Las dos patas del movimiento, con la obs cruzada para poder seguir el rastro.
  insert into public.stock_movimientos (material_id, tipo, cantidad, motivo, obs, fecha, created_by, estado)
  values (v_origen.id, 'salida', p_cantidad, 'fraccionamiento',
          coalesce(nullif(btrim(p_obs), '') || ' | ', '')
          || format('Fraccionado en %s %s de "%s"', v_unidades, v_destino.unidad, v_destino.nombre),
          current_date, p_user_id, 'aprobado');

  insert into public.stock_movimientos (material_id, tipo, cantidad, motivo, obs, fecha, created_by, estado)
  values (v_destino.id, 'entrada', v_unidades, 'fraccionamiento',
          coalesce(nullif(btrim(p_obs), '') || ' | ', '')
          || format('Viene de fraccionar %s de "%s"', p_cantidad, v_origen.nombre),
          current_date, p_user_id, 'aprobado');

  update public.stock_materiales
     set stock_actual = stock_actual - p_cantidad, updated_by = coalesce(p_user_id, updated_by), updated_at = now()
   where id = v_origen.id;

  v_stock_d := v_destino.stock_actual;
  update public.stock_materiales
     set stock_actual = stock_actual + v_unidades, updated_by = coalesce(p_user_id, updated_by), updated_at = now()
   where id = v_destino.id;

  -- El prorrateo se calcula pero NO se escribe: es informativo. Ver el comentario
  -- de arriba — fraccionar tiene su propio costo (ensacar) y `precio_ref` es
  -- precio de venta, no costo.
  if v_costo > 0 and v_unidades > 0 then
    v_precio := round(v_costo / v_unidades, 2);
  end if;

  return jsonb_build_object(
    'origen_id',      v_origen.id,
    'origen_nombre',  v_origen.nombre,
    'destino_id',     v_destino.id,
    'destino_nombre', v_destino.nombre,
    'fraccionado',    p_cantidad,
    'unidades',       v_unidades,
    'unidad_destino', v_destino.unidad,
    'costo_prorrateado', v_precio,  -- informativo: a cuánto salió la unidad
    'precio_destino',   v_destino.precio_ref,  -- el de venta, que NO cambia
    'stock_origen',   v_origen.stock_actual - p_cantidad,
    'stock_destino',  v_stock_d + v_unidades);
end $function$;

revoke all on function public.fraccionar_material(integer, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.fraccionar_material(integer, numeric, uuid, text) to service_role;
