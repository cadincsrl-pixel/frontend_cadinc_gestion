-- 20260904bh — Villaguay: respuestas del user (2026-09-04)
-- 2) "fijador" ×20 = 1 tacho de 20 litros → Fijador sellador x 20lts (el precio de
--    referencia de esa fila está roto en $78,65, así que el renglón queda en $0).
-- 3) la térmica es de 40 A → Térmica 2x40A.
-- 4) fueron 10 aires BGH → cantidad 10 a $651.387,01 (Prestigio 11/06/2026).
-- 1) y 5) quedan en texto libre.

create temp table vinc (item_id int, nombre text, precio numeric, cant numeric, unidad text, nota text);
insert into vinc values
  (2001, 'Fijador sellador x 20lts', 0,         1,  'lata', '20 unid eran 1 tacho de 20 litros; sin precio (la referencia está rota)'),
  (2356, 'Térmica 2x40A',            null,      null, null,  'térmica de 40 A (ABB o Schneider)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.descripcion || ' — ' || v.nota,
       jsonb_build_object('motivo', 'cc 24 Villaguay 2026-09-04', 'material_id', m.id, 'desc_canonica', m.nombre,
                          'cantidad_anterior', i.cantidad, 'cantidad_nueva', coalesce(v.cant, i.cantidad))
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on m.nombre = v.nombre
where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = m.id, descripcion = m.nombre,
       precio_unit = coalesce(v.precio, i.precio_unit),
       cantidad = coalesce(v.cant, i.cantidad),
       cantidad_comprada = case when i.cantidad_comprada is null then null else coalesce(v.cant, i.cantidad_comprada) end,
       cantidad_enviada  = case when i.cantidad_enviada  is null then null else coalesce(v.cant, i.cantidad_enviada) end,
       unidad = coalesce(v.unidad, i.unidad)
  from vinc v join public.stock_materiales m on m.nombre = v.nombre
 where i.id = v.item_id and i.material_id is null;

update public.materiales_a_cuenta_cliente c
   set descripcion = i.descripcion, precio_unit = coalesce(i.precio_unit, 0), cantidad = i.cantidad, unidad = i.unidad,
       precio_total = round(i.cantidad * coalesce(i.precio_unit, 0), 2), updated_at = now()
  from vinc v join public.solicitud_compra_item i on i.id = v.item_id
 where c.item_id = v.item_id and c.cobro_id is null;
drop table vinc;

-- 4) los 10 aires
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 10,
       'Fueron 10 aires BGH (user); precio de Prestigio 11/06/2026 $651.387,01 — antes cantidad ' || i.cantidad || ' × $' || coalesce(i.precio_unit, 0),
       jsonb_build_object('motivo', 'cc 24 Villaguay 2026-09-04', 'cantidad_anterior', i.cantidad, 'cantidad_nueva', 10, 'precio_anterior', i.precio_unit, 'precio_nuevo', 651387.01)
from public.solicitud_compra_item i where i.id = 794;

update public.solicitud_compra_item
   set cantidad = 10,
       cantidad_comprada = case when cantidad_comprada is null then null else 10 end,
       cantidad_enviada  = case when cantidad_enviada  is null then null else 10 end,
       precio_unit = 651387.01
 where id = 794;
update public.materiales_a_cuenta_cliente
   set cantidad = 10, precio_unit = 651387.01, precio_total = round(10 * 651387.01, 2), updated_at = now()
 where item_id = 794 and cobro_id is null;
