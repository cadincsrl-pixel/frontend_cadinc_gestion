-- 20260904bi — Oficina Misión Salta 2026 (CC-022, llave en mano): el texto libre al catálogo
--
-- 47 renglones en 3 pedidos (15–24/08), todos con precio, 24 en texto libre.
-- Se vinculan los 24 (13 altas: panel LED, alfombra y su adhesivo, kit CCTV,
-- TV y soporte, HDMI, estabilizador, cupla rígida 1", pintura de pisos
-- Brik-Col) conservando el precio que traía cada renglón. Los códigos
-- Sherwin: 7005 → Loxon LD exterior mate (EW), 7067 → (Deep), 6105 satinado
-- → la fila "Latex satinado interior x 20lts", cuyo precio de referencia
-- ($14.463) estaba roto y toma el de esta compra ($247.132,82).
-- Eléctrica: 20 mm = 3/4" (la cupla del pedido vale lo mismo que la del
-- catálogo), 25 mm = 1".

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, v.unidad, v.precio_ref, (select id from public.stock_rubros where nombre = v.rubro), v.alias, 'material',
       'Alta 2026-09-04 desde Oficina Misión Salta (CC-022, pedido #504/#505). Precio del pedido.'
from (values
  ('Panel LED embutir redondo 18W luz fría',          'unid',   5137.66, 'Electricidad',           array['panel led 18w','panel led embutir 18','plafon led 18w redondo','panel led redondo','macroled 18w']),
  ('Cupla p/ caño rígido 1"',                         'unid',    135.45, 'Electricidad',           array['union caño pvc 25 mm','cupla rigido 1','cupla 25 mm rigido','union rigido 1']),
  ('Kit CCTV DVR 8 canales + 8 cámaras 2MP + SSD 1TB', 'unid', 506340.00, 'Electricidad',          array['kit dahua','kit de camaras','dvr 8 canales','camaras de seguridad kit','cctv']),
  ('Televisor / monitor 32"',                          'unid', 282269.00, 'Electricidad',          array['televisor 32','monitor 32','tv 32 pulgadas','smart tv 32']),
  ('Soporte p/ TV 32"',                                'unid',  20000.00, 'Electricidad',          array['soporte tv','soporte para tv 32','soporte de televisor']),
  ('Splitter HDMI 1x4',                                'unid',  65000.00, 'Electricidad',          array['splitter hdmi','divisor hdmi','splitter 1x4']),
  ('Extensor HDMI',                                    'unid',  30000.00, 'Electricidad',          array['extensor hdmi','extension hdmi','alargue hdmi']),
  ('Cable HDMI 1m',                                    'unid',  10000.00, 'Electricidad',          array['cable hdmi','cable hdmi x 1m','hdmi 1 metro']),
  ('Estabilizador de tensión',                         'unid',  60000.00, 'Electricidad',          array['estabilizador de tension','estavilizador de tension','estabilizador','regulador de tension']),
  ('Pintura p/ pisos alto tránsito Brik-Col gris',     'lata',  90908.00, 'Pintura',               array['brikol pisos','brik col pisos gris','pintura pisos alto transito','pintura brikol pisos']),
  ('Alfombra alto tránsito (El Espartano Delos)',      'm2',    27000.00, 'Pisos y revestimientos', array['alfombra','alfombra alto transito','alfombra espartano','alfombra delos','alfombra gris']),
  ('Adhesivo p/ alfombra (balde)',                     'unid', 140000.00, 'Pisos y revestimientos', array['adhesivo para alfombra','pegamento alfombra','cemento de contacto alfombra'])
) as v(nombre, unidad, precio_ref, rubro, alias)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

update public.stock_materiales set precio_ref = v.p, alias = array(select distinct unnest(alias || v.al)), obs = coalesce(obs || ' · ', '') || v.n
from (values
  (799, 247132.82, array['loxon antimanchas satinado 6105','loxon satinado divine white','loxon ld satinado 20'], 'Pedido #504 Misión Salta (08/2026): Loxon LD antimanchas satinado SW6105 x 20, $247.132,82. Reemplaza el $14.463 que estaba roto.'),
  (360,   2268.00, array['rodillo poliester chico','mini rodillo poliester','rodillo chico'],                     'Pedido #504 Misión Salta (08/2026): $2.268.'),
  (260,    138.67, array['conector 20mm','conectores 20mm','conector rigido 20'],                                 'Pedido #505 Misión Salta (08/2026): $138,67.')
) as v(id, p, al, n)
where stock_materiales.id = v.id;

create temp table vinc (item_id int, nombre text, precio numeric, cant numeric, unidad text, nota text);
insert into vinc values
  (2469, 'Látex exterior Loxon Larga Duración mate x 18lts (base EW)',   null, null, null, 'Loxon exterior divine white 7005'),
  (2470, 'Látex exterior Loxon Larga Duración mate x 18lts (base Deep)', null, null, null, 'Loxon exterior cityscape 7067'),
  (2471, 'Latex satinado interior x 20lts',                               null, null, null, 'Loxon LD antimanchas satinado 6105'),
  (2472, 'Pintura p/ pisos alto tránsito Brik-Col gris',                  null, null, null, null),
  (2474, 'Panel LED embutir redondo 18W luz fría',                        null, null, null, null),
  (2476, 'Alfombra alto tránsito (El Espartano Delos)',                   null, null, null, null),
  (2477, 'Kit CCTV DVR 8 canales + 8 cámaras 2MP + SSD 1TB',              null, null, null, null),
  (2478, 'Televisor / monitor 32"',                                       null, null, null, null),
  (2479, 'Soporte p/ TV 32"',                                             null, null, null, null),
  (2480, 'Adhesivo p/ alfombra (balde)',                                  null, null, null, null),
  (2482, 'Esmalte sintético x 4lts',                                      null, null, null, 'Enduring bronce (Sherwin), presentación no indicada'),
  (2483, 'Cable UTP cat5e',                                               1000.00, 150, 'm', 'caja "de al menos 150 m" a $150.000: se carga como 150 m'),
  (2501, 'Splitter HDMI 1x4',                                             null, null, null, null),
  (2502, 'Extensor HDMI',                                                 null, null, null, null),
  (2503, 'Estabilizador de tensión',                                      null, null, null, null),
  (2504, 'Cable HDMI 1m',                                                 null, null, null, null),
  (2539, 'Rodillo antigota 23cm',                                         null, null, null, null),
  (2540, 'Mini rodillo 10cm',                                             null, null, null, 'rodillo poliéster chico'),
  (2543, 'Pincel 2"',                                                     null, null, null, 'pincel mediano'),
  (2511, 'Cupla p/ caño rígido 1"',                                       null, null, null, 'unión caño PVC 25 mm'),
  (2525, 'Caño rígido 3/4"',                                              null, null, 'm',  'caños PVC 20 mm: 12 a $769,56, se toma por metro'),
  (2527, 'Cupla p/ caño rígido 3/4"',                                     null, null, null, 'cuplas 20 mm'),
  (2528, 'Curva rígida 3/4"',                                             null, null, null, 'curvas 20 mm'),
  (2529, 'Conector caño rígido 3/4"',                                     null, null, null, 'conectores 20 mm');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.descripcion || coalesce(' — ' || v.nota, ''),
       jsonb_build_object('motivo', 'CC-022 Mision Salta 2026-09-04', 'material_id', m.id, 'desc_canonica', m.nombre,
                          'precio_anterior', i.precio_unit, 'precio_nuevo', coalesce(v.precio, i.precio_unit),
                          'cantidad_anterior', i.cantidad, 'cantidad_nueva', coalesce(v.cant, i.cantidad))
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on m.nombre = v.nombre
where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = m.id, descripcion = m.nombre,
       precio_unit = coalesce(v.precio, i.precio_unit),
       cantidad = coalesce(v.cant, i.cantidad),
       cantidad_comprada = case when i.cantidad_comprada is null then null else coalesce(v.cant, i.cantidad_comprada) end,
       cantidad_enviada  = case when i.cantidad_enviada  is null then null else coalesce(v.cant, i.cantidad_enviada) end,
       unidad = coalesce(v.unidad, i.unidad)
  from vinc v join public.stock_materiales m on m.nombre = v.nombre
 where i.id = v.item_id and i.material_id is null;

update public.materiales_a_cuenta_cliente c
   set descripcion = i.descripcion, precio_unit = coalesce(i.precio_unit, 0), cantidad = i.cantidad, unidad = i.unidad,
       precio_total = round(i.cantidad * coalesce(i.precio_unit, 0), 2), updated_at = now()
  from vinc v join public.solicitud_compra_item i on i.id = v.item_id
 where c.item_id = v.item_id and c.cobro_id is null;
drop table vinc;
