-- ════════════════════════════════════════════════════════════════════
-- Áridos — registrar cobro + imputación atómica (RPC transaccional).
-- Antes: el backend insertaba el cobro y, en un UPDATE aparte, imputaba
-- las ventas seleccionadas (cobro_id). Si el UPDATE fallaba, el cobro
-- quedaba huérfano y un reintento lo duplicaba. Esta RPC hace todo en
-- UNA transacción:
--   (a) inserta en aridos_cobros,
--   (b) imputa: aridos_movimientos.cobro_id = <nuevo> para los venta_ids
--       que sean ventas del MISMO cliente y sigan adeudadas (cobro_id NULL).
-- Además valida que el monto del cobro cubra los remitos seleccionados:
-- si p_venta_ids no está vacío y p_monto < Σ importe de esas ventas
-- (las que matchean cliente/tipo/sin cobrar), aborta con MONTO_INSUFICIENTE.
-- SECURITY DEFINER → llamar SIEMPRE con el cliente admin (CLAUDE.md §9).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.registrar_cobro_arido(
  p_cliente_id integer,
  p_fecha      date,
  p_monto      numeric,
  p_medio      text,
  p_obs        text,
  p_venta_ids  integer[],
  p_user_id    uuid
) RETURNS public.aridos_cobros
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cobro     public.aridos_cobros%rowtype;
  v_total_imp numeric;
BEGIN
  -- Serializa los cobros del mismo cliente: evita que dos cobros
  -- concurrentes imputen las mismas ventas o validen contra un total
  -- desactualizado (la validación y la imputación caen en la misma tx).
  PERFORM pg_advisory_xact_lock(hashtext('aridos_cobro_' || p_cliente_id::text));

  -- Validación monto vs imputación: solo cuando se seleccionaron ventas.
  -- Σ importe de las ventas del cliente, de tipo venta y todavía adeudadas
  -- (cobro_id IS NULL). Las ventas con importe NULL se cuentan como 0.
  IF p_venta_ids IS NOT NULL AND array_length(p_venta_ids, 1) > 0 THEN
    SELECT COALESCE(SUM(COALESCE(importe, 0)), 0)
      INTO v_total_imp
      FROM public.aridos_movimientos
     WHERE id = ANY(p_venta_ids)
       AND cliente_id = p_cliente_id
       AND tipo = 'venta'
       AND cobro_id IS NULL;

    IF p_monto < v_total_imp THEN
      RAISE EXCEPTION 'MONTO_INSUFICIENTE: el cobro no cubre los remitos seleccionados'
        USING errcode = 'P0001';
    END IF;
  END IF;

  -- (a) Insertar el cobro
  INSERT INTO public.aridos_cobros (cliente_id, fecha, monto, medio, obs, created_by, updated_by)
  VALUES (p_cliente_id, p_fecha, p_monto, p_medio, p_obs, p_user_id, p_user_id)
  RETURNING * INTO v_cobro;

  -- (b) Imputar las ventas seleccionadas (filtros = mismo cliente, tipo
  -- venta, sin cobrar: protege contra ids ajenos o ya imputados).
  IF p_venta_ids IS NOT NULL AND array_length(p_venta_ids, 1) > 0 THEN
    UPDATE public.aridos_movimientos
       SET cobro_id   = v_cobro.id,
           updated_by = p_user_id,
           updated_at = now()
     WHERE id = ANY(p_venta_ids)
       AND cliente_id = p_cliente_id
       AND tipo = 'venta'
       AND cobro_id IS NULL;
  END IF;

  RETURN v_cobro;
END;
$$;

-- Misma política que el resto de las SECURITY DEFINER (migración
-- 20260527): solo service_role puede ejecutarla.
REVOKE EXECUTE ON FUNCTION public.registrar_cobro_arido(integer, date, numeric, text, text, integer[], uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registrar_cobro_arido(integer, date, numeric, text, text, integer[], uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_cobro_arido(integer, date, numeric, text, text, integer[], uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.registrar_cobro_arido(integer, date, numeric, text, text, integer[], uuid) TO service_role;
