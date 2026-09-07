-- 20260907g — Precios de hoy del corrugado 3/4 y su conector (user 2026-09-07)
--
-- Presupuesto de VOLTAJE (proveedor 9) N° 0000-00213692 del 07/09/2026, por las
-- cantidades exactas de los dos renglones eléctricos que quedaron pendientes en
-- el pedido 679 de Garita (items 3398 y 3399, migración 20260906t):
--
--   CAÑO CORRUGADO LIVIANO 3/4 X METRO   25,00   P.Unit $224,00   P.Total $5.592,00
--   CONECTOR METALICO 3/4                30,00   P.Unit $265,00   P.Total $7.938,00
--   T. Neto $13.529,99 · IVA 21% $2.841,30 · Total $16.371,29
--
-- OJO: la columna "P. Unitario" del presupuesto está redondeada a pesos enteros.
-- El precio real sale del total de línea:
--   caño     5592 / 25 = 223,68 neto → 223,68 × 1,21 = 270,65 final
--   conector 7938 / 30 = 264,60 neto → 264,60 × 1,21 = 320,17 final
-- `precio_ref` es precio FINAL con IVA, como todo el catálogo.
--
-- El caño da exactamente el mismo número que las últimas compras a VOLTAJE
-- (270,65 el 03/09 y el 28/08), así que la cuenta cierra. El conector BAJÓ:
-- venía $335,17 (31/07) y $335,22 (23/07), los dos a VOLTAJE y con esta misma
-- descripción. Queda anotado en la obs por si fuera otro artículo; la ficha del
-- conector de caño RÍGIDO 3/4 es otra (id 260, $138,67).
--
-- Decisión del user: SOLO precios de referencia. Los items 3398 y 3399 siguen
-- 'pendiente' (el documento dice "no válido como Factura"); la compra se
-- resuelve desde la pantalla cuando corresponda.
-- `precio_actualizado_en` lo pone el trigger `trg_stock_materiales_precio_fecha`.

update public.stock_materiales
   set precio_ref = 270.65,
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: $270,65 final (neto $223,68 × 1,21) del presupuesto 0000-00213692 de VOLTAJE, '
             '25 m por $5.592 neto. Mismo precio que las compras del 03/09 y 28/08.',
       updated_at = now()
 where id = 59 and nombre = 'Caño corrugado 3/4"';

update public.stock_materiales
   set precio_ref = 320.17,
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: $320,17 final (neto $264,60 × 1,21) del presupuesto 0000-00213692 de VOLTAJE, '
             '30 unid por $7.938 neto, donde figura como "CONECTOR METALICO 3/4". BAJÓ desde $335,17 '
             '(31/07) y $335,22 (23/07), las dos a VOLTAJE con esta misma descripción; confirmar que '
             'es el mismo artículo. El conector de caño rígido 3/4 es la ficha 260.',
       updated_at = now()
 where id = 915 and nombre = 'Conector p/ caño corrugado 3/4"';
