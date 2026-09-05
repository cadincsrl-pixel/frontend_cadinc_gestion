-- 20260905p — Largueros de cielorraso desmontable: $15.000 c/u (estimado del user 2026-09-05, "después lo ajustamos")
--
-- Tres renglones en $0 con el material 1200 "Larguero p/ cielorraso desmontable
-- 3,66m": Capilla Concepción (CC-017, pedido #349, 5 u.) y Villaguay (CC-024,
-- pedidos #566 y #597, 2 u. c/u). Ninguno cobrado. El catálogo toma la misma
-- referencia.

create temp table precios as
select i.id as item_id, i.solicitud_id, i.estado, i.precio_unit as anterior
from public.solicitud_compra_item i
where i.material_id = 1200 and coalesce(i.precio_unit, 0) = 0;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select p.item_id, p.solicitud_id, 'correccion', null, p.estado,
       'Precio cargado: $15.000 (estimado del user 05/09/2026, a ajustar cuando llegue el precio real)',
       jsonb_build_object('motivo', 'largueros cielorraso 2026-09-05', 'precio_anterior', p.anterior, 'precio_nuevo', 15000)
from precios p;

update public.solicitud_compra_item i set precio_unit = 15000 from precios p where i.id = p.item_id;
update public.materiales_a_cuenta_cliente c set precio_unit = 15000, precio_total = round(c.cantidad * 15000, 2), updated_at = now()
  from precios p where c.item_id = p.item_id and c.cobro_id is null;
drop table precios;

update public.stock_materiales
   set precio_ref = 15000, precio_actualizado_en = now(),
       obs = coalesce(obs || ' · ', '') || 'Precio estimado por el user el 05/09/2026 ($15.000); ajustar con la compra real.'
 where id = 1200 and coalesce(precio_ref, 0) = 0;
