-- 20260905aa — Villaguay (cc 24): los 3 renglones en $0 que ya tienen precio en el sistema
--
-- Arranque de "completemos todos los precios de Villaguay" (user 2026-09-05).
-- Obra llave en mano: costo interno. Toman la última compra real / referencia:
--   #2004 Esmalte sintético x 4lts      → $49.200 (última compra 10/07/2026)
--   #2391 Espejo 60x80cm ×3             → $31.321,82 (última compra Hipódromo 27/07/2026)
--   #2425 Cerradura de embutir          → $23.500 (última compra 26/08/2026)
-- El resto (48) espera respuestas del user.

create temp table precios (item_id int, precio numeric, fuente text);
insert into precios values
  (2004, 49200,    'última compra 10/07/2026 (Esmalte sintético x 4lts)'),
  (2391, 31321.82, 'última compra 27/07/2026 (Espejo 60x80cm)'),
  (2425, 23500,    'última compra 26/08/2026 (Cerradura de embutir)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $' || p.precio || ' (' || p.fuente || ')',
       jsonb_build_object('motivo', 'Villaguay precios 2026-09-05', 'precio_anterior', i.precio_unit, 'precio_nuevo', p.precio)
from precios p join public.solicitud_compra_item i on i.id = p.item_id where coalesce(i.precio_unit, 0) <= 1;
update public.solicitud_compra_item i set precio_unit = p.precio from precios p where i.id = p.item_id and coalesce(i.precio_unit, 0) <= 1;
update public.materiales_a_cuenta_cliente c set precio_unit = p.precio, precio_total = round(c.cantidad * p.precio, 2), updated_at = now()
  from precios p where c.item_id = p.item_id and c.precio_unit <= 1 and c.cobro_id is null;
drop table precios;

-- catálogo: el esmalte y la cerradura no tenían referencia
update public.stock_materiales set precio_ref = 49200, precio_actualizado_en = now(), obs = coalesce(obs || ' · ', '') || 'Última compra 10/07/2026 $49.200.' where id = 122 and coalesce(precio_ref, 0) = 0;
update public.stock_materiales set precio_ref = 23500, precio_actualizado_en = now(), obs = coalesce(obs || ' · ', '') || 'Última compra 26/08/2026 $23.500.' where id = 144 and coalesce(precio_ref, 0) = 0;
