-- 20260905c — Catálogo de puntos y tomas: módulos, bastidores, tapas y llaves armadas
--
-- Pedido del user 2026-09-05: completar el catálogo de electricidad con el sistema
-- modular (Kalop línea Civil, códigos KD/KS, y Cambre Siglo XXII, códigos 021-),
-- que es lo que compran en Voltaje. Fuentes: kalop.com.ar (categoría Civil y
-- conjuntos armados), cambre.com.ar (tapas y módulos Siglo XXII), listados de
-- Ropelato / Complementos Eléctricos (códigos y precios web 09/2026).
--
-- El sistema tiene TRES familias y el catálogo las mezclaba:
--   · MÓDULO: la pieza suelta (punto, toma, combinación, ciego…) que va en un bastidor.
--   · BASTIDOR + TAPA: el soporte (3 módulos "10x5", mignon "5x5" de 2, 4, 6) y su tapa.
--   · LLAVE ARMADA ("lista"): bastidor + tapa + módulos ya montados (Kalop KS4075x).
-- Las filas viejas "Interruptor simple/doble", "Tomacorriente simple/doble/20A" y
-- "Combinación toma+inter" son las llaves armadas (sus precios vienen de "llave
-- lista 1 punto / 2 puntos" de Voltaje): se renombran como armadas y el nombre
-- viejo queda de alias. "Interruptor combinación" (251) es el MÓDULO (precio del
-- "módulo combinación" de Voltaje) y se renombra así. Los renombres se propagan
-- a los renglones y a la cuenta (no cobrados).
--
-- Precios: solo donde hay compra propia o precio web claro (final, con nota);
-- el resto en $0 hasta la primera factura. Colores: blanco por defecto.

-- 1) renombres de las filas existentes ───────────────────────────────────────
create temp table ren (id int, nombre text, alias text[], obs text);
insert into ren values
  (53,   'Llave armada 1 punto (bastidor + tapa)',      array['interruptor simple','llave lista 1 punto','llave 1 punto','1 punto','un punto','llave un punto','kalop ks40750','conjunto armado 1 interruptor','llave de luz 1 punto'], 'Conjunto armado Kalop Civil KS40750 (bastidor + tapa + 1 módulo punto). Voltaje "llave lista 1 punto".'),
  (54,   'Llave armada 2 puntos (bastidor + tapa)',     array['interruptor doble','llave lista 2 puntos','llave 2 puntos','2 puntos','dos puntos','llave dos puntos','kalop ks40751','conjunto armado 2 interruptores'], 'Conjunto armado Kalop Civil KS40751. Voltaje "llave lista 2 puntos".'),
  (55,   'Llave armada punto + toma 10A (bastidor + tapa)', array['combinacion toma+inter','combinacion toma inter','punto y toma','llave punto y toma','1 punto y 1 toma','kalop ks40754','conjunto armado 1 interruptor y 1 tomacorriente'], 'Conjunto armado Kalop Civil KS40754 (1 punto + 1 toma 10A).'),
  (1253, 'Toma armada simple 10A (bastidor + tapa)',    array['tomacorriente simple','toma simple','toma simple armada','1 toma','una toma','kalop ks40752','conjunto armado 1 tomacorriente'], 'Conjunto armado Kalop Civil KS40752.'),
  (52,   'Toma armada doble 10A (bastidor + tapa)',     array['tomacorriente doble','toma doble','toma doble armada','2 tomas','dos tomas','llave 2 tomas','kalop ks40753','conjunto armado 2 tomacorrientes','kd40251'], 'Conjunto armado Kalop Civil KS40753 (2 tomas 10A).'),
  (748,  'Toma armada 20A (bastidor + tapa)',           array['tomacorriente 20a','toma 20a','toma 20 amperes','kalop ks40759','conjunto armado tomacorriente 20a'], 'Conjunto armado Kalop Civil KS40759.'),
  (251,  'Módulo combinación 10A',                      array['interruptor combinacion','modulo combinacion','llave de combinacion','llave de escalera','interruptor escalera','combinacion','kalop kd40115','kl40115','cambre 021-09501','modulo interruptor combinacion'], 'Módulo suelto (va en bastidor). Kalop Civil KD40115 / Cambre Siglo XXII 021-09501. Voltaje "módulo combinación".'),
  (1173, 'Tapa 1 módulo blanca (10x5)',                 array['tapa 1 modulo','tapa un modulo','tapa punto simple','tapa toma simple','tapa 1 punto','tapa cambre 1 modulo','cambre 021-04501','tapa 1 modulo cambre (punto simple)'], 'Cambre Siglo XXII 021-04501 (10x5). En Kalop Civil la tapa de 1 módulo es la misma tapa de 3 con 2 tapones.'),
  (1176, 'Tapa 2 módulos blanca (10x5)',                array['tapa 2 modulos','tapa dos modulos','tapa toma doble','tapa 2 puntos','tapa punto y toma','tapa cambre 2 modulos','cambre 021-04502','tapa 2 modulos cambre (toma doble)'], 'Cambre Siglo XXII 021-04502 (10x5).'),
  (1001, 'Tapa 3 módulos blanca (10x5)',                array['tapa 3 modulos','tapa tres modulos','tapa 3 puntos','tapa kalop 3','kalop kd40710','ks40710','cambre 021-04503','tapa civil 10x5','tapa 3 modulos blanca'], 'Kalop Civil KD40710 / KS40710, Cambre Siglo XXII 021-04503.'),
  (962,  'Bastidor 3 módulos (10x5)',                   array['bastidor','bastidor 3 modulos','bastidor universal','bastidor 10x5','bastidor rectangular','bastidor kalop','kalop kd40702','ks40702','cambre 021-06950','bastidor std policarbonato'], 'Kalop Civil KD40702 (universal) / Cambre 021-06950. Para cajas 10x5.'),
  (255,  'Tapa ciega blanca (10x5)',                    array['tapa ciega','tapa ciega cambre','tapas ciegas','tapa ciega kalop','kalop ks40713','tapa civil ciega'], 'Kalop Civil KS40713.'),
  (961,  'Módulo tapón ciego',                          array['tapon ciego','modulo ciego','modulo tapon','kalop kd40570','cambre modulo ciego 1 modulo'], 'Kalop Civil KD40570.'),
  (267,  'Módulo pulsador (timbre)',                    array['pulsador de timbre','pulsador','modulo pulsador','interruptor pulsador','boton de timbre','cambre 021-09502'], 'Módulo suelto. Cambre Siglo XXII 021-09502.'),
  (252,  'Módulo toma TV coaxil',                       array['toma tv','toma tv coaxil','modulo tv','modulo catv','toma coaxil','modulo videocable','kalop ks40755 (armado)'], 'Módulo suelto (Kalop "1 módulo CATV" armado = KS40755).'),
  (253,  'Módulo toma RJ45 (datos)',                    array['toma rj45','toma rj45 datos','modulo rj45','modulo cambre red','toma de red cambre','rj45 cambre','modulo de red','toma de red'], 'Módulo suelto.'),
  (254,  'Módulo toma telefónica RJ11',                 array['toma telefono rj11','toma telefono','modulo telefonico','rj11','kalop ks40756 (armado)'], 'Módulo suelto (Kalop armado = KS40756).');

update public.stock_materiales m
   set nombre = r.nombre,
       alias  = array(select distinct unnest(m.alias || r.alias || array[lower(m.nombre)])),
       obs    = coalesce(m.obs || ' · ', '') || r.obs || ' (2026-09-05)',
       updated_at = now()
  from ren r where m.id = r.id and m.nombre <> r.nombre;

-- el nombre nuevo baja a los renglones y a la cuenta (no cobrados)
update public.solicitud_compra_item i set descripcion = m.nombre
  from public.stock_materiales m join ren r on r.id = m.id
 where i.material_id = m.id and i.descripcion <> m.nombre
   and lower(i.descripcion) = any(array(select lower(unnest(m.alias))));
update public.materiales_a_cuenta_cliente c set descripcion = i.descripcion, updated_at = now()
  from public.solicitud_compra_item i join ren r on r.id = i.material_id
 where c.item_id = i.id and c.cobro_id is null and c.descripcion <> i.descripcion;
drop table ren;

-- "Interruptor escalera" es la combinación: si nadie lo usó, se da de baja
update public.stock_materiales set activo = false,
       obs = coalesce(obs || ' · ', '') || 'Baja 2026-09-05: la llave de escalera es el módulo combinación (251).'
 where id = 250 and not exists (select 1 from public.solicitud_compra_item where material_id = 250);

-- 2) altas ───────────────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, 'unid', v.precio_ref, 2, v.alias, 'material', 'Alta 2026-09-05 (catálogo de puntos y tomas). ' || v.obs
from (values
  -- módulos
  ('Módulo punto 10A (interruptor unipolar)', 1651.41,
     array['modulo punto','modulo 1 punto','modulo de 1 punto','modulo interruptor','modulo interruptor unipolar','punto 10a','tecla punto','kalop kd40100','cambre 021-09500','modulo punto kalop'],
     'Kalop Civil KD40100 / Cambre Siglo XXII 021-09500. Precio web Ropelato 09/2026 $1.651,41.'),
  ('Módulo toma 10A (2P+T)', 1863.07,
     array['modulo toma','modulo toma 10a','toma 10a modulo','modulo tomacorriente','toma simple modulo','modulo toma dual','kalop kd40245','kl40245','cambre tomacorriente 10a modulo'],
     'Kalop Civil KD40245 (dual 2x10A c/ tierra) / Cambre Siglo XXII. Precio web Ropelato 09/2026 $1.863,07.'),
  ('Módulo toma 20A (2P+T)', 4379.77,
     array['modulo toma 20a','toma 20a modulo','modulo tomacorriente 20a','kalop kl40235','kd40235','cambre tomacorriente 20a modulo'],
     'Kalop Civil KL40235 / Cambre Siglo XXII. Precio web Ropelato 09/2026 $4.379,77.'),
  ('Módulo USB doble (cargador)', 0,
     array['modulo usb','modulo usb doble','usb doble','cargador usb modulo','toma usb','kalop ks40809 (armado)','cambre modulo usb a'],
     'Módulo suelto (Kalop armado 1 módulo USB doble = KS40809). Sin precio.'),
  ('Módulo dimmer LED', 0,
     array['dimmer','modulo dimmer','dimmer led','regulador de luz','atenuador'],
     'Cambre Siglo XXII módulo dimmer LED. Sin precio.'),
  -- bastidores
  ('Bastidor mignon 2 módulos (5x5)', 916.37,
     array['bastidor mignon','bastidor 5x5','bastidor chico','bastidor mignon 2 modulos','kalop kl40706','cambre bastidor mignon'],
     'Kalop Civil KL40706 / Cambre bastidor mignón 5x5. Precio web Ropelato 09/2026 $916,37 (grafito).'),
  ('Bastidor 4 módulos', 0,
     array['bastidor 4 modulos','bastidor cuatro modulos','bastidor 4 mod'],
     'Sin precio.'),
  ('Bastidor 6 módulos (doble)', 0,
     array['bastidor 6 modulos','bastidor doble','bastidor 6 mod'],
     'Sin precio.'),
  -- tapas
  ('Tapa 4 módulos blanca (10x5)', 0,
     array['tapa 4 modulos','tapa cuatro modulos','tapa 4 mod','cambre 021-04504'],
     'Cambre Siglo XXII 021-04504. Sin precio.'),
  ('Tapa 6 módulos blanca', 0,
     array['tapa 6 modulos','tapa seis modulos','tapa doble','kalop ks40760'],
     'Kalop Civil KS40760. Sin precio.'),
  ('Tapa mignon 1 módulo blanca (5x5)', 1188.30,
     array['tapa mignon','tapa mignon 1 modulo','tapa 5x5','tapa 5x5 1 modulo','kalop ks40730','cambre 021-04541'],
     'Kalop Civil KS40730 / Cambre Siglo XXII 021-04541. Precio web Ropelato 09/2026 $1.188,30.'),
  ('Tapa mignon 2 módulos blanca (5x5)', 0,
     array['tapa mignon 2 modulos','tapa 5x5 2 modulos','cambre 021-04542'],
     'Cambre Siglo XXII 021-04542. Sin precio.'),
  -- llaves armadas que faltaban
  ('Llave armada 3 puntos (bastidor + tapa)', 0,
     array['llave lista 3 puntos','llave 3 puntos','3 puntos','tres puntos','llave tres puntos','conjunto armado 3 interruptores'],
     'Bastidor + tapa + 3 módulos punto. Sin precio.'),
  ('Llave armada combinación (bastidor + tapa)', 0,
     array['llave lista combinacion','llave combinacion armada','combinacion armada','kalop ks40757','conjunto armado 1 interruptor combinacion'],
     'Conjunto armado Kalop Civil KS40757. Sin precio.'),
  ('Llave armada 2 puntos + toma 10A (bastidor + tapa)', 0,
     array['2 puntos y toma','llave 2 puntos y toma','dos puntos y una toma','llave lista 2 puntos y toma','2 puntos 1 toma'],
     'Bastidor + tapa + 2 puntos + 1 toma 10A. Sin precio.'),
  ('Llave armada punto + combinación (bastidor + tapa)', 0,
     array['punto y combinacion','llave punto y combinacion','1 punto 1 combinacion','llave lista punto y combinacion'],
     'Bastidor + tapa + 1 punto + 1 combinación. Sin precio.'),
  ('Toma armada USB + toma 10A (bastidor + tapa)', 0,
     array['usb y toma','toma con usb','usb mas toma','kalop ks40810','conjunto armado usb tomacorriente 10a'],
     'Conjunto armado Kalop Civil KS40810. Sin precio.')
) as v(nombre, precio_ref, alias, obs)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));
