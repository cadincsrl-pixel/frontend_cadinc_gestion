-- =====================================================================
-- Robustez de Pedidos y Stock (2026-09-24) — tanda 4 de la revisión del 23/09
--
-- 1. retirar_de_proveedor: la obra la mandaba quien llamaba y la RPC nunca
--    la comparaba con la del pedido de cada renglón. Con alcance en la obra A
--    se podía retirar lo comprado para B y facturárselo al cliente de A.
--    Ahora cada renglón tiene que ser de un pedido de p_obra_cod
--    (ITEM_DE_OTRA_OBRA). Y el número RR-NNNN salía de MAX+1 sin lock: dos
--    retiros a la vez chocaban. Se toma un advisory lock antes de numerar.
--
-- 2. resolver_item_en_proveedor: la entrada al stock en proveedor usaba la
--    cantidad PEDIDA; si se compraban 12 de 10 pedidos, solo se podían retirar
--    10 y al cliente se le facturaban 10. Y `pagado_por`/`cantidad_comprada`
--    los escribía el backend DESPUÉS de la RPC, sin mirar el error: si fallaba,
--    el retiro le cobraba al cliente algo que había pagado directo. Ahora entran
--    como parámetros (con default, así el backend viejo sigue andando) y todo
--    va en la misma transacción.
--
-- 3. devolver_material: trabajaba sobre la cantidad pedida y no la comprada.
--    Con 12 comprados (10 pedidos) y 2 devueltos, la cuenta quedaba en 8 y no
--    en 10. Y no bajaba `cantidad_comprada`, así que una edición posterior del
--    precio volvía a inflar el total. Ahora usa la cantidad efectiva y baja las
--    dos.
--
-- 4. sumar_stock(material, delta): el backend escribía stock_actual leyendo el
--    valor, sumando en JS y escribiendo el absoluto (7 lugares). Dos
--    movimientos a la vez se pisaban, y el «revertir» de aprobar un ajuste
--    escribía el valor viejo encima de un despacho concurrente. Esta función
--    suma en una sola sentencia.
-- =====================================================================

-- 4. sumar_stock ------------------------------------------------------------
create or replace function public.sumar_stock(p_material_id integer, p_delta numeric, p_user_id uuid default null)
returns numeric
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_nuevo numeric;
begin
  update stock_materiales
     set stock_actual = coalesce(stock_actual, 0) + p_delta,
         updated_by = coalesce(p_user_id, updated_by), updated_at = now()
   where id = p_material_id
  returning stock_actual into v_nuevo;
  if not found then raise exception 'MATERIAL_INEXISTENTE' using errcode = 'P0001'; end if;
  return v_nuevo;
end $$;
revoke all on function public.sumar_stock(integer, numeric, uuid) from public, anon, authenticated;
grant execute on function public.sumar_stock(integer, numeric, uuid) to service_role;

-- 2. resolver_item_en_proveedor --------------------------------------------
drop function if exists public.resolver_item_en_proveedor(integer, integer, numeric, integer, uuid);
create function public.resolver_item_en_proveedor(
  p_item_id integer, p_proveedor_id integer, p_precio_unit numeric,
  p_factura_id integer default null, p_user_id uuid default null,
  p_cantidad_comprada numeric default null, p_pagado_por text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item record;
  v_cant numeric;
begin
  select id, estado, cantidad into v_item
    from solicitud_compra_item where id = p_item_id for update;
  if v_item.id is null then
    raise exception 'ITEM_NO_EXISTE' using errcode = 'P0001';
  end if;
  if v_item.estado <> 'pendiente' then
    raise exception 'ITEM_YA_RESUELTO' using errcode = 'P0001', detail = v_item.estado;
  end if;
  if p_cantidad_comprada is not null and p_cantidad_comprada <= 0 then
    raise exception 'CANTIDAD_INVALIDA' using errcode = 'P0001';
  end if;
  if p_pagado_por is not null and p_pagado_por not in ('cadinc', 'cliente') then
    raise exception 'PAGADO_POR_INVALIDO' using errcode = 'P0001';
  end if;

  -- Lo que entra al galpón del proveedor es lo COMPRADO, no lo pedido.
  v_cant := coalesce(p_cantidad_comprada, v_item.cantidad);

  update solicitud_compra_item
     set estado = 'en_proveedor',
         proveedor_id = p_proveedor_id,
         precio_unit  = p_precio_unit,
         factura_id   = p_factura_id,
         cantidad_comprada = coalesce(p_cantidad_comprada, cantidad_comprada),
         pagado_por   = coalesce(p_pagado_por, pagado_por),
         fecha_resolucion = current_date,
         updated_by   = p_user_id
   where id = p_item_id;

  insert into stock_proveedor_movimientos
    (proveedor_id, solicitud_item_id, tipo, motivo, cantidad, fecha, created_by)
  values
    (p_proveedor_id, p_item_id, 'entrada', 'compra', v_cant, current_date, p_user_id);
end $function$;
revoke all on function public.resolver_item_en_proveedor(integer, integer, numeric, integer, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.resolver_item_en_proveedor(integer, integer, numeric, integer, uuid, numeric, text) to service_role;

-- 1 y 3: reemplazos puntuales sobre las definiciones vivas -------------------
do $$
declare
  d text; n int; cuenta text;
begin
  -- 1. retirar_de_proveedor
  d := pg_get_functiondef('public.retirar_de_proveedor(integer,text,date,text,text,text,jsonb,uuid)'::regprocedure);
  cuenta := '  SELECT es_deposito INTO v_obra_es_dep FROM obras WHERE cod = p_obra_cod;';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'retiro (obra): esperaba 1, hay %', n; end if;
  d := replace(d, cuenta, cuenta || E'\n\n' ||
    '  -- Cada renglón tiene que ser de un pedido de ESTA obra: la obra no la' || E'\n' ||
    '  -- decide quien llama (revisión 23/09).' || E'\n' ||
    '  PERFORM 1 FROM jsonb_array_elements(p_items) e' || E'\n' ||
    '    JOIN solicitud_compra_item i ON i.id = (e->>''item_id'')::integer' || E'\n' ||
    '    JOIN solicitud_compra s ON s.id = i.solicitud_id' || E'\n' ||
    '   WHERE s.obra_cod <> p_obra_cod;' || E'\n' ||
    '  IF FOUND THEN' || E'\n' ||
    '    RAISE EXCEPTION ''ITEM_DE_OTRA_OBRA'' USING ERRCODE=''P0001'';' || E'\n' ||
    '  END IF;' || E'\n\n' ||
    '  -- Numeración RR-NNNN sin choques entre dos retiros a la vez.' || E'\n' ||
    '  PERFORM pg_advisory_xact_lock(hashtext(''remitos_retiro_proveedor:numero''));');
  execute d;

  -- 3. devolver_material: cantidad efectiva (la comprada si la hay).
  d := pg_get_functiondef('public.devolver_material(integer,numeric,text,uuid)'::regprocedure);
  cuenta := '  if p_cantidad > v_item.cantidad - v_ya_acreditado then';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'devolver (tope 1): esperaba 1, hay %', n; end if;
  d := replace(d, cuenta, '  if p_cantidad > coalesce(v_item.cantidad_comprada, v_item.cantidad) - v_ya_acreditado then');

  cuenta := '  if p_cantidad > v_item.cantidad then';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'devolver (tope 2): esperaba 1, hay %', n; end if;
  d := replace(d, cuenta, '  if p_cantidad > coalesce(v_item.cantidad_comprada, v_item.cantidad) then');

  cuenta := '  v_resto := v_item.cantidad - p_cantidad;';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'devolver (resto): esperaba 1, hay %', n; end if;
  d := replace(d, cuenta, '  v_resto := coalesce(v_item.cantidad_comprada, v_item.cantidad) - p_cantidad;');

  cuenta := 'set cantidad = v_resto, cantidad_enviada = least(cantidad_enviada, v_resto),';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'devolver (update): esperaba 1, hay %', n; end if;
  d := replace(d, cuenta, 'set cantidad = v_resto, cantidad_enviada = least(cantidad_enviada, v_resto),' || E'\n' ||
    '           cantidad_comprada = case when cantidad_comprada is null then null else v_resto end,');
  execute d;
end $$;
