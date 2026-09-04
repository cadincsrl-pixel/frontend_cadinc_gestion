-- 20260904y — Lamadrid (CC-016): cierre de los 8 renglones que faltaban + herramientas fuera de la cuenta
--
-- Respuestas del user 2026-09-04:
--  1. hidrófugo #382: $11.800 era el TOTAL de los 5 kg (estaba 5 × $11.800 = $59.000 → cobrado ×5)
--  2. hidrófugo Ceresita se compra por kg; Sika por litro
--  3. "ceresita 10 lt" son 10 kg
--  4. chapa calibre 25: sinusoidal, por metro lineal
--  5. "riel o perfil IPN 3.4": IPN 140, 2 piezas de 3,4 m = 6,8 m, $110.000 cada pieza (total $220.000, no cambia)
--  6. ángulos de 1": 3/16" de espesor
--  7. bolsa de clavos 2": trae 1 kg
--  8. "curva 100": de 90°
--  9. las 15 herramientas de la lista salen de la cuenta del cliente
--
-- Efecto en la cuenta CADINC de Lamadrid: −$47.200 (el hidrófugo). Todo lo demás
-- son vínculos al catálogo, unidades y filas en $0.

-- 1) filas nuevas ────────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, v.unidad, v.precio_ref, v.rubro_id, v.alias, 'material',
       'Alta 2026-09-04 desde las compras de Lamadrid (' || v.fuente || '). Precio de esa compra, IVA sin verificar.'
from (values
  ('Hidrófugo Ceresita x kg',                    'kg',   3500.00, 4, array['ceresita','hidrofugo ceresita','hidrofugo por kilo','hidrofugo en polvo'], 'pedido #564'),
  ('Chapa sinusoidal galv. C25 x metro lineal',  'm',   13159.00, 9, array['chapa calibre 25','chapa c25 por metro','chapa sinusoidal por metro','chapa acanalada por metro'], 'pedido #596'),
  ('IPN 140 x metro lineal',                     'm',   32352.94, 7, array['ipn 14','ipn 140','riel ipn','perfil ipn'], 'pedido #516: 2 piezas de 3,4 m'),
  ('Curva PVC 110mm 90°',                        'unid', 3315.40, 1, array['curva 100','curva de 110 90','curva 110 90','curva del 100'], 'pedido #529')
) as v(nombre, unidad, precio_ref, rubro_id, alias, fuente)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- 2) vínculos y correcciones ─────────────────────────────────────────────────
create temp table vinc (item_id int, material_id int, unidad_nueva text);
insert into vinc values
  (1726, (select id from public.stock_materiales where nombre = 'Hidrófugo Ceresita x kg'), 'kg'),
  (1240, (select id from public.stock_materiales where nombre = 'Hidrófugo Ceresita x kg'), null),
  (2761, (select id from public.stock_materiales where nombre = 'Hidrófugo Ceresita x kg'), 'kg'),
  (2920, (select id from public.stock_materiales where nombre = 'Chapa sinusoidal galv. C25 x metro lineal'), null),
  (2575, (select id from public.stock_materiales where nombre = 'IPN 140 x metro lineal'), 'm'),
  (2023, 864, null),   -- Ángulo 1" x 3/16" x 6m
  (2600, 107, 'kg'),   -- Clavos 2" (kg): la bolsa trae 1 kg
  (2607, (select id from public.stock_materiales where nombre = 'Curva PVC 110mm 90°'), null);

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

-- hidrófugo #382: $11.800 era el total de los 5 kg
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'Estaba cargado como 5 × $11.800 = $59.000; $11.800 era el total de los 5 kg → $2.360/kg',
       jsonb_build_object('motivo', 'catalogo Lamadrid 2026-09-04', 'precio_anterior', 11800, 'precio_nuevo', 2360)
from public.solicitud_compra_item i where i.id = 1726 and i.precio_unit = 11800;
update public.solicitud_compra_item set precio_unit = 2360 where id = 1726 and precio_unit = 11800;
update public.materiales_a_cuenta_cliente
   set precio_unit = 2360, precio_total = round(cantidad * 2360, 2), updated_at = now()
 where item_id = 1726 and precio_unit = 11800;

-- IPN #516: 2 piezas de 3,4 m → 6,8 m a $32.352,94; el total ($220.000) no cambia
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 6.8,
       'Eran 2 piezas de IPN 140 de 3,4 m a $110.000 cada una: pasa a 6,8 m a $32.352,94/m (total $220.000, sin cambio)',
       jsonb_build_object('motivo', 'catalogo Lamadrid 2026-09-04', 'cantidad_anterior', 2, 'precio_anterior', 110000, 'cantidad_nueva', 6.8, 'precio_nuevo', 32352.94)
from public.solicitud_compra_item i where i.id = 2575 and i.precio_unit = 110000;
update public.solicitud_compra_item
   set cantidad = 6.8, cantidad_enviada = 6.8, precio_unit = 32352.94
 where id = 2575 and precio_unit = 110000;
update public.materiales_a_cuenta_cliente
   set cantidad = 6.8, precio_unit = 32352.94, precio_total = 220000, updated_at = now()
 where item_id = 2575 and precio_unit = 110000;

drop table vinc;

-- 3) herramientas fuera de la cuenta del cliente ─────────────────────────────
-- Mismo mecanismo que la limpieza de la mañana (evento + baja de la fila MCC).
create temp table herr (item_id int, es_herramienta boolean);
insert into herr values
  (1204, true),  -- Demoledor 1200w (ya en el pañol por patrón)
  (1203, true),  -- Alargues 15m ×2
  (1255, true),  -- pinza de corte
  (2052, true),  -- garrafa con martillo para soldar estaño
  (1287, true),  -- Manguera de nivel
  (1351, true),  -- Puntal metálico regulable 3m ×2
  (1245, true),  -- 10 puntales de 5,5 m
  (1286, false), -- Tanza de replanteo (consumible, no se cobra)
  (3219, false), -- Llana dentada 12mm ×2
  (1252, false), -- tachos de 20L ×2
  (1352, true),  -- tablón de chapa
  (1353, false), -- "retirar tablón de Las Heras" (servicio)
  (1934, false), -- tachito con tornillos T1 (está en el taller)
  (1253, true),  -- Buscapolo
  (2346, false); -- Arnés seguridad 3 puntos (EPP, costo CADINC)

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'sacado_de_cuenta_cliente', null, i.estado, c.cantidad,
       'No se cobra al cliente (herramienta, equipo o gasto de CADINC): ' || i.descripcion,
       jsonb_build_object('motivo', 'limpieza cuenta CC-016 2026-09-04 (2)', 'origen_mcc', c.origen,
                          'precio_total', c.precio_total, 'detectada_por', 'user')
from herr h
join public.solicitud_compra_item i on i.id = h.item_id
join public.materiales_a_cuenta_cliente c on c.item_id = i.id;

delete from public.materiales_a_cuenta_cliente c using herr h where c.item_id = h.item_id;

-- Los que son herramienta y no tienen fila en el catálogo: se tildan en el
-- renglón, y el trigger del pañol los suma al ledger.
update public.solicitud_compra_item i
   set clase = 'herramienta'
  from herr h
 where i.id = h.item_id and h.es_herramienta and i.material_id is null and i.clase <> 'herramienta';

-- Los que sí tienen fila: la fila pasa a herramienta (el recache propaga a
-- todos sus renglones, en todas las obras).
update public.stock_materiales
   set clase = 'herramienta'
 where id in (742, 636, 780, 752)   -- Alargue 15m, Puntal metálico regulable 3m, Manguera de nivel, Buscapolo
   and clase <> 'herramienta';

drop table herr;
