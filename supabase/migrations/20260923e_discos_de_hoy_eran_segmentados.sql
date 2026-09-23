-- 20260923e — Los 7 discos despachados hoy como "continuo" eran segmentados (user 2026-09-23)
--
-- Renglón 4355 (CC-004 SAN MARTIN 1050, 5 u, remito RM-1161) y renglón 4383
-- (CC-035 CONSULTORIOS PARAGUAY, 2 u, sin remito todavía) se pidieron y
-- despacharon contra C0859 (continuo) y lo que salió fue C2647 (segmentado).
-- Se mueve todo a la ficha correcta: renglón, despacho, cuenta del cliente y
-- el renglón del remito, para que la reimpresión diga lo que viajó.
--
-- Plata: nada. Las dos obras tienen materiales a cargo del cliente y los dos
-- renglones están a $0 en la cuenta y sin cobro ni certificado.
--
-- Recuento en el medio (CLAUDE.md §5.15): el número contado es la verdad y lo
-- que se recalcula es el ajuste de 20260923d.
--   continuo:   sin estos 7 despachos el sistema ya daba 0 = contado → el
--               ajuste de +7 sobra y se borra (lo cargó 20260923d hace una hora).
--   segmentado: con los 7 despachos el sistema da -7; contado 23 → +30.
--   turbo:      no cambia.
update public.solicitud_compra_item
   set material_id = 2647,
       descripcion = 'Disco diamantado segmentado 115mm (Patroll amarillo)'
 where id in (4355, 4383) and material_id = 859;

update public.stock_movimientos
   set material_id = 2647
 where id in (1345, 1369) and material_id = 859;

update public.materiales_a_cuenta_cliente
   set descripcion = 'Disco diamantado segmentado 115mm (Patroll amarillo)'
 where item_id in (4355, 4383);

update public.remitos_envio_item
   set descripcion = 'Disco diamantado segmentado 115mm (Patroll amarillo)'
 where item_id = 4355 and remito_id = 1190;

delete from public.stock_movimientos
 where material_id = 859 and tipo = 'ajuste' and fecha = '2026-09-23' and cantidad = 7;

update public.stock_movimientos
   set cantidad = 30,
       obs = 'Recuento del 23/09: 23 discos segmentados de 115. La ficha no tenía entradas y hoy salieron 7 (CC-004 x5, CC-035 x2, cargados primero como continuo): sistema -7, contado 23.'
 where material_id = 2647 and tipo = 'ajuste' and fecha = '2026-09-23' and cantidad = 23;

update public.stock_materiales m
   set stock_actual = coalesce((
         select sum(case when s.tipo = 'salida' then -s.cantidad else s.cantidad end)
           from public.stock_movimientos s
          where s.material_id = m.id and s.estado = 'aprobado'), 0)
 where m.id in (859, 2647, 2648);
