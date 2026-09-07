-- 20260908k — Se cargan los precios que ya estaban en el sistema, en Lamadrid
-- (user 2026-09-07: "fijate lamadrid lo que le falta precio si ya lo tenemos en
-- sistema; el alambre recocido son 5 kg")
--
-- Lamadrid (CC-016) es obra de CLIENTE, asi que por defecto los renglones a $0
-- se dejan quietos. Esta vez el user lo pide explicitamente, que es la
-- excepcion de siempre.
--
-- De los 31 renglones sin precio, estos CUATRO tienen ficha con precio cargado:
--   3071  4 placas de Superboard 10mm  x $45.000     = $180.000,00
--   3085  Alambre recocido N°16                       = $ 17.020,40  (ver abajo)
--   1898  1 punta Phillips PH2         x $ 3.270,33   = $  3.270,33
--   1899  1 mecha de acero rapido 4.2  x $ 1.778,70   = $  1.778,70
--                                             TOTAL   = $202.069,43
--
-- EL ALAMBRE ADEMAS TENIA MAL LA CANTIDAD. La ficha 639 se mide en KG y el
-- renglon decia "1 unid", que no quiere decir nada: un kilo suelto y un rollo
-- entero son la misma "unidad". El user confirma que fueron 5 kg, asi que van
-- 5 kg x $3.404,08.
--
-- Ninguno esta cobrado (cobro_id null en los cuatro), asi que no hay que tocar
-- ningun cobro. `cantidad_enviada` acompaña a `cantidad` en el alambre: se
-- despacharon los 5 kg, no 1.
update public.solicitud_compra_item
set cantidad = 5, cantidad_enviada = 5, unidad = 'kg', precio_unit = 3404.08,
    descripcion = 'Alambre recocido N°16',
    obs = coalesce(obs || ' · ', '') || 'Corregido el 07/09: el renglon decia "1 unid" contra una ficha que se mide en kg. El user confirmo que fueron 5 kg. Precio de referencia del 22/08.'
where id = 3085;

update public.solicitud_compra_item i
set precio_unit = sm.precio_ref
from public.stock_materiales sm
where sm.id = i.material_id and i.id in (3071, 1898, 1899);

-- La cuenta del cliente se pone al dia con lo mismo.
update public.materiales_a_cuenta_cliente
set cantidad = 5, unidad = 'kg', precio_unit = 3404.08, precio_total = 17020.40
where item_id = 3085;

update public.materiales_a_cuenta_cliente m
set precio_unit = sm.precio_ref,
    precio_total = m.cantidad * sm.precio_ref
from public.solicitud_compra_item i
join public.stock_materiales sm on sm.id = i.material_id
where i.id = m.item_id and m.item_id in (3071, 1898, 1899);
