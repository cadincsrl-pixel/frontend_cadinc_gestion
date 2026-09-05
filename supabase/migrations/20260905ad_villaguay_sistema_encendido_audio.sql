-- 20260905ad — Villaguay: "sistema de encendido de audio" $300.000 (user 2026-09-05)
-- Es un equipo propio de la iglesia ("sistema encendido audio"); queda en texto libre, con precio.

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $300000 (dicho por el user 05/09/2026; equipo propio de la iglesia "sistema encendido audio")',
       jsonb_build_object('motivo', 'Villaguay precios 2026-09-05', 'precio_anterior', i.precio_unit, 'precio_nuevo', 300000)
from public.solicitud_compra_item i where i.id = 2704 and coalesce(i.precio_unit, 0) <= 1;
update public.solicitud_compra_item set precio_unit = 300000 where id = 2704 and coalesce(precio_unit, 0) <= 1;
update public.materiales_a_cuenta_cliente set precio_unit = 300000, precio_total = round(cantidad * 300000, 2), updated_at = now()
 where item_id = 2704 and cobro_id is null and precio_unit <= 1;
