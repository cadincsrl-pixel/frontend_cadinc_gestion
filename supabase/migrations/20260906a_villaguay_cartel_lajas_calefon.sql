-- 20260906a — Villaguay: cartel de bienvenida, lajas frontis y calefón eléctrico (user 2026-09-06)
--
-- · "cartel de chapa 10 am con bastidor" (#2656) es el "Cartel de bienvenida de
--   chapa", lo usa siempre la iglesia → alta en el catálogo, $500.000.
-- · "lajas hall de entrada" (#2371) son "Lajas frontis": $190.000 los 3 m² →
--   alta por m² a $63.333,33, el renglón pasa a 3 m², proveedor LAJAS NOROESTE (49).
-- · "caldera" (#789) es un calefón eléctrico, $390.000 → alta y vínculo.
-- Mamparas, conductos, vidrio y puerta son a medida: quedan en texto libre.
-- "pintura para piso" el user no sabe qué es: queda como está.

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, obs)
select v.nombre, v.unidad, v.precio, v.rubro, v.alias, 'material', true, v.obs
from (values
  ('Cartel de bienvenida de chapa (c/ bastidor)', 'unid', 500000::numeric, 7,
     array['cartel de bienvenida','cartel bienvenida','cartel de chapa','cartel de chapa con bastidor','cartel iglesia','cartel de bienvenida de chapa'],
     'Alta 2026-09-06: lo usa siempre la iglesia (Villaguay pedido #545). $500.000 dicho por el user.'),
  ('Lajas frontis', 'm2', 63333.33, 11,
     array['lajas','laja','lajas frontis','lajas hall','lajas de frente','laja para frente','lajas para fachada','piedra laja'],
     'Alta 2026-09-06. POR M². $190.000 los 3 m² (LAJAS NOROESTE, Villaguay pedido #485).'),
  ('Calefón eléctrico', 'unid', 390000, 1,
     array['calefon electrico','calefon a electricidad','termocalefon electrico','calefón eléctrico'],
     'Alta 2026-09-06 (Villaguay pedido #214, cargado como "caldera"). $390.000 dicho por el user.')
) as v(nombre, unidad, precio, rubro, alias, obs)
where not exists (select 1 from public.stock_materiales m where m.nombre = v.nombre);

create temp table vinc (item_id int, nombre text, cant numeric, unidad text, precio numeric, proveedor_id int, nota text);
insert into vinc values
  (2656, 'Cartel de bienvenida de chapa (c/ bastidor)', 1, 'unid', 500000,   null, 'cartel de chapa 10 am con bastidor → Cartel de bienvenida de chapa, $500.000 (user 06/09/2026)'),
  (2371, 'Lajas frontis',                                3, 'm2',   63333.33, 49,   'lajas hall de entrada → Lajas frontis: $190.000 los 3 m² = $63.333,33/m², LAJAS NOROESTE (user 06/09/2026)'),
  (789,  'Calefón eléctrico',                            1, 'unid', 390000,   null, 'caldera → Calefón eléctrico, $390.000 (user 06/09/2026)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, v.cant, v.nota,
       jsonb_build_object('motivo', 'Villaguay precios 2026-09-06', 'material_id', m.id, 'desc_canonica', m.nombre,
                          'cantidad_anterior', i.cantidad, 'unidad_anterior', i.unidad, 'precio_anterior', i.precio_unit, 'cantidad_nueva', v.cant, 'precio_nuevo', v.precio)
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on m.nombre = v.nombre
where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = m.id, descripcion = m.nombre, cantidad = v.cant, unidad = v.unidad, precio_unit = v.precio,
       proveedor_id = coalesce(v.proveedor_id, i.proveedor_id),
       cantidad_comprada = case when i.cantidad_comprada is null then null else v.cant end,
       cantidad_enviada  = case when i.cantidad_enviada  is null then null else v.cant end
  from vinc v join public.stock_materiales m on m.nombre = v.nombre
 where i.id = v.item_id and i.material_id is null;

update public.materiales_a_cuenta_cliente c
   set descripcion = m.nombre, cantidad = v.cant, unidad = v.unidad, precio_unit = v.precio, precio_total = round(v.cant * v.precio, 2), updated_at = now()
  from vinc v join public.stock_materiales m on m.nombre = v.nombre
 where c.item_id = v.item_id and c.cobro_id is null;
drop table vinc;
