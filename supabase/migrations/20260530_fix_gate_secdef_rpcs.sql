-- Fix sistémico del gate auth.uid() en RPCs SECURITY DEFINER.
--
-- Problema: `_require_permiso_or_admin(modulo, accion)` arranca con
-- `auth.uid()`, que bajo service_role (cómo el backend llama estas RPCs desde
-- la migración 20260527 que revocó EXECUTE a `authenticated`) es NULL →
-- RAISE 'NO_AUTH'. Resultado: las 7 funciones de abajo quedaron INOPERABLES
-- (create/reabrir/eliminar liquidación, eliminar/despachar solicitud, mover
-- tramo, recalcular caja) desde fines de mayo 2026.
--
-- Fix: quitar el `PERFORM _require_permiso_or_admin(...)` interno. La
-- autorización ya la hace el middleware `requirePermiso(modulo, accion)` del
-- backend ANTES de llamar al service (con bypass de admin), verificado ruta
-- por ruta. Es el patrón documentado en CLAUDE.md §9 / obras.service: las
-- funciones reciben `p_user_id` explícito y NO usan auth.uid(). El gate en la
-- DB era redundante (EXECUTE ya está revocado de `authenticated`, sólo el
-- backend las llama). CREATE OR REPLACE preserva los grants existentes.
--
-- Cada función queda IDÉNTICA a su versión actual salvo la línea del gate.

-- 1) create_liquidacion_con_reintegros (overload 19-arg, el que usa el backend)
CREATE OR REPLACE FUNCTION public.create_liquidacion_con_reintegros(
  p_chofer_id integer, p_fecha_desde date, p_fecha_hasta date, p_dias_trabajados integer,
  p_basico_dia numeric, p_km_totales numeric, p_precio_km numeric, p_subtotal_basico numeric,
  p_subtotal_km numeric, p_total_adelantos numeric, p_total_reintegros numeric, p_total_neto numeric,
  p_obs text, p_tramo_ids integer[], p_adelanto_ids integer[], p_gasto_ids integer[],
  p_user_id uuid, p_subtotal_km_cargado numeric DEFAULT NULL::numeric, p_subtotal_km_vacio numeric DEFAULT NULL::numeric)
 RETURNS liquidaciones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_liq        liquidaciones;
  v_tramo_id    integer;
  v_adelanto_id integer;
  v_gasto_id    integer;
BEGIN
  IF array_length(p_tramo_ids, 1) > 0 THEN
    PERFORM 1 FROM tramos
    WHERE id = ANY(p_tramo_ids)
      AND (chofer_id <> p_chofer_id OR liquidacion_id IS NOT NULL OR estado <> 'completado');
    IF FOUND THEN
      RAISE EXCEPTION 'TRAMO_INVALIDO' USING DETAIL = 'Algun tramo no es valido (otro chofer / ya liquidado / no completado).';
    END IF;
  END IF;

  IF array_length(p_adelanto_ids, 1) > 0 THEN
    PERFORM 1 FROM adelantos
    WHERE id = ANY(p_adelanto_ids)
      AND (chofer_id <> p_chofer_id OR liquidacion_id IS NOT NULL);
    IF FOUND THEN
      RAISE EXCEPTION 'ADELANTO_INVALIDO' USING DETAIL = 'Algun adelanto no es valido.';
    END IF;
  END IF;

  IF array_length(p_gasto_ids, 1) > 0 THEN
    PERFORM 1 FROM gastos_logistica
    WHERE id = ANY(p_gasto_ids)
      AND (chofer_id <> p_chofer_id OR liquidacion_id IS NOT NULL OR estado <> 'aprobado' OR pagado_por <> 'chofer' OR deleted_at IS NOT NULL);
    IF FOUND THEN
      RAISE EXCEPTION 'GASTO_INVALIDO' USING DETAIL = 'Algun gasto no es valido para reintegrar.';
    END IF;
  END IF;

  INSERT INTO liquidaciones (
    chofer_id, fecha_desde, fecha_hasta, dias_trabajados,
    basico_dia, km_totales, precio_km,
    subtotal_basico, subtotal_km,
    subtotal_km_cargado, subtotal_km_vacio,
    total_adelantos, total_reintegros, total_neto,
    obs, estado, created_by, updated_by
  ) VALUES (
    p_chofer_id, p_fecha_desde, p_fecha_hasta, p_dias_trabajados,
    p_basico_dia, p_km_totales, p_precio_km,
    p_subtotal_basico, p_subtotal_km,
    p_subtotal_km_cargado, p_subtotal_km_vacio,
    p_total_adelantos, p_total_reintegros, p_total_neto,
    p_obs, 'borrador', p_user_id, p_user_id
  ) RETURNING * INTO v_liq;

  FOREACH v_tramo_id IN ARRAY p_tramo_ids LOOP
    UPDATE tramos SET liquidacion_id = v_liq.id, updated_by = p_user_id WHERE id = v_tramo_id;
  END LOOP;

  FOREACH v_adelanto_id IN ARRAY p_adelanto_ids LOOP
    UPDATE adelantos SET liquidacion_id = v_liq.id, updated_by = p_user_id WHERE id = v_adelanto_id;
  END LOOP;

  FOREACH v_gasto_id IN ARRAY p_gasto_ids LOOP
    UPDATE gastos_logistica SET liquidacion_id = v_liq.id, updated_by = p_user_id WHERE id = v_gasto_id;
  END LOOP;

  RETURN v_liq;
END
$function$;

-- 2) reabrir_liquidacion
CREATE OR REPLACE FUNCTION public.reabrir_liquidacion(p_liquidacion_id integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_estado_actual text;
  v_tramos_desligados    integer;
  v_adelantos_desligados integer;
  v_gastos_revertidos    integer;
BEGIN
  SELECT estado INTO v_estado_actual
    FROM liquidaciones
   WHERE id = p_liquidacion_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIQUIDACION_NO_EXISTE';
  END IF;

  IF v_estado_actual = 'borrador' THEN
    RAISE EXCEPTION 'LIQUIDACION_YA_EN_BORRADOR';
  END IF;

  UPDATE tramos
     SET liquidacion_id = NULL,
         updated_by     = p_user_id
   WHERE liquidacion_id = p_liquidacion_id;
  GET DIAGNOSTICS v_tramos_desligados = ROW_COUNT;

  UPDATE adelantos
     SET liquidacion_id = NULL,
         updated_by     = p_user_id
   WHERE liquidacion_id = p_liquidacion_id;
  GET DIAGNOSTICS v_adelantos_desligados = ROW_COUNT;

  UPDATE gastos_logistica
     SET estado         = 'aprobado',
         liquidacion_id = NULL,
         updated_by     = p_user_id
   WHERE liquidacion_id = p_liquidacion_id;
  GET DIAGNOSTICS v_gastos_revertidos = ROW_COUNT;

  UPDATE liquidaciones
     SET estado     = 'borrador',
         updated_by = p_user_id
   WHERE id = p_liquidacion_id;

  RETURN jsonb_build_object(
    'success',              true,
    'liquidacion_id',       p_liquidacion_id,
    'tramos_desligados',    v_tramos_desligados,
    'adelantos_desligados', v_adelantos_desligados,
    'gastos_revertidos',    v_gastos_revertidos
  );
END;
$function$;

-- 3) eliminar_liquidacion
CREATE OR REPLACE FUNCTION public.eliminar_liquidacion(p_liquidacion_id integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tramos_desligados    integer;
  v_adelantos_desligados integer;
  v_gastos_revertidos    integer;
BEGIN
  PERFORM 1 FROM liquidaciones WHERE id = p_liquidacion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIQUIDACION_NO_EXISTE';
  END IF;

  UPDATE tramos
     SET liquidacion_id = NULL,
         updated_by     = p_user_id
   WHERE liquidacion_id = p_liquidacion_id;
  GET DIAGNOSTICS v_tramos_desligados = ROW_COUNT;

  UPDATE adelantos
     SET liquidacion_id = NULL,
         updated_by     = p_user_id
   WHERE liquidacion_id = p_liquidacion_id;
  GET DIAGNOSTICS v_adelantos_desligados = ROW_COUNT;

  UPDATE gastos_logistica
     SET estado         = 'aprobado',
         liquidacion_id = NULL,
         updated_by     = p_user_id
   WHERE liquidacion_id = p_liquidacion_id;
  GET DIAGNOSTICS v_gastos_revertidos = ROW_COUNT;

  DELETE FROM liquidaciones WHERE id = p_liquidacion_id;

  RETURN jsonb_build_object(
    'success',              true,
    'liquidacion_id',       p_liquidacion_id,
    'tramos_desligados',    v_tramos_desligados,
    'adelantos_desligados', v_adelantos_desligados,
    'gastos_revertidos',    v_gastos_revertidos
  );
END;
$function$;

-- 4) eliminar_solicitud
CREATE OR REPLACE FUNCTION public.eliminar_solicitud(p_solicitud_id integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item             RECORD;
  v_stock_pre        numeric;
  v_items_revertidos integer := 0;
BEGIN
  PERFORM 1 FROM solicitud_compra WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOLICITUD_NO_EXISTE';
  END IF;

  PERFORM 1 FROM remitos_envio WHERE solicitud_id = p_solicitud_id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'SOLICITUD_TIENE_REMITOS';
  END IF;

  FOR v_item IN
    SELECT id, estado, material_id, cantidad
      FROM solicitud_compra_item
     WHERE solicitud_id = p_solicitud_id
       AND material_id IS NOT NULL
       AND estado IN ('de_deposito', 'enviado')
     FOR UPDATE
  LOOP
    SELECT stock_actual INTO v_stock_pre
      FROM stock_materiales
     WHERE id = v_item.material_id
     FOR UPDATE;

    IF FOUND THEN
      UPDATE stock_materiales
         SET stock_actual = v_stock_pre + v_item.cantidad,
             updated_by   = p_user_id,
             updated_at   = now()
       WHERE id = v_item.material_id;

      INSERT INTO stock_movimientos
        (material_id, tipo, cantidad, motivo, obs, fecha, created_by, forzado_sin_stock)
      VALUES
        (v_item.material_id, 'entrada', v_item.cantidad, 'devolucion',
         'Devolución por eliminación de solicitud #' || p_solicitud_id,
         current_date, p_user_id, false);

      v_items_revertidos := v_items_revertidos + 1;
    END IF;
  END LOOP;

  DELETE FROM solicitud_compra WHERE id = p_solicitud_id;

  RETURN jsonb_build_object(
    'success',           true,
    'solicitud_id',      p_solicitud_id,
    'items_revertidos',  v_items_revertidos
  );
END;
$function$;

-- 5) mover_tramo_orden
CREATE OR REPLACE FUNCTION public.mover_tramo_orden(p_tramo_id integer, p_dir text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actual_fecha    date;
  v_actual_orden    integer;
  v_actual_id       integer;
  v_vecino_id       integer;
  v_vecino_orden    integer;
BEGIN
  IF p_dir NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'DIR_INVALIDA';
  END IF;

  SELECT id, fecha_operacion, COALESCE(orden_dia, id)
    INTO v_actual_id, v_actual_fecha, v_actual_orden
    FROM tramos
   WHERE id = p_tramo_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRAMO_NO_EXISTE';
  END IF;

  IF v_actual_fecha IS NULL THEN
    RAISE EXCEPTION 'TRAMO_SIN_FECHA';
  END IF;

  IF p_dir = 'up' THEN
    SELECT id, COALESCE(orden_dia, id)
      INTO v_vecino_id, v_vecino_orden
      FROM tramos
     WHERE fecha_operacion = v_actual_fecha
       AND id <> p_tramo_id
       AND COALESCE(orden_dia, id) > v_actual_orden
     ORDER BY COALESCE(orden_dia, id) ASC
     LIMIT 1
     FOR UPDATE;
  ELSE
    SELECT id, COALESCE(orden_dia, id)
      INTO v_vecino_id, v_vecino_orden
      FROM tramos
     WHERE fecha_operacion = v_actual_fecha
       AND id <> p_tramo_id
       AND COALESCE(orden_dia, id) < v_actual_orden
     ORDER BY COALESCE(orden_dia, id) DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF v_vecino_id IS NULL THEN
    RETURN jsonb_build_object('moved', false);
  END IF;

  UPDATE tramos
     SET orden_dia = v_vecino_orden,
         updated_by = p_user_id
   WHERE id = v_actual_id;

  UPDATE tramos
     SET orden_dia = v_actual_orden,
         updated_by = p_user_id
   WHERE id = v_vecino_id;

  RETURN jsonb_build_object(
    'moved', true,
    'actual_id', v_actual_id,
    'vecino_id', v_vecino_id,
    'actual_orden_post', v_vecino_orden,
    'vecino_orden_post', v_actual_orden
  );
END;
$function$;

-- 6) resolver_item_despacho (saca el gate de 'creacion' Y el bloque de 'forzar_despacho';
--    la ruta /items/:itemId/despachar ya valida resolver_items, obra-scope y forzar_despacho)
CREATE OR REPLACE FUNCTION public.resolver_item_despacho(p_item_id integer, p_precio_unit numeric, p_user_id uuid DEFAULT NULL::uuid, p_forzar_sin_stock boolean DEFAULT false)
 RETURNS TABLE(item_id integer, solicitud_id integer, obra_cod text, estado text, material_id integer, cantidad numeric, precio_unit numeric, fecha_resolucion date, registrado_cuenta_cliente boolean, material_cuenta_cliente_id integer, stock_movimiento_id integer, stock_actual_post numeric, stock_forzado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item           solicitud_compra_item%ROWTYPE;
  v_obra_cod       text;
  v_es_deposito    boolean;
  v_stock_pre      numeric;
  v_stock_post     numeric := NULL;
  v_mov_id         integer := NULL;
  v_mcc_id         integer := NULL;
  v_registrado_mcc boolean := false;
BEGIN
  SELECT * INTO v_item
    FROM solicitud_compra_item
   WHERE id = p_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NO_EXISTE';
  END IF;
  IF v_item.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'ITEM_NO_DISPONIBLE';
  END IF;

  SELECT s.obra_cod, o.es_deposito
    INTO v_obra_cod, v_es_deposito
    FROM solicitud_compra s
    JOIN obras            o ON o.cod = s.obra_cod
   WHERE s.id = v_item.solicitud_id;

  IF v_item.material_id IS NOT NULL THEN
    SELECT stock_actual INTO v_stock_pre
      FROM stock_materiales
     WHERE id = v_item.material_id
     FOR UPDATE;

    IF v_stock_pre < v_item.cantidad AND NOT p_forzar_sin_stock THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE'
        USING DETAIL = json_build_object(
          'material_id',         v_item.material_id,
          'stock_actual',        v_stock_pre,
          'cantidad_solicitada', v_item.cantidad
        )::text;
    END IF;
  END IF;

  UPDATE solicitud_compra_item
     SET estado           = 'de_deposito',
         precio_unit      = p_precio_unit,
         fecha_resolucion = current_date
   WHERE id = p_item_id;

  IF v_item.material_id IS NOT NULL THEN
    UPDATE stock_materiales
       SET stock_actual = v_stock_pre - v_item.cantidad,
           updated_by   = p_user_id,
           updated_at   = now()
     WHERE id = v_item.material_id;

    INSERT INTO stock_movimientos
      (material_id, tipo, cantidad, motivo, obra_cod,
       solicitud_item_id, fecha, created_by, forzado_sin_stock)
    VALUES
      (v_item.material_id, 'salida', v_item.cantidad, 'despacho_obra',
       v_obra_cod, p_item_id, current_date, p_user_id, p_forzar_sin_stock)
    RETURNING id INTO v_mov_id;

    v_stock_post := v_stock_pre - v_item.cantidad;
  END IF;

  IF NOT v_es_deposito THEN
    BEGIN
      INSERT INTO materiales_a_cuenta_cliente
        (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
         precio_unit, precio_total, origen, proveedor_id, factura_id,
         fecha_resolucion, created_by, updated_by)
      VALUES
        (v_obra_cod, v_item.solicitud_id, p_item_id, v_item.descripcion,
         v_item.cantidad, v_item.unidad, p_precio_unit,
         v_item.cantidad * p_precio_unit, 'deposito', NULL, NULL,
         current_date, p_user_id, p_user_id)
      RETURNING id INTO v_mcc_id;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'ITEM_YA_REGISTRADO';
    END;

    v_registrado_mcc := true;
  ELSE
    v_registrado_mcc := false;
    v_mcc_id         := NULL;
  END IF;

  RETURN QUERY SELECT
    p_item_id,
    v_item.solicitud_id,
    v_obra_cod,
    'de_deposito'::text,
    v_item.material_id,
    v_item.cantidad,
    p_precio_unit,
    current_date,
    v_registrado_mcc,
    v_mcc_id,
    v_mov_id,
    v_stock_post,
    p_forzar_sin_stock;
END;
$function$;

-- 7) sp_recalcular_saldos_caja
CREATE OR REPLACE FUNCTION public.sp_recalcular_saldos_caja()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rows_actualizadas integer;
BEGIN
  with saldo_calc as (
    select
      id,
      sum(case when tipo = 'ingreso' then monto else -monto end)
        over (order by fecha, id rows between unbounded preceding and current row)
        as nuevo_saldo
    from movimientos_caja
  )
  update movimientos_caja m
     set saldo_acum = s.nuevo_saldo
    from saldo_calc s
   where m.id = s.id
     and (m.saldo_acum is distinct from s.nuevo_saldo);

  GET DIAGNOSTICS v_rows_actualizadas = ROW_COUNT;
  RETURN v_rows_actualizadas;
END;
$function$;
