-- 20260904ai — Casa Operarios (CC-014): herramientas fuera de la cuenta + 5 precios del catálogo
--
-- User 2026-09-04: el pedido #548 sigue en el depósito (queda como está, de_deposito
-- pendiente de envío) y OK para sacar las herramientas de la cuenta del cliente.
--
-- 1) Salen de la cuenta todas las filas de CC-014 cuyo renglón es herramienta:
--    las que el sistema ya detecta (herr_origen) más 9 que estaban en texto libre
--    y se le escapaban: hidrolavadora, fusionadora, "rotor martilo bosch",
--    escuadra, mandriles, reglas de 1,5 m, "punta", cinta pasacables y "todas las
--    herramientas de los herreros". Esas 9 quedan tildadas como herramienta, y
--    el trigger del pañol las suma al ledger cuando están enviadas.
-- 2) Cinco renglones sin precio que salen del catálogo o de la última compra:
--    cascos c/ arnés ×9, cinta teflón, boquilla p/ atornillador, manguera de
--    agua 1/2", ménsulas metálicas ×2.
-- Ninguno cobrado.

-- 1) herramientas ────────────────────────────────────────────────────────────
create temp table herr as
select c.id as mcc_id, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen, c.precio_total,
       (i.material_id is null and i.id in (741, 757, 760, 1169, 1170, 1174, 1514, 1500, 2679)) as tildar
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
where c.obra_cod = 'CC-014' and c.cobro_id is null
  and (i.herr_origen is not null or i.clase = 'herramienta'
       or i.id in (741, 757, 760, 1169, 1170, 1174, 1514, 1500, 2679));

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select h.item_id, h.solicitud_id, 'sacado_de_cuenta_cliente', null, h.estado, h.cantidad,
       'Era una herramienta cargada en la cuenta del cliente: ' || h.descripcion,
       jsonb_build_object('motivo', 'limpieza cuenta CC-014 2026-09-04', 'origen_mcc', h.origen,
                          'precio_total', h.precio_total, 'detectada_por', case when h.tildar then 'user' else 'sistema' end)
from herr h;

delete from public.materiales_a_cuenta_cliente c using herr h where c.id = h.mcc_id;

update public.solicitud_compra_item i
   set clase = 'herramienta'
  from herr h
 where i.id = h.item_id and h.tildar and i.clase <> 'herramienta';

drop table herr;

-- 2) precios ────────────────────────────────────────────────────────────────
create temp table precios (item_id int, precio numeric, fuente text);
insert into precios values
  (748,  4874.06, 'precio de referencia del catálogo (Casco seguridad c/ arnés)'),
  (742,   457.61, 'precio de referencia del catálogo (Cinta teflón, El Fontanero 28/07)'),
  (965,  1000.00, 'precio de referencia del catálogo (Boquilla p/ atornillador)'),
  (784,  2500.00, 'última compra del sistema (Manguera de agua 1/2", pedido #296)'),
  (2635, 14571.07, 'última compra del sistema (Ménsula metálica, pedido #404)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'Precio cargado: $' || p.precio || ' (' || p.fuente || ')',
       jsonb_build_object('motivo', 'CC-014 precios 2026-09-04', 'precio_anterior', i.precio_unit, 'precio_nuevo', p.precio)
from precios p join public.solicitud_compra_item i on i.id = p.item_id
where coalesce(i.precio_unit, 0) = 0;

update public.solicitud_compra_item i set precio_unit = p.precio
  from precios p where i.id = p.item_id and coalesce(i.precio_unit, 0) = 0;

update public.materiales_a_cuenta_cliente c
   set precio_unit = p.precio, precio_total = round(c.cantidad * p.precio, 2), updated_at = now()
  from precios p
 where c.item_id = p.item_id and c.precio_unit = 0 and c.cobro_id is null;

drop table precios;
