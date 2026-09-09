-- "manifull" y "trincheta": dos altas rápidas que no debieron existir
--
-- En el pedido #703 de hoy (CONCEPCION CAPILLA) Sosa creó dos fichas por el
-- alta rápida del pedido:
--
--   2653 "manifull"   → el manifold de aire acondicionado, que YA ESTABA en
--                       el catálogo desde antes: ficha 1322 "Manifold p/ aire
--                       acondicionado (juego de manómetros)", HERRAMIENTA, con
--                       los alias manifold / maniful / manifol / manifould /
--                       manifoult... pero ninguno con DOBLE L. Escribió
--                       "manifull", no matcheó nada y el sistema le ofreció
--                       crear. Se agrega ese sinónimo para que no se repita.
--   2660 "trincheta"  → es una HERRAMIENTA (va y vuelve de la obra), estaba
--                       cargada como material de Ferretería a $11. En el
--                       catálogo solo existía "Hoja de trincheta", que es el
--                       repuesto, no la herramienta.
--
-- Las dos entraron a la cuenta de la obra a $11. Como son herramientas, salen
-- de la cuenta por el camino de siempre (evento + borrado de la fila), igual
-- que el puntal (20260910p) y la piola (20260912l).

-- ── El manifold: el sinónimo que faltaba, y el renglón a la ficha buena ──
update public.stock_materiales
   set alias = (select array_agg(distinct a) from unnest(coalesce(alias, '{}') || array['manifull', 'manifulll']) a)
 where id = 1322;

update public.solicitud_compra_item
   set material_id = 1322,
       descripcion = 'Manifold p/ aire acondicionado (juego de manómetros)',
       obs = coalesce(obs || ' · ', '') ||
             'Reasignado 09/09: "manifull" es el manifold de aire (ficha 1322), que ya existía; se cargó una ficha nueva porque el alias tenía una sola L.'
 where material_id = 2653;

update public.stock_materiales
   set activo = false, precio_ref = 0, stock_actual = 0,
       obs = coalesce(obs, '') ||
             'Baja 09/09/2026: duplicada de la ficha 1322 (manifold de aire acondicionado). Alta rápida del pedido #703 con precio $11.'
 where id = 2653;

-- ── La trincheta: de material a herramienta ──
update public.stock_materiales
   set nombre = 'Trincheta (cutter)', clase = 'herramienta', rubro_id = 26, precio_ref = 0,
       alias = array['trincheta', 'cutter', 'cuchilla trincheta'],
       obs = coalesce(obs, '') ||
             'Pasada a herramienta el 09/09/2026: va y vuelve de la obra, no se factura. La HOJA de repuesto sí es material (ficha 858).'
 where id = 2660;

-- ── Las dos salen de la cuenta ──
create temp table herr as
select c.id as mcc_id, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
where i.material_id in (1322, 2660) and c.cobro_id is null;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select h.item_id, h.solicitud_id, 'sacado_de_cuenta_cliente', null, h.estado, h.cantidad,
       'Era una herramienta cargada en la cuenta: ' || h.descripcion,
       jsonb_build_object('motivo', 'manifold y trincheta a herramientas 2026-09-09', 'origen_mcc', h.origen)
from herr h;

delete from public.materiales_a_cuenta_cliente c using herr h where c.id = h.mcc_id;
drop table herr;

update public.solicitud_compra_item set material_id = material_id where material_id in (1322, 2660);

-- ── Y la tercera del mismo pedido: la masilla poliéster ──
-- 2658 "masilla poliester universal", también creada por el alta rápida a $11.
-- Esa sí es material y el rubro (Herrería) está bien; solo faltaba el precio.
-- Búsqueda del 09/09: la lata de 1 kg con catalizador — que es exactamente el
-- renglón — va de $11.150 a $13.150 en pinturerías online (Zeocar, Trimas
-- Sinteplast; en Tucumán, Pintureria España $13.150) y arranca en ~$14.500 en
-- Mercado Libre. Se toma $14.000/kg, el medio del rango de ML.
update public.stock_materiales
   set precio_ref = 14000, precio_actualizado_en = '2026-09-09',
       alias = array['masilla poliester', 'masilla plastica', 'masilla de carroceria', 'masilla poliester universal'],
       obs = coalesce(obs, '') ||
             'Precio de referencia del 09/09/2026: lata de 1 kg con catalizador, $14.000 (rango $11.150-$18.000).'
 where id = 2658;

update public.materiales_a_cuenta_cliente
   set precio_unit = 14000, precio_total = 14000, updated_at = now()
 where id = 3305 and obra_cod = 'CC-017';
