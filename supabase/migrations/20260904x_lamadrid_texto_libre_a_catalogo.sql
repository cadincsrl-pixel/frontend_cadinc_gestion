-- 20260904x — Lamadrid (CC-016): los renglones comprados en texto libre entran al catálogo
--
-- OK del user 2026-09-04 ("los podemos meter en el catálogo"). Son compras ya
-- cobradas con precio; acá solo se vinculan a una fila del catálogo (existente
-- o nueva) para que la próxima vez se pidan por catálogo y la última compra
-- aparezca en el Catálogo de precios. No cambia ningún precio ni cantidad de
-- la cuenta del cliente. Cada vínculo deja un evento 'vinculacion_manual' con
-- la descripción original.
--
-- 7 filas nuevas (precio de referencia = precio de esa compra, IVA sin
-- verificar; se ve como "última compra" igual) y 14 vínculos. Quedan afuera,
-- para preguntar: hidrófugo en kg y en lt, ceresita 10 lt, chapa calibre 25,
-- perfil IPN 3.4, ángulos de 1", la bolsa de clavos 2" y "curva 100".

-- 1) filas nuevas ────────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, usa_color, obs)
select v.nombre, v.unidad, v.precio_ref, v.rubro_id, v.alias, 'material', v.usa_color,
       'Alta 2026-09-04 desde las compras de Lamadrid (' || v.fuente || '). Precio de esa compra, IVA sin verificar.'
from (values
  ('Compriband (cinta expansiva)',              'm',    1020.00, 8,  array['compriband','cinta expansiva','sellador expansivo'],            false, 'pedido #454'),
  ('Aislante térmico p/ caño 1/4"',             'unid',  810.00, 8,  array['aislante 1/4','aislante de cano 1/4','aislacion 1/4'],           false, 'pedido #531'),
  ('Aislante térmico p/ caño 5/8"',             'unid', 1579.50, 8,  array['aislante 5/8','aislante de cano 5/8','aislacion 5/8'],           false, 'pedido #531'),
  ('Cinta PVC p/ aislación de caños (rollo)',   'unid', 1772.62, 8,  array['cinta pvc','cinta de pvc','cinta para aire acondicionado'],       false, 'pedido #531'),
  ('Tirante pino 2x3" x 2.75m',                 'unid', 5007.03, 13, array['palos 2x3','palo 2x3x2.74','palos de 3 x 2 x 2,75','tirante 2x3 2.75'], false, 'pedido #456'),
  ('Pastina x 1kg',                             'unid', 4876.03, 4,  array['pastina x 1kg','pastina 1 kilo','pastina chica'],                true,  'pedido #651'),
  ('Curva PVC 110mm 45°',                       'unid', 2740.00, 1,  array['curva 45 del 100','curva 45 de 110','curva 110 45'],             false, 'pedido #477')
) as v(nombre, unidad, precio_ref, rubro_id, alias, usa_color, fuente)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- 2) vínculos ────────────────────────────────────────────────────────────────
create temp table vinc (item_id int, material_id int, unidad_nueva text);
insert into vinc values
  (2614, 749, null),                                                                    -- cable tipo taller → 3x2.5mm²
  (2661, 939, 'm'),                                                                     -- rollo corrugado 7/8: 50 = 50 m
  (2662, 59,  'm'),                                                                     -- rollo corrugado 3/4: 50 = 50 m
  (3073, 72,  null),                                                                    -- "montante de 69" es el de 70
  (1979, 189, null),                                                                    -- ramal Y → Ramal PVC 110mm Y
  (2184, 379, null),                                                                    -- tornillos madera 3" → 6x80mm
  (2180, (select id from public.stock_materiales where nombre = 'Compriband (cinta expansiva)'), null),
  (2612, (select id from public.stock_materiales where nombre = 'Aislante térmico p/ caño 1/4"'), null),
  (2613, (select id from public.stock_materiales where nombre = 'Aislante térmico p/ caño 5/8"'), null),
  (2615, (select id from public.stock_materiales where nombre = 'Cinta PVC p/ aislación de caños (rollo)'), null),
  (2190, (select id from public.stock_materiales where nombre = 'Tirante pino 2x3" x 2.75m'), null),
  (1920, (select id from public.stock_materiales where nombre = 'Tirante pino 2x3" x 2.75m'), null),   -- pagó el cliente, solo trazabilidad
  (3232, (select id from public.stock_materiales where nombre = 'Pastina x 1kg'), null),
  (1981, (select id from public.stock_materiales where nombre = 'Curva PVC 110mm 45°'), null),
  (2318, (select id from public.stock_materiales where nombre = 'Curva PVC 110mm 45°'), null);

-- evento con la descripción original, antes de pisarla
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.descripcion,
       jsonb_build_object('motivo', 'catalogo Lamadrid 2026-09-04', 'material_id', v.material_id,
                          'desc_canonica', m.nombre, 'unidad_anterior', i.unidad, 'unidad_nueva', coalesce(v.unidad_nueva, i.unidad))
from vinc v
join public.solicitud_compra_item i on i.id = v.item_id
join public.stock_materiales m on m.id = v.material_id
where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = v.material_id,
       descripcion = m.nombre,
       unidad      = coalesce(v.unidad_nueva, i.unidad)
  from vinc v join public.stock_materiales m on m.id = v.material_id
 where i.id = v.item_id and i.material_id is null;

update public.materiales_a_cuenta_cliente c
   set descripcion = m.nombre,
       unidad      = coalesce(v.unidad_nueva, c.unidad),
       updated_at  = now()
  from vinc v join public.stock_materiales m on m.id = v.material_id
 where c.item_id = v.item_id;

drop table vinc;
