-- 20260905h — Villaguay: la "etiquetadora" es una rotuladora inalámbrica → herramienta
--
-- Respuesta del user (2026-09-05): rotula tableros y cables. Tipo nuevo en el
-- pañol, el renglón #2657 sale de la cuenta.

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select 'Rotuladora (etiquetadora) inalámbrica', 'unid', 0, 26,
       array['etiquetadora','rotuladora','rotuladora de tableros','etiquetadora inalambrica','rotuladora de cables','impresora de etiquetas'],
       'herramienta', 'Alta 2026-09-05: rotula tableros y cables (Villaguay).'
where not exists (select 1 from public.stock_materiales where lower(nombre) = lower('Rotuladora (etiquetadora) inalámbrica'));

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.cantidad, i.descripcion || ' → ' || m.nombre || ' (herramienta)',
       jsonb_build_object('motivo', 'cc 24 Villaguay respuestas 2026-09-05', 'material_id', m.id, 'desc_canonica', m.nombre)
from public.solicitud_compra_item i, public.stock_materiales m
where i.id = 2657 and i.material_id is null and lower(m.nombre) = lower('Rotuladora (etiquetadora) inalámbrica');
update public.solicitud_compra_item i set material_id = m.id, descripcion = m.nombre
  from public.stock_materiales m where i.id = 2657 and i.material_id is null and lower(m.nombre) = lower('Rotuladora (etiquetadora) inalámbrica');

create temp table herr as
select c.id as mcc_id, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen
from public.materiales_a_cuenta_cliente c join public.solicitud_compra_item i on i.id = c.item_id where i.id = 2657 and c.cobro_id is null;
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select h.item_id, h.solicitud_id, 'sacado_de_cuenta_cliente', null, h.estado, h.cantidad, 'Era una herramienta cargada en la cuenta: ' || h.descripcion,
       jsonb_build_object('motivo', 'cc 24 Villaguay respuestas 2026-09-05', 'origen_mcc', h.origen)
from herr h;
delete from public.materiales_a_cuenta_cliente c using herr h where c.id = h.mcc_id;
drop table herr;
