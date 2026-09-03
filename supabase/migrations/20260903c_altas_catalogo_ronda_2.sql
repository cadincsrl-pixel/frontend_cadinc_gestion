-- Altas de catálogo, fase 2 (2026-09-03). 29 materiales que la obra pide y no existían.
--
-- Salen de las 126 descripciones que la ronda 2 de sinónimos marcó como "no está en el
-- catálogo" (ver Inbox 2026-09-03). NO se dan de alta las 126: quedan afuera las piezas
-- a medida (mesadas, mueble de cocina, lajas, aberturas de aluminio con medida propia),
-- el equipamiento (TV, kit CCTV, splitter HDMI), los servicios (recarga de matafuego) y
-- todo lo que pide una decisión que no es mía (ropa de trabajo → módulo Ropa; la serie
-- PVC eléctrica métrica 20mm entera; el color 7055 del esmalte).
--
-- Criterio de esta tanda: (a) lo que se repite en 2+ pedidos, y (b) el hueco de medida
-- en una familia que ya existe — misma familia, mismo rubro, misma unidad, mismo patrón
-- de nombre que los hermanos. Nada de esto inventa una categoría nueva.
--
-- Verificado antes de insertar: ningún nombre normalizado existe ya, y ninguno de los
-- alias que se cuelgan pisa a otro material.

insert into public.stock_materiales (nombre, unidad, rubro_id, usa_color, alias)
select v.nombre, v.unidad, v.rubro_id, v.usa_color, v.alias
from (values
  -- ── Se repiten en 2+ pedidos ────────────────────────────────────────────
  -- Ripio bruto fino: 4 pedidos en bolsa (Farm 25, Heras x2, CC-023). Es un tercer
  -- árido, distinto de Piedra partida 1-3 y de Arena: en Farm 25 los pidieron juntos.
  ('Ripio bruto fino x bolsa','bolsa',4,false,array['bolsas de ripio bruto fino','ripio bruto fino','bolsa de ripio bruto fino']),
  ('Lustramuebles (Blem)','unid',6,false,array['blem','lustramuebles']),
  ('Limpiador cremoso (Cif)','unid',6,false,array['cif','limpiador cremoso']),
  ('Desplazador p/ inodoro 3cm','unid',1,false,array['desplazador 3 cm','desplazador de 3 cm','desplazador 3cm']),
  -- Conector de corrugado, NO el de caño rígido (260): en los dos pedidos viene junto
  -- con "rollo de caño corrugado 3/4".
  ('Conector p/ caño corrugado 3/4"','unid',2,false,array['conectores 3/4','conector 3/4','conector para corrugado 3/4']),
  ('Rodillo epoxi N°5','unid',5,false,array['rodillo epoxi n5','rodillo epoxi n 5']),
  ('Codo termofusión 20mm c/ rosca hembra 1/2"','unid',1,false,array['codos de 20 x 1/2','codo de 20 x 1/2']),
  ('Brocha N°40','unid',5,false,array['brocha n40','brocha n 40','brocha de 40']),
  ('Tirafondo 10mm','unid',6,false,array['tirafondos del 10','tirafondo del 10']),
  -- ── Hueco de medida en una familia existente ────────────────────────────
  ('Masilla Durlock x 17kg','balde',3,false,array['masilla x 17','masilla durlock 17']),
  ('Fenólico 4mm 1.22x2.44','unid',13,false,array['fenolicos calibre 4','fenolico calibre 4','fenolico de 4']),
  ('Caño estructural 100x40x1.6','unid',7,false,array['estructural 40x100 1.6','estructural 100x40x1.6']),
  ('Caño estructural 100x50x1.6','unid',7,false,array['perfil estructural 100x50x1.6','estructural 100x50x1.6']),
  ('Caño estructural 30x30x1.6','unid',7,false,array['estructural 30x30']),
  ('Lámpara LED 7W','unid',2,false,array['led para aplique 7w','lampara led de 7w']),
  -- "duratop" en esta empresa es termofusión (Dema), no PVC sanitario.
  ('Cupla termofusión 40mm','unid',1,false,array['cupla 0,40 duratop','cupla de 40 duratop']),
  ('Caño termofusión 63mm','m',1,false,array['canos 63 duratop','cano 63 duratop']),
  ('Codo termofusión 63mm','unid',1,false,array['codos de 63 duratop','codo de 63 duratop']),
  ('Curva PVC 50mm 45°','unid',1,false,array['curva de 50 a 45 grados','curva de 50 a 45']),
  ('Te termofusión reducción 25x20mm','unid',1,false,array['t de 25x20','te de 25x20']),
  ('Rejilla de piso 15x30','unid',1,false,array['rejilla 15x30']),
  ('Mecha acero rápido 4.2mm','unid',7,false,array['mecha para remaches 4.25mm','mecha 4.2','mecha de 4.2']),
  ('Tabla pino cepillada 1x6" x 3.05m','unid',13,false,array['tablas de 1x6x3.05','palos 1x 6x3,05','tabla 1x6 de 3.05']),
  ('Arandela plana 1/2"','unid',6,false,array['arandelas de 1/2','arandela de 1/2']),
  ('Precinto plástico 25cm','unid',6,false,array['precinto de 25','precintos de 25']),
  ('Porcelanato 60x120','m2',11,true,array['pieza porcelanato de 60x1.20','porcelanato 60x120']),
  -- La línea 7/8" existía a medias: estaba el caño (754) y nada para unirlo.
  ('Conector caño rígido 7/8"','unid',2,false,array['conectores 7/8 rigido','conector 7/8 rigido']),
  ('Cupla p/ caño rígido 7/8"','unid',2,false,array['cuplas 7/8 rigidas','cupla 7/8 rigida']),
  ('Caño corrugado 7/8"','m',2,false,array['rollo de cano corrugado 7/8','cano corrugado 7/8'])
) as v(nombre, unidad, rubro_id, usa_color, alias)
where not exists (
  select 1 from public.stock_materiales m
   where public.norm_material(m.nombre) = public.norm_material(v.nombre));
