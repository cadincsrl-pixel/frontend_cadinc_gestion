-- 20260904ac — Lamadrid (CC-016): 6 de los 11 renglones sin precio, tasados desde el catálogo y las compras
--
-- OK del user 2026-09-04 ("reparemos 1"). Fuentes, por renglón:
--   · Estopa x bolsa (item 3221, 1 bolsa)            → precio_ref $1.135 (Silva 20/08)
--   · Film 200 micrones (item 3236, "1 rollo")       → pasa a la fila por metro (950): 50 m × $2.000 = $100.000
--   · Disco diamantado continuo (item 3224, 1)       → $3.850, el del segmentado (441); se carga también en la fila 859
--   · Ladrillo hueco 12cm (item 2299, 144)           → precio_ref $586,95 (lo tasó el user hoy)
--   · Bolsas de escombro (item 2298, 30)             → $300, última compra del sistema (pedido #612, 08/2026)
--   · Punta Phillips PH2 (item 1935, 3)              → $1.635 c/u: pack Bosch x8 a $13.081 final en el Excel de compras
-- Quedan 5 que necesitan precio del user: rollos de aislante, cuñas, estaño, pinotea, grampas.
-- Ninguno está cobrado (guard en cada update).

-- 1) film: de "1 rollo" (fila inactiva 456) a 50 m de la fila por metro
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 50,
       'Film 200 micrones: 1 rollo = 50 m de la fila por metro (950), a $2.000/m = $100.000',
       jsonb_build_object('motivo', 'Lamadrid precios 2026-09-04', 'material_anterior', i.material_id, 'material_id', 950,
                          'cantidad_anterior', i.cantidad, 'cantidad_nueva', 50, 'precio_anterior', i.precio_unit, 'precio_nuevo', 2000)
from public.solicitud_compra_item i where i.id = 3236 and i.material_id = 456;

update public.solicitud_compra_item
   set material_id = 950, descripcion = 'Film polietileno 200 micrones (rollo 4m)', unidad = 'm',
       cantidad = 50, cantidad_enviada = 50, precio_unit = 2000
 where id = 3236 and material_id = 456;

update public.materiales_a_cuenta_cliente
   set descripcion = 'Film polietileno 200 micrones (rollo 4m)', unidad = 'm', cantidad = 50,
       precio_unit = 2000, precio_total = 100000, updated_at = now()
 where item_id = 3236 and cobro_id is null;

-- 2) los otros cinco: precio en el renglón y en la cuenta
create temp table precios (item_id int, precio numeric, fuente text);
insert into precios values
  (3221, 1135.00, 'precio de referencia del catálogo (Silva 20/08/2026)'),
  (3224, 3850.00, 'precio del disco diamantado segmentado (441), Mercado Libre 31/07/2026'),
  (2299,  586.95, 'precio de referencia del catálogo (tasado 04/09/2026)'),
  (2298,  300.00, 'última compra del sistema (pedido #612, 08/2026)'),
  (1935, 1635.00, 'pack Bosch x8 a $13.081 final, Excel de compras');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'Precio cargado: $' || p.precio || ' (' || p.fuente || ')',
       jsonb_build_object('motivo', 'Lamadrid precios 2026-09-04', 'precio_anterior', i.precio_unit, 'precio_nuevo', p.precio)
from precios p join public.solicitud_compra_item i on i.id = p.item_id
where coalesce(i.precio_unit, 0) = 0;

update public.solicitud_compra_item i
   set precio_unit = p.precio
  from precios p
 where i.id = p.item_id and coalesce(i.precio_unit, 0) = 0;

update public.materiales_a_cuenta_cliente c
   set precio_unit = p.precio, precio_total = round(c.cantidad * p.precio, 2), updated_at = now()
  from precios p
 where c.item_id = p.item_id and c.precio_unit = 0 and c.cobro_id is null;

drop table precios;

-- 3) el disco continuo queda con precio de referencia para la próxima
update public.stock_materiales set precio_ref = 3850 where id = 859 and precio_ref = 0;
