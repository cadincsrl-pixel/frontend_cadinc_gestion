-- =====================================================================
-- RPC sp_recalcular_saldos_caja — recalcula saldo_acum de movimientos_caja
-- usando window function. Reemplaza el loop JS N+1 de cajaService.
--
-- Problema resuelto:
-- Antes, crear/editar/borrar un movimiento disparaba un loop en JS que
-- hacía UPDATE por fila. Con 500 movimientos son 500 round-trips serializados
-- y race condition: dos inserciones concurrentes pisaban los mismos saldos.
--
-- Ahora todo en una sola query atómica:
--   UPDATE ... SET saldo_acum = SUM(delta) OVER (ORDER BY fecha, id)
--
-- Auth gate: caja.actualizacion (mismo que requiere el backend Hono).
-- =====================================================================

create or replace function public.sp_recalcular_saldos_caja()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_rows_actualizadas integer;
BEGIN
  PERFORM public._require_permiso_or_admin('caja', 'actualizacion');

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
$$;

comment on function public.sp_recalcular_saldos_caja() is
  'Recalcula saldo_acum de movimientos_caja con window function. Reemplaza loop JS N+1. Auth gate caja.actualizacion. Devuelve cantidad de rows actualizados.';

grant execute on function public.sp_recalcular_saldos_caja() to authenticated;
