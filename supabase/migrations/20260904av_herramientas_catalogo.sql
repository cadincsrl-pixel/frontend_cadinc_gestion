-- 20260904av — Herramientas al catálogo: ninguna herramienta sale más por texto libre
--
-- User (2026-09-04): "carguemos las herramientas con su nombre técnico y
-- sinónimos según los que usan en texto libre y los que se te ocurran, la
-- idea es que ninguna herramienta salga por texto libre".
--
-- Modelo: la fila del catálogo es el TIPO de herramienta (amoladora 4 1/2,
-- escalera tijera); la unidad concreta (marca, número de serie) es la ficha
-- HER-NNN del padrón, que se vincula en la fase 2 del pañol. Por eso las
-- variantes "bosch", "makita", "chico", "de franco" son sinónimos, no filas.
-- Se separan solo cuando cambia el tipo (amoladora 4 1/2 / 7 / 9, escalera
-- tijera / extensible / recta).
--
-- 1) rubro "Herramientas y máquinas": todas las filas clase herramienta van ahí
--    (así en el buscador de pedidos "herramienta" las trae a todas).
-- 2) 41 altas (clase herramienta, sin precio) con los sinónimos del texto
--    libre real + variantes de tipeo.
-- 3) 240 renglones de texto libre se vinculan; el texto original queda en el
--    evento. Quedan 3 que no son un tipo de herramienta ("herramientas de
--    Bruno", "todas las herramientas de los herreros", "llave para tornillo").
-- Al vincular, el ítem cambia material_id/descripcion → el trigger del ledger
-- sincroniza herr_entregas solo; de todos modos se le refresca la descripción.

-- 1) rubro ──────────────────────────────────────────────────────────────────
insert into public.stock_rubros (nombre, icono, orden)
select 'Herramientas y máquinas', '🔧', 18
where not exists (select 1 from public.stock_rubros where nombre = 'Herramientas y máquinas');

update public.stock_materiales
   set rubro_id = (select id from public.stock_rubros where nombre = 'Herramientas y máquinas')
 where clase = 'herramienta'
   and rubro_id is distinct from (select id from public.stock_rubros where nombre = 'Herramientas y máquinas');

update public.stock_materiales
   set alias = array(select distinct unnest(alias || array['cortadora de porcelana','cortadora porcelanato','cortadora de porcelanato 60x60','cortadora de ceramico','cortadora de ceramicos','cortadora grande de porcelanato','cortadora manual']))
 where id = 943;

-- 2) altas ──────────────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, 'unid', 0, (select id from public.stock_rubros where nombre = 'Herramientas y máquinas'), v.alias, 'herramienta',
       'Alta 2026-09-04: tipo de herramienta del pañol (la unidad concreta es la ficha HER). Sinónimos tomados del texto libre de los pedidos.'
from (values
  ('Amoladora angular 4 1/2" (115mm)', array['amoladora','amoladoras','amoladora chica','amoladora 4 1/2','amoladora 4.1/2','amoladora de 4 1/2','amoladora de 4.1/2','amoladora de 4','amoladora 4','amoladora 115','amoladora 115mm','amoladora skil','amoladora bosch chica','amoladora nueva','amoladora con disco','amoladora angular chica','moladora']),
  ('Amoladora angular 7" (180mm)',     array['amoladora de 7','amoladora 7','amoladora de7','amoladora n7','amoladora grande','amoladora 180','amoladora 180mm','amoladora angular grande','amoladora de 7 con disco']),
  ('Amoladora angular 9" (230mm)',     array['amoladora de 9','amoladora 9','amoladora n9','amoladora d n9','amoladora 230','amoladora 230mm']),
  ('Carretilla',                        array['carretillas','carretilla de obra','carrucha','carretilla de mano']),
  ('Aspiradora industrial polvo y agua', array['aspiradora','aspiradoras','aspiradora de obra','aspiradora con bolsas','aspiradora con accesorios','aspiradora industrial']),
  ('Mezcladora eléctrica de mano (batidora p/ mortero y pintura)', array['mezcladora','mezcladoras','batidora','batidora de pintura','mezcladora de pintura','mezcladora de mortero','revolvedor','mezclador electrico']),
  ('Hormigonera 130lts (trompo)',      array['hormigonera','hormigoneras','hormigonera 130l','hormigonera de 130 l','hormigonera 130 litros','hormigonera grande','hormigonera chica','maquina hormigonera','trompo','trompito','mezcladora de hormigon']),
  ('Caballete metálico',                array['caballete','caballetes','caballetes metalicos','caballetes de andamio','burro','burros','caballetes hecho por herreros']),
  ('Sierra circular 7 1/4"',            array['circular','sierra circular','circular de 7','circular con disco','sierra circular con disco','sierra de mano circular','circular 7 1/4']),
  ('Martillo demoledor (SDS-max)',      array['demoledor','demoledores','demoledor chico','demoledor mediano','demoledor grande','demoledor bosch','demoledor makita','demoledor makita grande','demoledor 1200w','percutor demoledor','martillo demoledor','rompepavimento','martillo electrico']),
  ('Escalera tijera de aluminio',       array['escalera','escaleras','escalera tijera','escalera de tijera','escalera aluminio','escalera de aluminio','escalera de aluminio chica','escalera aluminio tijera','escalera tijera aluminio','escalera 5 peldaños','escalera 8 peldaños','escalera 9 peldaños','escalera 11 peldaños','escalera 12 peldaños','escalera 14 peldaños','escalera 16 peldaños','escalera pintores','escalera de pintores','escalera aluminio pintores','escalera martel','escalera tijera extensible','escalera extensible tijera','escalera nueva','escalera doble']),
  ('Escalera extensible de aluminio',   array['escalera extensible','escalera extencible','escalera estencible','escalera extensible naranja','escalera extencible naranja','escalera extensible larga','escalera extensible chica','escalera extensible grande','escaleras extensibles','escalera de 8 ml','escalera aluminio 4.5','escalera 4.5','escalera corrediza','escalera de dos tramos']),
  ('Escalera recta (simple)',           array['escalera recta','escalera simple','escalera metalica recta','escalera metalica','escalera de fierro','escalera de hierro','escalera de madera','escalera de poda','escalera de 3.5 ml','escalera larga simple']),
  ('Taladro percutor',                  array['taladro','taladros','percutor','percutores','taladro percutor','taladro bosch','taladro bosch chico','taladro con mecha','taladro con mechas','taladro rojo','taladro y cargador','taladro electrico','agujereadora']),
  ('Rotomartillo (SDS-plus)',           array['rotomartillo','roto martillo','rotor martillo','rotor martilo','rotomartillo bosch','rotor martillo dewalt','rotor percutor','rotopercutor','roto percutor','rotor martillo a bateria','martillo perforador']),
  ('Atornillador a batería',            array['atornillador','atornilladora','atornilladoras','atornillador inalambrico','atornilladora inalambrica','atornilladora a bateria','atornilladora con cargador','atornilladora punta philips','atornilladora con punta philips','atornillador con punta phillips','taladro atornillador','destornillador electrico','atornillador electrico']),
  ('Nivel láser autonivelante',         array['nivel laser','nivel láser','laser','láser','nivel laser rojo','nivel laser verde','escuadra laser','nivel laser autonivelante','laser de lineas','nivel a laser']),
  ('Pistola de calor',                  array['pistola de calor','pistola termica','soplador de aire caliente','pistola de aire caliente','decapadora']),
  ('Soldadora inverter c/ careta',      array['soldador','soldadora','soldador completo','soldador completo + careta','soldador completo + mascara','soldador con careta','soldadora electrica','maquina de soldar','inverter','soldadora inverter','equipo de soldar','careta de soldar']),
  ('Caja de herramientas de mano (kit)', array['caja de herramientas','caja de herramienta','cajon de herramientas','cajon de herramientas con candado','cajon de herramientas mediano','caja de herramientas completa','caja de herramientas basica','kit de herramientas','valija de herramientas','caja de herramientas de herreros']),
  ('Hidrolavadora',                     array['hidrolavadora','hidro lavadora','hidrolavadora con manguera','hidrolavadora completa','lavadora a presion','karcher']),
  ('Motobomba / bomba de agua',         array['bomba de agua','bomba de agua completa','motobomba','bomba sumergible','bomba de achique','bomba centrifuga']),
  ('Bomba de vacío (aire acondicionado)', array['bomba de vacio','bomba de vacío','bomba vacio aire','bomba de vacio para aire acondicionado','vacuometro']),
  ('Compresor de aire',                 array['compresor','compresor chico','compresor de aire','compresor grande','compresora']),
  ('Puntal metálico regulable 5.5m',    array['puntal 5.5','puntales de 5,5m','puntales de 5.5m','puntal 5,5 m','puntal largo','acro 5.5']),
  ('Andamio tubular (cuerpo completo)', array['andamio','andamios','andamios completos','cuerpo de andamio','modulo de andamio','andamio que falta','andamio tubular','cuerpos de andamio']),
  ('Cinta pasacables 15m',              array['cinta pasacables','cinta pasacable','pasacable','pasacables','guia pasacables','cinta pasacables de 15 ml','pasa cable']),
  ('Escuadra metálica de albañil',      array['escuadra','escuadras','escuadra gris','escuadra de albañil','escuadra metalica','escuadra de carpintero']),
  ('Termofusora p/ caños PPR (fusionadora)', array['fusionadora','fucionadora','termofusora','termofusionadora','maquina de termofusion','plancha de termofusion','maquina de fusion','fusionadora de caños']),
  ('Soplete a garrafa (p/ soldar estaño)', array['soplete','soplete a gas','garrafa con soplete','garrafa para soldar','garrafa con martillo para soldar estano','soldador de estano','soplete de plomero']),
  ('Sierra ingletadora',                array['ingletadora','ingleteadora','sierra de inglete','sierra ingleteadora','ingletadora de mesa']),
  ('Malacate eléctrico (guinche)',      array['malacate','guinche','guinche electrico','aparejo electrico','malacate electrico']),
  ('Mandril p/ taladro',                array['mandril','mandriles','portabrocas','porta brocas','mandril de taladro']),
  ('Pulidora de pisos',                 array['pulidora','pulidora de piso','pulidora de pisos','maquina pulidora','maquina pulidora de piso','lustradora','lustradora de pisos']),
  ('Pinza de corte (alicate)',          array['pinza de corte','alicate','alicate de corte','pinza corte','pinza cortante','alicate corte diagonal']),
  ('Pisón manual (compactador)',        array['pison','pisón','pisones','apisonador','compactador manual','pison de mano']),
  ('Punta p/ martillo demoledor',       array['punta','puntas','punta demoledor','punta para demoledor','punta sds max','punta corta demoledor','punta larga demoledor','cincel demoledor','cortafrio demoledor']),
  ('Regla de aluminio 1.5m',            array['regla 1.5','regla de 1.5','reglas de 1.5 mts','regla de aluminio 1,5','regla 1,5 m','regla de 1,5 metros']),
  ('Sierra caladora',                   array['caladora','sierra caladora','caladora electrica','sierra caladora completa','caladora con hojas']),
  ('Tablón metálico p/ andamio',        array['tablon de chapa','tablon metalico','tablon de andamio','tablones de chapa','tablon de andamio metalico','plataforma de andamio']),
  ('Vibrador de hormigón (aguja)',      array['vibrador','vibrador grande','vibradora','vibrador de hormigon','aguja vibradora','vibrador de inmersion'])
) as v(nombre, alias)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- 3) vínculos ────────────────────────────────────────────────────────────────
create temp table vinc (item_id int, nombre text);
insert into vinc
select unnest(ids), nombre from (values
  (array[721,1205,2254,2291,2712,2741,3249,628,691,1217,1471,1759,2249,3009,1082,2241,2804,1734,1954,1824,3167,532,2340,651,765,978,1896,1838,2211], 'Amoladora angular 4 1/2" (115mm)'),
  (array[652,861,2686,2733,2855,767,3008,1496], 'Amoladora angular 7" (180mm)'),
  (array[2485], 'Amoladora angular 9" (230mm)'),
  (array[745,1211,1336,2446,2692,3023,3070,3086,3097,952,1652,1769,2259], 'Carretilla'),
  (array[458,980,1259,1862,2700,346,2087], 'Aspiradora industrial polvo y agua'),
  (array[119,1778,2033,2271,2302], 'Mezcladora eléctrica de mano (batidora p/ mortero y pintura)'),
  (array[1332,2443,746,2830,1036,3062,380,3090], 'Hormigonera 130lts (trompo)'),
  (array[876,1929,2488,3117,2059], 'Caballete metálico'),
  (array[621,987,3028,3137,1076,704,650,1242], 'Sierra circular 7 1/4"'),
  (array[966,1215,1468,2746,709,1199,1984,2026,1204,1696,973,3032,3169,2209,763,764,3000], 'Martillo demoledor (SDS-max)'),
  (array[1508,1799,1733,3027,3162,3116,1950,1220,528,1038,1168,1246,1004,3174,266,882,1374,2042,3136,3180,573,218,708,2537,1403,2623,383,2859,2208,538,2070,2036], 'Escalera tijera de aluminio'),
  (array[149,1001,3235,3238,798,2714,2082,998,397,2675,496,843,2429,2460,778], 'Escalera extensible de aluminio'),
  (array[253,2141,552,3111,1758], 'Escalera recta (simple)'),
  (array[679,886,2407,3156,762,236,1617,1635,1946,1247,2331,1978,680,2891,2252,2684], 'Taladro percutor'),
  (array[1119,1037,2072,972,3175,1757,761,760,2233], 'Rotomartillo (SDS-plus)'),
  (array[1212,1756,2928,1339,2711,774,2801,2073,2410,2216,2642,196,1736], 'Atornillador a batería'),
  (array[1221,1604,2213,1772,120,2914,3057,1834,2269,1953], 'Cortadora de cerámica'),
  (array[1347,1443,2260,1202,1356,964,1606], 'Nivel láser autonivelante'),
  (array[456,547,1722], 'Pistola de calor'),
  (array[1180,2640,2889,844,481,2234,520,3119], 'Soldadora inverter c/ careta'),
  (array[1753,2071,653,756,2999,971,773,1389,130,2310,2648], 'Caja de herramientas de mano (kit)'),
  (array[741,1534,2088], 'Hidrolavadora'),
  (array[1547], 'Motobomba / bomba de agua'),
  (array[787], 'Bomba de vacío (aire acondicionado)'),
  (array[317], 'Compresor de aire'),
  (array[1245], 'Puntal metálico regulable 5.5m'),
  (array[2439,3163], 'Andamio tubular (cuerpo completo)'),
  (array[1500], 'Cinta pasacables 15m'),
  (array[1169], 'Escuadra metálica de albañil'),
  (array[757,105], 'Termofusora p/ caños PPR (fusionadora)'),
  (array[2052], 'Soplete a garrafa (p/ soldar estaño)'),
  (array[795], 'Sierra ingletadora'),
  (array[855], 'Malacate eléctrico (guinche)'),
  (array[1170], 'Mandril p/ taladro'),
  (array[343,1365], 'Pulidora de pisos'),
  (array[1255], 'Pinza de corte (alicate)'),
  (array[961], 'Pisón manual (compactador)'),
  (array[1514], 'Punta p/ martillo demoledor'),
  (array[1174], 'Regla de aluminio 1.5m'),
  (array[3145], 'Sierra caladora'),
  (array[1352], 'Tablón metálico p/ andamio'),
  (array[2729], 'Vibrador de hormigón (aguja)')
) as v(ids, nombre);

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.descripcion,
       jsonb_build_object('motivo', 'herramientas al catalogo 2026-09-04', 'material_id', m.id, 'desc_canonica', m.nombre)
from vinc v
join public.solicitud_compra_item i on i.id = v.item_id
join public.stock_materiales m on m.nombre = v.nombre
where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = m.id, descripcion = m.nombre, clase = 'herramienta'
  from vinc v join public.stock_materiales m on m.nombre = v.nombre
 where i.id = v.item_id and i.material_id is null;

-- El ledger ya se sincroniza por trigger; se refresca la descripción por las dudas.
update public.herr_entregas e
   set descripcion = m.nombre, descripcion_norm = public.norm_txt(m.nombre), material_id = m.id, updated_at = now()
  from vinc v join public.stock_materiales m on m.nombre = v.nombre
 where e.item_id = v.item_id and e.estado <> 'anulada'
   and (e.descripcion is distinct from m.nombre or e.material_id is distinct from m.id);

drop table vinc;
