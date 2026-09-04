-- 20260904ae — Lamadrid (CC-016): los últimos 4 renglones sin precio, con los números del user
--
-- User 2026-09-04: "grampas ponele 2460 a cada uno, la pinotea ponele 86.000,
-- el estaño para soldar 66453 y las cuñas ponele 5 pesos a cada una".
-- Precios finales (con IVA), como todo lo que va a la cuenta del cliente.
--   · item 1251  grampas (6)                    → $2.460 c/u
--   · item 1444  pinotea para dintel 2,2 m (1)  → $86.000
--   · item 2053  Estaño p/ soldar (1)           → $66.453  (y precio_ref de la fila 761)
--   · item 3268  cuñas nivelador (200)          → $5 c/u   (y precio_ref de la fila 944)
-- Con esto la cuenta no tiene ningún renglón facturable en $0. Ninguno cobrado.

create temp table precios (item_id int, precio numeric);
insert into precios values (1251, 2460), (1444, 86000), (2053, 66453), (3268, 5);

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'Precio cargado: $' || p.precio || ' (lo dio el user, 2026-09-04)',
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

-- referencia para la próxima compra
update public.stock_materiales set precio_ref = 66453 where id = 761 and precio_ref = 0;
update public.stock_materiales set precio_ref = 5     where id = 944 and precio_ref = 0;
