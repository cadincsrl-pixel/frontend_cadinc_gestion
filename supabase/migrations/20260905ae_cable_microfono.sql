-- 20260905ae — Cable de micrófono: alta en el catálogo por metro y precio en Villaguay (user 2026-09-05)
-- Publicación de Mercado Libre: Venetian CBL03, rollo de 100 m, cable de micrófono
-- balanceado 6 mm mallado, $303.606,60 → $3.036,07/m. El renglón "cable
-- micrófono x1" de Villaguay (#2421) era el rollo → 100 m.

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, obs)
select 'Cable p/ micrófono balanceado 6mm (XLR)', 'm', 3036.07, (select rubro_id from public.stock_materiales where id = 238),
       array['cable microfono','cable de microfono','cable mic','cable xlr','cable balanceado','rollo cable microfono','cable microfono 100 metros','cable de audio balanceado'],
       'material', true, 'POR METRO. Rollo de 100 m $303.606,60 (Mercado Libre, Venetian CBL03, 05/09/2026).'
where not exists (select 1 from public.stock_materiales where nombre = 'Cable p/ micrófono balanceado 6mm (XLR)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 100,
       'cable micrófono: "1 unid" era el rollo de 100 m → 100 m × $3.036,07 = $303.607 (Mercado Libre, user 05/09/2026)',
       jsonb_build_object('motivo', 'Villaguay precios 2026-09-05', 'material_id', (select id from public.stock_materiales where nombre = 'Cable p/ micrófono balanceado 6mm (XLR)'),
                          'cantidad_anterior', i.cantidad, 'unidad_anterior', i.unidad, 'precio_anterior', i.precio_unit, 'cantidad_nueva', 100, 'precio_nuevo', 3036.07)
from public.solicitud_compra_item i where i.id = 2421 and i.material_id is null;

update public.solicitud_compra_item
   set material_id = (select id from public.stock_materiales where nombre = 'Cable p/ micrófono balanceado 6mm (XLR)'),
       descripcion = 'Cable p/ micrófono balanceado 6mm (XLR)',
       cantidad = 100, unidad = 'm', precio_unit = 3036.07,
       cantidad_comprada = case when cantidad_comprada is null then null else 100 end,
       cantidad_enviada  = case when cantidad_enviada  is null then null else 100 end
 where id = 2421 and material_id is null;
update public.materiales_a_cuenta_cliente
   set descripcion = 'Cable p/ micrófono balanceado 6mm (XLR)', cantidad = 100, unidad = 'm', precio_unit = 3036.07, precio_total = 303607.00, updated_at = now()
 where item_id = 2421 and cobro_id is null;
