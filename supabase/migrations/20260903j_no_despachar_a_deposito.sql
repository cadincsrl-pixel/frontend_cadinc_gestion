-- Despachar de depósito HACIA el depósito es un movimiento que no existe.
--
-- El material no se mueve, pero el sistema sí: `resolver_item_despacho`
-- descuenta stock siempre que el item tenga material_id, y el recibo NUNCA
-- lo repone — el crédito al recibir en depósito sólo corre para items
-- 'comprado' (remitos-envio.service.ts: `esDeposito && estado === 'comprado'`).
-- Neto: stock que se va y no vuelve, por un movimiento que físicamente
-- es un no-op.
--
-- Caso real: pedido #436 (obra CC DEPOSITO), 5 items cerrados así entre el
-- 07/08 y el 26/08/2026. No se perdió stock sólo porque eran texto libre sin
-- material_id vinculado; con el catálogo completo el mismo click descuenta
-- de verdad.
--
-- El backend ya corta antes de llamar a la RPC (_assertDestinoNoEsDeposito).
-- Esta guarda es defensa en profundidad: la RPC ya tenía `v_es_deposito` a
-- mano para decidir sobre MCC, ahora también corta el despacho.
--
-- Única diferencia con la versión anterior: el bloque `if v_es_deposito`
-- agregado abajo. El resto es idéntico.

create or replace function public.resolver_item_despacho(
  p_item_id          integer,
  p_precio_unit      numeric,
  p_user_id          uuid    default null,
  p_forzar_sin_stock boolean default false
)
returns table(
  item_id                    integer,
  solicitud_id               integer,
  obra_cod                   text,
  estado                     text,
  material_id                integer,
  cantidad                   numeric,
  precio_unit                numeric,
  fecha_resolucion           date,
  registrado_cuenta_cliente  boolean,
  material_cuenta_cliente_id integer,
  stock_movimiento_id        integer,
  stock_actual_post          numeric,
  stock_forzado              boolean
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

  -- ── NUEVO ── El depósito no se despacha a sí mismo.
  if v_es_deposito then
    raise exception 'DESPACHO_A_DEPOSITO';
  end if;

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

  -- v_es_deposito ya no puede ser true acá (cortamos arriba), pero se deja
  -- la rama por simetría con resolver_item_compra y para no cambiar el
  -- contrato de la columna `registrado_cuenta_cliente`.
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

-- Mantener el modelo de la migración 20260527_revoke_secdef_from_public:
-- SECURITY DEFINER sólo ejecutable por service_role.
revoke execute on function public.resolver_item_despacho(integer, numeric, uuid, boolean) from public, anon, authenticated;
grant  execute on function public.resolver_item_despacho(integer, numeric, uuid, boolean) to service_role;
