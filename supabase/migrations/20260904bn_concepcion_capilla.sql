-- 20260904bn — Concepción Capilla (CC-017, llave en mano): 14 vínculos, 3 altas, 31 precios, 3 herramientas fuera
--
-- Pedido del user 2026-09-04 ("vamos con concepcion capilla"). 70 renglones en
-- 16 pedidos (27/07 → 07/08), $655.542, **60 sin precio**, 33 en texto libre,
-- todo gasto CADINC. Casi todo salió del depósito en $0.
--
-- 1) Altas: larguero de cielorraso desmontable 3,66 m (sin precio), placa de
--    cielorraso desmontable 1,20x0,60 (a $23.000, el precio que cargó el user
--    al despachar el 07/08: 14 placas = $322.000, la mitad de la obra — a
--    confirmar) y destornillador plano (herramienta).
-- 2) 14 vínculos conservando el precio, salvo: "rodillo d10" → Mini rodillo
--    10cm a $2.268; "franela" a $907; "Bricol para las lajas" → Impregnante
--    Brik-Col x 4 l a $61.862 (presentación supuesta); "Cinta negra" → cinta
--    aisladora a $1.427,55 (última compra a Voltaje, no los $4.997 del rollo
--    grande); "Cable 15ml" → 15 m de cable taller 2x1,5 (alias que ya tenía la
--    fila; sin precio). "Yeso x 25kg" 2 **kg** → fila "Yeso x kg" a $1.668.
-- 3) Conversiones: Poximix "20 kg" y "5 kg" → 4 y 1 bolsas de 5 kg a
--    $18.751,63; alambre "1 unid" → 1 kg a $4.500.
-- 4) Herramientas fuera de la cuenta: "regla de 1.50" (→ Regla de aluminio
--    1.5m), "Pinza de fuerza y alicate" (→ Pinza de fuerza 10"; el alicate se
--    desdobla en un renglón nuevo del mismo pedido, vinculado a Pinza de corte,
--    para que el pañol lo vea) y "destornillador plano". Todas en $0.
-- 5) 23 renglones en $0 (y uno en $1) toman el precio de referencia; el disco
--    diamantado 115 toma $3.900 (última compra) y no los $24.000 de la ficha,
--    que se corrigen.
-- Quedan para el user: los 11 equipos de audio/video/Starlink del pedido #387,
-- "pintura 7005" y "pintura 7055" (×2), "llave de iglesia", "Cuadro" y su
-- pintura, "Cerámico para los zócalos", "Plafones para el holls", "cable
-- unipolar", "Cable tipo taller 1 unid", aguarrás x 4 l (referencia rota).
-- Ninguno cobrado.

-- 1) altas ───────────────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, v.unidad, v.precio_ref, v.rubro_id, v.alias, v.clase, v.obs
from (values
  ('Larguero p/ cielorraso desmontable 3,66m', 'unid', 0, 3,
   array['larguero','largueros','larguero cielorraso','larguero 3.66','largueros cielorraso desmontable','larguero de cielorraso desmontable'],
   'material', 'Alta 2026-09-04 desde Concepción Capilla (pedido #349). Sin precio.'),
  ('Placa cielorraso desmontable 1,20x0,60', 'unid', 23000, 3,
   array['placas cielorraso 1.2x0.6','placa cielorraso 120x60','placa desmontable 1.20x0.60','placas de cielorraso desmontable','placa cielorraso 1.2x0.6','placa cielorraso 1.20x0.60'],
   'material', 'Alta 2026-09-04 desde Concepción Capilla: despacho de depósito a $23.000 c/u cargado por el user el 07/08/2026. Confirmar precio y material (yeso / PVC).'),
  ('Destornillador plano 6mm x 100mm', 'unid', 0, 26,
   array['destornillador plano','destornillador paleta','destornillador punta plana','destornilladores planos','destornillador de paleta'],
   'herramienta', 'Alta 2026-09-04 desde Concepción Capilla (pedido #418).')
) as v(nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- 2) vínculos (texto libre) ──────────────────────────────────────────────────
create temp table vinc (item_id int, material_id int, cant numeric, unidad text, precio numeric, nota text);
insert into vinc values
  (1477, 68,   null, null, null,     'placas durlock 12.5 → Placa Durlock STD 12.5mm (Silva, precio final)'),
  (1481, (select id from public.stock_materiales where lower(nombre) = lower('Larguero p/ cielorraso desmontable 3,66m')), null, null, null, 'largueros (alta, sin precio)'),
  (1482, 1170, null, null, null,     'travesaños 060 → Travesaño p/ cielorraso desmontable 0,60m'),
  (1489, (select id from public.stock_materiales where lower(nombre) = lower('Placa cielorraso desmontable 1,20x0,60')), null, null, null, 'placas cielorraso 1.2x0.6 (alta; $23.000 cargado por el user)'),
  (1540, 360,  null, null, 2268,     'rodillo d10 → Mini rodillo 10cm a $2.268 (catálogo)'),
  (1721, 126,  null, null, null,     'rodillos para satinado → Rodillo lana pelo corto 23cm (sin precio)'),
  (1822, 1120, null, null, null,     'regla de 1.50 → Regla de aluminio 1.5m (herramienta)'),
  (1864, 822,  null, null, 907.30,   'franela para aguilar → Franela a $907,30 (catálogo)'),
  (1968, 1144, null, null, 61861.63, 'Bricol para las lajas → Impregnante p/ ladrillo incoloro Brik-Col x 4lts a $61.861,63 (presentación supuesta)'),
  (1971, 839,  null, null, null,     'Pinza de fuerza y alicate → Pinza de fuerza 10" (herramienta); el alicate va en un renglón aparte'),
  (1972, 61,   null, null, 1427.55,  'Cinta negra → Cinta aisladora a $1.427,55 (última compra a Voltaje 03/09/2026)'),
  (1973, 746,  15, 'm', null,        'Cable 15ml → 15 m de Cable tipo taller 2x1.5mm² (alias de la fila; sin precio)'),
  (1977, (select id from public.stock_materiales where lower(nombre) = lower('Destornillador plano 6mm x 100mm')), null, null, null, 'destornillador plano (alta, herramienta)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, coalesce(v.cant, i.cantidad),
       i.descripcion || ' → ' || m.nombre || ' — ' || v.nota,
       jsonb_build_object('motivo', 'CC-017 Concepción Capilla 2026-09-04', 'material_id', v.material_id, 'desc_canonica', m.nombre,
                          'cantidad_anterior', i.cantidad, 'cantidad_nueva', coalesce(v.cant, i.cantidad),
                          'precio_anterior', i.precio_unit, 'precio_nuevo', coalesce(v.precio, i.precio_unit))
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on m.id = v.material_id
where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = v.material_id, descripcion = m.nombre,
       cantidad          = coalesce(v.cant, i.cantidad),
       cantidad_comprada = case when i.cantidad_comprada is null then null else coalesce(v.cant, i.cantidad_comprada) end,
       cantidad_enviada  = case when i.cantidad_enviada  is null then null else coalesce(v.cant, i.cantidad_enviada)  end,
       unidad            = coalesce(v.unidad, i.unidad),
       precio_unit       = coalesce(v.precio, i.precio_unit)
  from vinc v join public.stock_materiales m on m.id = v.material_id
 where i.id = v.item_id and i.material_id is null;

update public.materiales_a_cuenta_cliente c
   set descripcion = m.nombre,
       cantidad    = coalesce(v.cant, c.cantidad),
       unidad      = coalesce(v.unidad, c.unidad),
       precio_unit = coalesce(v.precio, c.precio_unit),
       precio_total = round(coalesce(v.cant, c.cantidad) * coalesce(v.precio, c.precio_unit), 2),
       updated_at  = now()
  from vinc v join public.stock_materiales m on m.id = v.material_id
 where c.item_id = v.item_id and c.cobro_id is null;
drop table vinc;

-- el alicate del renglón #1971, desdoblado para que el pañol lo vea
insert into public.solicitud_compra_item (solicitud_id, descripcion, cantidad, unidad, obs, clase, devuelve, estado, material_id, precio_unit, fecha_resolucion, fecha_envio, cantidad_enviada, remito_envio_id)
select i.solicitud_id, 'Pinza de corte (alicate)', 1, 'unid',
       'Desdoblado del renglón #1971 "Pinza de fuerza y alicate" (2026-09-04)', 'herramienta', false, 'enviado', 1103, 0,
       i.fecha_resolucion, i.fecha_envio, 1, i.remito_envio_id
  from public.solicitud_compra_item i
 where i.id = 1971
   and not exists (select 1 from public.solicitud_compra_item x where x.solicitud_id = i.solicitud_id and x.material_id = 1103);

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select x.id, x.solicitud_id, 'creado', null, 'enviado', 1,
       'Renglón desdoblado de #1971 "Pinza de fuerza y alicate": salió con el mismo remito',
       jsonb_build_object('motivo', 'CC-017 Concepción Capilla 2026-09-04', 'desdoblado_de', 1971, 'material_id', 1103)
  from public.solicitud_compra_item x
 where x.solicitud_id = (select solicitud_id from public.solicitud_compra_item where id = 1971) and x.material_id = 1103
   and not exists (select 1 from public.solicitud_item_eventos e where e.item_id = x.id);

-- 3) conversiones de unidad y el yeso ────────────────────────────────────────
create temp table conv (item_id int, material_id int, cant numeric, unidad text, precio numeric, nota text);
insert into conv values
  (1459, 697, 4, 'unid', 18751.63, 'Poximix 20 kg = 4 bolsas de 5 kg a $18.751,63 (catálogo)'),
  (1619, 697, 1, 'unid', 18751.63, 'Poximix 5 kg = 1 bolsa de 5 kg a $18.751,63 (catálogo)'),
  (1828, 317, 1, 'kg',   4500,     'Alambre de atar N°18: 1 unid = 1 kg a $4.500 (catálogo)'),
  (1620, 948, 2, 'kg',   1668,     'Yeso: eran 2 kg sueltos, no bolsas de 25 kg → fila "Yeso x kg" a $1.668/kg');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, c.cant,
       c.nota || ' — antes ' || i.cantidad || ' ' || i.unidad || ' × $' || coalesce(i.precio_unit, 0),
       jsonb_build_object('motivo', 'CC-017 Concepción Capilla 2026-09-04', 'material_anterior', i.material_id, 'material_id', c.material_id,
                          'cantidad_anterior', i.cantidad, 'precio_anterior', i.precio_unit, 'cantidad_nueva', c.cant, 'precio_nuevo', c.precio)
from conv c join public.solicitud_compra_item i on i.id = c.item_id;

update public.solicitud_compra_item i
   set material_id = c.material_id, descripcion = m.nombre,
       cantidad = c.cant, unidad = c.unidad, precio_unit = c.precio,
       cantidad_comprada = case when i.cantidad_comprada is null then null else c.cant end,
       cantidad_enviada  = case when i.cantidad_enviada  is null then null else c.cant end
  from conv c join public.stock_materiales m on m.id = c.material_id where i.id = c.item_id;
update public.materiales_a_cuenta_cliente mc
   set descripcion = m.nombre, cantidad = c.cant, unidad = c.unidad, precio_unit = c.precio, precio_total = round(c.cant * c.precio, 2), updated_at = now()
  from conv c join public.stock_materiales m on m.id = c.material_id where mc.item_id = c.item_id and mc.cobro_id is null;
drop table conv;

-- 4) herramientas fuera de la cuenta ────────────────────────────────────────
create temp table herr as
select c.id as mcc_id, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen, c.precio_total
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
where c.obra_cod = 'CC-017' and c.cobro_id is null and i.id in (1822, 1971, 1977);

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select h.item_id, h.solicitud_id, 'sacado_de_cuenta_cliente', null, h.estado, h.cantidad,
       'Era una herramienta cargada en la cuenta: ' || h.descripcion,
       jsonb_build_object('motivo', 'CC-017 Concepción Capilla 2026-09-04', 'origen_mcc', h.origen, 'precio_total', h.precio_total)
from herr h;
delete from public.materiales_a_cuenta_cliente c using herr h where c.id = h.mcc_id;
drop table herr;

-- 5) renglones en $0 (o $1) que toman el precio de referencia ───────────────
create temp table precios (item_id int, precio numeric, fuente text);
insert into precios values
  (1458, 558.09,   'catálogo (Lija al agua N°150)'),
  (1480, 3034.32,  'catálogo (Perfil perimetral L p/ cielorraso desmontable x 3m)'),
  (1483, 18.07,    'catálogo (Tornillo T2 punta aguja)'),
  (1484, 25,       'catálogo (Tornillo T1 punta aguja)'),
  (1485, 33835.04, 'catálogo (Masilla Durlock x 32kg)'),
  (1487, 21.29,    'catálogo (Tarugo fisher 6mm c/tornillo)'),
  (1488, 21.29,    'catálogo (Tarugo fisher 6mm c/tornillo); estaba cargado a $1'),
  (1536, 1135,     'catálogo (Estopa x bolsa)'),
  (1725, 1135,     'catálogo (Estopa x bolsa)'),
  (1826, 1135,     'catálogo (Estopa x bolsa)'),
  (1539, 2462.62,  'catálogo (Pincel 1")'),
  (1927, 2462.62,  'catálogo (Pincel 1")'),
  (1618, 1817,     'catálogo (Rodillo epoxi N°10)'),
  (1621, 10253.69, 'catálogo (Revoque premezclado 3 en 1 x 30kg)'),
  (1624, 62695,    'catálogo (Enduido interior x 25kg)'),
  (1967, 62695,    'catálogo (Enduido interior x 25kg)'),
  (1627, 2135.14,  'catálogo (Balde de albañil 12lts)'),
  (1720, 3264.15,  'catálogo (Pincel 2-1/2")'),
  (1819, 13415,    'catálogo (Pegamento p/ cerámicos x 30kg)'),
  (1821, 3900,     'última compra del sistema 31/08/2026 (Disco diamantado 115mm)'),
  (1863, 1881.55,  'catálogo (Trapo de piso)'),
  (1974, 350,      'última compra del sistema 10/07/2026 (Ficha macho 10A)'),
  (1975, 1386.58,  'catálogo (Ficha hembra 10A)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $' || p.precio || ' (' || p.fuente || ')',
       jsonb_build_object('motivo', 'CC-017 Concepción Capilla 2026-09-04', 'precio_anterior', i.precio_unit, 'precio_nuevo', p.precio)
from precios p join public.solicitud_compra_item i on i.id = p.item_id where coalesce(i.precio_unit, 0) in (0, 1);
update public.solicitud_compra_item i set precio_unit = p.precio from precios p where i.id = p.item_id and coalesce(i.precio_unit, 0) in (0, 1);
update public.materiales_a_cuenta_cliente c set precio_unit = p.precio, precio_total = round(c.cantidad * p.precio, 2), updated_at = now()
  from precios p where c.item_id = p.item_id and c.precio_unit in (0, 1) and c.cobro_id is null;
drop table precios;

-- 6) catálogo ────────────────────────────────────────────────────────────────
update public.stock_materiales set precio_ref = 3900,
       obs = coalesce(obs || ' · ', '') || 'Estaba en $24.000; las últimas tres compras (agosto 2026) fueron $3.207, $3.800 y $3.900.'
 where id = 441 and precio_ref = 24000;

update public.stock_materiales set precio_ref = 0,
       obs = coalesce(obs || ' · ', '') || 'Estaba en $1 (marcador). Sin precio de referencia.'
 where id = 746 and precio_ref = 1;

update public.stock_materiales set precio_ref = 1004.76,
       obs = coalesce(obs || ' · ', '') || 'Silva 27/07/2026 (Concepción Capilla): $1.004,76.'
 where id = 1170 and coalesce(precio_ref, 0) = 0;

update public.stock_materiales
   set nombre = 'Yeso x kg (suelto)',
       alias = array(select distinct unnest(alias || array['yeso x kg','yeso suelto','yeso por kilo','kilo de yeso','kilos de yeso'])),
       obs = coalesce(obs || ' · ', '') || 'Por kilo, para pedidos chicos; la bolsa de 25 kg es la fila 772.'
 where id = 948 and nombre = 'yeso x kg';

-- el renombre de la 948 vino después del vínculo: se propaga a los renglones que quedaron con el nombre viejo
update public.solicitud_compra_item set descripcion = 'Yeso x kg (suelto)' where material_id = 948 and descripcion = 'yeso x kg';
update public.materiales_a_cuenta_cliente c set descripcion = 'Yeso x kg (suelto)', updated_at = now()
  from public.solicitud_compra_item i where i.id = c.item_id and i.material_id = 948 and c.descripcion = 'yeso x kg' and c.cobro_id is null;
