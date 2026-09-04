-- 20260904as — Clínica Salta: el texto libre que quedaba pasa al catálogo
--
-- User (2026-09-04): las chapas acanaladas se venden por metro lineal (eran
-- 6 de 1,30 m); la lana de vidrio viene con o sin aluminio; las bisagras
-- vienen ala ancha y ala corta; "20 lts verde tenis" es pintura para piso.
-- Para el resto se usan nombres genéricos. Quedan como texto libre las 7
-- cosas a medida (puerta, ventanas, mesada, retazos, tramo 40x40) y el
-- "tornillo para durlock" a $95, que no es un T1/T2 (esos valen $18-54).
-- De paso, las dos roscas de 1/2 toman el precio de Pollano (20260904ar).

-- 1) altas ───────────────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, v.unidad, v.precio_ref, (select id from public.stock_rubros where nombre = v.rubro), v.alias, 'material',
       'Alta 2026-09-04 desde Clínica Salta (pedido #' || v.pedido || '). ' || v.nota
from (values
  ('Chapa acanalada galvanizada (por metro)',           'm',    15077.69, 'Techado y cubiertas',    array['chapa acanalada','chapas acanaladas','chapa acanalada galvanizada','chapa de techo acanalada'], '326', 'Por metro lineal: 6 de 1,30 m a $19.601 c/u. Precio final.'),
  ('Lana de vidrio 50mm c/ foil de aluminio',           'm2',    5200.00, 'Aislación e impermeab.', array['lana de vidrio con aluminio','lana con aluminio','lana de vidrio aluminizada'],                  '577', 'Precio final.'),
  ('Lana de vidrio 50mm s/ foil',                       'm2',       0,    'Aislación e impermeab.', array['lana de vidrio sin aluminio','lana sin aluminio','lana de vidrio m2'],                          '577', 'Sin precio.'),
  ('Bisagra ala ancha',                                 'unid',  2580.00, 'Ferretería general',     array['bisagras ala ancha','bisagra de ala ancha'],                                                   '326', 'Precio final.'),
  ('Bisagra ala corta',                                 'unid',     0,    'Ferretería general',     array['bisagras ala corta','bisagra de ala corta','bisagra ala angosta'],                             '326', 'Sin precio.'),
  ('Pasador p/ soldar chico',                           'unid',  1979.00, 'Herrería',               array['pasador chico para soldar','pasador para soldar','pasador soldar'],                            '326', 'Precio final.'),
  ('Separadores p/ cerámico x bolsa',                   'bolsa', 7400.00, 'Pisos y revestimientos', array['bolsa de separadores','separadores bolsa','crucetas bolsa','bolsa de crucetas'],                '614', 'Precio final.'),
  ('Ángulo 1-1/4" x 1/8" x 6m',                         'unid', 13011.49, 'Herrería',               array['angulo 1 1/4 x 1/8','angulos 1/4x1/8','angulo 1,25 x 1/8'],                                   '611', 'El pedido decía "1/4x1/8". Precio final.'),
  ('Planchuela 1-1/4" x 1/8" x 6m',                     'unid',  7227.12, 'Herrería',               array['planchuela 1 1/4 x 1/8','planchuela 1/4x1/8'],                                                 '611', 'El pedido decía "1/4x1/8". Precio final.'),
  ('Pintura p/ pisos deportivos verde tenis x 20lts',   'lata',     0,    'Pintura',                array['verde tenis','pintura verde tenis','pintura piso verde tenis','20 lts verde tenis'],           '273', 'Sin precio.')
) as v(nombre, unidad, precio_ref, rubro, alias, pedido, nota)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- 2) vínculos ────────────────────────────────────────────────────────────────
create temp table vinc (item_id int, nombre text);
insert into vinc values
  (1337, 'Chapa acanalada galvanizada (por metro)'),
  (2835, 'Lana de vidrio 50mm c/ foil de aluminio'),
  (1343, 'Bisagra ala ancha'),
  (1345, 'Pasador p/ soldar chico'),
  (3053, 'Cerámico piso 33x33'),
  (3054, 'Separadores p/ cerámico x bolsa'),
  (3037, 'Ángulo 1-1/4" x 1/8" x 6m'),
  (3039, 'Planchuela 1-1/4" x 1/8" x 6m'),
  (1074, 'Pintura p/ pisos deportivos verde tenis x 20lts');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.descripcion,
       jsonb_build_object('motivo', 'catalogo CC CLINICA SALTA 2026-09-04 (2)', 'material_id', m.id, 'desc_canonica', m.nombre)
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on m.nombre = v.nombre
where i.material_id is null;

update public.solicitud_compra_item i set material_id = m.id, descripcion = m.nombre
  from vinc v join public.stock_materiales m on m.nombre = v.nombre where i.id = v.item_id and i.material_id is null;
update public.materiales_a_cuenta_cliente c set descripcion = m.nombre, updated_at = now()
  from vinc v join public.stock_materiales m on m.nombre = v.nombre where c.item_id = v.item_id and c.cobro_id is null;
drop table vinc;

-- 3) chapas: 6 unid × $19.601 → 7,8 m × $15.077,69 (mismo total) ────────────
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 7.8,
       'Chapa acanalada por metro lineal: 6 de 1,30 m = 7,8 m — antes ' || coalesce(i.cantidad_comprada, i.cantidad) || ' ' || i.unidad || ' × $' || i.precio_unit,
       jsonb_build_object('motivo', 'catalogo CC CLINICA SALTA 2026-09-04 (2)', 'cantidad_anterior', coalesce(i.cantidad_comprada, i.cantidad), 'precio_anterior', i.precio_unit, 'cantidad_nueva', 7.8, 'precio_nuevo', 15077.69)
from public.solicitud_compra_item i where i.id = 1337;

update public.solicitud_compra_item
   set cantidad = 7.8,
       cantidad_comprada = case when cantidad_comprada is null then null else 7.8 end,
       cantidad_enviada  = case when cantidad_enviada  is null then null else 7.8 end,
       unidad = 'm', precio_unit = 15077.69
 where id = 1337;
update public.materiales_a_cuenta_cliente
   set cantidad = 7.8, unidad = 'm', precio_unit = 15077.69, precio_total = round(7.8 * 15077.69, 2), updated_at = now()
 where item_id = 1337 and cobro_id is null;

-- 4) roscas 1/2: precio del catálogo (Pollano) ───────────────────────────────
create temp table precios (item_id int, precio numeric, fuente text);
insert into precios values
  (2880, 3700.00, 'precio de referencia del catálogo (Rosca hembra termofusión 1/2", Pollano 05/08)'),
  (2879, 3690.00, 'precio de referencia del catálogo (Rosca macho termofusión 1/2", Pollano 03/07)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $' || p.precio || ' (' || p.fuente || ')',
       jsonb_build_object('motivo', 'CC CLINICA SALTA precios 2026-09-04', 'precio_anterior', i.precio_unit, 'precio_nuevo', p.precio)
from precios p join public.solicitud_compra_item i on i.id = p.item_id where coalesce(i.precio_unit, 0) = 0;
update public.solicitud_compra_item i set precio_unit = p.precio from precios p where i.id = p.item_id and coalesce(i.precio_unit, 0) = 0;
update public.materiales_a_cuenta_cliente c set precio_unit = p.precio, precio_total = round(c.cantidad * p.precio, 2), updated_at = now()
  from precios p where c.item_id = p.item_id and c.precio_unit = 0 and c.cobro_id is null;
drop table precios;
