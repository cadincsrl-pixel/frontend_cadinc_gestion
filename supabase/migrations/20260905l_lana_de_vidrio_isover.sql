-- 20260905l — Lana de vidrio 50 mm: precio del rollo Isover (ML 09/2026) para Farmacia America
--
-- El user mandó la publicación: Isover Rolac Plata 50 mm c/ aluminio, rollo de
-- 24 m x 1,20 m (28,8 m²) a $313.500 final → $13.062,50 el metro lineal
-- ($10.885,42 el m²). La fila 83 se compra por metro lineal de rollo: toma esa
-- referencia y el renglón #3210 (15 m, pedido #650 de CC-023) queda en
-- $195.937,50. La fila 463 "Lana de vidrio rollo 50mm" (sin uso, sin precio)
-- duplicaba a la 83 y se da de baja.

update public.stock_materiales
   set precio_ref = 13062.50,
       alias = array(select distinct unnest(alias || array['isover rolac plata','lana de vidrio con aluminio rollo','rollo de lana de vidrio','lana de vidrio 50 con aluminio','lana isover'])),
       obs = coalesce(obs || ' · ', '') || 'Isover Rolac Plata 50 mm c/ aluminio, rollo 24 m x 1,20 m (28,8 m²) $313.500 final en ML 09/2026 → $13.062,50/m lineal.'
 where id = 83;

update public.stock_materiales set activo = false,
       obs = coalesce(obs || ' · ', '') || 'Baja 2026-09-05: duplicaba a la 83 (rollo por metro lineal), sin uso.'
 where id = 463 and not exists (select 1 from public.solicitud_compra_item where material_id = 463);

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $13.062,50/m (rollo Isover 24 m a $313.500, ML 09/2026, según el user)',
       jsonb_build_object('motivo', 'CC-023 Farmacia America precios 2026-09-05', 'precio_anterior', i.precio_unit, 'precio_nuevo', 13062.50)
from public.solicitud_compra_item i where i.id = 3210 and coalesce(i.precio_unit, 0) = 0;
update public.solicitud_compra_item set precio_unit = 13062.50 where id = 3210 and coalesce(precio_unit, 0) = 0;
update public.materiales_a_cuenta_cliente set precio_unit = 13062.50, precio_total = round(cantidad * 13062.50, 2), updated_at = now()
 where item_id = 3210 and precio_unit = 0 and cobro_id is null;
