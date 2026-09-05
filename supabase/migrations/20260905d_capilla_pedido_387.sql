-- 20260905d — Concepción Capilla, pedido #387: el equipo de audio lo compró CADINC
--
-- Respuestas del user (2026-09-05). Los 11 renglones salieron del depósito en $0
-- y en texto libre. Todo lo compró CADINC (obra llave en mano → gasto CADINC):
--   consola mixer Behringer X Air XR12 $776.000 · potencia Studiomaster $667.000
--   · rack 18 módulos $529.000 · bandeja de rack $32.305 · canal de tensión
--   $78.316 · ficha XLR hembra a RCA $49.999 · cable de parlante $25.000 ·
--   plafón LED 3000K $72.973 · 14 parlantes de embutir SKP SK-CST8X $115.530 c/u.
-- La antena Starlink y la cámara domo son EQUIPOS DE LA EMPRESA para controlar
-- la obra: herramientas, fuera de la cuenta, al pañol.
-- Precios finales tal como los pasó el user. Ninguno cobrado.

-- altas de material (rubro Electricidad, como el kit CCTV y los HDMI)
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, 'unid', v.precio_ref, 2, v.alias, 'material', 'Alta 2026-09-05 desde Concepción Capilla (pedido #387). Precio según el user.'
from (values
  ('Consola mixer digital Behringer X Air XR12', 776000, array['x air','xair','xr12','x air xr12','consola x air','portencia x air','potencia x air','mixer behringer','consola behringer']),
  ('Potencia de audio Studiomaster', 667000, array['potencia studiomaster','amplificador studiomaster','potencia de audio','amplificador de audio']),
  ('Rack de audio 18 módulos', 529000, array['rack 18 modulos','rack de audio','rack 18u','rack para audio']),
  ('Bandeja p/ rack de audio', 32305, array['bandeja rack','bandeja de rack','bandeja para rack']),
  ('Canal de tensión p/ rack (zapatilla rackeable)', 78316, array['canal de tension rack','canal de tension','zapatilla rack','regleta rack','regleta de tension']),
  ('Ficha XLR hembra a RCA', 49999, array['ficha xlr','xlr a rca','ficha xlr hembra a rca','adaptador xlr rca']),
  ('Cable de parlante (rollo)', 25000, array['cable de parlante','cable parlante','cable para parlantes','cable de audio parlante']),
  ('Plafón LED 3000K (luz cálida)', 72973, array['plafon frontis','plafon led 3000k','plafon luz calida','plafon 3000k','plafon calido']),
  ('Parlante de embutir coaxial p/ techo SKP SK-CST8X (8")', 115530, array['parlantes salon sacramental','parlante embutir techo','parlante skp','sk-cst8x','sk cst8x','parlante coaxial techo','parlante musica funcional','parlante de techo'])
) as v(nombre, precio_ref, alias)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- equipos de la empresa (herramientas)
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, 'unid', 0, 26, v.alias, 'herramienta', 'Alta 2026-09-05: equipo de la empresa para controlar la obra (Concepción Capilla).'
from (values
  ('Kit Starlink (antena + router)', array['antena starlink','starlink','kit starlink','internet satelital']),
  ('Cámara domo de vigilancia', array['camara domo','camara de seguridad','domo','camara de vigilancia'])
) as v(nombre, alias)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- vínculos con precio
create temp table vinc (item_id int, nombre text, precio numeric);
insert into vinc values
  (1740, 'Consola mixer digital Behringer X Air XR12', 776000),
  (1742, 'Potencia de audio Studiomaster', 667000),
  (1741, 'Rack de audio 18 módulos', 529000),
  (1745, 'Bandeja p/ rack de audio', 32305),
  (1746, 'Canal de tensión p/ rack (zapatilla rackeable)', 78316),
  (1744, 'Ficha XLR hembra a RCA', 49999),
  (1743, 'Cable de parlante (rollo)', 25000),
  (1749, 'Plafón LED 3000K (luz cálida)', 72973),
  (1750, 'Parlante de embutir coaxial p/ techo SKP SK-CST8X (8")', 115530),
  (1747, 'Kit Starlink (antena + router)', 0),
  (1748, 'Cámara domo de vigilancia', 0);

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.cantidad,
       i.descripcion || ' → ' || m.nombre || case when m.clase = 'herramienta' then ' (equipo de la empresa)' else ' a $' || v.precio end,
       jsonb_build_object('motivo', 'CC-017 Capilla pedido 387 2026-09-05', 'material_id', m.id, 'desc_canonica', m.nombre, 'precio_anterior', i.precio_unit, 'precio_nuevo', v.precio)
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on lower(m.nombre) = lower(v.nombre)
where i.material_id is null;

update public.solicitud_compra_item i set material_id = m.id, descripcion = m.nombre, precio_unit = v.precio
  from vinc v join public.stock_materiales m on lower(m.nombre) = lower(v.nombre)
 where i.id = v.item_id and i.material_id is null;

update public.materiales_a_cuenta_cliente c
   set descripcion = i.descripcion, precio_unit = i.precio_unit, precio_total = round(c.cantidad * i.precio_unit, 2), updated_at = now()
  from vinc v join public.solicitud_compra_item i on i.id = v.item_id
 where c.item_id = v.item_id and c.cobro_id is null;
drop table vinc;

-- Starlink y cámara fuera de la cuenta (el pañol las toma por el trigger)
create temp table herr as
select c.id as mcc_id, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen
from public.materiales_a_cuenta_cliente c join public.solicitud_compra_item i on i.id = c.item_id
where i.id in (1747, 1748) and c.cobro_id is null;
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select h.item_id, h.solicitud_id, 'sacado_de_cuenta_cliente', null, h.estado, h.cantidad,
       'Equipo de la empresa para controlar la obra, no material: ' || h.descripcion,
       jsonb_build_object('motivo', 'CC-017 Capilla pedido 387 2026-09-05', 'origen_mcc', h.origen)
from herr h;
delete from public.materiales_a_cuenta_cliente c using herr h where c.id = h.mcc_id;
drop table herr;
