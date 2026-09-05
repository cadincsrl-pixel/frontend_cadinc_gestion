-- 20260905m — Pañol: tipo para las herramientas que quedaron en texto libre
--
-- Del barrido (20260904bq) quedaron 34 renglones marcados herramienta sin tipo.
-- Acá se tipifican los que se pueden decidir sin el user, con 10 tipos nuevos
-- (prolongación 5 m, zapatilla, juego de llaves tubo, llave 10 mm, llave de
-- amoladora, cargador de batería, sondeadora, bomba de prueba hidráulica, pinza
-- universal, adaptador SDS). Los "herramientas de Gabriel / Bruno / Moyano /
-- Cabubi / de los herreros" son el cajón de mano de cada uno → "Caja de
-- herramientas de mano (kit)". Los renglones con dos herramientas ("masa y
-- cortafierro", "alargue + tablero", "alargue + pulidora") se desdoblan: el
-- renglón original toma una y se agrega un renglón hermano con la otra, como
-- se hizo con el alicate de la Capilla, para que el pañol vea las dos.
-- "Llana de acero" (338, la llana lisa) pasa a herramienta como ya lo son la
-- dentada y la cuchara: sus 6 renglones salen de las cuentas y van al pañol.
-- Quedan sin tipo: "Materiales de los herreros para soldar guinche y
-- herramientas" (mezcla), "llave para tornillo" (no se entiende) y los dos
-- canjes (demoledor, andamio), que ya están ignorados en el pañol.

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, 'unid', 0, 26, v.alias, 'herramienta', 'Alta 2026-09-05 (tipos para herramientas en texto libre).'
from (values
  ('Prolongación 5m',                                  array['alargue 5m','alargue de 5 metros','alargue de 5mts','alargue corto','prolongacion 5 m','alargue 5 metros']),
  ('Zapatilla (prolongador con tomas)',                array['zapatilla','alargue con zapatilla','zapatilla con alargue','prolongador con tomas','zapatilla 2 tomas','zapatilla electrica']),
  ('Juego de llaves tubo',                             array['llaves tubo','llave tubo','caja de llave tubo','juego de tubos','tubos para la maquina','juego de tubo','llaves de tubo']),
  ('Llave fija/combinada 10mm',                        array['llave 10','llave fija 10','llave combinada 10','llave del 10','llave numero 10']),
  ('Llave p/ tuerca de amoladora',                     array['llave para la amoladora','llave de amoladora','llave amoladora','llave de la amoladora']),
  ('Cargador de batería p/ herramienta inalámbrica',   array['cargador','cargador para maquina','cargador de maquina','cargador de bateria','cargador de franco','cargador del atornillador']),
  ('Sondeadora / destapacañerías',                     array['maquina para destrancar','maquina sondiadora','sondeadora','destapacanerias','sonda destapadora','maquina de destapar','destrancador']),
  ('Bomba de prueba hidráulica (p/ cañerías)',         array['maquina para inflar caneria','maquina para inflar caneria de agua','bomba de prueba','bomba hidraulica de prueba','probador de caneria','prueba hidraulica']),
  ('Pinza universal (electricista)',                   array['pinsa','pinza','pinza universal','pinza de electricista','pinza comun']),
  ('Adaptador SDS p/ rotomartillo (portamandril)',     array['adaptador para rotomartillo','adactador para rotormartillos','adaptador sds','mandril sds','portamandril sds','adaptador rotomartillo'])
) as v(nombre, alias)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- la llana lisa es herramienta
update public.stock_materiales set clase = 'herramienta', rubro_id = 26,
       alias = array(select distinct unnest(alias || array['llana lisa','llana de acero lisa','llana','llanas'])),
       obs = coalesce(obs || ' · ', '') || 'Herramienta (2026-09-05), como la llana dentada y la cuchara.'
 where id = 338 and clase <> 'herramienta';

create temp table fuera as
select c.id as mcc_id, c.obra_cod, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen, c.precio_total
from public.materiales_a_cuenta_cliente c join public.solicitud_compra_item i on i.id = c.item_id
where i.material_id = 338 and c.cobro_id is null;
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select f.item_id, f.solicitud_id, 'sacado_de_cuenta_cliente', null, f.estado, f.cantidad, 'Era una herramienta cargada en la cuenta de ' || f.obra_cod || ': ' || f.descripcion,
       jsonb_build_object('motivo', 'herramientas sin tipo 2026-09-05', 'origen_mcc', f.origen, 'precio_total', f.precio_total, 'obra_cod', f.obra_cod)
from fuera f;
delete from public.materiales_a_cuenta_cliente c using fuera f where c.id = f.mcc_id;
drop table fuera;
update public.solicitud_compra_item set material_id = material_id where material_id = 338 and herr_origen is distinct from 'catalogo';

-- vínculos ─────────────────────────────────────────────────────────────────
create temp table vinc (item_id int, nombre text, nota text);
insert into vinc values
  (84,   'Juego de llaves tubo', 'un juego de tubo grande para la máquina'),
  (94,   'Llave p/ tuerca de amoladora', null),
  (353,  'Prolongación 5m', null),
  (356,  'Juego de llaves tubo', null),
  (369,  'Amoladora angular 4 1/2" (115mm)', 'tamaño no indicado: se toma la común'),
  (466,  'Zapatilla (prolongador con tomas)', null),
  (475,  'Cargador de batería p/ herramienta inalámbrica', null),
  (676,  'Sondeadora / destapacañerías', null),
  (690,  'Pinza universal (electricista)', null),
  (788,  'Bomba de prueba hidráulica (p/ cañerías)', null),
  (879,  'Caja de herramientas de mano (kit)', 'herramientas de Moyano'),
  (1113, 'Prolongación 10m', 'largo no indicado: se toma la de 10 m'),
  (1376, 'Caja de herramientas de mano (kit)', 'herramientas de herrero'),
  (1470, 'Prolongación 10m', '"largue" = alargue; largo no indicado'),
  (1493, 'Juego de llaves tubo', null),
  (1494, 'Llave fija/combinada 10mm', null),
  (1549, 'Caja de herramientas de mano (kit)', 'herramientas de Cabubi'),
  (1948, 'Adaptador SDS p/ rotomartillo (portamandril)', null),
  (1960, 'Maza de acero 3kg', 'masa y cortafierro: el cortafierro va en renglón aparte'),
  (2210, 'Tablero de obra estanco c/ disyuntor', 'alargue + tablero ×3: los alargues van en renglón aparte'),
  (2235, 'Maza de acero 3kg', 'masa y cortafierro: el cortafierro va en renglón aparte'),
  (2250, 'Prolongación 10m', 'alargue + disco flap: el disco es consumible, queda anotado acá'),
  (2418, 'Pulidora de pisos', 'alargue + pulidora: el alargue va en renglón aparte'),
  (2497, 'Maza de acero 3kg', 'llana lisa, masa y cortafierro: llana y cortafierro van en renglones aparte'),
  (2556, 'Cargador de batería p/ herramienta inalámbrica', 'cargador de Franco'),
  (2679, 'Caja de herramientas de mano (kit)', 'todas las herramientas de los herreros'),
  (2732, 'Tablero de obra estanco c/ disyuntor', '"alargue o tablero": se toma tablero'),
  (3105, 'Caja de herramientas de mano (kit)', 'herramientas de Gabriel'),
  (3113, 'Caja de herramientas de mano (kit)', 'herramientas de Bruno'),
  (3187, 'Sondeadora / destapacañerías', null);

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.cantidad, i.descripcion || ' → ' || m.nombre || coalesce(' — ' || v.nota, ''),
       jsonb_build_object('motivo', 'herramientas sin tipo 2026-09-05', 'material_id', m.id, 'desc_canonica', m.nombre)
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on lower(m.nombre) = lower(v.nombre)
where i.material_id is null;

update public.solicitud_compra_item i set material_id = m.id, descripcion = m.nombre,
       obs = case when v.nota is not null then coalesce(i.obs || ' · ', '') || 'Era "' || i.descripcion || '": ' || v.nota else i.obs end
  from vinc v join public.stock_materiales m on lower(m.nombre) = lower(v.nombre)
 where i.id = v.item_id and i.material_id is null;

-- el pañol ya tenía filas para estos renglones (texto libre): toman el tipo
update public.herr_entregas h set material_id = i.material_id, descripcion = i.descripcion, descripcion_norm = public.norm_txt(i.descripcion), origen = 'catalogo', updated_at = now()
  from public.solicitud_compra_item i join vinc v on v.item_id = i.id
 where h.item_id = i.id and h.estado <> 'anulada' and h.material_id is distinct from i.material_id;
drop table vinc;

-- renglones hermanos para la segunda herramienta ─────────────────────────────
create temp table extra (base_id int, nombre text, cant numeric);
insert into extra values
  (1960, 'Cortafierro (cincel) de mano', 1),
  (2235, 'Cortafierro (cincel) de mano', 1),
  (2497, 'Cortafierro (cincel) de mano', 1),
  (2497, 'Llana de acero', 1),
  (2210, 'Prolongación 10m', 3),
  (2418, 'Prolongación 10m', 1);

insert into public.solicitud_compra_item (solicitud_id, descripcion, cantidad, unidad, obs, clase, devuelve, estado, material_id, precio_unit, fecha_resolucion, fecha_envio, cantidad_enviada, remito_envio_id)
select b.solicitud_id, m.nombre, e.cant, 'unid', 'Desdoblado del renglón #' || b.id || ' (2026-09-05): salió con el mismo remito', 'herramienta', false, b.estado, m.id, 0,
       b.fecha_resolucion, b.fecha_envio, case when b.cantidad_enviada is null then null else e.cant end, b.remito_envio_id
  from extra e join public.solicitud_compra_item b on b.id = e.base_id join public.stock_materiales m on lower(m.nombre) = lower(e.nombre)
 where not exists (select 1 from public.solicitud_compra_item x where x.solicitud_id = b.solicitud_id and x.material_id = m.id and x.obs like 'Desdoblado del renglón #' || b.id || '%');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_nuevo, cantidad, comentario, meta)
select x.id, x.solicitud_id, 'creado', x.estado, x.cantidad, x.obs,
       jsonb_build_object('motivo', 'herramientas sin tipo 2026-09-05', 'material_id', x.material_id)
  from public.solicitud_compra_item x
 where x.obs like 'Desdoblado del renglón #%(2026-09-05)%' and not exists (select 1 from public.solicitud_item_eventos e where e.item_id = x.id);
drop table extra;
