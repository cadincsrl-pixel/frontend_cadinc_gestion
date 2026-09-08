-- LAMADRID 566: la tanda de construcción en seco del 31/08 la pagó el cliente
--
-- Orden de entrega EMI X 0004-031703 (20/07/2026), a nombre de VALDEZ
-- NICOLAS (cons. final): superboard, soleras 70/35, montantes 69/34, placas
-- Durlock 12,5 x14, tornillos T1/T2/tel-fix, tacos, masillas, loxon frentes,
-- cinta, alambre, envío. El user confirmó: "esta compra de materiales de
-- construcción en seco la pagó el cliente en lamadrid".
--
-- Los 15 renglones del 31/08 del sistema calzan uno a uno con la orden.
-- 8 ya estaban como pago directo; estos 7 habían quedado A COBRAR:
--
--   2892 Solera 70mm x14        55.381,34
--   2894 Tornillo T1 x1000      32.340,00   (la orden: 2 cajas de 500)
--   2896 Tarugo fisher x100      6.000,00   (la orden: tacos comunes N8)
--   2897 Tarugo fisher x100      6.000,00   (la orden: tornillo tel-fix x100)
--   2900 Placa Durlock x14     214.304,30
--   2901 Montante 35mm x33     113.334,54   (la orden: montante 34)
--   2903 Solera 35mm x13        46.196,28
--                              ----------
--                              473.556,46 que se le estaban por cobrar.
--
-- Las valuaciones se conservan (una vez en pago directo no facturan; la
-- orden de entrega no trae precios para reemplazarlas).

update materiales_a_cuenta_cliente
   set pagado_por = 'cliente', updated_at = now()
 where id in (2892, 2894, 2896, 2897, 2900, 2901, 2903)
   and obra_cod = 'CC-016';

update solicitud_compra_item i
   set pagado_por = 'cliente',
       obs = coalesce(i.obs || ' · ', '') ||
             'Pagado directo por el cliente: orden de entrega EMI X 0004-031703 a nombre de Valdez. Marcado el 08/09.'
  from materiales_a_cuenta_cliente c
 where c.item_id = i.id and c.id in (2892, 2894, 2896, 2897, 2900, 2901, 2903);
