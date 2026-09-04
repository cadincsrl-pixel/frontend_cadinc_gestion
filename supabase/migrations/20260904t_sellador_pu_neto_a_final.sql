-- 20260904t — Sellador poliuretano 3M PU550: 4 compras cargadas al neto → final
--
-- Segunda tanda de 20260904s. Estos 4 renglones coincidían con una fila del
-- Excel SIN fecha ni proveedor ($12.203 neto / $14.765,63 final) y por eso
-- habían quedado afuera. El user confirmó el 2026-09-04 que el sellador
-- "sale 15.000": los $12.203 son el neto. Se usa el final de la misma fila
-- (×1,21), coherente con los otros 99. Ninguno cobrado ni pagado por el cliente.

create temp table fix_neto (item_id int, precio_viejo numeric, precio_nuevo numeric, fuente text);
insert into fix_neto values
  (379,  12203, 14765.63, 'SELLADOR PU550 NEGRO 310 ML - 3M'),
  (591,  12203, 14765.63, 'SELLADOR PU550 NEGRO 310 ML - 3M'),
  (1933, 12203, 14765.63, 'SELLADOR PU550 NEGRO 310 ML - 3M'),
  (2381, 12203, 14765.63, 'SELLADOR PU550 NEGRO 310 ML - 3M');

update public.solicitud_compra_item i
set precio_unit = f.precio_nuevo
from fix_neto f
where i.id = f.item_id and i.precio_unit = f.precio_viejo;

update public.materiales_a_cuenta_cliente m
set precio_unit  = f.precio_nuevo,
    precio_total = round(m.cantidad * f.precio_nuevo, 2),
    updated_at   = now()
from fix_neto f
where m.item_id = f.item_id and m.precio_unit = f.precio_viejo;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'Precio de compra cargado neto (sin IVA): ' || f.precio_viejo || ' → final ' || f.precio_nuevo || ' (' || f.fuente || ', confirmado por el user)',
       jsonb_build_object('motivo', 'compras netas a final 2026-09-04', 'precio_anterior', f.precio_viejo, 'precio_nuevo', f.precio_nuevo, 'fila_excel', f.fuente)
from fix_neto f join public.solicitud_compra_item i on i.id = f.item_id
where i.precio_unit = f.precio_nuevo;

drop table fix_neto;
