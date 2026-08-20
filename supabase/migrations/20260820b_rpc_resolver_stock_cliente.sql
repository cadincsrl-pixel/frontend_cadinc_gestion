-- =====================================================================
-- Resolución "del stock del cliente" (estado nuevo: de_stock_cliente).
--
-- Un ítem pendiente de solicitud se cubre con material que el CLIENTE ya
-- compró y tiene administrado en el depósito de CADINC (20260820_stock_
-- cliente). La RPC descuenta el ledger y NO inserta en materiales_a_
-- cuenta_cliente: cobrarlo sería facturar dos veces material ajeno.
--
-- El ítem sigue el flujo normal de envío después ('de_stock_cliente' se
-- comporta como 'de_deposito' para el remito: el material sale físicamente
-- del depósito de CADINC).
-- =====================================================================

-- 1. Widening del CHECK de estado (agregar valores nunca viola filas
--    existentes; mismo criterio que 20260529).
ALTER TABLE public.solicitud_compra_item
  DROP CONSTRAINT solicitud_compra_item_estado_check;

ALTER TABLE public.solicitud_compra_item
  ADD CONSTRAINT solicitud_compra_item_estado_check
  CHECK (estado = ANY (ARRAY[
    'pendiente'::text,
    'comprado'::text,
    'de_deposito'::text,
    'en_proveedor'::text,
    'retirado'::text,
    'de_stock_cliente'::text,
    'enviado'::text,
    'rechazado'::text
  ]));


-- 2. RPC transaccional. SECURITY DEFINER + service_role only (patrón
--    20260527): el backend valida permiso y scope de obra ANTES de llamar
--    con el cliente admin, y pasa p_user_id explícito.
create or replace function public.resolver_item_stock_cliente(
  p_item_id       integer,
  p_stock_item_id integer,
  p_user_id       uuid default null
)
returns table(
  item_id integer, solicitud_id integer, obra_cod text, estado text,
  cantidad numeric, fecha_resolucion date,
  stock_cliente_item_id integer, saldo_post numeric
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item       solicitud_compra_item%rowtype;
  v_stock      stock_cliente_items%rowtype;
  v_obra_cod   text;
  v_saldo      numeric;
begin
  select * into v_item
    from solicitud_compra_item
   where id = p_item_id
   for update;

  if not found then
    raise exception 'ITEM_NO_EXISTE';
  end if;

  if v_item.estado <> 'pendiente' then
    raise exception 'ITEM_YA_PROCESADO';
  end if;

  select s.obra_cod into v_obra_cod
    from solicitud_compra s
   where s.id = v_item.solicitud_id;

  if v_obra_cod is null then
    raise exception 'SOLICITUD_NO_EXISTE';
  end if;

  select * into v_stock
    from stock_cliente_items
   where id = p_stock_item_id
   for update;

  if not found or not v_stock.activo then
    raise exception 'STOCK_CLIENTE_NO_EXISTE';
  end if;

  -- El material del cliente solo va a SU obra.
  if v_stock.obra_cod <> v_obra_cod then
    raise exception 'OBRA_DISTINTA';
  end if;

  -- Saldo con lock tomado sobre el item del ledger (serializa consumos
  -- concurrentes del mismo material). Columnas calificadas con alias: las
  -- OUT del RETURNS TABLE (cantidad, item_id) son variables plpgsql y
  -- ensombrecen las de la tabla (bug cazado en smoke test, 2026-08-20).
  select coalesce(sum(case when m.tipo = 'entrada' then m.cantidad else -m.cantidad end), 0)
    into v_saldo
    from stock_cliente_movimientos m
   where m.item_id = p_stock_item_id;

  if v_saldo < v_item.cantidad then
    raise exception 'SALDO_INSUFICIENTE';
  end if;

  insert into stock_cliente_movimientos
    (item_id, tipo, motivo, cantidad, solicitud_item_id, fecha, created_by)
  values
    (p_stock_item_id, 'salida', 'consumo_obra', v_item.cantidad,
     p_item_id, current_date, p_user_id);

  update solicitud_compra_item
     set estado           = 'de_stock_cliente',
         fecha_resolucion = current_date,
         updated_by       = p_user_id
   where id = p_item_id;

  -- Evento del timeline, atómico con la transición. Sin MCC a propósito.
  insert into solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, meta, user_id)
  values
    (p_item_id, v_item.solicitud_id, 'consumo_stock_cliente', 'pendiente',
     'de_stock_cliente', v_item.cantidad,
     jsonb_build_object('stock_cliente_item_id', p_stock_item_id,
                        'descripcion_stock', v_stock.descripcion),
     p_user_id);

  return query
  select p_item_id, v_item.solicitud_id, v_obra_cod, 'de_stock_cliente'::text,
         v_item.cantidad, current_date::date,
         p_stock_item_id, (v_saldo - v_item.cantidad);
end;
$function$;

revoke all on function public.resolver_item_stock_cliente(integer, integer, uuid) from public;
revoke all on function public.resolver_item_stock_cliente(integer, integer, uuid) from anon, authenticated;
grant execute on function public.resolver_item_stock_cliente(integer, integer, uuid) to service_role;


-- 3. Revert (deshacer la resolución): devuelve el consumo al ledger como
--    'devolucion' y vuelve el ítem a pendiente. Mismo gate que la ida.
create or replace function public.revertir_item_stock_cliente(
  p_item_id integer,
  p_user_id uuid default null
)
returns table(item_id integer, estado text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item solicitud_compra_item%rowtype;
  v_mov  stock_cliente_movimientos%rowtype;
begin
  select * into v_item
    from solicitud_compra_item
   where id = p_item_id
   for update;

  if not found then
    raise exception 'ITEM_NO_EXISTE';
  end if;

  if v_item.estado <> 'de_stock_cliente' then
    raise exception 'ITEM_NO_DE_STOCK_CLIENTE';
  end if;

  -- Consumo original (la salida más reciente de este ítem).
  select * into v_mov
    from stock_cliente_movimientos
   where solicitud_item_id = p_item_id and tipo = 'salida'
   order by id desc limit 1;

  if found then
    insert into stock_cliente_movimientos
      (item_id, tipo, motivo, cantidad, solicitud_item_id, fecha, created_by, obs)
    values
      (v_mov.item_id, 'entrada', 'devolucion', v_mov.cantidad, p_item_id,
       current_date, p_user_id, 'Reversión de consumo del ítem #' || p_item_id);
  end if;

  update solicitud_compra_item
     set estado           = 'pendiente',
         fecha_resolucion = null,
         updated_by       = p_user_id
   where id = p_item_id;

  insert into solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, user_id)
  values
    (p_item_id, v_item.solicitud_id, 'revertido', 'de_stock_cliente',
     'pendiente', v_item.cantidad, p_user_id);

  return query select p_item_id, 'pendiente'::text;
end;
$function$;

revoke all on function public.revertir_item_stock_cliente(integer, uuid) from public;
revoke all on function public.revertir_item_stock_cliente(integer, uuid) from anon, authenticated;
grant execute on function public.revertir_item_stock_cliente(integer, uuid) to service_role;
