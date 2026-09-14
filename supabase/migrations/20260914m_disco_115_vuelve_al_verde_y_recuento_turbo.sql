-- Dos correcciones del 14/09, las dos con dato del user.
--
-- 1) REVIERTE la migración 20260914j. Ahí moví el renglón 3450 ("Disco diamantado 115mm",
--    20 unidades del pedido de depósito de Sosa) de la ficha 441 (Aliafor verde, $24.000)
--    a la 2648 (Patroll turbo 115, $9.500), razonando que el disco de la foto que mandó el
--    user era el turbo y que por lo tanto eso era lo que Sosa quería.
--
--    Estaba mal. El user aclaró: "en realidad Sosa quiere Aliafor verde, puso ése porque se
--    confundió". O sea que la descripción genérica del renglón era ambigua y la ficha
--    original (441) resultó ser la correcta. Vuelve a 441.
--
--    La lección es la contraria a la que parecía: el precio de catálogo NO alcanza para
--    inferir qué quiso pedir alguien. Que el turbo sea el que más usan (dato del user) no
--    implica que sea lo que pedía ESTE renglón.
--
--    El renglón ya está `rechazado` desde entonces, así que no se va a comprar de ninguna
--    manera; esto sólo deja el registro apuntando a lo que se quiso pedir.
--
-- 2) Recuento de Sosa: 49 discos Patroll TURBO de 4 1/2 (ficha 2648), que estaba en 0 y sin
--    movimientos. Se descartó que fueran los de 7": el user confirmó que de 7 pulgadas no
--    hay nada todavía, pese a que hay 30 compradas en el mismo pedido (renglón 3456, que
--    debe estar sin recibir).
--
--    `ajuste` es un DELTA sobre el saldo, no el número contado; como la ficha estaba en 0,
--    acá delta y contado coinciden. `stock_actual` es cache sin trigger: se recalcula.

update public.solicitud_compra_item set material_id = 441 where id = 3450;

insert into public.stock_movimientos (material_id, tipo, cantidad, motivo, fecha, estado, obs, created_by)
values (2648, 'ajuste', 49, 'ajuste_inventario', date '2026-09-14', 'aprobado',
        'Recuento de Sosa del 14/09: 49 discos Patroll turbo de 4 1/2. La ficha estaba en 0 y sin movimientos.',
        'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');

update public.stock_materiales m
   set stock_actual = coalesce((
        select sum(case sm.tipo when 'entrada' then sm.cantidad
                               when 'salida'  then -sm.cantidad
                               when 'ajuste'  then sm.cantidad end)
          from public.stock_movimientos sm
         where sm.material_id = m.id and coalesce(sm.estado,'aprobado') <> 'rechazado'), 0)
 where m.id = 2648;

do $$
declare v numeric; f integer;
begin
  select stock_actual into v from public.stock_materiales where id = 2648;
  select material_id into f from public.solicitud_compra_item where id = 3450;
  if v <> 49 then raise exception 'El turbo 115 quedó en % y tenía que quedar en 49', v; end if;
  if f <> 441 then raise exception 'El renglón 3450 quedó en la ficha % y tenía que volver a la 441', f; end if;
end $$;
