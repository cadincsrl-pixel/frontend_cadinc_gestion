-- =====================================================================
-- RPCs transaccionales: reabrir_liquidacion / eliminar_liquidacion.
--
-- Reemplazan el camino JS no-transaccional de liquidaciones.service.
-- Problemas que resuelven:
-- 1. Operaciones sobre 3-4 tablas (tramos, adelantos, gastos_logistica,
--    liquidaciones) hechas secuencialmente desde JS sin rollback.
-- 2. Errores silenciosos: los updates en el loop awaitaban pero no
--    capturaban el { error }.
-- 3. Concurrencia: "cerrar" + "reabrir" concurrentes podían dejar
--    liquidaciones.estado en un valor y los children en otro.
--
-- Auth gate interno: logistica.actualizacion (reabrir) / logistica.eliminacion
-- (eliminar). Mismo patrón que resolver_item_* y eliminar_solicitud.
-- =====================================================================


-- ── 1. reabrir_liquidacion ──────────────────────────────────────────
-- Una liquidación en 'cerrada' vuelve a 'borrador'. Tramos, adelantos y
-- gastos quedan desligados para poder incluirlos en otra liquidación o
-- editarlos. Gastos además revierten estado 'pagado' → 'aprobado'.
create or replace function public.reabrir_liquidacion(
  p_liquidacion_id integer,
  p_user_id        uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_estado_actual text;
  v_tramos_desligados    integer;
  v_adelantos_desligados integer;
  v_gastos_revertidos    integer;
BEGIN
  -- (0) Auth gate.
  PERFORM public._require_permiso_or_admin('logistica', 'actualizacion');

  -- (1) Lock y validación.
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

  -- (2) Desligar tramos.
  UPDATE tramos
     SET liquidacion_id = NULL,
         updated_by     = p_user_id
   WHERE liquidacion_id = p_liquidacion_id;
  GET DIAGNOSTICS v_tramos_desligados = ROW_COUNT;

  -- (3) Desligar adelantos.
  UPDATE adelantos
     SET liquidacion_id = NULL,
         updated_by     = p_user_id
   WHERE liquidacion_id = p_liquidacion_id;
  GET DIAGNOSTICS v_adelantos_desligados = ROW_COUNT;

  -- (4) Revertir gastos: estado 'pagado' → 'aprobado', desligar.
  UPDATE gastos_logistica
     SET estado         = 'aprobado',
         liquidacion_id = NULL,
         updated_by     = p_user_id
   WHERE liquidacion_id = p_liquidacion_id;
  GET DIAGNOSTICS v_gastos_revertidos = ROW_COUNT;

  -- (5) Cambiar estado de la liquidación.
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
$$;

comment on function public.reabrir_liquidacion(integer, uuid) is
  'Reabre una liquidación cerrada. Desliga tramos, adelantos y gastos (revierte pagado→aprobado). Transaccional + auth gate logistica.actualizacion.';

grant execute on function public.reabrir_liquidacion(integer, uuid) to authenticated;


-- ── 2. eliminar_liquidacion ──────────────────────────────────────────
-- Desliga tramos/adelantos/gastos y borra la liquidación. Los children
-- con FK NO ACTION (tramos, adelantos) deben desligarse manualmente
-- antes del delete. Los con CASCADE (liquidacion_tramos, liquidacion_viajes)
-- se borran automáticamente.
create or replace function public.eliminar_liquidacion(
  p_liquidacion_id integer,
  p_user_id        uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_tramos_desligados    integer;
  v_adelantos_desligados integer;
  v_gastos_revertidos    integer;
BEGIN
  -- (0) Auth gate.
  PERFORM public._require_permiso_or_admin('logistica', 'eliminacion');

  -- (1) Lock y validación de existencia.
  PERFORM 1 FROM liquidaciones WHERE id = p_liquidacion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIQUIDACION_NO_EXISTE';
  END IF;

  -- (2) Desligar tramos (FK NO ACTION, el DELETE fallaría sin esto).
  UPDATE tramos
     SET liquidacion_id = NULL,
         updated_by     = p_user_id
   WHERE liquidacion_id = p_liquidacion_id;
  GET DIAGNOSTICS v_tramos_desligados = ROW_COUNT;

  -- (3) Desligar adelantos (FK NO ACTION).
  UPDATE adelantos
     SET liquidacion_id = NULL,
         updated_by     = p_user_id
   WHERE liquidacion_id = p_liquidacion_id;
  GET DIAGNOSTICS v_adelantos_desligados = ROW_COUNT;

  -- (4) Revertir gastos a 'aprobado' y desligar.
  -- (gastos_logistica tiene FK SET NULL así que el DELETE no fallaría,
  -- pero queremos que el estado vuelva a 'aprobado' explícitamente.)
  UPDATE gastos_logistica
     SET estado         = 'aprobado',
         liquidacion_id = NULL,
         updated_by     = p_user_id
   WHERE liquidacion_id = p_liquidacion_id;
  GET DIAGNOSTICS v_gastos_revertidos = ROW_COUNT;

  -- (5) Delete — liquidacion_tramos / liquidacion_viajes cascadean.
  DELETE FROM liquidaciones WHERE id = p_liquidacion_id;

  RETURN jsonb_build_object(
    'success',              true,
    'liquidacion_id',       p_liquidacion_id,
    'tramos_desligados',    v_tramos_desligados,
    'adelantos_desligados', v_adelantos_desligados,
    'gastos_revertidos',    v_gastos_revertidos
  );
END;
$$;

comment on function public.eliminar_liquidacion(integer, uuid) is
  'Elimina una liquidación. Desliga tramos/adelantos/gastos antes del DELETE. Transaccional + auth gate logistica.eliminacion.';

grant execute on function public.eliminar_liquidacion(integer, uuid) to authenticated;
