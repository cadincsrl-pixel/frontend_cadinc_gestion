-- ════════════════════════════════════════════════════════════════════
-- Áridos — remito emitible de la venta (RV-NNNN).
-- El campo texto `remito` existente queda para registrar el N° del
-- remito PAPEL; esto agrega la emisión digital con numeración propia:
--   - remito_numero / remito_emitido_en en el movimiento.
--   - RPC emitir_remito_arido: idempotente (re-emitir devuelve el mismo
--     número), advisory lock para serializar la numeración.
-- SECURITY DEFINER → llamar SIEMPRE con el cliente admin (CLAUDE.md §9).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE aridos_movimientos
  ADD COLUMN IF NOT EXISTS remito_numero TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS remito_emitido_en TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.emitir_remito_arido(
  p_movimiento_id integer,
  p_user_id       uuid
) RETURNS public.aridos_movimientos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov    public.aridos_movimientos%rowtype;
  v_seq    integer;
  v_numero text;
BEGIN
  -- Serializa numeración + evita doble-INSERT por doble click.
  PERFORM pg_advisory_xact_lock(hashtext('aridos_remito_emit'));

  SELECT * INTO v_mov FROM public.aridos_movimientos WHERE id = p_movimiento_id;
  IF v_mov.id IS NULL THEN
    RAISE EXCEPTION 'MOVIMIENTO_NO_EXISTE' USING errcode = 'P0001';
  END IF;
  IF v_mov.tipo <> 'venta' THEN
    RAISE EXCEPTION 'SOLO_VENTAS_EMITEN_REMITO' USING errcode = 'P0001';
  END IF;

  -- Idempotente: si ya tiene número, devolver tal cual.
  IF v_mov.remito_numero IS NOT NULL THEN
    RETURN v_mov;
  END IF;

  SELECT COALESCE(MAX(SUBSTRING(remito_numero FROM 4)::integer), 0) + 1
    INTO v_seq
    FROM public.aridos_movimientos
   WHERE remito_numero LIKE 'RV-%';

  v_numero := 'RV-' || LPAD(v_seq::text, 4, '0');

  UPDATE public.aridos_movimientos SET
    remito_numero     = v_numero,
    remito_emitido_en = now(),
    updated_by        = p_user_id,
    updated_at        = now()
  WHERE id = p_movimiento_id
  RETURNING * INTO v_mov;

  RETURN v_mov;
END;
$$;

-- Misma política que el resto de las SECURITY DEFINER (migración
-- 20260527): solo service_role puede ejecutarla.
REVOKE EXECUTE ON FUNCTION public.emitir_remito_arido(integer, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.emitir_remito_arido(integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.emitir_remito_arido(integer, uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.emitir_remito_arido(integer, uuid) TO service_role;
