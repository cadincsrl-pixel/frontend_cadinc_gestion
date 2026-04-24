-- =====================================================================
-- RPC transaccional eliminar_solicitud.
--
-- Reemplaza el camino JS no-transaccional en solicitudes.service.delete
-- que sufría de:
-- 1. Race condition read-modify-write sobre stock_materiales.stock_actual
--    (leía el valor, sumaba en JS, escribía — dos clientes concurrentes
--    podían perder un update).
-- 2. No atomicidad: si fallaba entre el update de stock y el delete de
--    solicitud, quedaba stock revertido sin la solicitud borrada.
-- 3. Errores silenciosos: las operaciones de update/insert dentro del
--    loop no capturaban errores.
--
-- Esta RPC:
-- - Valida auth.uid() tiene certificaciones.eliminacion.
-- - Locks FOR UPDATE sobre solicitud_compra y stock_materiales.
-- - Revierte stock + inserta stock_movimiento con motivo='devolucion'.
-- - Rechaza con SOLICITUD_TIENE_REMITOS si hay remitos_envio vinculados
--   (FK sin CASCADE; antes fallaba con error genérico 23503).
-- - Delete CASCADE de solicitud_compra borra solicitud_compra_item y
--   materiales_a_cuenta_cliente automáticamente.
-- =====================================================================

create or replace function public.eliminar_solicitud(
  p_solicitud_id integer,
  p_user_id      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_item             RECORD;
  v_stock_pre        numeric;
  v_items_revertidos integer := 0;
BEGIN
  -- (0) Auth gate — defensa en profundidad.
  PERFORM public._require_permiso_or_admin('certificaciones', 'eliminacion');

  -- (1) Lock de cabecera + check de existencia.
  PERFORM 1 FROM solicitud_compra WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOLICITUD_NO_EXISTE';
  END IF;

  -- (2) Check remitos_envio (FK sin ON DELETE CASCADE).
  -- Si la solicitud tuvo items enviados via remitos, no permitimos borrar
  -- — romperíamos referencialidad o dejaríamos los remitos apuntando a
  -- una solicitud eliminada. Mejor error claro que error de integridad.
  PERFORM 1 FROM remitos_envio WHERE solicitud_id = p_solicitud_id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'SOLICITUD_TIENE_REMITOS';
  END IF;

  -- (3) Revertir stock para items despachados/enviados con material_id.
  -- Lock primero los items, después los materiales (mismo orden que
  -- resolver_item_* para evitar deadlocks).
  FOR v_item IN
    SELECT id, estado, material_id, cantidad
      FROM solicitud_compra_item
     WHERE solicitud_id = p_solicitud_id
       AND material_id IS NOT NULL
       AND estado IN ('de_deposito', 'enviado')
     FOR UPDATE
  LOOP
    -- Lock del material antes de R-M-W.
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

  -- (4) Delete de la cabecera. ON DELETE CASCADE borra:
  --     - solicitud_compra_item (FK cascade)
  --     - materiales_a_cuenta_cliente (FK cascade)
  DELETE FROM solicitud_compra WHERE id = p_solicitud_id;

  RETURN jsonb_build_object(
    'success',           true,
    'solicitud_id',      p_solicitud_id,
    'items_revertidos',  v_items_revertidos
  );
END;
$$;

comment on function public.eliminar_solicitud(integer, uuid) is
  'Elimina una solicitud_compra de forma transaccional. Revierte stock, valida remitos_envio, auth gate certificaciones.eliminacion. Ver migración 20260424_rpc_eliminar_solicitud.';

grant execute on function public.eliminar_solicitud(integer, uuid) to authenticated;
