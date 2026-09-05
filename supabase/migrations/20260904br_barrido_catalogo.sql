-- 20260904br — Barrido de todas las obras (2/2): 49 altas, ~330 vínculos al catálogo y los "$1"
--
-- Segunda mitad del barrido (ver 20260904bq). De las 758 descripciones en texto
-- libre, 124 coincidían exactamente con un nombre o alias del catálogo y otras
-- ~200 se resolvieron a mano; el resto (retazos, cosas a medida, "cosas de
-- Molina", equipos de audio de la Capilla, pinturas sin código…) queda en texto
-- libre para el user.
--
-- REGLA DE PRECIOS: los vínculos conservan el precio del renglón. Si estaba en $0
-- (o en $1, el marcador de "sin precio"), toma la referencia del catálogo SOLO en
-- obras llave en mano (gasto CADINC); en obras del cliente queda en $0, porque
-- ponerle precio es facturarlo y eso lo decide el user ("los $12,4 M sin
-- facturar: ahora no"). Los "$1" que quedan sueltos pasan a $0.
--
-- Conversiones con plata (todas conservan el total salvo que se indique):
--   · "fijador al agua" #1383 (FARM 25): 20 l "a $96.819 el litro" → 1 lata de 20 l
--     a $96.819. El renglón estaba en $1.936.380; queda en $96.819 (−$1,84 M).
--   · "fijador al agua" #1003 (CC-011): 4 l a $6.929 → 1 lata de 4 l a $27.716.
--   · "verde tenis" 40 l, "quantum frentes" 40 l, "esmalte triple acción 4 l",
--     "Revesta 290" 4 l: litros → latas (mismo total).
--   · "rollo de caño 3/4" #1844: 1 rollo a $5.592 → 25 m a $270,65 (como en Clínica Salta).
--   · babetas de CC-008: unidades → metros lineales (la fila es por metro).
--   · velo de fibra (906): la fila decía "m" a $30.981; es el ROLLO de 50 m.
--   · cajas de porcelanato 58x58 → 1,35 m2 (4 placas); pieza 60x120 → 0,72 m2.
--   · "caja de cable red cat 5" → 305 m a $1.314,10.
--   · niveladores "3 bolsas" (Praderas) → 750 u. a $38.
-- Ninguno cobrado.

-- 1) altas ───────────────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, v.unidad, v.precio_ref, v.rubro_id, v.alias, v.clase, 'Alta 2026-09-04 (barrido de obras). ' || v.obs
from (values
  ('Marco de aplicar p/ panel LED 30x120', 'unid', 15867, 2, array['accesorios para panel led 30x120','marco aplicar 30x120','marco de aplicar 120x30'], 'material', 'Hipódromo (CC-019).'),
  ('Panel LED 30x120 40W (embutir)', 'unid', 0, 2, array['plafones de 120x30','panel led 30x120','plafon 30x120','panel 120x30'], 'material', 'Orán (CC-001). Sin precio.'),
  ('Bocallave', 'unid', 2763.50, 10, array['bocallave','bocallaves','boca llave'], 'material', 'Valle Fértil.'),
  ('Cable canal 20x10mm x 2m', 'unid', 1876.75, 2, array['cable canal 20x10','cablecanal 20x10','cable canal schneider 20x10mm'], 'material', 'Obrador (CC CADINC).'),
  ('Cable tipo taller 2x2.5mm²', 'm', 1818.36, 2, array['cable tipo taller 2x2,5','cable taller 2x2.5','tpr 2x2.5','cable tipo taller 2x2.5'], 'material', 'CC-013.'),
  ('Caja de vereda domiciliaria (medidor)', 'unid', 21310.10, 2, array['caja de vereda','caja de vereda domiciliaria','caja medidor vereda'], 'material', 'Clínica Heras.'),
  ('Caño de acero galvanizado 1 1/2" x 6.40m', 'unid', 101035.21, 7, array['caño galvanizado 1 1/2','caños de acero galvanizado de 1 1/2','cano galvanizado 1 1/2'], 'material', 'Concepción PL (CC-018), 17 caños.'),
  ('Caño de acero galvanizado 3" x 6.40m', 'unid', 212310.47, 7, array['caño galvanizado 3','caños de acero galvanizado de 3','cano galvanizado 3 pulgadas'], 'material', 'Concepción PL (CC-018), 16 caños.'),
  ('Caño mecánico 4" x 6m', 'unid', 0, 7, array['caño mecanico 4','caños mecanicos 4','cano mecanico 4 pulgadas'], 'material', 'Concepción PL. Sin precio.'),
  ('Caño estructural 100x20x1.6', 'unid', 54630.96, 7, array['caño 20x100x1.6','estructural 20x100x1.6','caño estructural 100x20'], 'material', 'Clínica Heras.'),
  ('Caño estructural 100x20x2', 'unid', 56001.44, 7, array['estructural 20x100x2','caño 20x100x2'], 'material', 'Clínica Heras.'),
  ('Caño estructural 25x25x1.6', 'unid', 21079.25, 7, array['caño 25x25x1.6','estructural 25x25','caño 25x25'], 'material', 'Clínica Heras.'),
  ('Caño estructural 30x10x1.6', 'unid', 13727.74, 7, array['caños 10x30x1.6','estructural 10x30x1,6','caño 10x30','caño 30x10'], 'material', 'Clínica Heras.'),
  ('Caño estructural 100x100x2', 'unid', 104268.25, 7, array['estructural 100x100x2','caño 100x100','caño estructural 100x100'], 'material', 'Clínica Heras.'),
  ('Perfil C 80x50x15 x 6m', 'unid', 44193.78, 7, array['perfil c 80x50','perfil c 80x50x15','pc 80x50'], 'material', 'CC NORTE.'),
  ('Chapa galvanizada lisa C18 1.22x2.44 (hoja)', 'unid', 41375, 9, array['chapa galvanizada c18 1.22x2.44','chapa lisa calibre 18','chapa galvanizada calibre 18','chapa c18'], 'material', 'FARM 25 ($41.375) y Lamadrid.'),
  ('Canaleta de chapa galvanizada a medida (por metro)', 'm', 0, 9, array['canaleta de chapa','canaleta zingueria','canaleta a medida','canaleta de 8ml'], 'material', 'Zinguería a medida, por metro lineal. Sin precio.'),
  ('Enduido exterior x 10lts', 'balde', 34200, 5, array['enduido exterior de 10','enduido exterior 10 litros','enduido exterior x 10'], 'material', 'FARM 25.'),
  ('Esmalte al agua Revesta 290 blanco x 4lts', 'lata', 150000, 5, array['revesta 290','revesta 290 blanco','sintetico revesta 290','esmalte revesta'], 'material', 'Casa Operarios (CC-014).'),
  ('Sellador poliuretano gris x 300ml (Sikaflex 1A Plus)', 'unid', 20690.91, 6, array['sikaflex 1a plus 300','sikaflex 1a plus color gris cartucho x 300ml','sellador para canaleta gris','sikaflex gris 300','sellador pu gris 300'], 'material', 'Clínica Heras ($20.691); el Obrador lo cargó a $12.000.'),
  ('Sellador adhesivo PU 3M 550 x 300ml', 'unid', 14765.63, 6, array['silicona 3m 550','3m 550','sellador 3m 550','adhesivo 3m 550'], 'material', 'CC-008.'),
  ('Lubricante p/ junta elástica PVC (solución deslizante)', 'unid', 5227.33, 1, array['solucion deslizante','lubricante junta elastica','deslizante para pvc'], 'material', 'Praderas.'),
  ('Tejido romboidal galvanizado 2m de alto (por metro)', 'm', 9855, 7, array['tela romboidal','tejido romboidal','tela romboidal galvanizada x 2m de alto','alambre romboidal 2m'], 'material', 'Mantenimiento (CC CADINC 1).'),
  ('Tornillo de fijación p/ inodoro c/ tarugo', 'unid', 1032, 1, array['tornillo para inodoro','tornillos para inodoros con taco','tornillos pora inodoro','tornillos de inodoro','fijacion inodoro'], 'material', 'Mantenimiento.'),
  ('Ventana aluminio corrediza 1.20x0.60', 'unid', 0, 10, array['ventana corrediza modena 120x0.60','ventana 120x60','ventana corrediza 1.20x0.60'], 'material', 'Lamadrid (Modena). Sin precio.'),
  ('Ventana aluminio corrediza 1.20x1.00', 'unid', 0, 10, array['ventana corrediza modena 120x100','ventana 120x100','ventana corrediza 1.20x1.00'], 'material', 'Lamadrid (Modena). Sin precio.'),
  ('Ventana aluminio corrediza 1.50x1.00', 'unid', 0, 10, array['ventana corrediza modena blanco 150x100','ventana 150x100','ventana corrediza 1.50x1.00'], 'material', 'Lamadrid (Modena). Sin precio.'),
  ('Masilla p/ Superboard x 5kg', 'unid', 0, 3, array['masilla para superboard','masilla superboard 5kg','masilla para superboard x5kg'], 'material', 'Lamadrid. Sin precio.'),
  ('Cinta de pintor 18mm', 'rollo', 0, 5, array['cinta de papel 18mm','cinta de papel 18','cinta 2 cm','cinta de enmascarar 18'], 'material', 'Sin precio.'),
  ('Pegamento p/ porcelanato x 25kg', 'bolsa', 6604.28, 4, array['pegamento para porcelanato x25kg','pegamento porcelanato 25 kg','pegamento porcelanato x 25'], 'material', 'Praderas, 80 bolsas.'),
  ('Careta p/ soldar (visor fijo)', 'unid', 7840, 15, array['careta','careta de soldar','careta soldador','mascara de soldar comun'], 'epp', 'Casa Operarios.'),
  ('Mecha paleta p/ madera 25mm', 'unid', 6040, 6, array['mecha pala de 25mm','mecha paleta 25','mecha pala 25'], 'material', 'CC-004.'),
  ('Rueda p/ carretilla (repuesto)', 'unid', 0, 6, array['rueda de carretilla','rueda carretilla','cubierta carretilla'], 'material', 'CC NORTE. Sin precio.'),
  ('Terminal puntera doble p/ cable 2.5mm²', 'unid', 0, 2, array['punteras termicas 2,5 doble','puntera doble 2.5','terminal doble 2.5'], 'material', 'Hipódromo. Sin precio.'),
  ('Térmica 2x63A', 'unid', 25553.78, 2, array['llave 63a','termica 2x63','termica 63 amper','llave termica 63a'], 'material', 'Casa Operarios.'),
  ('Térmica tetrapolar 4x32A', 'unid', 36714.77, 2, array['llave termica tetrapolar curva c 32 amper','termica 4x32','termica tetrapolar 32','llave tetrapolar 32a'], 'material', 'Valle Fértil.'),
  ('Térmica tripolar 3x32A curva D', 'unid', 63830.29, 2, array['termica trifasica curva d 32 amper','termica 3x32 curva d','termica trifasica 32a','llave trifasica 32'], 'material', 'Valle Fértil.'),
  ('Tomacorriente simple', 'unid', 3638.47, 2, array['toma simple','tomacorriente simple','toma simple 10a'], 'material', 'Hipódromo.'),
  ('Kit de amure p/ sanitarios', 'unid', 6606.48, 1, array['kit de amure','kit amure inodoro','kit de amure bidet'], 'material', 'Hipódromo.'),
  ('Periscopio de piso 4 tomas', 'unid', 12927, 2, array['periscopios de 4 tomas piso','periscopio de piso','periscopio 4 tomas'], 'material', 'Hipódromo.'),
  ('Tapón PVC 40mm', 'unid', 456.99, 1, array['tapon 40 awaduct','tapon pvc 40','tapon de 40'], 'material', 'Valle Fértil.'),
  ('Tapa PVC 50mm', 'unid', 455.58, 1, array['tapa 0.50 pvc','tapa pvc 50','tapa de 50 pvc'], 'material', 'Praderas (Duratop).'),
  ('Codo PVC 50mm 90° MH', 'unid', 1708.29, 1, array['codos 0.50 mh duratop','codo 50 mh 90','codo pvc 50 macho hembra'], 'material', 'Praderas (Duratop).'),
  ('Codo PVC 50mm 45° MH', 'unid', 1131.28, 1, array['codos 0.50 mh 45','codo 50 a 45 mh','codo pvc 50 45 grados'], 'material', 'Praderas (Duratop).'),
  ('Codo PVC 63mm 45° MH', 'unid', 1840.40, 1, array['codos 0.63 45 mh duratop','codo 63 a 45 mh','codo pvc 63 45 grados'], 'material', 'Praderas (Duratop).'),
  ('Codo PVC 63mm 90° MH', 'unid', 3950, 1, array['codos a 90 de 63 mh','codo 63 mh 90','codo pvc 63 macho hembra'], 'material', 'CC-008.'),
  ('Curva PVC 63mm 90° HH', 'unid', 2389.54, 1, array['curvas de 0,63 hh duratop','curva 63 hh 90','curva pvc 63 90 hh'], 'material', 'Casa Operarios (Duratop).'),
  ('Curva PVC 63mm 90° MH', 'unid', 1840.39, 1, array['curvas de 0,63 mh duratop','curva 63 mh 90','curva pvc 63 90 mh'], 'material', 'Casa Operarios (Duratop).'),
  ('Curva PVC 63mm 45° MH', 'unid', 4300, 1, array['curvas a 45 de 63 mh','curva 63 a 45 mh','curva pvc 63 45 grados'], 'material', 'CC-008.')
) as v(nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- el velo de fibra es por ROLLO de 50 m, no por metro (ningún renglón lo usa por metro)
update public.stock_materiales
   set unidad = 'rollo', precio_ref = 33520,
       alias = array(select distinct unnest(alias || array['velo de fibra','rollo de velo','velo 50x1','velo de 1x50','rollos de velo'])),
       obs = coalesce(obs || ' · ', '') || 'ROLLO de 50 m x 1 m. Decía "m" a $30.981, que era el precio del rollo. $33.520 (CC-015, 2026).'
 where id = 906 and unidad = 'm'
   and not exists (select 1 from public.solicitud_compra_item i where i.material_id = 906 and i.cantidad > 5);

-- 2) vínculos ────────────────────────────────────────────────────────────────
create temp table vinc (item_id int, mat int, cant numeric, unidad text, precio numeric, nota text);
-- coincidencias exactas con nombre o alias
insert into vinc values
  (2903, 5, null, null, null, 'estaba a $1'), (1413, 29, null, null, null, null), (1913, 29, null, null, null, null),
  (2323, 37, null, 'm', null, null), (1850, 55, null, null, null, null),
  (1844, 59, 25, 'm', 270.65, 'rollo de 25 m; $5.592 era neto del rollo'), (1855, 59, null, 'm', null, null),
  (3091, 87, null, 'bolsa', null, null), (2940, 99, null, null, null, null), (2579, 115, null, null, null, null),
  (216, 126, null, null, null, null), (268, 126, null, null, null, null), (381, 126, null, null, null, null), (3242, 126, null, null, null, null),
  (2288, 133, null, null, null, null), (350, 149, null, null, null, null), (1559, 149, null, null, null, null),
  (306, 167, null, null, null, null), (309, 167, null, null, null, null), (2280, 167, null, null, null, null), (2283, 167, null, null, null, null), (2490, 168, null, null, null, null),
  (2431, 981, null, null, null, 'Sikaflex 1A 600 ml'), (1589, 181, null, null, null, null), (3189, 187, null, null, null, null),
  (875, 189, null, null, null, null), (1629, 189, null, null, null, null), (2898, 189, null, null, null, 'estaba a $1'), (3178, 189, null, null, null, null),
  (2899, 190, null, null, null, 'estaba a $1'), (2905, 195, null, null, null, 'estaba a $1'), (2911, 206, null, null, null, 'estaba a $1'),
  (92, 318, null, null, null, null), (1773, 318, null, null, null, null), (1937, 318, null, null, null, null), (1997, 318, null, null, null, null), (2580, 318, null, null, null, null),
  (2752, 358, null, null, null, null), (569, 361, null, null, null, null), (2285, 361, null, null, null, null),
  (2247, 383, null, null, null, null), (2207, 384, null, null, null, null), (599, 411, null, null, null, null), (39, 419, null, null, null, null), (38, 432, null, null, null, null),
  (672, 440, null, null, null, null), (2967, 440, null, null, null, null), (2385, 441, null, null, null, null), (898, 469, null, null, null, 'chapas acanaladas a $56.181 = 1.10x5m'),
  (2220, 555, null, null, null, null), (1150, 588, null, null, null, null), (2791, 647, null, null, null, null), (2549, 671, null, null, null, null), (2857, 671, null, null, null, null),
  (2387, 691, null, null, null, null), (3138, 718, null, null, null, null), (3190, 770, null, null, null, null), (2965, 808, null, null, null, null),
  (313, 809, null, null, null, null), (468, 809, null, null, null, null), (503, 809, null, null, null, null), (701, 809, null, null, null, null), (781, 809, null, null, null, null), (2638, 809, null, null, null, null),
  (686, 818, null, null, null, null), (474, 825, null, null, null, null), (2270, 859, null, null, null, null), (1637, 901, null, null, null, null),
  (220, 910, 1.35, 'm2', null, 'caja de 4 placas 58x58 = 1,35 m2'), (550, 910, 1.35, 'm2', null, 'caja de 4 placas 58x58 = 1,35 m2'),
  (1601, 910, null, 'm2', null, null), (1781, 910, 0.34, 'm2', null, '1 placa 58x58 = 0,34 m2'),
  (82, 911, null, null, null, null), (1331, 911, null, null, null, null), (1362, 911, null, null, null, null), (2938, 911, null, null, null, null), (3134, 911, null, null, null, null),
  (199, 912, null, null, null, null), (341, 912, null, null, null, null), (2416, 912, null, null, null, null), (342, 913, null, null, null, null),
  (1557, 914, null, null, null, null), (2172, 914, null, null, 6735.83, 'última compra del sistema'),
  (1572, 915, null, null, null, null), (1857, 915, null, null, null, null), (336, 916, null, null, null, null), (728, 916, null, null, null, null),
  (2913, 917, null, null, null, 'estaba a $1'), (2813, 918, null, null, null, null), (606, 919, null, null, null, null), (2379, 921, null, null, null, null), (2524, 922, null, null, null, null), (2193, 923, null, null, null, null),
  (2906, 929, null, null, null, 'estaba a $1'), (2909, 930, null, null, null, 'estaba a $1'), (3179, 931, null, null, null, null),
  (2188, 933, null, null, null, null), (2378, 933, null, null, null, null), (2192, 934, null, null, null, null), (1994, 936, 0.72, 'm2', null, '1 pieza 60x120 = 0,72 m2'), (1692, 1075, null, null, null, null),
  (725, 1094, 2, 'lata', 190628.80, '40 l = 2 latas de 20 l'), (2078, 1197, null, null, null, null), (2926, 1200, null, null, null, null),
  (2445, 111, 1, 'balde', null, '20 l = 1 balde'), (2780, 1013, null, null, null, null), (3047, 1013, null, 'kg', null, 'ceresita por kilo');
-- resueltos a mano
insert into vinc values
  (2282, 165, 0.25, 'kg', 12000, '1/4 kg de electrodos a $3.000'), (234, 859, null, null, null, null), (1951, 149, null, null, null, null), (2142, 786, null, null, null, null),
  (1634, 383, 20, null, null, '20 tornillos con tacos del 8'),
  (1062, 906, 1, 'rollo', 33520, '"4 velos de 1x50" a $33.520: es el precio de un rollo'), (873, 906, 0.5, 'rollo', 35620, 'rollo de 25 m = medio rollo'), (1072, 906, 0.5, 'rollo', 35620, 'rollo de 25 m = medio rollo'),
  (1065, 906, 1, 'rollo', null, null), (463, 906, null, 'rollo', null, null),
  (2081, 1153, null, 'lata', 156956.51, 'pintura 7055 = Loxon exterior mate Deep 18 l (como en la Capilla)'),
  (1914, (select id from public.stock_materiales where nombre = 'Marco de aplicar p/ panel LED 30x120'), null, null, null, null),
  (2076, (select id from public.stock_materiales where nombre = 'Panel LED 30x120 40W (embutir)'), null, null, null, null),
  (1142, 156, null, null, null, null), (566, 450, null, 'lata', null, null), (42, 450, null, 'lata', null, '2 l = 2 latas de 1 l'), (2284, 450, null, 'lata', null, null),
  (202, 769, null, 'bolsa', null, null), (2588, 656, null, null, null, null), (2624, 656, null, null, null, null), (1845, 1190, null, null, null, null),
  (515, 875, 2.2, 'm', null, null), (510, 875, 5.1, 'm', null, null), (513, 875, 5, 'm', null, null), (512, 875, 0.6, 'm', null, null), (511, 875, 0.75, 'm', null, null),
  (509, 875, 14.8, 'm', null, '4 × 3,70 m'), (516, 875, 18, 'm', null, '6 × 3 m'), (514, 875, 8, 'm', null, '2 × 4 m'),
  (305, 653, null, null, null, null), (110, (select id from public.stock_materiales where nombre = 'Bocallave'), null, null, null, null),
  (2619, 697, null, null, null, null), (2681, 697, null, null, null, null), (2138, 109, null, null, null, null), (2039, 844, null, null, null, null), (311, 318, null, null, null, null), (2276, 323, null, null, null, null),
  (526, 769, null, 'bolsa', null, null), (1544, 808, null, null, null, null), (122, 770, null, 'bolsa', null, null), (1370, 844, null, null, null, null),
  (716, 555, 750, null, 38, '3 cajas de 250 a $9.500'), (1993, 318, null, null, null, null),
  (1853, 38, null, null, null, null), (1852, 38, null, null, null, null), (1583, 39, null, null, null, null),
  (72, (select id from public.stock_materiales where nombre = 'Cable canal 20x10mm x 2m'), null, null, null, null),
  (609, (select id from public.stock_materiales where nombre = 'Cable tipo taller 2x2.5mm²'), null, null, null, null),
  (3158, 238, 305, 'm', 1314.10, 'caja de 305 m a $400.800'),
  (1333, (select id from public.stock_materiales where nombre = 'Caja de vereda domiciliaria (medidor)'), null, null, null, null),
  (1027, 146, null, null, null, null), (654, 146, null, null, null, null), (557, 146, null, null, null, null),
  (1787, 3, null, null, null, 'Duratop 63 junta elástica = caño PVC 63 x 4 m'),
  (888, (select id from public.stock_materiales where nombre = 'Caño estructural 100x20x1.6'), null, null, null, null),
  (1519, (select id from public.stock_materiales where nombre = 'Caño estructural 100x20x2'), null, null, null, null),
  (890, (select id from public.stock_materiales where nombre = 'Caño estructural 25x25x1.6'), null, null, null, null),
  (889, 924, null, null, null, null), (878, 992, null, null, null, null),
  (949, (select id from public.stock_materiales where nombre = 'Caño estructural 30x10x1.6'), null, null, null, null),
  (1521, (select id from public.stock_materiales where nombre = 'Caño estructural 30x10x1.6'), null, null, null, null),
  (1518, (select id from public.stock_materiales where nombre = 'Caño estructural 100x100x2'), null, null, null, null),
  (112, 1, null, null, null, null), (1786, 2, null, null, null, 'PVC 50 reforzado 3.2'),
  (2870, (select id from public.stock_materiales where nombre = 'Caño de acero galvanizado 1 1/2" x 6.40m'), null, null, null, null),
  (2869, (select id from public.stock_materiales where nombre = 'Caño de acero galvanizado 3" x 6.40m'), null, null, null, null),
  (2867, (select id from public.stock_materiales where nombre = 'Caño mecánico 4" x 6m'), null, null, null, null),
  (2715, 4, null, null, null, null), (845, (select id from public.stock_materiales where nombre = 'Careta p/ soldar (visor fijo)'), null, null, null, null),
  (303, 87, null, 'bolsa', null, 'préstamo'), (2797, 144, null, null, null, null), (2882, 144, null, null, null, null), (1639, 144, null, null, null, null), (2304, 144, null, null, null, null),
  (1915, (select id from public.stock_materiales where nombre = 'Chapa galvanizada lisa C18 1.22x2.44 (hoja)'), null, null, null, null),
  (3034, (select id from public.stock_materiales where nombre = 'Chapa galvanizada lisa C18 1.22x2.44 (hoja)'), null, null, null, null),
  (2775, 877, null, 'm', null, 'por metro (rollo de 20 m)'), (1909, 1015, 28, 'm', null, '4 chapas de 7 m'), (1926, 1015, 67.5, 'm', null, '15 chapas de 4,50 m'), (508, 1015, 9, 'm', null, '10 chapas de 0,90 m'),
  (2755, (select id from public.stock_materiales where nombre = 'Cinta de pintor 18mm'), null, 'rollo', null, null),
  (99, (select id from public.stock_materiales where nombre = 'Cinta de pintor 18mm'), null, 'rollo', null, null),
  (733, 367, null, 'rollo', null, null), (125, 367, null, 'rollo', null, null), (1014, 367, null, 'rollo', null, null), (671, 107, null, null, null, null),
  (1590, 184, null, null, null, null), (1788, 6, null, null, null, null),
  (1789, (select id from public.stock_materiales where nombre = 'Codo PVC 50mm 45° MH'), null, null, null, null),
  (1796, (select id from public.stock_materiales where nombre = 'Codo PVC 50mm 90° MH'), null, null, null, null),
  (1792, (select id from public.stock_materiales where nombre = 'Codo PVC 63mm 45° MH'), null, null, null, null),
  (1791, 928, null, null, null, null),
  (501, (select id from public.stock_materiales where nombre = 'Codo PVC 63mm 90° MH'), null, null, null, null),
  (1279, (select id from public.stock_materiales where nombre = 'Curva PVC 63mm 90° HH'), null, null, null, null),
  (1280, (select id from public.stock_materiales where nombre = 'Curva PVC 63mm 90° MH'), null, null, null, null),
  (502, (select id from public.stock_materiales where nombre = 'Curva PVC 63mm 45° MH'), null, null, null, null),
  (1795, 12, null, null, null, null), (1798, 195, null, null, null, null),
  (1794, (select id from public.stock_materiales where nombre = 'Tapa PVC 50mm'), null, null, null, null),
  (1628, 7, null, null, null, null), (1632, 1008, null, null, null, null), (2901, 1008, null, null, null, 'estaba a $1'),
  (111, (select id from public.stock_materiales where nombre = 'Tapón PVC 40mm'), null, null, null, null), (1555, 203, null, null, null, null), (2177, 11, null, null, null, 'Duratop = PVC'),
  (968, 662, null, null, null, null), (3122, 662, null, null, null, null),
  (229, 859, null, null, null, null), (1961, 859, null, null, null, null), (1832, 859, null, null, null, null), (3348, 859, null, null, null, null),
  (235, 167, null, null, null, null), (858, 440, null, null, null, null), (988, 718, null, null, null, null), (1229, 859, null, null, null, null), (673, 167, null, null, null, null), (592, 440, null, null, null, null), (681, 718, null, null, null, null),
  (1574, 51, null, null, null, null), (1382, (select id from public.stock_materiales where nombre = 'Enduido exterior x 10lts'), null, 'balde', null, null),
  (1024, 375, null, null, null, null), (1171, 375, null, null, null, null), (2551, 375, null, null, null, null), (1023, 375, null, null, null, null), (1172, 375, null, null, null, null), (2552, 375, null, null, null, null),
  (892, 122, 1, 'lata', 49200, '4 l = 1 lata'), (587, 691, null, null, null, null), (166, 691, null, null, null, null),
  (489, 345, null, 'lata', null, null), (572, 345, null, 'lata', null, null), (2034, 345, null, 'lata', null, null), (2823, 345, null, 'lata', null, null),
  (1003, 121, 1, 'lata', 27716, '4 l a $6.929 = 1 lata de 4 l'),
  (1383, 120, 1, 'lata', 96819, '20 l "a $96.819 el litro" = 1 lata de 20 l a $96.819 (estaba en $1.936.380)'),
  (97, 723, null, null, null, 'bolsa de 25 kg (la fila es de 30 kg)'), (354, 23, null, null, null, 'estaba a $1'), (1800, 109, null, null, null, null), (1801, 790, null, null, null, null),
  (2794, 1047, null, null, null, null), (143, 270, null, null, null, null), (304, 644, null, null, null, null), (2160, 644, null, null, null, null), (1361, 652, null, null, null, null), (2159, 652, null, null, null, null), (1595, 1034, null, null, null, null),
  (2352, 809, null, 'kg', null, null), (2466, 1007, null, null, null, null),
  (1412, (select id from public.stock_materiales where nombre = 'Kit de amure p/ sanitarios'), null, null, null, null),
  (1582, 66, null, null, null, 'jabalina con tomacable'), (2817, 1200, null, null, null, null), (1016, 117, null, null, null, null), (1513, 374, null, null, null, null),
  (1587, 53, null, null, null, null), (1586, 54, null, null, null, null),
  (2146, (select id from public.stock_materiales where nombre = 'Térmica 2x63A'), null, null, null, null),
  (108, (select id from public.stock_materiales where nombre = 'Térmica tetrapolar 4x32A'), null, null, null, null),
  (107, (select id from public.stock_materiales where nombre = 'Térmica tripolar 3x32A curva D'), null, null, null, null),
  (1575, 242, null, null, null, null), (2787, 696, null, null, null, null), (534, 655, null, null, null, null),
  (3078, (select id from public.stock_materiales where nombre = 'Masilla p/ Superboard x 5kg'), null, null, null, null),
  (1650, 80, null, 'balde', null, null), (327, 932, null, null, null, null), (357, 443, null, null, null, null), (362, 862, null, null, null, null),
  (359, (select id from public.stock_materiales where nombre = 'Mecha paleta p/ madera 25mm'), null, null, null, null),
  (261, 173, null, 'balde', null, null), (2777, 173, null, 'balde', null, 'Sikafill fibrada blanca'), (2289, 173, null, 'balde', null, 'Sikafill fibrada roja'),
  (1409, 214, null, null, null, null), (2344, 214, null, null, null, null), (1414, 28, null, null, null, 'inodoro con tapa'),
  (1848, (select id from public.stock_materiales where nombre = 'Periscopio de piso 4 tomas'), null, null, null, null),
  (3186, 1040, null, null, null, null), (157, 128, null, null, null, null), (126, 128, null, null, null, '5 cm = 2"'), (282, 128, null, null, null, null), (2115, 362, null, null, null, '10 cm = 4"'),
  (188, 1195, null, null, null, null), (891, 163, null, null, null, null), (142, 63, null, null, null, null), (1719, 504, null, null, null, null), (1424, 504, null, null, null, null), (3112, 506, null, null, null, null),
  (2523, 526, 0.9, 'm2', null, '1,00 x 0,90 m'),
  (1579, 957, null, null, null, null), (1578, 985, null, null, null, null), (1576, 907, null, null, null, null),
  (1577, (select id from public.stock_materiales where nombre = 'Terminal puntera doble p/ cable 2.5mm²'), null, null, null, null),
  (1167, 115, 2, 'lata', 168940, '40 l = 2 latas de 20 l'), (1428, 224, null, null, null, null), (173, 725, null, null, 0, 'estaba a $1'), (172, 725, null, null, 0, 'estaba a $4'),
  (1655, (select id from public.stock_materiales where nombre = 'Esmalte al agua Revesta 290 blanco x 4lts'), 1, 'lata', 150000, '4 l = 1 lata'),
  (1885, (select id from public.stock_materiales where nombre = 'Esmalte al agua Revesta 290 blanco x 4lts'), 1, 'lata', 150000, '4 l = 1 lata'),
  (278, 126, null, null, null, null), (394, 126, null, null, null, null), (492, 126, null, null, null, null), (1166, 126, null, null, null, null), (2815, 126, null, null, null, null), (1178, 360, null, null, null, null),
  (1565, 59, 50, 'm', null, '2 rollos de 25 m'), (1608, 1067, null, null, null, null), (1561, 999, null, null, null, null),
  (329, (select id from public.stock_materiales where nombre = 'Sellador poliuretano gris x 300ml (Sikaflex 1A Plus)'), null, null, null, null),
  (779, (select id from public.stock_materiales where nombre = 'Sellador poliuretano gris x 300ml (Sikaflex 1A Plus)'), null, null, null, null),
  (724, (select id from public.stock_materiales where nombre = 'Sellador poliuretano gris x 300ml (Sikaflex 1A Plus)'), null, null, null, null),
  (591, (select id from public.stock_materiales where nombre = 'Sellador adhesivo PU 3M 550 x 300ml'), null, null, null, null),
  (1996, 553, null, null, null, null), (1368, 913, null, null, null, null),
  (1793, (select id from public.stock_materiales where nombre = 'Lubricante p/ junta elástica PVC (solución deslizante)'), null, null, null, null),
  (594, (select id from public.stock_materiales where nombre = 'Tejido romboidal galvanizado 2m de alto (por metro)'), null, 'm', null, null),
  (2350, 933, null, null, null, null), (1567, 44, null, null, null, null), (1015, 115, null, 'lata', null, null), (944, 354, null, 'lata', null, null),
  (1091, 383, null, null, null, null), (2278, 382, null, null, null, null), (480, 383, null, null, null, null), (1025, 384, null, null, null, null), (2423, 255, null, null, null, null),
  (1939, (select id from public.stock_materiales where nombre = 'Tomacorriente simple'), null, null, null, null),
  (1560, (select id from public.stock_materiales where nombre = 'Tornillo de fijación p/ inodoro c/ tarugo'), null, null, null, null),
  (2962, (select id from public.stock_materiales where nombre = 'Tornillo de fijación p/ inodoro c/ tarugo'), null, null, null, 'estaba a $1'),
  (2173, (select id from public.stock_materiales where nombre = 'Tornillo de fijación p/ inodoro c/ tarugo'), null, null, null, null),
  (1846, 744, null, null, null, null), (582, 455, null, 'rollo', null, null),
  (2591, (select id from public.stock_materiales where nombre = 'Ventana aluminio corrediza 1.20x0.60'), null, null, null, null),
  (2592, (select id from public.stock_materiales where nombre = 'Ventana aluminio corrediza 1.20x1.00'), null, null, null, null),
  (2593, (select id from public.stock_materiales where nombre = 'Ventana aluminio corrediza 1.50x1.00'), null, null, null, null),
  (1017, 700, null, 'lata', null, null),
  (1892, (select id from public.stock_materiales where nombre = 'Canaleta de chapa galvanizada a medida (por metro)'), 4.1, 'm', null, null),
  (1891, (select id from public.stock_materiales where nombre = 'Canaleta de chapa galvanizada a medida (por metro)'), 6.5, 'm', null, null),
  (1375, (select id from public.stock_materiales where nombre = 'Canaleta de chapa galvanizada a medida (por metro)'), 8, 'm', null, null),
  (464, (select id from public.stock_materiales where nombre = 'Pegamento p/ porcelanato x 25kg'), null, 'bolsa', null, null),
  (2225, 412, null, null, null, null), (2224, 154, null, null, null, null),
  (507, (select id from public.stock_materiales where nombre = 'Perfil C 80x50x15 x 6m'), null, null, null, null),
  (1355, (select id from public.stock_materiales where nombre = 'Rueda p/ carretilla (repuesto)'), null, null, null, null),
  (132, 799, null, 'lata', null, 'Pintura 6105 = Loxon satinado divine white 20 l'), (285, 353, null, 'lata', null, null), (284, 353, null, 'lata', null, null),
  (1882, 797, 1, 'lata', 288240, '20 l = 1 lata; se conserva el total ($14.412/l), revisar');

-- eventos + updates con la regla de precios
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, coalesce(v.cant, i.cantidad),
       i.descripcion || ' → ' || m.nombre || coalesce(' — ' || v.nota, ''),
       jsonb_build_object('motivo', 'barrido catalogo 2026-09-04', 'material_id', v.mat, 'desc_canonica', m.nombre,
                          'cantidad_anterior', i.cantidad, 'cantidad_nueva', coalesce(v.cant, i.cantidad),
                          'precio_anterior', i.precio_unit,
                          'precio_nuevo', coalesce(v.precio, case when coalesce(i.precio_unit, 0) in (0, 1) then (case when o.materiales_a_cargo_de = 'cadinc' then coalesce(m.precio_ref, 0) else 0 end) else i.precio_unit end),
                          'a_cargo_de', o.materiales_a_cargo_de)
from vinc v
join public.solicitud_compra_item i on i.id = v.item_id
join public.solicitud_compra s on s.id = i.solicitud_id
join public.obras o on o.cod = s.obra_cod
join public.stock_materiales m on m.id = v.mat
where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = v.mat, descripcion = m.nombre,
       cantidad          = coalesce(v.cant, i.cantidad),
       cantidad_comprada = case when i.cantidad_comprada is null then null else coalesce(v.cant, i.cantidad_comprada) end,
       cantidad_enviada  = case when i.cantidad_enviada  is null then null else coalesce(v.cant, i.cantidad_enviada)  end,
       unidad            = coalesce(v.unidad, i.unidad),
       precio_unit       = coalesce(v.precio, case when coalesce(i.precio_unit, 0) in (0, 1) then (case when o.materiales_a_cargo_de = 'cadinc' then coalesce(m.precio_ref, 0) else 0 end) else i.precio_unit end)
  from vinc v
  join public.stock_materiales m on m.id = v.mat
  join public.solicitud_compra s on true
  join public.obras o on o.cod = s.obra_cod
 where i.id = v.item_id and s.id = i.solicitud_id and i.material_id is null;

update public.materiales_a_cuenta_cliente c
   set descripcion = i.descripcion, cantidad = i.cantidad, unidad = i.unidad, precio_unit = i.precio_unit,
       precio_total = round(i.cantidad * i.precio_unit, 2), updated_at = now()
  from vinc v join public.solicitud_compra_item i on i.id = v.item_id
 where c.item_id = v.item_id and c.cobro_id is null and i.material_id = v.mat;
drop table vinc;

-- 3) los "$1" que quedaron sueltos pasan a $0 ─────────────────────────────────
create temp table uno as
select c.id as mcc_id, i.id as item_id, i.solicitud_id, i.estado, i.descripcion
from public.materiales_a_cuenta_cliente c join public.solicitud_compra_item i on i.id = c.item_id
where c.cobro_id is null and c.precio_unit = 1;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select u.item_id, u.solicitud_id, 'correccion', null, u.estado, 'Estaba cargado a $1 (marcador): queda en $0 hasta que se tase',
       jsonb_build_object('motivo', 'barrido catalogo 2026-09-04', 'precio_anterior', 1, 'precio_nuevo', 0)
from uno u;
update public.solicitud_compra_item i set precio_unit = 0 from uno u where i.id = u.item_id and i.precio_unit = 1;
update public.materiales_a_cuenta_cliente c set precio_unit = 0, precio_total = 0, updated_at = now() from uno u where c.id = u.mcc_id;
drop table uno;

-- 4) catálogo: referencias que estaban en $0 y hoy tienen una compra real ──────
update public.stock_materiales set precio_ref = v.p, obs = coalesce(obs || ' · ', '') || v.n
from (values
  (469, 56181.05, 'CC-008: chapa 1.10x5m $56.181,05.'),
  (156, 20499.22, 'Clínica Heras: $20.499,22.'),
  (163, 14318.67, 'Clínica Heras: $14.318,67.'),
  (38,  1181.00,  'Hipódromo: $1.181/m.'),
  (354, 52115.29, 'Praderas: $52.115,29 la lata de 18 l.'),
  (2,   20314.69, 'Praderas: PVC 50 reforzado 3.2 $20.314,69.'),
  (6,   1158.05,  'Praderas: codo 50 HH 90° $1.158,05.')
) as v(id, p, n)
where stock_materiales.id = v.id and coalesce(stock_materiales.precio_ref, 0) = 0;
