-- LAMADRID 566: la compra grande de ZERAMIKO la pagó el cliente directo
--
-- Factura ZERAMIKO 00051-00008710 (30/07/2026), a nombre de BONILLA DIEGO
-- RICARDO (CUIT 23-37096607-9), domicilio "LAMADRID 566", pagada con VISA
-- en 6 cuotas (promo Galicia): porcelanato SL 58x58 x36, cerámico scop
-- 45x45 x12, Klaukol flex x12 e impermeable x6, pastina x15, espaciador
-- autonivelante x4. Neto $1.743.538,51 + IVA $366.143,09 + percepciones
-- $65.382,69 = $2.175.064,29.
--
-- El user confirmó: "esta compra de zeramiko la pagó el cliente directo".
-- Los 6 renglones estaban A COBRAR en la cuenta ($2.000.998,13) — se le
-- estaba por cobrar al cliente algo que ya pagó de su bolsillo.
--
-- Además venían cargados MEZCLADOS: porcelanato y cerámico con IVA, y los
-- otros cuatro al neto de la factura. Ya que no facturan, se alinean todos
-- al precio final con IVA para que el total de "pago directo" refleje lo
-- que el cliente pagó de verdad (las percepciones quedan fuera del
-- por-renglón; con ellas se llega al total de la factura).
--
--   3029 separador     4 x  8.465,40 =    33.861,60  (estaba neto)
--   3031 Klaukol flex 12 x 35.231,00 =   422.772,00  (estaba neto)
--   3032 Klaukol imp.  6 x 13.514,99 =    81.089,94  (estaba neto)
--   3033 pastina      15 x  5.900,00 =    88.500,00  (estaba neto)
--   3034 cerámico     12 x 20.297,00 =   243.564,00  (ya con IVA, no cambia)
--   3035 porcelanato  36 x 34.441,50 = 1.239.894,00  (ya con IVA, no cambia)

update materiales_a_cuenta_cliente set precio_unit = 8465.40,  precio_total = 33861.60,  updated_at = now() where id = 3029;
update materiales_a_cuenta_cliente set precio_unit = 35231.00, precio_total = 422772.00, updated_at = now() where id = 3031;
update materiales_a_cuenta_cliente set precio_unit = 13514.99, precio_total = 81089.94,  updated_at = now() where id = 3032;
update materiales_a_cuenta_cliente set precio_unit = 5900.00,  precio_total = 88500.00,  updated_at = now() where id = 3033;

update materiales_a_cuenta_cliente
   set pagado_por = 'cliente', updated_at = now()
 where id in (3029, 3031, 3032, 3033, 3034, 3035) and obra_cod = 'CC-016';

update solicitud_compra_item i
   set pagado_por = 'cliente',
       obs = coalesce(i.obs || ' · ', '') ||
             'Pagado directo por el cliente: factura ZERAMIKO 00051-00008710 (30/07) a nombre de Bonilla, VISA 6 cuotas. Marcado el 08/09.'
  from materiales_a_cuenta_cliente c
 where c.item_id = i.id and c.id in (3029, 3031, 3032, 3033, 3034, 3035);
