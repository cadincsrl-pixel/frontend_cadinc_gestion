-- 20260906b — Selladores poliuretánicos por marca y presentación, color como dato del pedido (user 2026-09-06)
--
-- Antes había un genérico "Sellador poliuretano x 300ml" (24 usos, con la
-- referencia rota: $4.503 era el Hidro 3 de 50 cc) más filas sueltas por color.
-- Queda una fila por marca + presentación, con `usa_color` (el pedido pide el
-- color: gris / negro / blanco):
--   179  → Sellador PU Sikaflex 1A Plus x 300ml   ($20.690,91, última compra real; absorbe 1247 "gris")
--   981  → Sellador PU Sikaflex 1A Plus x 600ml (salchicha)
--   1241 → Sellador PU 3M 550 x 300ml              (absorbe 876 "negro", que era 3M 550 de canaletas; precio a confirmar con la factura)
--   696  → Sellador adhesivo PU Sikaflex 221 x 300ml ($25.000: caja de 12 a $300.000 en ML, 06/09/2026)
-- Los dos renglones "sellador hidro 3 mediano" que estaban colgados del
-- genérico son sellador de roscas Hidro 3 de 50 cc (su compra fue a $4.503,30,
-- el precio del de 50 cc) y pasan a la fila 999.

create temp table viejos as select id, nombre from public.stock_materiales where id in (179, 981, 1241, 696, 1247, 876);

-- 1) hidro 3 mediano → sellador de roscas 50 cc ────────────────────────────
create temp table hidro as
select distinct i.id as item_id, i.solicitud_id, i.estado
from public.solicitud_compra_item i join public.solicitud_item_eventos e on e.item_id = i.id
where i.material_id = 179 and e.comentario ilike '%hidro 3%';
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select item_id, solicitud_id, 'correccion', null, estado, '"sellador hidro 3 mediano" no es poliuretánico: pasa a Sellador de roscas x 50cc (su compra fue a $4.503,30, el precio del de 50 cc)',
       jsonb_build_object('motivo', 'selladores PU por marca 2026-09-06', 'material_anterior', 179, 'material_nuevo', 999) from hidro;
update public.solicitud_compra_item i set material_id = 999, descripcion = 'Sellador de roscas x 50cc' from hidro h where i.id = h.item_id;
update public.materiales_a_cuenta_cliente c set descripcion = 'Sellador de roscas x 50cc', updated_at = now() from hidro h where c.item_id = h.item_id and c.cobro_id is null;

-- 2) filas por marca ─────────────────────────────────────────────────────────
update public.stock_materiales m
   set nombre = 'Sellador PU Sikaflex 1A Plus x 300ml', usa_color = true, precio_ref = 20690.91, precio_actualizado_en = now(),
       alias = array(select distinct x from unnest(coalesce(m.alias,'{}') || (select coalesce(alias,'{}') from public.stock_materiales where id = 1247)
                     || array['sikaflex','sikaflex 1a plus 300ml','sellador sika','sellador poliuretanico sika','sellador pu sika','sikaflex 1a plus negro','sikaflex 1a plus blanco','sikaflex 1a plus gris','sellador poliuretano x 300ml']) as x
                     where x not in ('sellador hidro 3 mediano')),
       obs = coalesce(m.obs || ' · ', '') || '2026-09-06: era el genérico "Sellador poliuretano x 300ml" (referencia rota $4.503 = Hidro 3 50 cc). Ahora Sika 1A Plus, color en el pedido (gris/negro/blanco). Absorbió la fila "gris" (1247). $20.690,91 = última compra real (Clínica Heras).'
 where m.id = 179;

update public.stock_materiales m
   set nombre = 'Sellador PU Sikaflex 1A Plus x 600ml (salchicha)', usa_color = true,
       alias = array(select distinct unnest(coalesce(m.alias,'{}') || array['sikaflex 1a plus 600','sikaflex salchicha','sellador sika 600','sikaflex 600 ml','sikaflex 1a plus purform 600','salchicha sikaflex'])),
       obs = coalesce(m.obs || ' · ', '') || '2026-09-06: color en el pedido (gris/negro/blanco).'
 where m.id = 981;

update public.stock_materiales m
   set nombre = 'Sellador PU 3M 550 x 300ml', usa_color = true,
       alias = array(select distinct unnest(coalesce(m.alias,'{}') || (select coalesce(alias,'{}') from public.stock_materiales where id = 876)
                     || array['3m 550','sellador 3m','sellador poliuretano 3m','sellador negro canaletas','sellador 3m negro','sellador 3m blanco','sellador 3m gris','pu 3m 550','sellador poliuretano negro x 300ml'])),
       obs = coalesce(m.obs || ' · ', '') || '2026-09-06: color en el pedido (negro/blanco/gris). Absorbió "Sellador poliuretano negro x 300ml" (876), que eran 3M 550 de canaletas. Precio a confirmar con la factura de 3M.'
 where m.id = 1241;

update public.stock_materiales m
   set nombre = 'Sellador adhesivo PU Sikaflex 221 x 300ml', usa_color = true, precio_ref = 25000, precio_actualizado_en = now(),
       alias = array(select distinct unnest(coalesce(m.alias,'{}') || array['sikaflex 221 300','sika 221 blanco','sika 221 negro','sika 221 gris','sikaflex 221 blanco','sikaflex 221 negro','sikaflex 221 gris','adhesivo sellador sika 221','sika 221 (sellador pu)'])),
       obs = coalesce(m.obs || ' · ', '') || '2026-09-06: color en el pedido (blanco/negro/gris). Mercado Libre, caja de 12 a $300.000 → $25.000 c/u.'
 where m.id = 696;

-- 3) fusiones: 1247 (gris) → 179, 876 (negro) → 1241 ──────────────────────
create temp table mov (item_id int, solicitud_id int, estado text, de int, a int, color text);
insert into mov select i.id, i.solicitud_id, i.estado, 1247, 179, 'gris' from public.solicitud_compra_item i where i.material_id = 1247;
insert into mov select i.id, i.solicitud_id, i.estado, 876, 1241, 'negro' from public.solicitud_compra_item i where i.material_id = 876;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select v.item_id, v.solicitud_id, 'correccion', null, v.estado,
       'Selladores por marca: ' || (select nombre from viejos where id = v.de) || ' → ' || m.nombre || ' (color ' || v.color || ')',
       jsonb_build_object('motivo', 'selladores PU por marca 2026-09-06', 'material_anterior', v.de, 'material_nuevo', v.a, 'color', v.color)
from mov v join public.stock_materiales m on m.id = v.a;

update public.solicitud_compra_item i
   set material_id = v.a, descripcion = m.nombre, color = coalesce(i.color, v.color)
  from mov v join public.stock_materiales m on m.id = v.a where i.id = v.item_id;
update public.materiales_a_cuenta_cliente c set descripcion = m.nombre, updated_at = now()
  from mov v join public.stock_materiales m on m.id = v.a where c.item_id = v.item_id and c.cobro_id is null;
update public.stock_movimientos set material_id = 179 where material_id = 1247;
update public.stock_movimientos set material_id = 1241 where material_id = 876;

update public.stock_materiales set activo = false, updated_at = now(),
       obs = coalesce(obs || ' · ', '') || 'Fusionado el 06/09/2026 en "Sellador PU Sikaflex 1A Plus x 300ml" (179): el color va en el pedido.'
 where id = 1247;
update public.stock_materiales set activo = false, updated_at = now(),
       obs = coalesce(obs || ' · ', '') || 'Fusionado el 06/09/2026 en "Sellador PU 3M 550 x 300ml" (1241): el color va en el pedido.'
 where id = 876;

-- 4) los renglones que llevaban el nombre viejo toman el nuevo ─────────────
update public.solicitud_compra_item i set descripcion = m.nombre
  from viejos v join public.stock_materiales m on m.id = v.id
 where i.material_id = v.id and i.descripcion = v.nombre and v.id in (179, 981, 1241, 696);
update public.materiales_a_cuenta_cliente c set descripcion = m.nombre, updated_at = now()
  from viejos v join public.stock_materiales m on m.id = v.id join public.solicitud_compra_item i on i.id = c.item_id
 where i.material_id = v.id and c.descripcion = v.nombre and c.cobro_id is null and v.id in (179, 981, 1241, 696);

-- 5) color gris en los renglones del genérico cuyo texto original lo decía
update public.solicitud_compra_item i set color = 'gris'
 where i.material_id = 179 and i.color is null
   and exists (select 1 from public.solicitud_item_eventos e where e.item_id = i.id and e.accion in ('vinculacion_manual','descripcion_unificada') and e.comentario ilike '%gris%');

drop table mov; drop table hidro; drop table viejos;
