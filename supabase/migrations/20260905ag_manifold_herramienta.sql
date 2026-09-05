-- 20260905ag — "maniful" es el manifold de aire acondicionado: herramienta (user 2026-09-05)
-- Alta del tipo en el catálogo de herramientas; el renglón de Villaguay (#786,
-- pedido 214) y cualquier otro escrito parecido pasan a herramienta, salen de la
-- cuenta y entran al pañol ya confirmados.

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, obs)
select 'Manifold p/ aire acondicionado (juego de manómetros)', 'unid', 0, (select id from public.stock_rubros where nombre = 'Herramientas y máquinas'),
       array['manifold','maniful','manifould','manifoult','manifol','manifold aire acondicionado','manometros aire acondicionado','juego de manometros','analizador de aire acondicionado','analizador de gas refrigerante','manifold refrigeracion'],
       'herramienta', true, 'Alta 2026-09-05: tipo de herramienta del pañol (en los pedidos aparece como "maniful").'
where not exists (select 1 from public.stock_materiales where nombre = 'Manifold p/ aire acondicionado (juego de manómetros)');

create temp table herr as
select i.id as item_id, i.solicitud_id, i.estado, i.descripcion
from public.solicitud_compra_item i
where i.material_id is null and public.norm_txt(i.descripcion) ~ '^mani(fol|ful|foul)';

-- fuera de la cuenta del cliente
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select h.item_id, h.solicitud_id, 'sacado_de_cuenta_cliente', null, h.estado, c.cantidad,
       'Era una herramienta cargada en la cuenta del cliente: ' || h.descripcion,
       jsonb_build_object('motivo', 'manifold es herramienta 2026-09-05', 'origen_mcc', c.origen, 'precio_total', c.precio_total)
from herr h join public.materiales_a_cuenta_cliente c on c.item_id = h.item_id where c.cobro_id is null;
delete from public.materiales_a_cuenta_cliente c using herr h where c.item_id = h.item_id and c.cobro_id is null;

-- vínculo al tipo (el trigger del pañol toma el renglón)
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select h.item_id, h.solicitud_id, 'vinculacion_manual', null, h.estado, h.descripcion,
       jsonb_build_object('motivo', 'manifold es herramienta 2026-09-05', 'material_id', m.id, 'desc_canonica', m.nombre)
from herr h, public.stock_materiales m where m.nombre = 'Manifold p/ aire acondicionado (juego de manómetros)';
update public.solicitud_compra_item i
   set clase = 'herramienta', material_id = m.id, descripcion = m.nombre
  from herr h, public.stock_materiales m
 where i.id = h.item_id and m.nombre = 'Manifold p/ aire acondicionado (juego de manómetros)';

-- pañol: confirmadas de una (el user ya dijo que es herramienta)
update public.herr_entregas e
   set estado = 'confirmada', resuelto_por = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', resuelto_el = now(),
       updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', updated_at = now(),
       nota = coalesce(nota || ' · ', '') || 'Confirmada al tipificarla como manifold (05/09/2026).'
  from herr h where e.item_id = h.item_id and e.sentido = 'salida' and e.estado = 'pendiente';
drop table herr;
