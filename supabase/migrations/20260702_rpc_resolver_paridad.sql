-- ═══════════════════════════════════════════════════════════════════
--  Consolidación RPC (plan #2, paso 1) — paridad de resolver_item_compra
--  y resolver_item_despacho con el camino legacy + eventos IN-TX.
-- ───────────────────────────────────────────────────────────────────
--  Estas dos RPCs están detrás del feature flag USE_RPC_RESOLVER (hoy
--  APAGADO en prod), así que este cambio es INERTE hasta que se encienda
--  el flag — no altera el comportamiento actual (camino legacy).
--
--  Qué faltaba para poder encender el flag sin perder datos:
--   1. `pagado_por` y `cantidad_comprada`: el legacy los escribe (item +
--      MCC); las RPCs no los aceptaban → el backend los parcheaba
--      post-RPC, sin chequear error (no atómico). Ahora son parámetros.
--   2. Cantidad efectiva en MCC: el legacy usa COALESCE(cantidad_comprada,
--      cantidad); la RPC insertaba siempre la solicitada → precio_total
--      descuadrado cuando se compra distinto de lo pedido.
--   3. Eventos del timeline (solicitud_item_eventos): hoy se escriben
--      best-effort DESPUÉS de la operación (lib/item-eventos.ts) — no
--      atómicos. Ahora se insertan DENTRO de la TX de la RPC.
--   4. `updated_by` en el ítem (columna agregada en 20260701).
--
--  resolver_item_compra cambia de firma (2 params nuevos) → DROP+CREATE
--  y hay que RE-APLICAR los grants (DROP borra los de 20260527). El
--  patrón es el de esa migración: REVOKE de PUBLIC/anon/authenticated +
--  GRANT a service_role (el backend llama con SERVICE_ROLE_KEY).
--  resolver_item_despacho mantiene firma → CREATE OR REPLACE preserva
--  los grants existentes.
--
--  NO enciende el flag: ese paso (operativo, con deploy del backend) se
--  hace aparte tras smoke test del happy path (regla CLAUDE.md §8).
-- ═══════════════════════════════════════════════════════════════════

-- ── resolver_item_compra (nueva firma: + p_pagado_por, p_cantidad_comprada) ──
drop function if exists public.resolver_item_compra(integer, integer, numeric, integer, uuid);

create or replace function public.resolver_item_compra(
  p_item_id           integer,
  p_proveedor_id      integer,
  p_precio_unit       numeric,
  p_factura_id        integer default null,
  p_user_id           uuid    default null,
  p_pagado_por        text    default 'cadinc',
  p_cantidad_comprada numeric default null
)
returns table(
  item_id integer, solicitud_id integer, obra_cod text, estado text,
  material_id integer, cantidad numeric, precio_unit numeric,
  fecha_resolucion date, registrado_cuenta_cliente boolean,
  material_cuenta_cliente_id integer, stock_movimiento_id integer,
  stock_actual_post numeric
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item           solicitud_compra_item%rowtype;
  v_obra_cod       text;
  v_es_deposito    boolean;
  v_mcc_id         integer := null;
  v_registrado_mcc boolean := false;
  v_cant_efectiva  numeric;
  v_pagado_por     text := coalesce(p_pagado_por, 'cadinc');
begin
  select * into v_item
    from solicitud_compra_item
   where id = p_item_id
   for update;

  if not found then
    raise exception 'ITEM_NO_EXISTE';
  end if;
  if v_item.estado <> 'pendiente' then
    raise exception 'ITEM_NO_DISPONIBLE';
  end if;

  select s.obra_cod, o.es_deposito
    into v_obra_cod, v_es_deposito
    from solicitud_compra s
    join obras            o on o.cod = s.obra_cod
   where s.id = v_item.solicitud_id;

  perform 1 from proveedores where id = p_proveedor_id and activo = true;
  if not found then
    raise exception 'PROVEEDOR_INVALIDO';
  end if;

  if p_factura_id is not null then
    perform 1 from facturas_compra where id = p_factura_id;
    if not found then
      raise exception 'FACTURA_INVALIDA';
    end if;
  end if;

  -- Cantidad efectiva: la comprada si se especificó, si no la solicitada.
  v_cant_efectiva := coalesce(p_cantidad_comprada, v_item.cantidad);

  update solicitud_compra_item
     set estado            = 'comprado',
         proveedor_id      = p_proveedor_id,
         precio_unit       = p_precio_unit,
         factura_id        = p_factura_id,
         fecha_resolucion  = current_date,
         pagado_por        = v_pagado_por,
         cantidad_comprada = p_cantidad_comprada,
         updated_by        = p_user_id
   where id = p_item_id;

  if not v_es_deposito then
    begin
      insert into materiales_a_cuenta_cliente
        (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
         precio_unit, precio_total, origen, proveedor_id, factura_id,
         fecha_resolucion, pagado_por, created_by, updated_by)
      values
        (v_obra_cod, v_item.solicitud_id, p_item_id, v_item.descripcion,
         v_cant_efectiva, v_item.unidad, p_precio_unit,
         v_cant_efectiva * p_precio_unit, 'proveedor', p_proveedor_id,
         p_factura_id, current_date, v_pagado_por, p_user_id, p_user_id)
      returning id into v_mcc_id;
    exception
      when unique_violation then
        raise exception 'ITEM_YA_REGISTRADO';
    end;
    v_registrado_mcc := true;
  end if;

  -- Evento del timeline, atómico con la transición (antes era best-effort
  -- post-RPC en el backend).
  insert into solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, meta, user_id)
  values
    (p_item_id, v_item.solicitud_id, 'comprado', 'pendiente', 'comprado', v_cant_efectiva,
     jsonb_build_object(
       'proveedor_id', p_proveedor_id, 'precio_unit', p_precio_unit,
       'factura_id', p_factura_id, 'pagado_por', v_pagado_por,
       'queda_en_proveedor', false),
     p_user_id);

  return query select
    p_item_id, v_item.solicitud_id, v_obra_cod, 'comprado'::text, v_item.material_id,
    v_cant_efectiva, p_precio_unit, current_date, v_registrado_mcc, v_mcc_id,
    null::integer, null::numeric;
end;
$function$;

-- Re-aplicar grants (DROP borró los de 20260527). Patrón Supabase para SECDEF.
revoke all on function public.resolver_item_compra(integer, integer, numeric, integer, uuid, text, numeric) from public;
revoke all on function public.resolver_item_compra(integer, integer, numeric, integer, uuid, text, numeric) from anon, authenticated;
grant execute on function public.resolver_item_compra(integer, integer, numeric, integer, uuid, text, numeric) to service_role;


-- ── resolver_item_despacho (misma firma → CREATE OR REPLACE preserva grants) ──
create or replace function public.resolver_item_despacho(
  p_item_id           integer,
  p_precio_unit       numeric,
  p_user_id           uuid    default null,
  p_forzar_sin_stock  boolean default false
)
returns table(
  item_id integer, solicitud_id integer, obra_cod text, estado text,
  material_id integer, cantidad numeric, precio_unit numeric,
  fecha_resolucion date, registrado_cuenta_cliente boolean,
  material_cuenta_cliente_id integer, stock_movimiento_id integer,
  stock_actual_post numeric, stock_forzado boolean
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item           solicitud_compra_item%rowtype;
  v_obra_cod       text;
  v_es_deposito    boolean;
  v_stock_pre      numeric;
  v_stock_post     numeric := null;
  v_mov_id         integer := null;
  v_mcc_id         integer := null;
  v_registrado_mcc boolean := false;
begin
  select * into v_item
    from solicitud_compra_item
   where id = p_item_id
   for update;

  if not found then
    raise exception 'ITEM_NO_EXISTE';
  end if;
  if v_item.estado <> 'pendiente' then
    raise exception 'ITEM_NO_DISPONIBLE';
  end if;

  select s.obra_cod, o.es_deposito
    into v_obra_cod, v_es_deposito
    from solicitud_compra s
    join obras            o on o.cod = s.obra_cod
   where s.id = v_item.solicitud_id;

  if v_item.material_id is not null then
    select stock_actual into v_stock_pre
      from stock_materiales
     where id = v_item.material_id
     for update;

    if v_stock_pre < v_item.cantidad and not p_forzar_sin_stock then
      raise exception 'STOCK_INSUFICIENTE'
        using detail = json_build_object(
          'material_id',         v_item.material_id,
          'stock_actual',        v_stock_pre,
          'cantidad_solicitada', v_item.cantidad
        )::text;
    end if;
  end if;

  update solicitud_compra_item
     set estado           = 'de_deposito',
         precio_unit      = p_precio_unit,
         fecha_resolucion = current_date,
         updated_by       = p_user_id
   where id = p_item_id;

  if v_item.material_id is not null then
    update stock_materiales
       set stock_actual = v_stock_pre - v_item.cantidad,
           updated_by   = p_user_id,
           updated_at   = now()
     where id = v_item.material_id;

    insert into stock_movimientos
      (material_id, tipo, cantidad, motivo, obra_cod,
       solicitud_item_id, fecha, created_by, forzado_sin_stock)
    values
      (v_item.material_id, 'salida', v_item.cantidad, 'despacho_obra',
       v_obra_cod, p_item_id, current_date, p_user_id, p_forzar_sin_stock)
    returning id into v_mov_id;

    v_stock_post := v_stock_pre - v_item.cantidad;
  end if;

  if not v_es_deposito then
    begin
      insert into materiales_a_cuenta_cliente
        (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
         precio_unit, precio_total, origen, proveedor_id, factura_id,
         fecha_resolucion, created_by, updated_by)
      values
        (v_obra_cod, v_item.solicitud_id, p_item_id, v_item.descripcion,
         v_item.cantidad, v_item.unidad, p_precio_unit,
         v_item.cantidad * p_precio_unit, 'deposito', null, null,
         current_date, p_user_id, p_user_id)
      returning id into v_mcc_id;
    exception
      when unique_violation then
        raise exception 'ITEM_YA_REGISTRADO';
    end;
    v_registrado_mcc := true;
  else
    v_registrado_mcc := false;
    v_mcc_id         := null;
  end if;

  -- Evento del timeline, atómico con la transición.
  insert into solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, meta, user_id)
  values
    (p_item_id, v_item.solicitud_id, 'despachado', 'pendiente', 'de_deposito', v_item.cantidad,
     jsonb_build_object('precio_unit', p_precio_unit, 'forzar_sin_stock', p_forzar_sin_stock),
     p_user_id);

  return query select
    p_item_id, v_item.solicitud_id, v_obra_cod, 'de_deposito'::text, v_item.material_id,
    v_item.cantidad, p_precio_unit, current_date, v_registrado_mcc, v_mcc_id,
    v_mov_id, v_stock_post, p_forzar_sin_stock;
end;
$function$;
