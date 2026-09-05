-- 20260905e — Concepción Capilla: respuestas del user, segunda tanda (2026-09-05)
--
-- · "llave de iglesia" = la llave maestra que presta la iglesia: para CADINC es
--   una herramienta (vuelve al terminar) → tipo "Llave maestra de obra (prestada
--   por el cliente)", fuera de la cuenta, al pañol.
-- · "Cuadro" del frontis y el "Cerámico para los zócalos del frontis" (3 piezas)
--   los provee la iglesia: quedan en la cuenta como pagados por el cliente
--   (estado "pago directo"), en $0.
-- · "cable unipolar" = 10 m celeste. No dijo la sección: se toma 2,5 mm² (la de
--   uso general) a la referencia; si era 1,5 se cambia.
-- · Cable tipo taller 2x1,5 cargado como "1 unid" = 10 m. Sin precio todavía.
-- · Placas de cielorraso 1,20x0,60: el precio $23.000 es POR PLACA (confirmado).
-- · Largueros de cielorraso desmontable: hay que pedir precio, quedan en $0.
-- · Panel LED redondo de embutir 24 W: $33.000 c/u (y referencia de la fila 1202).

-- 1) la llave maestra ─────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select 'Llave maestra de obra (prestada por el cliente)', 'unid', 0, 26,
       array['llave de iglesia','llave maestra','llave de la obra','llaves de la obra','llave del cliente'],
       'herramienta', 'Alta 2026-09-05: la llave que presta el cliente para entrar a la obra; se devuelve al terminar (Concepción Capilla).'
where not exists (select 1 from public.stock_materiales where lower(nombre) = lower('Llave maestra de obra (prestada por el cliente)'));

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.cantidad, i.descripcion || ' → ' || m.nombre || ' (herramienta prestada por la iglesia)',
       jsonb_build_object('motivo', 'CC-017 Capilla respuestas 2026-09-05', 'material_id', m.id, 'desc_canonica', m.nombre)
from public.solicitud_compra_item i, public.stock_materiales m
where i.id = 1622 and i.material_id is null and lower(m.nombre) = lower('Llave maestra de obra (prestada por el cliente)');
update public.solicitud_compra_item i set material_id = m.id, descripcion = m.nombre
  from public.stock_materiales m where i.id = 1622 and i.material_id is null and lower(m.nombre) = lower('Llave maestra de obra (prestada por el cliente)');

create temp table herr as
select c.id as mcc_id, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen
from public.materiales_a_cuenta_cliente c join public.solicitud_compra_item i on i.id = c.item_id where i.id = 1622 and c.cobro_id is null;
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select h.item_id, h.solicitud_id, 'sacado_de_cuenta_cliente', null, h.estado, h.cantidad, 'Es la llave maestra que presta la iglesia, no un material: ' || h.descripcion,
       jsonb_build_object('motivo', 'CC-017 Capilla respuestas 2026-09-05', 'origen_mcc', h.origen)
from herr h;
delete from public.materiales_a_cuenta_cliente c using herr h where c.id = h.mcc_id;
drop table herr;

-- 2) provistos por la iglesia: pagado por el cliente, $0 ─────────────────────
create temp table cli (item_id int, descripcion text, cant numeric, unidad text);
insert into cli values
  (1965, 'Cuadro del frontis (provisto por la iglesia)', null, null),
  (1969, 'Cerámico p/ zócalos del frontis (provisto por la iglesia)', 3, 'unid');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, coalesce(k.cant, i.cantidad),
       'Lo provee la iglesia: queda como pagado por el cliente, sin costo para CADINC — ' || k.descripcion,
       jsonb_build_object('motivo', 'CC-017 Capilla respuestas 2026-09-05', 'pagado_por_anterior', i.pagado_por, 'pagado_por_nuevo', 'cliente', 'cantidad_anterior', i.cantidad, 'cantidad_nueva', coalesce(k.cant, i.cantidad))
from cli k join public.solicitud_compra_item i on i.id = k.item_id;

update public.solicitud_compra_item i
   set descripcion = k.descripcion, pagado_por = 'cliente', precio_unit = 0,
       cantidad = coalesce(k.cant, i.cantidad), unidad = coalesce(k.unidad, i.unidad),
       cantidad_enviada = case when i.cantidad_enviada is null then null else coalesce(k.cant, i.cantidad_enviada) end,
       obs = coalesce(i.obs || ' · ', '') || 'Provisto por la iglesia (2026-09-05).'
  from cli k where i.id = k.item_id;
update public.materiales_a_cuenta_cliente c
   set descripcion = k.descripcion, pagado_por = 'cliente', precio_unit = 0, precio_total = 0,
       cantidad = coalesce(k.cant, c.cantidad), unidad = coalesce(k.unidad, c.unidad), updated_at = now()
  from cli k where c.item_id = k.item_id and c.cobro_id is null;
drop table cli;

-- 3) cables, panel LED ───────────────────────────────────────────────────────
-- cable unipolar: 10 m celeste, 2,5 mm² a la referencia (obra llave en mano)
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, 10,
       'cable unipolar → Cable unipolar 2.5mm² celeste, 10 m a $971,63 (referencia; el user no dijo la sección)',
       jsonb_build_object('motivo', 'CC-017 Capilla respuestas 2026-09-05', 'material_id', 37, 'cantidad_anterior', i.cantidad, 'cantidad_nueva', 10, 'precio_anterior', i.precio_unit, 'precio_nuevo', 971.63)
from public.solicitud_compra_item i where i.id = 1761 and i.material_id is null;
update public.solicitud_compra_item set material_id = 37, descripcion = 'Cable unipolar 2.5mm²', color = 'celeste', cantidad = 10, unidad = 'm', precio_unit = 971.63,
       cantidad_enviada = case when cantidad_enviada is null then null else 10 end
 where id = 1761 and material_id is null;
update public.materiales_a_cuenta_cliente set descripcion = 'Cable unipolar 2.5mm²', cantidad = 10, unidad = 'm', precio_unit = 971.63, precio_total = 9716.30, updated_at = now()
 where item_id = 1761 and cobro_id is null;

-- cable tipo taller "1 unid" = 10 m (sin precio)
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 10, '"1 unid" de cable tipo taller 2x1,5 = 10 m (user)',
       jsonb_build_object('motivo', 'CC-017 Capilla respuestas 2026-09-05', 'cantidad_anterior', i.cantidad, 'cantidad_nueva', 10)
from public.solicitud_compra_item i where i.id = 1760 and i.unidad = 'unid';
update public.solicitud_compra_item set cantidad = 10, unidad = 'm', cantidad_enviada = case when cantidad_enviada is null then null else 10 end where id = 1760 and unidad = 'unid';
update public.materiales_a_cuenta_cliente set cantidad = 10, unidad = 'm', updated_at = now() where item_id = 1760 and unidad = 'unid' and cobro_id is null;

-- panel LED redondo 24 W: $33.000 c/u
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $33.000 (user)',
       jsonb_build_object('motivo', 'CC-017 Capilla respuestas 2026-09-05', 'precio_anterior', i.precio_unit, 'precio_nuevo', 33000)
from public.solicitud_compra_item i where i.id = 1970 and coalesce(i.precio_unit, 0) = 0;
update public.solicitud_compra_item set precio_unit = 33000 where id = 1970 and coalesce(precio_unit, 0) = 0;
update public.materiales_a_cuenta_cliente set precio_unit = 33000, precio_total = round(cantidad * 33000, 2), updated_at = now() where item_id = 1970 and precio_unit = 0 and cobro_id is null;
update public.stock_materiales set precio_ref = 33000, obs = coalesce(obs || ' · ', '') || 'Precio según el user 2026-09-05: $33.000.' where id = 1202 and coalesce(precio_ref, 0) = 0;

-- las placas de cielorraso: confirmado por placa
update public.stock_materiales set obs = replace(obs, 'Confirmar precio y material (yeso / PVC).', 'Precio POR PLACA confirmado por el user (2026-09-05).') where id = 1199;
