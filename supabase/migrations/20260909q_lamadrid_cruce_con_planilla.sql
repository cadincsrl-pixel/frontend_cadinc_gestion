-- LAMADRID 566 (CC-016): correcciones del cruce contra la planilla del cliente
--
-- El 08/09 se cruzó la planilla que lleva el capataz/cliente (amarillo = lo
-- compró el cliente) contra la cuenta corriente del sistema. Coincidió en el
-- corazón (5/7 semanas de MO al peso, mismas certs, 92 renglones 1:1), pero
-- quedaron 5 renglones del despacho del 01/08 con el pagador AL REVÉS:
-- el sistema decía "los pagó el cliente" (pago_directo) y la planilla los
-- cobra con precio, en filas NO amarillas. El user confirmó: "la planilla
-- está bien, corregí el sistema".
--
-- Los 5 son despachos de depósito (origen='deposito', estado 'enviado') que
-- nunca descontaron stock ni tienen stock_movimientos, así que tocar
-- cantidades acá no desbalancea inventario.
--
-- Detalle renglón por renglón (mcc id → item id):
--   1767 → 1920  Tirante pino 2x3" x 2.75m, 30u. Ya valuado $150.210,90
--                (a $5.007,03/u, el precio real de la compra del 07/08).
--                Solo cambia el pagador. La planilla lo tiene a $3.872/u
--                ($116.160): se defiende la valuación del sistema, criterio
--                general del cruce.
--   1768 → 1925  Sombrerete, 3u. Ya valuado $37.020 (la planilla dice
--                $49.800; ídem criterio). Solo pagador.
--   1769 → 1924  Caño chapa galv. 100mm, 4u. Estaba en $0: toma el precio
--                de la planilla ($12.620/u = $50.480), única fuente.
--   1771 → 1922  "2 ML de hierro del 10", 1 renglón. Estaba en $0: $3.333,33
--                (2 m × $1.666,67 de la planilla).
--   1772 → 1921  Tornillo madera 6x127mm (5"). El sistema tenía 50u en $0;
--                la planilla registra 800u × $197,75 = $158.200. El user
--                avaló la planilla: cantidad 800 y precio en item + MCC.
--
-- Efecto en el saldo del cliente: los 5 renglones pasan de pago_directo a
-- a_cobrar por un total de $399.244,23
-- (150.210,90 + 37.020 + 50.480 + 3.333,33 + 158.200).

update solicitud_compra_item
   set pagado_por = 'cadinc'
 where id in (1920, 1921, 1922, 1924, 1925);

update materiales_a_cuenta_cliente
   set pagado_por = 'cadinc'
 where id in (1767, 1768, 1769, 1771, 1772);

update materiales_a_cuenta_cliente
   set precio_unit = 12620, precio_total = 50480
 where id = 1769;

update materiales_a_cuenta_cliente
   set precio_unit = 3333.33, precio_total = 3333.33
 where id = 1771;

update solicitud_compra_item
   set cantidad = 800
 where id = 1921;

update materiales_a_cuenta_cliente
   set cantidad = 800, precio_unit = 197.75, precio_total = 158200
 where id = 1772;
