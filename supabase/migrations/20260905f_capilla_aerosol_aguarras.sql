-- 20260905f — Concepción Capilla: aerosol dorado y aguarrás (respuestas del user, 2026-09-05)
--
-- · "Pintura para el cuadro" = pintura aerosol dorada, $30.000 → alta y vínculo.
-- · Aguarrás x 4 l: "ponele $35.000" → renglón #1537 y referencia de la fila 357,
--   que estaba rota en $26,62 (cargada "en miles").
-- · Cable tipo taller 2x1,5 (25 m), virulana, mandil y rodillo: sin precio hasta
--   que se sepa; quedan en $0.

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select 'Pintura aerosol dorada', 'unid', 30000, 5,
       array['aerosol dorado','pintura aerosol dorada','pintura dorada aerosol','spray dorado','pintura para el cuadro','aerosol oro'],
       'material', 'Alta 2026-09-05 desde Concepción Capilla (pedido #418, "Pintura para el cuadro"). $30.000 según el user.'
where not exists (select 1 from public.stock_materiales where lower(nombre) = lower('Pintura aerosol dorada'));

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.cantidad, i.descripcion || ' → ' || m.nombre || ' a $30.000 (user)',
       jsonb_build_object('motivo', 'CC-017 Capilla respuestas 2026-09-05', 'material_id', m.id, 'desc_canonica', m.nombre, 'precio_anterior', i.precio_unit, 'precio_nuevo', 30000)
from public.solicitud_compra_item i, public.stock_materiales m
where i.id = 1966 and i.material_id is null and lower(m.nombre) = lower('Pintura aerosol dorada');
update public.solicitud_compra_item i set material_id = m.id, descripcion = m.nombre, precio_unit = 30000
  from public.stock_materiales m where i.id = 1966 and i.material_id is null and lower(m.nombre) = lower('Pintura aerosol dorada');
update public.materiales_a_cuenta_cliente c set descripcion = i.descripcion, precio_unit = 30000, precio_total = round(c.cantidad * 30000, 2), updated_at = now()
  from public.solicitud_compra_item i where c.item_id = i.id and i.id = 1966 and c.cobro_id is null;

-- aguarrás x 4 l
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $35.000 la lata de 4 l (user)',
       jsonb_build_object('motivo', 'CC-017 Capilla respuestas 2026-09-05', 'precio_anterior', i.precio_unit, 'precio_nuevo', 35000)
from public.solicitud_compra_item i where i.id = 1537 and coalesce(i.precio_unit, 0) = 0;
update public.solicitud_compra_item set precio_unit = 35000, unidad = 'lata' where id = 1537 and coalesce(precio_unit, 0) = 0;
update public.materiales_a_cuenta_cliente set precio_unit = 35000, precio_total = round(cantidad * 35000, 2), unidad = 'lata', updated_at = now() where item_id = 1537 and precio_unit = 0 and cobro_id is null;

update public.stock_materiales set precio_ref = 35000,
       obs = coalesce(obs || ' · ', '') || 'Estaba en $26,62 (cargado en miles). $35.000 la lata de 4 l según el user, 2026-09-05.'
 where id = 357 and precio_ref = 26.62;
