-- Recuento de Sosa del 14/09: del Aliafor verde (ficha 441) hay 1.
-- Figuraba en -1, producto de una salida del 08/09 sin ninguna entrada previa.
--
-- `ajuste` es un DELTA sobre el saldo corriente, NO el número contado. Verificado contra
-- seis fichas con historial mixto (34, 36, 71, 76, 77, 79): en las seis el saldo cierra
-- sumando el ajuste al acumulado. Así que para pasar de -1 a 1 el ajuste es +2.
--
-- `stock_actual` es un cache que escribe el backend y NO tiene trigger sobre
-- stock_movimientos (CLAUDE.md §5.15), así que se recalcula a mano acá abajo.
--
-- El otro número del recuento (49 del "Patroll amarillo") NO se carga: "Patroll amarillo"
-- son cinco fichas distintas y el user no precisó cuál. Queda pendiente.

insert into public.stock_movimientos (material_id, tipo, cantidad, motivo, fecha, estado, obs, created_by)
values (441, 'ajuste', 2, 'ajuste_inventario', date '2026-09-14', 'aprobado',
        'Recuento de Sosa del 14/09: contó 1 disco Aliafor verde. La ficha figuraba en -1, así que el ajuste es +2.',
        'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');

update public.stock_materiales m
   set stock_actual = coalesce((
        select sum(case sm.tipo when 'entrada' then sm.cantidad
                               when 'salida'  then -sm.cantidad
                               when 'ajuste'  then sm.cantidad end)
          from public.stock_movimientos sm
         where sm.material_id = m.id and coalesce(sm.estado,'aprobado') <> 'rechazado'), 0)
 where m.id = 441;

do $$
declare v numeric;
begin
  select stock_actual into v from public.stock_materiales where id = 441;
  if v <> 1 then raise exception 'El stock del Aliafor verde quedó en % y tenía que quedar en 1', v; end if;
end $$;
