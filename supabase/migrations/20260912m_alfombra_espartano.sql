-- La alfombra de la iglesia: ficha duplicada, medida y precio
--
-- En el pedido #703 de hoy (CONCEPCION CAPILLA, Sosa) el renglón de alfombra
-- se cargó contra una ficha NUEVA — "alfombra iglesia" (2659), rubro
-- Ferretería general, sin sinónimos y con precio_ref $11 — cuando ya existía
-- la ficha real desde el 04/09: "Alfombra alto tránsito (El Espartano Delos)"
-- (1187), rubro Pisos y revestimientos, $27.000/m², usada en Oficina Misión
-- Salta. El alias "alfombra espartano" ya estaba puesto en la 1187; el alta
-- rápida igual dejó crear la duplicada.
--
-- Y la medida estaba mal: el user (09/09) aclaró que "la alfombra es El
-- Espartano, viene por 2 metros de ancho y 8,5 m de largo" — o sea
-- 2 × 8,5 = 17 m², no los 6 m² cargados.
--
-- Efecto en CONCEPCION CAPILLA (llave en mano, así que es gasto propio):
-- $66 → $459.000. No estaba cobrado ni certificado.
--
-- Cuatro cosas:
--   a) el renglón y su fila de cuenta pasan a la ficha buena, 17 m² x $27.000;
--   b) el movimiento de stock sigue al mismo material y cantidad (la 2659
--      quedaba en −6 y la salida real es de la 1187);
--   c) "alfombra iglesia" queda como sinónimo de la 1187, para que la próxima
--      vez que alguien la pida así la encuentre;
--   d) la ficha duplicada se da de baja.

-- a) El renglón a la ficha buena, con la medida real
update public.solicitud_compra_item
   set material_id = 1187,
       descripcion = 'Alfombra alto tránsito (El Espartano Delos)',
       cantidad = 17, unidad = 'm2', precio_unit = 27000,
       obs = coalesce(obs || ' · ', '') ||
             'Corregido 09/09: es El Espartano (rollo de 2 m de ancho x 8,5 m = 17 m²), no 6 m²; estaba en una ficha duplicada a $11.'
 where id = 3534;

update public.materiales_a_cuenta_cliente
   set descripcion = 'Alfombra alto tránsito (El Espartano Delos)',
       cantidad = 17, unidad = 'm2', precio_unit = 27000, precio_total = 459000,
       updated_at = now()
 where id = 3310 and obra_cod = 'CC-017';

-- b) El movimiento de stock: mismo despacho, material y cantidad reales
update public.stock_movimientos
   set material_id = 1187, cantidad = 17,
       obs = coalesce(obs || ' · ', '') || 'Reasignado 09/09 de la ficha duplicada "alfombra iglesia" a El Espartano; 6 → 17 m² (2 m de ancho x 8,5 m).'
 where id = 433;

-- c) El apodo va a la ficha buena
update public.stock_materiales
   set alias = (select array_agg(distinct a) from unnest(coalesce(alias, '{}') || array['alfombra iglesia']) a),
       obs = coalesce(obs, '') || ' Viene en rollo de 2 m de ancho (dicho del user 09/09).'
 where id = 1187;

-- d) La duplicada, de baja
update public.stock_materiales
   set activo = false, stock_actual = 0,
       obs = coalesce(obs, '') ||
             'Baja 09/09/2026: duplicada de la ficha 1187 "Alfombra alto tránsito (El Espartano Delos)". '
             'Se creó desde el alta rápida del pedido #703 con precio $11 y su único renglón se reasignó.'
 where id = 2659;
