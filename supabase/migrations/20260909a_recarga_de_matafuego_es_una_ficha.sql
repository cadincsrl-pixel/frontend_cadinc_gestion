-- La recarga de matafuego deja de ser texto libre y pasa a tener ficha propia.
--
-- Contexto: la revisión del 07/09 marcó 21 renglones como "no son materiales".
-- De esos 21, uno es el único que tiene plata en la cuenta de una obra:
--
--   item 2546 · CC NORTE · 18/08/2026 · "Recarga de matafuego ABC" · $20.000,01
--   proveedor SEGUMAX (15) · MCC 2406, sin cobrar
--
-- No es una nota ni una línea de impuesto: es un SERVICIO real que CADINC pagó
-- y le corresponde a la obra. Así que en vez de borrarlo, se le da entidad:
-- una ficha de catálogo, en el mismo rubro donde ya viven los matafuegos.
--
-- Va a "Obrador y señalización" (25) y no a "Seguridad y EPP" (15) porque ahí
-- están las fichas 669 "Matafuego ABC 5kg" y 670 "Matafuego ABC 10kg": la
-- recarga es el consumible de esas dos, no un elemento de protección personal.
--
-- Es un servicio, no algo que se stockea: stock_minimo 0 y aclarado en obs. El
-- renglón ya está 'enviado', así que vincularlo NO genera movimiento de stock
-- retroactivo — que es justo lo que corresponde, la recarga nunca pasó por el
-- depósito.

insert into stock_materiales
  (rubro_id, nombre, unidad, clase, stock_actual, stock_minimo,
   precio_ref, precio_actualizado_en, proveedor_id, alias, activo, obs)
values
  (25, 'Recarga de matafuego ABC', 'unid', 'material', 0, 0,
   20000, '2026-08-18', 15,
   array['recarga de matafuegos', 'recarga matafuego abc', 'recarga de extintor'],
   true,
   'SERVICIO, no stock: el matafuego se manda a recargar y vuelve el mismo. '
   || 'Se compra siempre al proveedor — NO despachar de depósito, el catálogo '
   || 'descontaría stock de algo que nunca estuvo en el galpón y lo dejaría en '
   || 'negativo. Precio de referencia tomado de la única recarga real, SEGUMAX '
   || '18/08/2026, $20.000,01. Sin factura asociada, así que no se pudo '
   || 'confirmar si ese número ya trae el IVA; si resultara neto, el de '
   || 'referencia sería ~$24.200.');

-- El renglón toma la ficha y pierde la marca de "no es un material": sí lo es,
-- solo que es un servicio y no una cosa.
update solicitud_compra_item i
   set material_id = m.id,
       obs = null
  from stock_materiales m
 where m.nombre = 'Recarga de matafuego ABC'
   and i.id = 2546;

-- El renglón hermano del mismo pedido y el mismo proveedor: "Matafuego nuevo
-- ABC" ($145.000) también está sin ficha, pero no se toca todavía — existen la
-- de 5kg y la de 10kg y no hay dato en la base que diga cuál se compró. Queda
-- para preguntarle a quien hizo la compra.
