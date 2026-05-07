-- Fix: create_liquidacion_con_reintegros (versión 19 args) llamaba a
-- _require_permiso_or_admin con 3 argumentos (incluyendo p_user_id), pero
-- la función real toma 2 args (saca el user_id de auth.uid()).
-- Resultado: la RPC tiraba "function does not exist" y el frontend lo
-- mostraba como "no tenés permisos" en el toast.
--
-- Solo se redefine esa sobrecarga; la versión vieja de 17 args queda igual.

CREATE OR REPLACE FUNCTION public.create_liquidacion_con_reintegros(
  p_chofer_id           integer,
  p_fecha_desde         date,
  p_fecha_hasta         date,
  p_dias_trabajados     integer,
  p_basico_dia          numeric,
  p_km_totales          numeric,
  p_precio_km           numeric,
  p_subtotal_basico     numeric,
  p_subtotal_km         numeric,
  p_total_adelantos     numeric,
  p_total_reintegros    numeric,
  p_total_neto          numeric,
  p_obs                 text,
  p_tramo_ids           integer[],
  p_adelanto_ids        integer[],
  p_gasto_ids           integer[],
  p_user_id             uuid,
  p_subtotal_km_cargado numeric DEFAULT NULL::numeric,
  p_subtotal_km_vacio   numeric DEFAULT NULL::numeric
)
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
  -- Permiso: la helper toma el uid de auth.uid() internamente.
  PERFORM _require_permiso_or_admin('logistica', 'creacion');

  IF array_length(p_tramo_ids, 1) > 0 THEN
    PERFORM 1 FROM tramos
    WHERE id = ANY(p_tramo_ids)
      AND (chofer_id <> p_chofer_id OR liquidacion_id IS NOT NULL OR estado <> 'completado');
    IF FOUND THEN
      RAISE EXCEPTION 'TRAMO_INVALIDO' USING DETAIL = 'Algún tramo no es válido (otro chofer / ya liquidado / no completado).';
    END IF;
  END IF;

  IF array_length(p_adelanto_ids, 1) > 0 THEN
    PERFORM 1 FROM adelantos
    WHERE id = ANY(p_adelanto_ids)
      AND (chofer_id <> p_chofer_id OR liquidacion_id IS NOT NULL);
    IF FOUND THEN
      RAISE EXCEPTION 'ADELANTO_INVALIDO' USING DETAIL = 'Algún adelanto no es válido.';
    END IF;
  END IF;

  IF array_length(p_gasto_ids, 1) > 0 THEN
    PERFORM 1 FROM gastos_logistica
    WHERE id = ANY(p_gasto_ids)
      AND (chofer_id <> p_chofer_id OR liquidacion_id IS NOT NULL OR estado <> 'aprobado' OR pagado_por <> 'chofer' OR deleted_at IS NOT NULL);
    IF FOUND THEN
      RAISE EXCEPTION 'GASTO_INVALIDO' USING DETAIL = 'Algún gasto no es válido para reintegrar.';
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
