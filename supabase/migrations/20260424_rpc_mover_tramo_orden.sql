-- =====================================================================
-- RPC transaccional mover_tramo_orden (swap de orden_dia entre dos tramos).
--
-- Reemplaza el camino JS de tramos.service.mover que hacía:
--   1. SELECT actual
--   2. SELECT vecino
--   3. UPDATE actual.orden_dia = vecino.orden_dia
--   4. UPDATE vecino.orden_dia = actual.orden_dia (antes del paso 3)
--
-- Problemas:
-- - Dos usuarios moviendo tramos del mismo día en paralelo podían leer
--   valores consistentes y escribir resultados que dejaran duplicados
--   (ambos con el mismo orden_dia).
-- - Sin lock, la ventana entre SELECT y UPDATE es arbitraria.
--
-- Fix: FOR UPDATE sobre ambos tramos dentro de la misma transacción.
-- Auth gate logistica.creacion (match con el route POST /:id/mover).
-- =====================================================================

create or replace function public.mover_tramo_orden(
  p_tramo_id integer,
  p_dir      text,   -- 'up' | 'down'
  p_user_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_actual_fecha    date;
  v_actual_orden    integer;
  v_actual_id       integer;
  v_vecino_id       integer;
  v_vecino_orden    integer;
BEGIN
  -- (0) Auth gate.
  PERFORM public._require_permiso_or_admin('logistica', 'creacion');

  -- (1) Validar dirección.
  IF p_dir NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'DIR_INVALIDA';
  END IF;

  -- (2) Lock del tramo objetivo + datos.
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

  -- (3) Buscar vecino dentro del mismo día con FOR UPDATE.
  -- up   → el inmediato con orden_dia mayor (sube en la lista).
  -- down → el inmediato con orden_dia menor.
  -- Ordenamos por COALESCE(orden_dia, id) para consistencia con el SELECT
  -- del frontend, aunque el filtro de tipos (gt/lt) ya usa el valor crudo.
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

  -- (4) Si no hay vecino, el tramo ya está en el extremo → no-op.
  IF v_vecino_id IS NULL THEN
    RETURN jsonb_build_object('moved', false);
  END IF;

  -- (5) Swap atómico.
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
$$;

comment on function public.mover_tramo_orden(integer, text, uuid) is
  'Mueve un tramo en su día (swap de orden_dia con vecino). Transaccional con FOR UPDATE. Auth gate logistica.creacion.';

grant execute on function public.mover_tramo_orden(integer, text, uuid) to authenticated;
