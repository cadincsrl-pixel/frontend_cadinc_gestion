-- LAMADRID 566: los tornillos del 07/08 según la factura real
--
-- Factura A 0005-00019806 de BULONERIA + MARTINEZ (Transporte Martinez SAS),
-- 07/08/2026, contado:
--   TORNILLO FIXER 5x75  · 200 u · neto  $9.090,80 → con IVA $10.999,87
--   TORNILLO FIXER 6x110 · 100 u · neto $12.396,70 → con IVA $15.000,01
--   Total factura $25.999,88.
--
-- El sistema despachó ese día 200 "6x80mm" a $59,50 y 100 "6x127mm" a
-- $125,40 ($24.440): fichas parecidas del catálogo, no las medidas ni los
-- precios reales de la compra. (La planilla del capataz los tenía a $47.100,
-- peor todavía.) Manda la factura; se redondea a $55/u y $150/u
-- ($26.000, +12 centavos sobre la factura).
--   mcc 2040 / item ver abajo: 200 u  $59,50 → $55
--   mcc 2041: 100 u $125,40 → $150

update materiales_a_cuenta_cliente
   set precio_unit = 55, precio_total = 11000, updated_at = now()
 where id = 2040 and obra_cod = 'CC-016';

update materiales_a_cuenta_cliente
   set precio_unit = 150, precio_total = 15000, updated_at = now()
 where id = 2041 and obra_cod = 'CC-016';

update solicitud_compra_item i
   set obs = coalesce(i.obs || ' · ', '') ||
             'Precio corregido el 08/09 con la factura Buloneria Martinez A 0005-00019806 (07/08): la compra real fue fixer 5x75 / 6x110.'
 where i.id in (select item_id from materiales_a_cuenta_cliente where id in (2040, 2041));
