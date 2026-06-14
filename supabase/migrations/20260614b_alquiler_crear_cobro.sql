-- ════════════════════════════════════════════════════════════════════
-- Alquiler — crear cobro + imputación atómica (RPC transaccional).
-- Calca registrar_cobro_arido (20260614_aridos_registrar_cobro.sql).
--
-- Antes: el backend insertaba el cobro en alquiler_cobros y, en un UPDATE
-- aparte, imputaba los remitos seleccionados (cobro_id). Si el UPDATE
-- fallaba, el cobro quedaba huérfano y un reintento lo duplicaba. Esta RPC
-- hace todo en UNA transacción:
--   (a) inserta en alquiler_cobros,
--   (b) imputa: alquiler_remitos.cobro_id = <nuevo> para los remito_ids que
--       sean de OBRAS del cliente (un cobro es a nivel cliente, los remitos
--       cuelgan de obras del cliente) y sigan adeudados (cobro_id IS NULL).
--   (c) valida que el monto del cobro cubra los remitos imputados: si
--       p_remito_ids no está vacío y p_monto < Σ importe de esos remitos,
--       aborta con MONTO_INSUFICIENTE.
--
-- IMPORTE DEL REMITO: alquiler_remitos NO tiene columna `importe`. El remito
-- es 1:1 con el parte (alquiler_remitos.parte_id → alquiler_partes.id UNIQUE),
-- y el importe devengado vive en alquiler_partes.importe (horas × precio_hora
-- congelado al emitir). Por eso la validación de monto JOINea remitos→partes
-- y suma alquiler_partes.importe (mismo criterio que getRemitosCliente, que
-- expone `importe` desde parte:alquiler_partes(importe)). Los partes con
-- importe NULL (máquina sin tarifa) cuentan como 0.
--
-- FILTRO DE IMPUTACIÓN (réplica exacta del UPDATE viejo de createCobro):
--   id = ANY(p_remito_ids)
--   AND obra_id IN (obras del cliente)   ← un id ajeno simplemente no matchea
--   AND cobro_id IS NULL                 ← no re-imputar un remito ya cobrado
--
-- SECURITY DEFINER → llamar SIEMPRE con el cliente admin (CLAUDE.md §9).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.crear_cobro_alquiler(
  p_cliente_id integer,
  p_fecha      date,
  p_monto      numeric,
  p_medio      text,
  p_obs        text,
  p_remito_ids integer[],
  p_user_id    uuid
) RETURNS public.alquiler_cobros
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cobro     public.alquiler_cobros%rowtype;
  v_total_imp numeric;
BEGIN
  -- Serializa los cobros del mismo cliente: evita que dos cobros concurrentes
  -- imputen los mismos remitos o validen contra un total desactualizado (la
  -- validación y la imputación caen en la misma transacción).
  PERFORM pg_advisory_xact_lock(hashtext('alquiler_cobro_' || p_cliente_id::text));

  -- (c) Validación monto vs imputación: solo cuando se seleccionaron remitos.
  -- Σ importe (del parte 1:1) de los remitos de obras del cliente todavía
  -- adeudados (cobro_id IS NULL). Partes con importe NULL cuentan como 0.
  IF p_remito_ids IS NOT NULL AND array_length(p_remito_ids, 1) > 0 THEN
    SELECT COALESCE(SUM(COALESCE(pa.importe, 0)), 0)
      INTO v_total_imp
      FROM public.alquiler_remitos r
      JOIN public.alquiler_obras o   ON o.id = r.obra_id
      LEFT JOIN public.alquiler_partes pa ON pa.id = r.parte_id
     WHERE r.id = ANY(p_remito_ids)
       AND o.cliente_id = p_cliente_id
       AND r.cobro_id IS NULL;

    IF p_monto < v_total_imp THEN
      RAISE EXCEPTION 'MONTO_INSUFICIENTE: el cobro no cubre los remitos seleccionados'
        USING errcode = 'P0001';
    END IF;
  END IF;

  -- (a) Insertar el cobro.
  INSERT INTO public.alquiler_cobros (cliente_id, fecha, monto, medio, obs, created_by, updated_by)
  VALUES (p_cliente_id, p_fecha, p_monto, p_medio, p_obs, p_user_id, p_user_id)
  RETURNING * INTO v_cobro;

  -- (b) Imputar los remitos seleccionados. Filtro = remitos de OBRAS del
  -- cliente, todavía adeudados (sin cobrar): protege contra ids ajenos o ya
  -- imputados (mismo criterio que el UPDATE viejo de createCobro).
  IF p_remito_ids IS NOT NULL AND array_length(p_remito_ids, 1) > 0 THEN
    UPDATE public.alquiler_remitos r
       SET cobro_id   = v_cobro.id,
           updated_by = p_user_id,
           updated_at = now()
     WHERE r.id = ANY(p_remito_ids)
       AND r.cobro_id IS NULL
       AND r.obra_id IN (
         SELECT o.id FROM public.alquiler_obras o WHERE o.cliente_id = p_cliente_id
       );
  END IF;

  RETURN v_cobro;
END;
$$;

-- Misma política que el resto de las SECURITY DEFINER del módulo
-- (20260602b / 20260527): solo service_role puede ejecutarla. Supabase otorga
-- EXECUTE explícito a anon/authenticated en el schema public por default, así
-- que hay que revocar de esos roles por nombre (revoke from public no alcanza).
REVOKE EXECUTE ON FUNCTION public.crear_cobro_alquiler(integer, date, numeric, text, text, integer[], uuid)
  FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.crear_cobro_alquiler(integer, date, numeric, text, text, integer[], uuid)
  TO service_role;
