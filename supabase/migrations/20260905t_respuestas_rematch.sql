-- 20260905t — Las 4 del re-match, contestadas por el user (2026-09-05)
--
-- 1) "espejo" de Hipódromo (#1430, CC-019, llave en mano) es el Espejo 60x80cm
--    (232): se vincula con su precio ($31.321,82) y el catálogo, que estaba en
--    $0, toma ese precio como última compra.
-- 2) "chapas grises ranuradas" de Farmacia 25 (#2206): chapa especial comprada
--    solo para esa obra y PAGADA POR EL CLIENTE. Queda en texto libre y la
--    fila de la cuenta pasa a pago directo (pagado_por = 'cliente', $0).
-- 3) "caño de 63" y "caño de 40" de Farmacia America (#2897, #2902): 2 m son
--    media barra de 4 m; se prorratea: 0,5 unid al precio de la barra del
--    catálogo (63: $17.043,02 → $8.521,51; 40: $10.940,24 → $5.470,12).

-- 1) espejo ──────────────────────────────────────────────────────────────────
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.descripcion,
       jsonb_build_object('motivo', 'respuestas re-match 2026-09-05', 'material_id', 232, 'desc_canonica', 'Espejo 60x80cm')
from public.solicitud_compra_item i where i.id = 1430 and i.material_id is null;
update public.solicitud_compra_item set material_id = 232, descripcion = 'Espejo 60x80cm' where id = 1430 and material_id is null;
update public.materiales_a_cuenta_cliente set descripcion = 'Espejo 60x80cm', updated_at = now() where item_id = 1430 and cobro_id is null;
update public.stock_materiales
   set precio_ref = 31321.82, precio_actualizado_en = now(),
       obs = coalesce(obs || ' · ', '') || 'Última compra Hipódromo (pedido #341): $31.321,82.'
 where id = 232 and coalesce(precio_ref, 0) = 0;

-- 2) chapas especiales pagadas por el cliente ───────────────────────────────
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'Chapa especial comprada solo para esta obra y pagada por el cliente: pasa a pago directo (user 05/09/2026)',
       jsonb_build_object('motivo', 'respuestas re-match 2026-09-05', 'pagado_por', 'cliente')
from public.solicitud_compra_item i where i.id = 2206;
update public.materiales_a_cuenta_cliente set pagado_por = 'cliente', updated_at = now() where item_id = 2206 and cobro_id is null;

-- 3) media barra ────────────────────────────────────────────────────────────
create temp table conv (item_id int, material_id int, nombre text, precio numeric);
insert into conv values
  (2897, 3, 'Caño PVC 63mm x 4m', 17043.02),
  (2902, 1, 'Caño PVC 40mm x 4m', 10940.24);

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 0.5,
       i.descripcion || ': 2 m = media barra de 4 m, prorrateado → 0,5 unid × $' || c.precio || ' (precio de referencia de ' || c.nombre || ')',
       jsonb_build_object('motivo', 'respuestas re-match 2026-09-05', 'material_id', c.material_id, 'cantidad_anterior', i.cantidad, 'unidad_anterior', i.unidad, 'precio_anterior', i.precio_unit, 'cantidad_nueva', 0.5, 'precio_nuevo', c.precio)
from conv c join public.solicitud_compra_item i on i.id = c.item_id where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = c.material_id, descripcion = c.nombre,
       cantidad = 0.5, unidad = 'unid', precio_unit = c.precio,
       cantidad_comprada = case when i.cantidad_comprada is null then null else 0.5 end,
       cantidad_enviada  = case when i.cantidad_enviada  is null then null else 0.5 end
  from conv c where i.id = c.item_id and i.material_id is null;
update public.materiales_a_cuenta_cliente m
   set descripcion = c.nombre, cantidad = 0.5, unidad = 'unid', precio_unit = c.precio, precio_total = round(0.5 * c.precio, 2), updated_at = now()
  from conv c where m.item_id = c.item_id and m.cobro_id is null;
drop table conv;
