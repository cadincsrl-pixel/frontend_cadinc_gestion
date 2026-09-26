-- =====================================================================
-- 20261007a — Compra y despacho por RPC: dejarlas listas para producción
-- (2026-09-26, revisión del circuito Pedidos y Stock, tanda 3)
--
-- Producción resuelve con el camino legacy del backend (varios UPDATE e
-- INSERT sueltos): si falla la cuenta del cliente, el renglón queda resuelto
-- sin fila, y el despacho no mira el saldo. Las RPC resolver_item_compra /
-- resolver_item_despacho son transaccionales pero estaban «dormidas» detrás
-- de USE_RPC_RESOLVER. Antes de usarlas siempre, dos ajustes:
--
-- 1. Herramientas: el legacy no las lleva a la cuenta del cliente; las RPC
--    insertaban y dejaban que trg_mcc_sin_herramientas borrara la fila y
--    escribiera un evento «sacado_de_cuenta_cliente» por cada compra. Ahora
--    las RPC no insertan si el renglón o su ficha es herramienta.
-- 2. Stock negativo (decisión del dueño 26/09: «dejar stock negativo hasta
--    que estemos bien pulidos pero avisar»): el despacho YA NO frena con
--    STOCK_INSUFICIENTE. Descuenta igual, marca el movimiento con
--    forzado_sin_stock = true cuando no alcanzaba, y devuelve el saldo que
--    queda (stock_actual_post) y stock_forzado para que la pantalla avise.
--    p_forzar_sin_stock queda por compatibilidad y no cambia nada.
-- Firmas y columnas de retorno sin cambios.
-- =====================================================================

create or replace function public.resolver_item_compra(p_item_id integer, p_proveedor_id integer, p_precio_unit numeric, p_factura_id integer DEFAULT NULL::integer, p_user_id uuid DEFAULT NULL::uuid, p_pagado_por text DEFAULT 'cadinc'::text, p_cantidad_comprada numeric DEFAULT NULL::numeric)
 RETURNS TABLE(item_id integer, solicitud_id integer, obra_cod text, estado text, material_id integer, cantidad numeric, precio_unit numeric, fecha_resolucion date, registrado_cuenta_cliente boolean, material_cuenta_cliente_id integer, stock_movimiento_id integer, stock_actual_post numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item           solicitud_compra_item%rowtype;
  v_obra_cod       text;
  v_es_deposito    boolean;
  v_es_herr        boolean;
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

  -- 20261007a: una herramienta no va a la cuenta del cliente (va al pañol).
  v_es_herr := coalesce(v_item.clase, 'material') = 'herramienta'
            or coalesce((select m.clase from stock_materiales m where m.id = v_item.material_id), '') = 'herramienta';

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

  if not v_es_deposito and not v_es_herr then
    begin
      insert into materiales_a_cuenta_cliente
        (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
         precio_unit, precio_total, origen, proveedor_id, factura_id,
         fecha_resolucion, pagado_por, created_by, updated_by)
      values
        (v_obra_cod, v_item.solicitud_id, p_item_id, desc_con_color(v_item.descripcion, v_item.color),
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

create or replace function public.resolver_item_despacho(p_item_id integer, p_precio_unit numeric, p_user_id uuid DEFAULT NULL::uuid, p_forzar_sin_stock boolean DEFAULT false)
 RETURNS TABLE(item_id integer, solicitud_id integer, obra_cod text, estado text, material_id integer, cantidad numeric, precio_unit numeric, fecha_resolucion date, registrado_cuenta_cliente boolean, material_cuenta_cliente_id integer, stock_movimiento_id integer, stock_actual_post numeric, stock_forzado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item           solicitud_compra_item%rowtype;
  v_obra_cod       text;
  v_es_deposito    boolean;
  v_clase          text;
  v_es_herr        boolean;
  v_mueve_stock    boolean := false;
  v_stock_pre      numeric;
  v_stock_post     numeric := null;
  v_sin_stock      boolean := false;
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

  -- El deposito no se despacha a si mismo: el despacho descuenta stock y el
  -- recibo nunca lo repone (solo acredita items 'comprado'). Pedido #436.
  if v_es_deposito then
    raise exception 'DESPACHO_A_DEPOSITO';
  end if;

  -- La herramienta no mueve stock (20260916c): el panol es la unica verdad.
  -- El servicio tampoco: ya esta en la obra cuando se carga.
  if v_item.material_id is not null then
    select clase into v_clase from stock_materiales where id = v_item.material_id;
    v_mueve_stock := (coalesce(v_clase, 'material') not in ('herramienta', 'servicio'));
  end if;
  v_es_herr := coalesce(v_item.clase, 'material') = 'herramienta' or coalesce(v_clase, '') = 'herramienta';

  if v_mueve_stock then
    select stock_actual into v_stock_pre
      from stock_materiales
     where id = v_item.material_id
     for update;
    -- 20261007a: sin stock suficiente se despacha igual y se avisa.
    v_sin_stock := coalesce(v_stock_pre, 0) < v_item.cantidad;
  end if;

  update solicitud_compra_item
     set estado           = 'de_deposito',
         precio_unit      = p_precio_unit,
         fecha_resolucion = current_date,
         updated_by       = p_user_id
   where id = p_item_id;

  if v_mueve_stock then
    update stock_materiales
       set stock_actual = coalesce(v_stock_pre, 0) - v_item.cantidad,
           updated_by   = p_user_id,
           updated_at   = now()
     where id = v_item.material_id;

    insert into stock_movimientos
      (material_id, tipo, cantidad, motivo, obra_cod,
       solicitud_item_id, fecha, created_by, forzado_sin_stock)
    values
      (v_item.material_id, 'salida', v_item.cantidad, 'despacho_obra',
       v_obra_cod, p_item_id, current_date, p_user_id, v_sin_stock)
    returning id into v_mov_id;

    v_stock_post := coalesce(v_stock_pre, 0) - v_item.cantidad;
  end if;

  if not v_es_herr then
    begin
      insert into materiales_a_cuenta_cliente
        (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
         precio_unit, precio_total, origen, proveedor_id, factura_id,
         fecha_resolucion, created_by, updated_by)
      values
        (v_obra_cod, v_item.solicitud_id, p_item_id, desc_con_color(v_item.descripcion, v_item.color),
         v_item.cantidad, v_item.unidad, p_precio_unit,
         v_item.cantidad * p_precio_unit, 'deposito', null, null,
         current_date, p_user_id, p_user_id)
      returning id into v_mcc_id;
    exception
      when unique_violation then
        raise exception 'ITEM_YA_REGISTRADO';
    end;
    v_registrado_mcc := true;
  end if;

  insert into solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, meta, user_id)
  values
    (p_item_id, v_item.solicitud_id, 'despachado', 'pendiente', 'de_deposito', v_item.cantidad,
     jsonb_build_object('precio_unit', p_precio_unit, 'forzar_sin_stock', v_sin_stock,
                        'stock_antes', v_stock_pre, 'stock_despues', v_stock_post),
     p_user_id);

  return query select
    p_item_id, v_item.solicitud_id, v_obra_cod, 'de_deposito'::text, v_item.material_id,
    v_item.cantidad, p_precio_unit, current_date, v_registrado_mcc, v_mcc_id,
    v_mov_id, v_stock_post, v_sin_stock;
end;
$function$;
