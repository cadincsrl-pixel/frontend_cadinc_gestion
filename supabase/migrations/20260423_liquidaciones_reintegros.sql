-- =====================================================================
-- Fase 3 — Liquidaciones con reintegros de gastos del chofer
-- =====================================================================
--
-- 1. ADD COLUMN liquidaciones.total_reintegros
-- 2. RPC create_liquidacion_con_reintegros(...) — insert atómico de
--    liquidación + vinculación validada de tramos/adelantos/gastos.
--
-- ¿Por qué RPC y no bulk UPDATEs desde el service?
--   - Si un UPDATE falla a mitad (network, RLS, deadlock), la
--     liquidación queda inconsistente: el chofer cobra menos o doble.
--   - El RPC envuelve todo en una única transacción Postgres.
--   - Valida que los IDs enviados pertenezcan al chofer y estén en el
--     estado esperado — defensa en profundidad (el frontend no es
--     la autoridad).
--
-- Vinculación de gastos:
--   - Al create → gastos quedan con liquidacion_id seteado y estado
--     sigue 'aprobado'. Solo cambian a 'pagado' cuando la liquidación
--     se cierra (endpoint /cerrar, lógica en el backend).
--   - Se marcan con liquidacion_id solo gastos con pagado_por='chofer',
--     estado='aprobado', liquidacion_id IS NULL, deleted_at IS NULL.
--
-- Errores (RAISE EXCEPTION → backend mapea a HTTP):
--   - TRAMO_INVALIDO    → 400
--   - ADELANTO_INVALIDO → 400
--   - GASTO_INVALIDO    → 400
-- ---------------------------------------------------------------------

-- ── 1. Columna total_reintegros ─────────────────────────────────────
alter table liquidaciones
  add column if not exists total_reintegros numeric not null default 0;

comment on column liquidaciones.total_reintegros is
  'Suma de gastos del chofer reintegrados en esta liquidación (pagados por el chofer). Se suma al neto a pagar.';


-- ── 2. RPC create_liquidacion_con_reintegros ───────────────────────
create or replace function public.create_liquidacion_con_reintegros(
  p_chofer_id         integer,
  p_fecha_desde       date,
  p_fecha_hasta       date,
  p_dias_trabajados   integer,
  p_basico_dia        numeric,
  p_km_totales        numeric,
  p_precio_km         numeric,
  p_subtotal_basico   numeric,
  p_subtotal_km       numeric,
  p_total_adelantos   numeric,
  p_total_reintegros  numeric,
  p_total_neto        numeric,
  p_obs               text,
  p_tramo_ids         integer[],
  p_adelanto_ids      integer[],
  p_gasto_ids         integer[],
  p_user_id           uuid
)
returns liquidaciones
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_liq      liquidaciones%ROWTYPE;
  v_expected integer;
  v_actual   integer;
BEGIN
  -- (1) Insertar la liquidación
  INSERT INTO liquidaciones (
    chofer_id, fecha_desde, fecha_hasta,
    dias_trabajados, basico_dia, km_totales, precio_km,
    subtotal_basico, subtotal_km,
    total_adelantos, total_reintegros, total_neto,
    obs, estado, created_by, updated_by
  ) VALUES (
    p_chofer_id, p_fecha_desde, p_fecha_hasta,
    p_dias_trabajados, p_basico_dia, coalesce(p_km_totales, 0), coalesce(p_precio_km, 0),
    p_subtotal_basico, coalesce(p_subtotal_km, 0),
    p_total_adelantos, coalesce(p_total_reintegros, 0), p_total_neto,
    coalesce(p_obs, ''), 'borrador', p_user_id, p_user_id
  )
  RETURNING * INTO v_liq;

  -- (2) Tramos
  v_expected := coalesce(cardinality(p_tramo_ids), 0);
  IF v_expected > 0 THEN
    SELECT count(*) INTO v_actual
    FROM tramos
    WHERE id = ANY(p_tramo_ids)
      AND chofer_id = p_chofer_id
      AND liquidacion_id IS NULL;

    IF v_actual <> v_expected THEN
      RAISE EXCEPTION 'TRAMO_INVALIDO'
        USING DETAIL = json_build_object(
          'esperados', v_expected,
          'encontrados', v_actual,
          'tramo_ids', p_tramo_ids,
          'message', 'Algún tramo no existe, no pertenece al chofer, o ya está en otra liquidación.'
        )::text;
    END IF;

    UPDATE tramos
       SET liquidacion_id = v_liq.id,
           updated_by     = p_user_id
     WHERE id = ANY(p_tramo_ids);
  END IF;

  -- (3) Adelantos
  v_expected := coalesce(cardinality(p_adelanto_ids), 0);
  IF v_expected > 0 THEN
    SELECT count(*) INTO v_actual
    FROM adelantos
    WHERE id = ANY(p_adelanto_ids)
      AND chofer_id = p_chofer_id
      AND liquidacion_id IS NULL;

    IF v_actual <> v_expected THEN
      RAISE EXCEPTION 'ADELANTO_INVALIDO'
        USING DETAIL = json_build_object(
          'esperados', v_expected,
          'encontrados', v_actual,
          'adelanto_ids', p_adelanto_ids,
          'message', 'Algún adelanto no existe, no pertenece al chofer, o ya está en otra liquidación.'
        )::text;
    END IF;

    UPDATE adelantos
       SET liquidacion_id = v_liq.id,
           updated_by     = p_user_id
     WHERE id = ANY(p_adelanto_ids);
  END IF;

  -- (4) Gastos (validación más estricta: pagado_por='chofer', estado='aprobado', no borrado)
  v_expected := coalesce(cardinality(p_gasto_ids), 0);
  IF v_expected > 0 THEN
    SELECT count(*) INTO v_actual
    FROM gastos_logistica
    WHERE id = ANY(p_gasto_ids)
      AND chofer_id = p_chofer_id
      AND pagado_por = 'chofer'
      AND estado = 'aprobado'
      AND liquidacion_id IS NULL
      AND deleted_at IS NULL;

    IF v_actual <> v_expected THEN
      RAISE EXCEPTION 'GASTO_INVALIDO'
        USING DETAIL = json_build_object(
          'esperados', v_expected,
          'encontrados', v_actual,
          'gasto_ids', p_gasto_ids,
          'message', 'Algún gasto no existe, no pertenece al chofer, no está aprobado, no es pagado-por-chofer, o ya está en otra liquidación.'
        )::text;
    END IF;

    -- Estado NO cambia en el create — la transición a 'pagado' ocurre
    -- al cerrar la liquidación (endpoint /cerrar en el backend).
    UPDATE gastos_logistica
       SET liquidacion_id = v_liq.id,
           updated_by     = p_user_id
     WHERE id = ANY(p_gasto_ids);
  END IF;

  RETURN v_liq;
END;
$$;

comment on function public.create_liquidacion_con_reintegros(
  integer, date, date, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, integer[], integer[], integer[], uuid
) is
  'Inserta liquidación + vincula tramos/adelantos/gastos en una sola transacción. Valida pertenencia al chofer y disponibilidad. Fase 3 del módulo de gastos.';


-- ── 3. GRANT EXECUTE ────────────────────────────────────────────────
grant execute on function public.create_liquidacion_con_reintegros(
  integer, date, date, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, integer[], integer[], integer[], uuid
) to authenticated;
