-- 20260905ac — Cable UTP: precio por metro desde la bobina de 305 m (user 2026-09-05)
--
-- "Se vende por metro o bobina entera: la bobina de 305 m sale $399.000 en
-- categoría 5 y $407.000 en categoría 6." El catálogo va por metro:
--   238 Cable UTP cat5e → $1.308,20/m   239 Cable UTP cat6 → $1.334,43/m
-- Villaguay (#2393) tenía "1 unid" de cat5e: era la bobina → 305 m × $1.308,20 = $399.000.

update public.stock_materiales set precio_ref = 1308.20, precio_actualizado_en = now(),
       alias = array(select distinct unnest(coalesce(alias,'{}') || array['bobina utp','bobina utp cat 5','cable de red','cable de red cat 5','cable utp 305','utp cat5e','cable utp'])),
       obs = coalesce(obs || ' · ', '') || 'POR METRO. Bobina de 305 m $399.000 (05/09/2026).'
 where id = 238;
update public.stock_materiales set precio_ref = 1334.43, precio_actualizado_en = now(),
       alias = array(select distinct unnest(coalesce(alias,'{}') || array['bobina utp cat 6','cable de red cat 6','utp cat6','cable utp 6'])),
       obs = coalesce(obs || ' · ', '') || 'POR METRO. Bobina de 305 m $407.000 (05/09/2026).'
 where id = 239;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 305,
       'Cable UTP cat5e: "1 unid" era la bobina de 305 m → 305 m × $1.308,20 = $399.000 (user 05/09/2026)',
       jsonb_build_object('motivo', 'Villaguay precios 2026-09-05', 'cantidad_anterior', i.cantidad, 'unidad_anterior', i.unidad, 'precio_anterior', i.precio_unit, 'cantidad_nueva', 305, 'precio_nuevo', 1308.20)
from public.solicitud_compra_item i where i.id = 2393 and coalesce(i.precio_unit, 0) <= 1;

update public.solicitud_compra_item
   set cantidad = 305, unidad = 'm', precio_unit = 1308.20,
       cantidad_comprada = case when cantidad_comprada is null then null else 305 end,
       cantidad_enviada  = case when cantidad_enviada  is null then null else 305 end
 where id = 2393 and coalesce(precio_unit, 0) <= 1;
update public.materiales_a_cuenta_cliente
   set cantidad = 305, unidad = 'm', precio_unit = 1308.20, precio_total = 399001.00, updated_at = now()
 where item_id = 2393 and cobro_id is null and precio_unit <= 1;
