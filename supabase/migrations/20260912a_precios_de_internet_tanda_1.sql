-- 20260912a — Precios de referencia buscados en internet, tanda 1: las fichas sin precio con
-- renglones en $0 en la cuenta de clientes (user 08/09: "vamos con 3, resolvamos los que más influyan").
--
-- 90 fichas buscadas por 90 agentes en paralelo (2 a 4 búsquedas cada uno, comercios .com.ar,
-- precio FINAL con IVA en la unidad de la ficha); las que mueven más de $30.000 pasaron además por
-- un auditor que intentó refutarlas. Acá van SOLO las de confianza ALTA (2+ fuentes del producto
-- exacto, coherentes) y no refutadas. Las de confianza media/baja y las refutadas esperan el OK del
-- user en la planilla "Precios que faltan" (artifact) y van en la tanda 2.
--
-- Cada precio queda en el historial con fuente 'manual' y la cita en obs. Después se tasan los
-- renglones en $0 con las guardas de siempre: precio en 0 · no cobrado · no certificado · unidad_compatible.
-- Probado con rollback antes de aplicar: 38 fichas, 81 renglones tasados, $4.898.875,50.
--
--   ficha  precio      cant   renglones  ficha
--   656      92000.00      30   13        Arnés seguridad 3 puntos
--   353     119612.00       3    2        Pintura epoxi pisos x 4lts
--   345       6500.00      50    3        Fijador sellador x 1lt
--   896      29000.00      10    3        Poste delimitador de obra
--   875       4990.00   54.45   13        Babeta de chapa plegada
--   1235     52000.00       2    1        Panel LED 30x120 40W (embutir)
--   923      75100.00       1    1        Caño estructural 100x50x1.6 x 6m
--   746       1800.00      41    3        Cable tipo taller 2x1.5mm² sin marca
--   904      33000.00       2    2        Engrasadora manual
--   662      15500.00       4    2        Delantal de cuero soldador
--   149       9600.00       6    4        Silicona transparente 280ml
--   898      26600.00       2    1        Capa de lluvia naranja
--   762      25800.00       2    1        Luz de emergencia LED
--   818       4300.00      11    6        Virulana de acero
--   655      46000.00       1    1        Máscara soldar fotosensible
--   111      39000.00       1    1        Hidrófugo x 20lts
--   157      32157.00       1    1        Ángulo 1-1/2" x 1/8" x 6m
--   168       5100.00       6    1        Disco corte 230mm
--   146       8099.00       3    3        Candado 40mm
--   936      29000.00    0.72    1        Porcelanato 60x120
--   362       9500.00       2    1        Pincel 4"
--   866       5600.00       2    2        Mecha widia 12mm
--   765        145.00      64    2        Tarugo mariposa p/ placa de yeso
--   1219      3000.00       3    2        Cinta de pintor 18mm
--   187       8600.00       1    1        Curva PVC 110mm larga
--   867       4000.00       2    2        Mecha widia 6mm
--   794       2600.00       3    2        Brocha N°15
--   862       3600.00       2    2        Mecha widia 8mm
--   827       7100.00       1    2        Detergente x 5lts
--   913       4665.00       1    1        Limpiador cremoso (Cif)
--   916       2300.00       2    2        Rodillo epoxi N°5
--   829       3900.00       1    3        Lavandina x 5lts
--   652       3695.00       1    1        Guante latex multiuso
--   646       1290.00       2    1        Protector auditivo endoaural
--   900       2500.00       1    1        Protector facial
--   130        680.00       1    1        Lija al agua N°100
--   803      58000.00       0    2        Pintura demarcación vial amarilla x 4lts
--   806      22000.00       0    1        Removedor de pintura en gel x 1lt

select public.fijar_precio_ref(656, 92000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $92.000 de internet (La Tienda Ferretera $101335 (1 arnés Eslingar Essential 3 puntos con cabo de vida 1,5 m con amortiguador); Provincia Compras $90075.68 (1 arnés Eslingar Essential 3 puntos con cabo de vida 1,5 m (precio con 20% dto, lista $112.594,61)); DFG $94449 (1 arnés IRAM 3622-1 con cabo de vida 1,5 m y mosque).')
 where id = 656;

select public.fijar_precio_ref(353, 119612, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $119.612 de internet (Pinturería Proxecto $114680 (Esmalte Epoxi Pisos Alto Tránsito HB Sinteplast, lata 4 lts, blanco); Motta Decoraciones $119612 (Esmalte Epoxi para Piso Sinteplast gris, kit 4 lts (A+B); lista $159.483 con 25% off por transferencia); Rex (somosrex.com) $130920 (Recufloor Esmalte Epoxi Pisos Alto Tráns).')
 where id = 353;

select public.fijar_precio_ref(345, 6500, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $6.500 de internet (Sodimac Argentina (Andina) $6299 (lata/balde 1 L (precio con 10% dto, lista $6.999)); Pinturerías Sagitario (Sinteplast) $8700 (lata 1 L); Pinturerías Sagitario (Alba) $11874 (lata 1 L (con 20% dto))).')
 where id = 345;

select public.fijar_precio_ref(896, 29000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $29.000 de internet (MercadoLibre - MUNDO OFI-MAX $29999 (Poste demarcatorio vial para cadena plástica, x unidad (con base)); MercadoLibre - NELLO $28300 (Poste para cadena base de goma LB-90, x unidad); MercadoLibre - SEGNALETICA $26300 (Poste columna demarcatoria vial para cadena, por unidad (amarillo y negro))).')
 where id = 896;

select public.fijar_precio_ref(875, 4990, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $4.990 de internet (Serrano - Aceros y Más $4068.9 (babeta galvanizada calibre 30, por metro lineal (final con IVA; sin IVA $3.362,73)); MercadoLibre - GEA Zinguería $4990 (babeta sobre chapa/teja, chapa galvanizada C30 Ternium, tira de 1 metro lineal (lista $5.240)); MercadoLibre - Zinguerías (tienda.zinguerias.com) $).')
 where id = 875;

select public.fijar_precio_ref(1235, 52000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $52.000 de internet (Sieteiluminación (Lumenac, backlight 40W) $52320 (1 panel 120x30 cm 40W de embutir, IVA incluido); Electrolineas (Sica 40W luz día) $50761.72 (1 artefacto embutir LED 120x30 40W); Ciardi (40W 6000K) $38196.52 (1 panel LED embutir 30x120 40W)).')
 where id = 1235;

select public.fijar_precio_ref(923, 75100, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $75.100 de internet (MercadoLibre - Sidersa $71988 (Caño estructural rectangular 100x50x1.6mm, barra de 6 m); MercadoLibre - Gramabi $73499 (Caño estructural rectangular 100x50x1.60mm, barra de 6 m (lista $85.200, 13% OFF)); MercadoLibre - Ternium $75099 (Caño estructural rectangular 50x100x1.6mm, barra de 6 m (lista $8).')
 where id = 923;

select public.fijar_precio_ref(746, 1800, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $1.800 de internet (Sodimac Argentina (Trefilcon, por metro) $2219 (por metro); Lograsso Iluminación (sin marca, por metro) $1343.95 (por metro); Distribuidores del Sud (Trefilcon) $182636.7 (rollo x100 m (impuestos incluidos))).')
 where id = 746;

select public.fijar_precio_ref(904, 33000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $33.000 de internet (MercadoLibre - listado engrasadora manual (Total) $33172 (1 engrasadora manual a palanca 400cc Total (precio con descuento, lista $42.113)); Ferretería El Trébol $33761 (1 engrasadora grasera manual 400cc profesional Total THT111051); Bulfer $21488 (1 engrasadora grasera manual 400cc profesional Tot).')
 where id = 904;

select public.fijar_precio_ref(662, 15500, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $15.500 de internet (Oxi Mercedes (tienda online .com.ar) $15474 (1 delantal descarne entero 60x90 cm (precio consumidor final, sin impuestos $12.788)); Seguridad Blanco $13240 (1 delantal cuero descarne simple para soldador); Oeste Gas ESS (Tiendanube) $17545 (1 delantal descarne con refuerzo)).')
 where id = 662;

select public.fijar_precio_ref(149, 9600, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $9.600 de internet (Easy - Tacsa $11295 (cartucho 280 ml); Treselec - Tacsa $9599 (cartucho 280 ml); MercadoLibre (Luxono) - Tacsa x6 $33477.5 (pack x6 cartuchos 280 ml (= $5.580 c/u))).')
 where id = 149;

select public.fijar_precio_ref(898, 26600, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $26.600 de internet (Sodimac Argentina - Steel Pro $25999 (Capa de lluvia PVC amarilla, 1 unidad (talles XL/XXL)); Easy - DP $27995 (Capa de lluvia amarilla, 1 unidad (talles M a XXL)); Rufer Ropa de Trabajo (tienda MercadoLibre) - Vicuña $24450.65 (Capa de agua/lluvia Vicuña PVC 100% impermeable, 1 unidad)).')
 where id = 898;

select public.fijar_precio_ref(762, 25800, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $25.800 de internet (Sodimac Argentina $21999 (Lámpara de emergencia 60 LED Candela, 1 unidad); Sodimac Argentina $29999 (Luz de emergencia 60 LED recargable Sica, 1 unidad); Easy $25165 (Luz de emergencia 60 LED Candela, 1 unidad)).')
 where id = 762;

select public.fijar_precio_ref(818, 4300, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $4.300 de internet (Rosmar (pinturería/ferretería online) $4287.9 (paquete 250 g viruta de acero fina marca Rucar (lista $5.359,88, 20% off)); Mottesi Materiales $4261.84 (paquete 250 g viruta fina de acero); Tornado Home $4756.2 (paquete 250 g viruta de acero (fina/media/gruesa))).')
 where id = 818;

select public.fijar_precio_ref(655, 46000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $46.000 de internet (Sodimac Argentina $45599 (1 unidad - Máscara fotosensible UV/IR Elite Silver Shadow (precio con 10% off, lista $50.599)); Easy $46425 (1 unidad - Máscara fotosensible Elite DIN 9-13 Silver Shadow); Easy $31525 (1 unidad - Máscara fotosensible Essential DIN 11 fijo Silver Shadow (gama básica))).')
 where id = 655;

select public.fijar_precio_ref(111, 39000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $39.000 de internet (Sodimac Argentina $39239.1 (Aditivo hidrófugo en pasta Ceresita (Weber) balde x 20 kg (precio de lista $43.599)); Easy $36860 (Hidrófugo químico Sika 1 x 20 kg (exclusivo online)); Sodimac Argentina $37899 (Hidrófugo líquido Sinteplast x 20 kg (sin stock momentáneo))).')
 where id = 111;

select public.fijar_precio_ref(157, 32157, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $32.157 de internet (Gramabi (Lomas del Mirador) $31899 (barra de 6 m (38,10 x 3,20 mm), precio con descuento 23%, IVA incluido (sin impuestos $26.362,81)); Ropelato $32157.24 (barra de 6 m, marca Acindar, IVA incluido); Hierros Torrent $35752 (barra de 6 m, precio de consumidor final (no aclara IVA explícitamente))).')
 where id = 157;

select public.fijar_precio_ref(168, 5100, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $5.100 de internet (Lüsqtoff Bera (tienda oficial) $4254 (1 disco 230 x 1,9 x 22,2 mm Lüsqtoff DCL23019); Tienda Sur (MercadoShops) $5123 (1 disco 230 mm x 2,0 mm KLD); Gramabi $5299 (1 disco 230 x 1,9 x 22,2 mm Tyrolit Xpert (oferta; lista $8.500))).')
 where id = 168;

select public.fijar_precio_ref(146, 8099, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $8.099 de internet (Sodimac Argentina $8099 (Candado de bronce 40 mm Fixser, 1 unidad); Easy $13850 (Candado latón 40 mm Pado, 1 unidad con 2 llaves); Provetec $6499 (Candado laminado 40 mm Udovo, 1 unidad (con 5% off queda $6.174))).')
 where id = 146;

select public.fijar_precio_ref(936, 29000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $29.000 de internet (Easy - Porcelanato Bristol White Cerámica Alberdi 60x120 1ra $27995 (precio por m2 (caja 1,44 m2)); Easy - Porcelanato Montreal Gray Cerámica Alberdi 60x120 1ra $27995 (precio por m2 (caja 1,44 m2)); Sodimac - Porcelanato Puro white 60x120 $33999 (precio por m2)).')
 where id = 936;

select public.fijar_precio_ref(362, 9500, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $9.500 de internet (Sodimac Argentina $8549 (Pinceleta obra N°40 Topex, 1 unidad (oferta 10%; precio de lista $9.499)); Easy $9695 (Pincel Profesional N°40 cerda gris El Cazador, 1 unidad); Easy $10995 (Pinceleta Serie 611 blanca N°40 El Cazador, 1 unidad)).')
 where id = 362;

select public.fijar_precio_ref(866, 5600, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $5.600 de internet (MercadoLibre - Insumos Online (Mota W12) $5632.89 (1 mecha widia 12 mm x 150 mm para mampostería, encastre cilíndrico); MercadoShops - Econotools (Ezeta 12mm) $5997 (1 mecha widia 12 mm x 150 mm); El Ferretero (Mota) $6092.17 (1 mecha widia 12 mm)).')
 where id = 866;

select public.fijar_precio_ref(765, 145, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $145 de internet (Herrajes Assef (Fischer, tamaño 10) $178 (por unidad, IVA incluido (sin impuestos $147,11)); Ferretería Ayuso (Fischer) $145 (por unidad); Herracenter Córdoba (Fischer MN10B) $184.3 (por unidad)).')
 where id = 765;

select public.fijar_precio_ref(1219, 3000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $3.000 de internet (Easy (Candela) $2350 (rollo 18mm x 50m); Sigma Grafica $2900 (rollo 18mm x 50m); MercadoLibre - Comercial MGM (Tacsa) $3108 (rollo 18mm x 50m)).')
 where id = 1219;

select public.fijar_precio_ref(187, 8600, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $8.600 de internet (Easy $8600 (Curva larga 87°30'' PVC MH 110 mm Amanco, 1 unidad); Sodimac $6599 (Curva PVC a 90° MH 110 mm Tigre, 1 unidad (no aclara larga/corta)); Kalmat (ferretería online) $11456.72 (Curva PVC 110 90° MH Tigre, 1 unidad, impuestos incluidos (contado $8.592,54))).')
 where id = 187;

select public.fijar_precio_ref(867, 4000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $4.000 de internet (Ferretería Santa María (Venturo 6x100mm) $3945 (1 unidad); Casa Dani (Difelbroc 6x95mm, tienda ML) $4000 (1 unidad); Distribuidora Lamadrid $3478.46 (1 unidad)).')
 where id = 867;

select public.fijar_precio_ref(794, 2600, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $2.600 de internet (Sodimac Argentina - Topex $2519 (Pincel de obra N°15 (1,5") negro, 1 unidad (lista $2.799, con 10% off)); Indugar Pinturerías - El Galgo S1 $2485 (Pincel El Galgo serie S1 N°15, 1 unidad); MercadoLibre - AJ Pinturerías $2840 (Pincel N°15 para pintar, 1 unidad (rango $2.499 a $2.840 en el listado))).')
 where id = 794;

select public.fijar_precio_ref(862, 3600, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $3.600 de internet (insumosonline.com.ar (MercadoLibre) - Mota W08 $3440 (1 mecha widia 8 mm mampostería, encastre cilíndrico); Electromisiones - Fischer WHS 8x120 $3240 (1 mecha Fischer WHS 8x120 mm (baja a $2.388 por cantidad)); Martel Pinturerías - Fischer WHS 8mm $4014 (1 mecha Fischer WHS 8 mm (lista $5.017, con 2).')
 where id = 862;

select public.fijar_precio_ref(827, 7100, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $7.100 de internet (Industrias Litoral $7092.9 (bidón 5 lts detergente para vajilla); MercadoLibre - Productos Limpieza $7100 (bidón 5 lts detergente certificado gastronómico); NeoClean $4499.5 (bidón 5 lts detergente clásico (oferta desde $8.490 de lista, sin stock))).')
 where id = 827;

select public.fijar_precio_ref(913, 4665, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $4.665 de internet (Jumbo $4900 (Limpiador multiuso en crema Cif Bioactive Original 750 g (1 unidad)); Carrefour $4665 (Limpiador cremoso Cif con lavandina 750 g (1 unidad)); Supermercados Dia $4650 (Limpiador en crema Cif con lavandina/cloro 750 g (1 unidad))).')
 where id = 913;

select public.fijar_precio_ref(916, 2300, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $2.300 de internet (Pinturerías Sagitario $1883 (1 mini rodillo N°5 apto epoxi (El Rodillo), con 20% dto); Tecnoperfil $1897.78 (1 mini rodillo epoxi N°5); Pinturería Giannoni $2293 (1 mini rodillo epoxi El Galgo N°5 (precio regular $2.866))).')
 where id = 916;

select public.fijar_precio_ref(829, 3900, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $3.900 de internet (Sodimac Argentina (Idefix III concentrada) $4109 (bidón 5 lts (sin stock al momento de la consulta)); Bien Limpito y Más $4400 (bidón 5 lts lavandina concentrada); Limpieza Córdoba (genérica Engel) $3699 (bidón 5 lts (en oferta a $3.299))).')
 where id = 829;

select public.fijar_precio_ref(652, 3695, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $3.695 de internet (Easy - Bettanin $3695 (Guante de limpieza multiuso amarillo Bettanin, 1 par); Easy - DP $3895 (Guantes de látex amarillo XL DP, 1 par); Sodimac - Virulana $2649 (Guante multiuso Virulana talle M/S, 1 par)).')
 where id = 652;

select public.fijar_precio_ref(646, 1290, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $1.290 de internet (Sodimac Argentina - Libus $1389 (Protector auditivo endoaural con cordón, poliuretano, 1 unidad (par con cordón)); Easy Argentina - DP (De Pascale) $1195 (Protector auditivo endoaural con cordón reutilizable, 1 unidad (par))).')
 where id = 646;

select public.fijar_precio_ref(900, 2500, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $2.500 de internet (MercadoLibre - FASE $2759 (Máscara protectora facial reforzada acetato 1 mm, vincha plástica, x1 unidad (+1000 vendidos)); MercadoLibre - SOLFER $2259 (Protector facial plástico inyectado y acetato 300 micrones, x1 unidad); MercadoLibre - FASE $2205 (Protector facial plástico de seguridad transparen).')
 where id = 900;

select public.fijar_precio_ref(130, 680, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $680 de internet (Sodimac Argentina (Hunter) $569 (hoja 23x28 cm, grano 100); Abrafer SRL $665.19 (hoja al agua grano 100); Vallejos Materiales (Carbowet) $698.17 (hoja al agua grano 100)).')
 where id = 130;

select public.fijar_precio_ref(803, 58000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $58.000 de internet (Pinturerías Miozzi - Sintevial Sinteplast amarillo 4 lt $53899 (lata 4 lts (precio con 40% off; lista $89.832)); Kromacolor - Sintevial alquídica amarillo 4 lts $53187 (lata 4 lts); Somos Rex - Pisoacril vial amarillo 4 lts $61679 (lata 4 lts (25% off; lista $82.239))).')
 where id = 803;

select public.fijar_precio_ref(806, 22000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $22.000 de internet (Easy $21095 (Removedor en Gel 1 Lts Venier (lata 1 lt)); Easy $22595 (Removedor en Gel Rapida Accion 1 Lts Sinteplast (lata 1 lt)); Sodimac $22999 (Removedor en gel 1 L Sinteplast (lata 1 lt))).')
 where id = 806;

select set_config('cadinc.mcc_fuente', 'tasacion_catalogo_hoy', true);

update public.materiales_a_cuenta_cliente c
   set precio_unit  = m.precio_ref,
       precio_total = round(c.cantidad * m.precio_ref, 2),
       updated_at   = now(),
       updated_by   = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.solicitud_compra_item i
  join public.stock_materiales m on m.id = i.material_id
 where i.id = c.item_id and m.id in (656, 353, 345, 896, 875, 1235, 923, 746, 904, 662, 149, 898, 762, 818, 655, 111, 157, 168, 146, 936, 362, 866, 765, 1219, 187, 867, 794, 862, 827, 913, 916, 829, 652, 646, 900, 130, 803, 806)
   and coalesce(c.precio_unit, 0) = 0 and c.cobro_id is null and c.certificado_id is null
   and coalesce(c.pagado_por, 'cadinc') = 'cadinc'
   and m.precio_ref > 0 and public.unidad_compatible(c.unidad, m.unidad);

update public.solicitud_compra_item i
   set precio_unit = c.precio_unit
  from public.materiales_a_cuenta_cliente c
 where c.item_id = i.id and i.material_id in (656, 353, 345, 896, 875, 1235, 923, 746, 904, 662, 149, 898, 762, 818, 655, 111, 157, 168, 146, 936, 362, 866, 765, 1219, 187, 867, 794, 862, 827, 913, 916, 829, 652, 646, 900, 130, 803, 806)
   and coalesce(i.precio_unit, 0) = 0 and c.precio_unit > 0
   and c.updated_at >= now() - interval '5 minutes'
   and c.updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid;
