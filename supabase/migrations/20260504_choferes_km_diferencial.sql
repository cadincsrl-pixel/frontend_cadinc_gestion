-- =====================================================================
-- Tarifa diferencial cargado vs vacío para choferes
--
-- Antes: choferes.precio_km (mismo $/km para cualquier tipo de tramo).
-- Ahora: precio_km_cargado + precio_km_vacio.
--
-- En la liquidación se separa el subtotal por tipo, se persisten los
-- desgloses para auditoría y se mantiene `subtotal_km` como total para
-- compat con consumidores existentes.
-- =====================================================================

-- ── 1) Renombrar precio_km → precio_km_cargado ────────────────────────
ALTER TABLE choferes RENAME COLUMN precio_km TO precio_km_cargado;

-- ── 2) Nueva columna precio_km_vacio (default 0 = no se paga por vacío
--    a menos que el usuario lo configure)
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS precio_km_vacio numeric NOT NULL DEFAULT 0;

-- ── 3) Histórico: agregar `tipo` ('cargado' | 'vacio') a choferes_km_hist.
--    Las filas existentes se marcan como 'cargado' (eran del precio único
--    pre-diferencial).
ALTER TABLE choferes_km_hist
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'cargado'
  CHECK (tipo IN ('cargado', 'vacio'));

-- (no remuevo el DEFAULT — está bien tener 'cargado' como default para
--  futuros INSERTs antiguos sin tipo)

-- ── 4) Liquidaciones: dos columnas para el desglose persistido.
--    Las cerradas no se recalculan; quedan con NULL en el desglose y
--    el subtotal_km original como única fuente de verdad para esas.
ALTER TABLE liquidaciones
  ADD COLUMN IF NOT EXISTS subtotal_km_cargado numeric,
  ADD COLUMN IF NOT EXISTS subtotal_km_vacio   numeric;

-- ── 5) Reescribir RPC create_liquidacion_con_reintegros con parámetros
--    nuevos al final (defaults para compat con clientes que no migraron
--    todavía).
CREATE OR REPLACE FUNCTION create_liquidacion_con_reintegros(
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
  p_subtotal_km_cargado numeric DEFAULT NULL,
  p_subtotal_km_vacio   numeric DEFAULT NULL
) RETURNS liquidaciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_liq liquidaciones;
  v_tramo_id integer;
  v_adelanto_id integer;
  v_gasto_id integer;
BEGIN
  PERFORM _require_permiso_or_admin(p_user_id, 'logistica', 'creacion');

  -- Validar tramos: todos deben pertenecer al chofer y NO estar liquidados.
  IF array_length(p_tramo_ids, 1) > 0 THEN
    PERFORM 1 FROM tramos
    WHERE id = ANY(p_tramo_ids)
      AND (chofer_id <> p_chofer_id OR liquidacion_id IS NOT NULL OR estado <> 'completado');
    IF FOUND THEN
      RAISE EXCEPTION 'TRAMO_INVALIDO' USING DETAIL = 'Algún tramo no es válido (otro chofer / ya liquidado / no completado).';
    END IF;
  END IF;

  -- Validar adelantos.
  IF array_length(p_adelanto_ids, 1) > 0 THEN
    PERFORM 1 FROM adelantos
    WHERE id = ANY(p_adelanto_ids)
      AND (chofer_id <> p_chofer_id OR liquidacion_id IS NOT NULL);
    IF FOUND THEN
      RAISE EXCEPTION 'ADELANTO_INVALIDO' USING DETAIL = 'Algún adelanto no es válido.';
    END IF;
  END IF;

  -- Validar gastos a reintegrar.
  IF array_length(p_gasto_ids, 1) > 0 THEN
    PERFORM 1 FROM gastos_logistica
    WHERE id = ANY(p_gasto_ids)
      AND (chofer_id <> p_chofer_id OR liquidacion_id IS NOT NULL OR estado <> 'aprobado' OR pagado_por <> 'chofer' OR deleted_at IS NOT NULL);
    IF FOUND THEN
      RAISE EXCEPTION 'GASTO_INVALIDO' USING DETAIL = 'Algún gasto no es válido para reintegrar.';
    END IF;
  END IF;

  -- Crear la liquidación
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

  -- Vincular tramos
  FOREACH v_tramo_id IN ARRAY p_tramo_ids LOOP
    UPDATE tramos SET liquidacion_id = v_liq.id, updated_by = p_user_id WHERE id = v_tramo_id;
  END LOOP;

  -- Vincular adelantos
  FOREACH v_adelanto_id IN ARRAY p_adelanto_ids LOOP
    UPDATE adelantos SET liquidacion_id = v_liq.id, updated_by = p_user_id WHERE id = v_adelanto_id;
  END LOOP;

  -- Vincular gastos (no cambian de estado hasta cerrar la liquidación)
  FOREACH v_gasto_id IN ARRAY p_gasto_ids LOOP
    UPDATE gastos_logistica SET liquidacion_id = v_liq.id, updated_by = p_user_id WHERE id = v_gasto_id;
  END LOOP;

  RETURN v_liq;
END $$;

GRANT EXECUTE ON FUNCTION create_liquidacion_con_reintegros(
  integer, date, date, integer,
  numeric, numeric, numeric,
  numeric, numeric,
  numeric, numeric, numeric,
  text, integer[], integer[], integer[],
  uuid, numeric, numeric
) TO authenticated;
