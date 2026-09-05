-- 20260904bp — Concepción Capilla: "Plafones para el holls" ×2 son paneles LED redondos de embutir de 24 W
--
-- Según el user (2026-09-04). No había fila (la 1190 es el de 18 W y la 750 es
-- el plafón de 24 W de aplicar) ni compra con precio → alta sin precio, hermana
-- de la 1190, y vínculo del #1970. Queda "sin precio" hasta la primera compra.

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select 'Panel LED embutir redondo 24W', 'unid', 0, 2,
       array['panel led 24w','panel led embutir 24','plafon led 24w redondo embutir','plafon redondo de embutir 24w','panel led redondo 24','plafones para el hall','macroled 24w'],
       'material', 'Alta 2026-09-04 desde Concepción Capilla (pedido #418, "Plafones para el holls"). Sin precio.'
where not exists (select 1 from public.stock_materiales where lower(nombre) = lower('Panel LED embutir redondo 24W'));

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.cantidad, i.descripcion || ' → ' || m.nombre || ' (según el user; sin precio)',
       jsonb_build_object('motivo', 'CC-017 Concepción Capilla plafones 2026-09-04', 'material_id', m.id, 'desc_canonica', m.nombre)
from public.solicitud_compra_item i, public.stock_materiales m
where i.id = 1970 and i.material_id is null and lower(m.nombre) = lower('Panel LED embutir redondo 24W');

update public.solicitud_compra_item i set material_id = m.id, descripcion = m.nombre
  from public.stock_materiales m where i.id = 1970 and i.material_id is null and lower(m.nombre) = lower('Panel LED embutir redondo 24W');
update public.materiales_a_cuenta_cliente c set descripcion = m.nombre, updated_at = now()
  from public.solicitud_compra_item i join public.stock_materiales m on m.id = i.material_id
 where c.item_id = i.id and i.id = 1970 and c.cobro_id is null;
