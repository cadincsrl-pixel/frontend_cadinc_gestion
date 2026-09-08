-- LAMADRID 566: los ladrillos del 21/07 según la factura real
--
-- El user está cotejando la cuenta contra las facturas (08/09). La factura
-- A 0152-00000923 de SUPERMAT CENTRAL S.A.S. ("UNIMAX", 21/07/2026) dice:
-- 288 ladrillos huecos 12x18x33 × $602,47 −7% bonif = neto $161.365,56
-- + IVA $33.886,77 + perc. IIBB $2.017,07 = $197.269,40.
--
-- El sistema (y la planilla del capataz) tenían 270 × $729 = $196.830 con
-- proveedor "El sol": el capataz le erró al corralón y aproximó el total.
-- Manda la factura: 288 u, $197.269,40 final, proveedor UNIMAX (se crea,
-- no existía). El renglón es mcc 1118 / item 1231.

insert into proveedores (nombre)
values ('UNIMAX (Supermat Central)');

update solicitud_compra_item
   set cantidad = 288,
       precio_unit = 684.96,
       proveedor_id = (select id from proveedores where nombre = 'UNIMAX (Supermat Central)')
 where id = 1231;

update materiales_a_cuenta_cliente
   set cantidad = 288,
       precio_unit = 684.96,
       precio_total = 197269.40,
       proveedor_id = (select id from proveedores where nombre = 'UNIMAX (Supermat Central)'),
       updated_at = now()
 where id = 1118;
