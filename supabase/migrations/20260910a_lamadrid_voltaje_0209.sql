-- LAMADRID 566: la compra grande de VOLTAJE del 02/09 no estaba en el sistema
--
-- Factura A 0006-00003681 de VOLTAJE SRL (02/09/2026, cuenta corriente), con
-- la obra impresa en observaciones: "PR Nº 000000212881 - cristian lazarte /
-- obra lamadrid 566". Es el grueso de la instalación eléctrica:
--
--   cable unipolar 2,5mm Kalop rojo/celeste/verde-amarillo (100 m c/u),
--   cable 1,5mm rojo (100 m), cable subterráneo 3x6mm (21 m),
--   llaves Kalop (2 tomas x5, 2 puntos, 1 punto), bastidores, tapas, módulos.
--
--   Neto $700.914,05 + IVA 21% $142.940,27 + IVA 10,5% $2.125,84
--   = $845.980,16.
--
-- No estaba ni como pedido ni en la cuenta (es posterior al corte de la
-- planilla del capataz, 27/08). Entra al pedido de migración como UN renglón
-- (criterio EMI/Fontanero), enviado con la fecha de la factura — el material
-- lo retiró Cristian Lazarte según el PR.
--
-- La otra factura VOLTAJE que pasó el user (A 0005-00024689, 24/08,
-- $154.610,20) YA estaba cargada completa y con IVA (mcc 2526-2534, 9/9
-- renglones, $13 de diferencia por redondeos) — sin cambios.

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
         'Compra VOLTAJE: cables Kalop (2,5/1,5mm y subterráneo 3x6) y llaves/bastidores/módulos',
         1, 'unid', 'enviado', 845980.16, 9,
         1, '2026-09-02', '2026-09-02',
         'Factura A 0006-00003681 (02/09), 11 renglones, $700.914,05 + IVA = $845.980,16. Retiró Cristian Lazarte (PR 000000212881, "obra lamadrid 566" impreso en la factura). Posterior al corte de la planilla del capataz.'
  from pedido p
  returning id, solicitud_id
)
insert into materiales_a_cuenta_cliente
  (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
   precio_unit, precio_total, origen, proveedor_id, fecha_resolucion, pagado_por)
select 'CC-016', i.solicitud_id, i.id,
       'Compra VOLTAJE: cables Kalop (2,5/1,5mm y subterráneo 3x6) y llaves/bastidores/módulos',
       1, 'unid', 845980.16, 845980.16, 'proveedor', 9, '2026-09-02', 'cadinc'
from item i;
