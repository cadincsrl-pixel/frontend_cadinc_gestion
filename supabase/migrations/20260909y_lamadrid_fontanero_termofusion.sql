-- LAMADRID 566: la compra de termofusión de El Fontanero (11/08)
--
-- Factura A 0008-00002336 de EL FONTANERO (Contreras Mario Gabriel),
-- 11/08/2026, a cuenta corriente: 16 renglones de agua por termofusión
-- (tubos rosca macho/hembra 25 y 32, válvulas PPR esfera 25 y 32, curvas 90,
-- tes, bujes de reducción, tubo Amanco PN20 32, unión doble 32, banda
-- autoadhesiva, cáñamo, sellador hidro 3). Neto $106.598,69 + IVA $22.385,73
-- = $128.984,42.
--
-- No estaba en NINGÚN lado: ni en la cuenta de ninguna obra, ni como entrada
-- de stock del depósito, ni en la planilla del capataz. El user confirmó que
-- es de LAMADRID — cierra: es la semana exacta (07-13/08) en que Reynoso el
-- sanitarista hizo la instalación de agua (su certificación es de esa
-- semana).
--
-- Va como UN renglón al pedido de migración de la obra (mismo criterio que
-- EMI y los contenedores), estado enviado con la fecha de la factura porque
-- el material ya se entregó (pedido del user).

with pedido as (
  select id from solicitud_compra
   where obra_cod = 'CC-016' and obs like '[migración]%'
   order by id desc limit 1
),
item as (
  insert into solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, estado, precio_unit, proveedor_id,
     cantidad_enviada, fecha_resolucion, fecha_envio, obs)
  select p.id,
         'Compra El Fontanero: termofusión agua (tubos, válvulas PPR, curvas, tes, bujes, cáñamo, sellador)',
         1, 'unid', 'enviado', 128984.42, 30,
         1, '2026-08-11', '2026-08-11',
         'Factura A 0008-00002336 (11/08), 16 renglones, $106.598,69 + IVA = $128.984,42. No estaba en la planilla del capataz; obra confirmada por el user el 08/09.'
  from pedido p
  returning id, solicitud_id, descripcion, cantidad, unidad, precio_unit, proveedor_id
)
insert into materiales_a_cuenta_cliente
  (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
   precio_unit, precio_total, origen, proveedor_id, fecha_resolucion, pagado_por)
select 'CC-016', i.solicitud_id, i.id, i.descripcion, 1, 'unid',
       128984.42, 128984.42, 'proveedor', 30, '2026-08-11', 'cadinc'
from item i;
