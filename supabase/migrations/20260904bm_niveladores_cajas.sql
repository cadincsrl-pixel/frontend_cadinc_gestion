-- 20260904bm — Niveladores: los tres renglones "por unidad" en $0 eran cajas de 250
--
-- Confirmado por el user (2026-09-04): #871 Praderas (3 unid), #1597 Hipódromo
-- (1 unid) y #1955 Clínica Heras (1 unid) son cajas de 250 niveladores. Pasan a
-- 750 / 250 / 250 unidades a $33,86 (caja de $8.465 / 250, 20260904bl).
-- Ninguno cobrado.

create temp table niv (item_id int, cant numeric, nota text);
insert into niv values
  (871,  750, '3 cajas de 250 niveladores'),
  (1597, 250, '1 caja de 250 niveladores'),
  (1955, 250, '1 caja de 250 niveladores');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, n.cant,
       n.nota || ' a $33,86 (caja de $8.465 / 250, confirmado por el user) — antes ' || i.cantidad || ' ' || i.unidad || ' × $' || coalesce(i.precio_unit, 0),
       jsonb_build_object('motivo', 'niveladores por caja 2026-09-04', 'cantidad_anterior', i.cantidad, 'precio_anterior', i.precio_unit, 'cantidad_nueva', n.cant, 'precio_nuevo', 33.86)
from niv n join public.solicitud_compra_item i on i.id = n.item_id
where coalesce(i.precio_unit, 0) = 0;

update public.solicitud_compra_item i
   set cantidad = n.cant, precio_unit = 33.86,
       cantidad_comprada = case when i.cantidad_comprada is null then null else n.cant end,
       cantidad_enviada  = case when i.cantidad_enviada  is null then null else n.cant end
  from niv n where i.id = n.item_id and coalesce(i.precio_unit, 0) = 0;

update public.materiales_a_cuenta_cliente c
   set cantidad = n.cant, precio_unit = 33.86, precio_total = round(n.cant * 33.86, 2), updated_at = now()
  from niv n where c.item_id = n.item_id and c.precio_unit = 0 and c.cobro_id is null;
drop table niv;
