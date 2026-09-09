-- 20260912b — Precios de referencia de internet, tanda 2: las 50 fichas de confianza media/baja (o
-- refutadas) que el user aprobó una por una en la planilla "Precios que faltan" (artifact, 08/09 a la
-- noche), más el renglón de texto libre que decidió. Mismo mecanismo que 20260912a: fijar_precio_ref con
-- la cita en obs y tasación de los renglones en $0 con las guardas (precio en 0 · no cobrado · no
-- certificado · pagado por CADINC · unidad_compatible).
--
-- Dos precios los puso el user distinto de la propuesta: 1549 Pintura de látex blanca por litro
-- $10.003 (el agente decía $3.400) y 802 Esmalte sintético naranja x 4 lts $160.000 (el agente $90.000,
-- confianza baja). 901 Cuña de madera va a $90 (el auditor refutó los $400 del buscador).
-- 380 Tornillo autoperforante 10mm: nota del user "son los T1".
-- Probado con rollback antes de aplicar: 50 fichas, 79 renglones tasados, $2.834.877; quedan 198 en $0.
--
--   ficha  precio      cant   ficha
--   1244    180000.00       3  Caño mecánico 4" x 6m
--   506     400499.00       1  Puerta exterior chapa reforzada
--   781       3300.00     115  Alambrón
--   911       4950.00      70  Ripio bruto fino x bolsa
--   894      34995.00       4  Cono de señalización vial 50cm
--   834       6500.00      20  Cable de acero 10mm
--   412     103000.00       1  Perfil C 160x60x20 x 6m
--   1251      9500.00       8  Canaleta de chapa galvanizada a medida (por metro)
--   893      36300.00       2  Malla naranja de cerramiento
--   556       4100.00      15  Alfajía pino 1x2" x 3.35m
--   154      60000.00       1  Perfil C 100x50x15 x 6m
--   1550     60000.00       1  Escalera de madera chica
--   526      55000.00     0.9  Reja p/ ventana a medida
--   491       3720.00      11  Soporte p/ canaleta
--   892       2500.00      15  Mandil de trabajo
--   1254     28000.00       1  Rueda p/ carretilla (repuesto)
--   638      25000.00       1  Tablón pino encofrado 1" x 4m
--   1059     11540.00       2  Guante vaqueta amarilla
--   778       2880.00       7  Ácido muriático x litro
--   800       2750.00       7  Pincel 1-1/2"
--   731       9350.00       2  Caño de chapa galvanizada 100mm (ventilación)
--   751      18000.00       1  Térmica tripolar
--   784       6000.00       3  Piola de albañil x 50m
--   828       7800.00       2  Escobillón
--   734      13000.00       1  Desagüe flexible cromado 40cm p/ pileta
--   1035      1600.00       8  Colgador p/ alacena
--   844        495.00      24  Bolsa de consorcio
--   1549     10003.00       1  Pintura de látex blanca (por litro)   (precio del user)
--   901         90.00     107  Cuña de madera p/ encofrado
--   870       3200.00       3  Disco desbaste 115mm
--   838       9350.00       1  Fleje perforado galvanizado
--   411       8955.00       1  Alambre galvanizado N°14
--   919       1040.00       8  Tirafondo 10mm
--   1556      6900.00       1  Mecha widia 10mm
--   815        750.00       9  Lápiz de carpintero
--   374        500.00      12  Lija p/ madera N°120
--   339       2750.00       2  Fratacho espuma
--   756        538.00      10  Prensacable PG
--   1220       100.00      50  Terminal puntera doble p/ cable 2.5mm²
--   842        750.00       6  Tirafondo 8mm
--   792        390.00      11  Estaca de madera p/ replanteo
--   934        100.00      40  Arandela plana 1/2"
--   380         17.00     210  Tornillo autoperf. punta mecha 10mm
--   835       2850.00       1  Cinta de embalar transparente 48mm
--   1548      2800.00       1  Caño pluvial 40mm
--   826         85.00       6  Tarugo p/ ladrillo hueco 8mm
--   802     160000.00       0  Esmalte sintético naranja x 4lts   (precio del user)
--   890      80300.00       0  Mortero de reparación estructural x 25kg
--   90       28000.00       0  Arena fina
--   955      37500.00       0  Chapón de hierro calibre 16

select public.fijar_precio_ref(1244, 180000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $180.000 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: MercadoLibre - DSM Depósito San Martín $191100 (Caño uso mecánico 4" 114,3 x 3,2 mm, barra de 6,40 m ($181.545 llevando 10 o más)).')
 where id = 1244;

select public.fijar_precio_ref(506, 400499, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $400.499 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Sodimac - Oblak M3710B $400499 (puerta exterior de chapa inyectada 80x200x7, hoja + marco, blanca, 1 unidad).')
 where id = 506;

select public.fijar_precio_ref(781, 3300, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $3.300 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Red Materiales (comparador de corralones, actualizado 9/9/2026) $3323 (Hierro liso 6 mm por kg, promedio de corralones (rango $2.247 a $4.400/kg)).')
 where id = 781;

select public.fijar_precio_ref(911, 4950, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $4.950 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Prima Porta (San Martín, Bs. As.) $4578.16 (Piedra partida x bolsa 25 kg).')
 where id = 911;

select public.fijar_precio_ref(894, 34995, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $34.995 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Easy $34995 (1 cono de tránsito PVC 47 cm naranja con 2 bandas reflectivas de 8 cm (marca DP)).')
 where id = 894;

select public.fijar_precio_ref(834, 6500, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $6.500 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Martc Tools (tienda online .com.ar) - Toho 6x19+FC galvanizado $267700 (rollo 50 m (precio con 10% dto.')
 where id = 834;

select public.fijar_precio_ref(412, 103000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $103.000 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Tubo Center S.A. (tubocenter.com.ar) $182961.18 (Perfil C 160x60x20x2.00 GAL, barra estándar de 12 m (se corta a pedido)).')
 where id = 412;

select public.fijar_precio_ref(1251, 9500, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $9.500 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Serrano Aceros y Más (Córdoba) - Canaleta galvanizada cuadrada americana x 1 m $9320.56 (tramo de 1 m, calibre 25 (0,5 mm) o 30.')
 where id = 1251;

select public.fijar_precio_ref(893, 36300, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $36.300 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Comercial Argentina (ferretería online) $57312.64 (rollo 1 m x 50 m, malla demarcatoria cuadriculada, precio con impuestos (sin impuestos $47.365,82)).')
 where id = 893;

select public.fijar_precio_ref(556, 4100, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $4.100 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Sodimac Argentina - El Dorado $3799 (Listón pino cepillado 1" x 2" x 3.05 m, precio de lista (promo -15%: $3.239)).')
 where id = 556;

select public.fijar_precio_ref(154, 60000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $60.000 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: MercadoLibre - Gramabi $77099 (barra de 6 m).')
 where id = 154;

select public.fijar_precio_ref(1550, 60000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $60.000 (referencia de internet, confianza baja, OK del user en la planilla). Fuentes: Easy - Mc Carthy $79400 (Escalera pintor de madera 6 escalones, 1 unidad).')
 where id = 1550;

select public.fijar_precio_ref(526, 55000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $55.000 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: El Outlet Aberturas (tienda online .com.ar) $58699 (Reja hierro macizo redondo 10 mm, 1,00 x 1,00 m (1 m2), precio final con IVA (sin impuestos $48.51.')
 where id = 526;

select public.fijar_precio_ref(491, 3720, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $3.720 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Easy - Aurelio Gundin (Soporte Media Caña 15 cm chapa galvanizada) $3430 (1 unidad).')
 where id = 491;

select public.fijar_precio_ref(892, 2500, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $2.500 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: MercadoLibre / Alberdi Ofertas (Mercado Líder Platinum) $25970 (pack x10 fratacho plástico goma espuma reforzado revoque fino 30 cm (= $2.597/unid)).')
 where id = 892;

select public.fijar_precio_ref(1254, 28000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $28.000 (referencia de internet, confianza baja, OK del user en la planilla). Fuentes: Easy (referencia indirecta: carretilla completa con rueda neumática) $208700 (Carretilla Rueda Neumática 90 Lts Deper, unidad completa (no la rueda su.')
 where id = 1254;

select public.fijar_precio_ref(638, 25000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $25.000 (referencia de internet, confianza baja, OK del user en la planilla). Fuentes: Sodimac Argentina $10699 (Tabla pino cepillado El Dorado 1" x 6" x 3.05 m (unidad)).')
 where id = 638;

select public.fijar_precio_ref(1059, 11540, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $11.540 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Easy - Guante de Vaqueta Nacional Amarillo DP $11540 (par).')
 where id = 1059;

select public.fijar_precio_ref(778, 2880, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $2.880 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Mottesi Materiales $14390.59 (bidón 5 lts (precio final con IVA)).')
 where id = 778;

select public.fijar_precio_ref(800, 2750, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $2.750 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Perreny Cía (pinturería online) $2748 (1 pincel El Galgo Silver N°15 cerda).')
 where id = 800;

select public.fijar_precio_ref(731, 9350, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $9.350 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Easy - El Fontanero (caño 1 m) $9350 (Caño redondo para ventilación 100 mm x 1 m, chapa galvanizada (tramo de 1 m)).')
 where id = 731;

select public.fijar_precio_ref(751, 18000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $18.000 (referencia de internet, confianza baja, OK del user en la planilla). Fuentes: Sodimac Argentina (referencia bipolar, no tripolar) $19079 (Llave termica Schneider 2 x 25A 4.5kA, 1 unidad (bipolar)).')
 where id = 751;

select public.fijar_precio_ref(784, 6000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $6.000 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Sodimac Argentina - Tanza/hilo para albañil Silver Shadow (nylon) $8929 (rollo de hilo nylon para albañil (metraje no indicado en la ficha)).')
 where id = 784;

select public.fijar_precio_ref(828, 7800, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $7.800 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Sodimac (Kleine Wolke) - escobillón suave 31 cm + cabo de madera 120 cm $3399 (Cabeza de escobillón 31 cm $3.399 (sin cabo).')
 where id = 828;

select public.fijar_precio_ref(734, 13000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $13.000 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Tuboland (tuboland.com.ar) $9460 (1 unid - Fuelle PVC extensible cromo para descarga lavatorio/cocina 40/50 (sin stock al consultar)).')
 where id = 734;

select public.fijar_precio_ref(1035, 1600, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $1.600 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: CAB Herrajes (cab.com.ar) $3129 (par (2 colgadores + 2 placas de montaje), precio final con IVA).')
 where id = 1035;

select public.fijar_precio_ref(844, 495, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $495 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Easy (Good, consorcio 90x120 x10) $7295 (pack x10 bolsas 90x120 negras).')
 where id = 844;

select public.fijar_precio_ref(1549, 10003, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $10.003 (precio del user en la planilla). Fuentes: Sodimac Argentina - Andina látex int/ext blanco mate $49999 (balde 20 lts (≈ $2.500/lt)).')
 where id = 1549;

select public.fijar_precio_ref(901, 90, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $90 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: MercadoLibre - Cuñas de madera para encofrado x 50 unidades (grandis/maderas duras 1 1/2" x 3" x 16 cm) $19000 (pack x 50 unidades).')
 where id = 901;

select public.fijar_precio_ref(870, 3200, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $3.200 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Sodimac Argentina $3299 (Disco desbaste metal 115 mm Dewalt, 1 unidad).')
 where id = 870;

select public.fijar_precio_ref(838, 9350, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $9.350 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Easy $9350 (Fleje perforado chapa galvanizada 19 mm x 6 m (rollo), marca Aurelio Gundin).')
 where id = 838;

select public.fijar_precio_ref(411, 8955, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $8.955 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Easy - SC Metalúrgica $8955 (Alambre Galvanizado N°14 x 1 kg).')
 where id = 411;

select public.fijar_precio_ref(919, 1040, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $1.040 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Sodimac $6099 (Pote 10 tacos Fischer SX10 (10 mm) + tirafondo 1/4 x 2 1/4 (10 unid)).')
 where id = 919;

select public.fijar_precio_ref(1556, 6900, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $6.900 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Easy - Venturo $6800 (1 broca de widia 10x130 mm Venturo).')
 where id = 1556;

select public.fijar_precio_ref(815, 750, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $750 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: El Ferretero (ferretería online) $564.24 (1 lápiz carpintero MOTA 18 cm).')
 where id = 815;

select public.fijar_precio_ref(374, 500, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $500 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: CENFER Ferretería (Lija Rubi Abradur madera grano 120, cod. 5159) $800 (hoja/pliego suelto 230x280).')
 where id = 374;

select public.fijar_precio_ref(339, 2750, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $2.750 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Sodimac - Maez $1699 (1 unidad, fratacho plástico con goma espuma 25 cm).')
 where id = 339;

select public.fijar_precio_ref(756, 538, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $538 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Easy - Cabletextil $2690 (Kit prensacable plástico blanco x 5 unidades).')
 where id = 756;

select public.fijar_precio_ref(1220, 100, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $100 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: HobbyTronica (Hemmel CIFD2512) $5790 (bolsa x100 punteras dobles 2x2,5mm2 (x50 a $4.490)).')
 where id = 1220;

select public.fijar_precio_ref(842, 750, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $750 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Easy - Tirafondo cincado 5/16 x 2 1/2 (7,94x63,5 mm) TEL $20815 (caja x40 unidades, sin tarugo (≈ $520/u)).')
 where id = 842;

select public.fijar_precio_ref(792, 390, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $390 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: MercadoLibre - Maderera San Eduardo $3900 (pack x10 estacas saligna 2,5x2,5 cm x 40 cm).')
 where id = 792;

select public.fijar_precio_ref(934, 100, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $100 (referencia de internet, confianza baja, OK del user en la planilla). Fuentes: .')
 where id = 934;

select public.fijar_precio_ref(380, 17, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $17 (referencia de internet, confianza media, OK del user en la planilla; nota del user: son los T1). Fuentes: Canela Pinturerías $14.02 (por unidad (precio promo.')
 where id = 380;

select public.fijar_precio_ref(835, 2850, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $2.850 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Sodimac Argentina $2999 (Cinta para embalar Ajec 48 x 90 m transparente, 1 rollo).')
 where id = 835;

select public.fijar_precio_ref(1548, 2800, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $2.800 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Sodimac Argentina - Tigre $11199 (Caño sanitario PVC 40 mm x 4 m (barra)).')
 where id = 1548;

select public.fijar_precio_ref(826, 85, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $85 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Easy $3830 (Tarugo Nylon N°8 Universal x 30 un Fischer (tipo UX, apto ladrillo hueco) = $128/u).')
 where id = 826;

select public.fijar_precio_ref(802, 160000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $160.000 (precio del user en la planilla). Fuentes: Sodimac - Tersuave esmalte sintético bermellón brillante lavable 4 L $99999 (lata 4 L (color bermellón, vivo, mismo escalón de precio que naranja)).')
 where id = 802;

select public.fijar_precio_ref(890, 80300, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $80.300 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Tecno Barracas $74594 (Sika MonoTop-615 bolsa 25 kg (IVA incluido)).')
 where id = 890;

select public.fijar_precio_ref(90, 28000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $28.000 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Red Materiales (comparador de corralones, actualizado 09/2026) $45078 (Arena fina a granel, promedio por m3 (rango $24.500 a $60.000), sin flete).')
 where id = 90;

select public.fijar_precio_ref(955, 37500, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: $37.500 (referencia de internet, confianza media, OK del user en la planilla). Fuentes: Hierros Torrent (tienda online) $111624 (Chapa lisa LAC (laminada en caliente) Nº16, 1,59 mm, hoja 1,22 x 2,44 m (2,977 m2)).')
 where id = 955;

select set_config('cadinc.mcc_fuente', 'tasacion_catalogo_hoy', true);

update public.materiales_a_cuenta_cliente c
   set precio_unit  = m.precio_ref,
       precio_total = round(c.cantidad * m.precio_ref, 2),
       updated_at   = now(),
       updated_by   = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.solicitud_compra_item i
  join public.stock_materiales m on m.id = i.material_id
 where i.id = c.item_id and m.id in (1244, 506, 781, 911, 894, 834, 412, 1251, 893, 556, 154, 1550, 526, 491, 892, 1254, 638, 1059, 778, 800, 731, 751, 784, 828, 734, 1035, 844, 1549, 901, 870, 838, 411, 919, 1556, 815, 374, 339, 756, 1220, 842, 792, 934, 380, 835, 1548, 826, 802, 890, 90, 955)
   and coalesce(c.precio_unit, 0) = 0 and c.cobro_id is null and c.certificado_id is null
   and coalesce(c.pagado_por, 'cadinc') = 'cadinc'
   and m.precio_ref > 0 and public.unidad_compatible(c.unidad, m.unidad);

update public.solicitud_compra_item i
   set precio_unit = c.precio_unit
  from public.materiales_a_cuenta_cliente c
 where c.item_id = i.id and i.material_id in (1244, 506, 781, 911, 894, 834, 412, 1251, 893, 556, 154, 1550, 526, 491, 892, 1254, 638, 1059, 778, 800, 731, 751, 784, 828, 734, 1035, 844, 1549, 901, 870, 838, 411, 919, 1556, 815, 374, 339, 756, 1220, 842, 792, 934, 380, 835, 1548, 826, 802, 890, 90, 955)
   and coalesce(i.precio_unit, 0) = 0 and c.precio_unit > 0
   and c.updated_at >= now() - interval '5 minutes'
   and c.updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid;

-- ═══ texto libre decidido en la planilla ═══
-- mcc 74 (CC VALLE FERTIL, 01/06, "Pintura 6106", 1 unid): "como la Enduring Bronze de precio" (user) =
-- $49.200, la lata de 4 lts de esmalte SW 7055 (ficha 2637). Solo el precio: SW 6106 es Kilim Beige, otro producto.
select set_config('cadinc.mcc_fuente', 'planilla_precios_que_faltan', true);
update public.materiales_a_cuenta_cliente c
   set precio_unit = 49200, precio_total = round(c.cantidad * 49200, 2), updated_at = now(),
       updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where c.id = 74 and coalesce(c.precio_unit, 0) = 0 and c.cobro_id is null and c.certificado_id is null;
update public.solicitud_compra_item i
   set precio_unit = 49200,
       obs = trim(both ' ' from coalesce(i.obs, '') || ' · 09/09/2026: precio como el esmalte SW 7055 Enduring Bronze x 4 lts, $49.200 (user, planilla).')
  from public.materiales_a_cuenta_cliente c
 where c.item_id = i.id and c.id = 74 and coalesce(i.precio_unit, 0) = 0 and c.precio_unit = 49200;
