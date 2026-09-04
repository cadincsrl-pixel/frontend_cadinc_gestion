-- 20260904s — Compras cargadas al precio NETO (sin IVA) → precio FINAL (IVA incl.)
--
-- Lo que se cobra a las obras es precio final. 99 renglones de compra se
-- resolvieron con el neto de la factura (Voltaje, Silva, El Fontanero, EMI,
-- UNIMAX, Chediac, Segumak): el precio cargado coincide (±0,15%) con la
-- columna "s/IVA" del Excel de compras de Nicolás, en la fila del mismo
-- proveedor y con fecha. Se descartaron las coincidencias de precio con otro
-- proveedor, las filas sin fecha y los precios que también podían ser un final.
-- Ninguno está cobrado ni marcado como pagado por el cliente. Ver diario 2026-09-04.
--
-- Corrige el renglón de compra, la fila de la cuenta del cliente (unitario y
-- total) y deja un evento 'correccion' por renglón. `fuente` es trazabilidad.

create temp table fix_neto (item_id int, precio_viejo numeric, precio_nuevo numeric, fuente text, fecha_excel date);
insert into fix_neto values
  (578, 938, 1134.98, 'ESTOPA BLANCA SUPER X 300 GR', '2026-08-20'),
  (865, 552.49, 668.51, 'TF-CODO A 90 FUSION 25 MM', '2026-07-30'),
  (866, 418.7, 506.63, 'TF-UNION SIMPLE FUSION 25 MM', '2026-07-28'),
  (867, 2977.84, 3603.19, 'TF-CODO A 90 C/ROSCA HEMBRA', '2026-07-30'),
  (1310, 464.95, 562.59, 'CAJA PVC OCTOGONAL CHICA', '2026-07-28'),
  (1311, 464.95, 562.59, 'CAJA PVC RECTANGULAR', '2026-07-28'),
  (1312, 3822.86, 4625.66, 'LLAVE LISTA 2 TOMAS 10A BL -', '2026-07-28'),
  (1313, 5014.81, 6067.92, 'LLAVE LISTA TOMA 20A BL - KA', '2026-07-28'),
  (1315, 5143, 6223.03, 'LLAVE LISTA 2 PUNTOS BL - KA', '2026-07-28'),
  (1318, 277.04, 335.22, 'CONECTOR METALICO 3/4', '2026-07-28'),
  (1319, 790.19, 956.13, 'CABLE UNIPOLAR C/NORMAS IRAM', '2026-07-28'),
  (1322, 9222.53, 11159.26, 'CABLE CANAL 100X50 MM X 2 MT', '2026-07-28'),
  (1499, 464.95, 562.59, 'CAJA PVC OCTOGONAL CHICA', '2026-07-28'),
  (1503, 3658.17, 4426.39, 'ESPATULA ENDUIR 12 CM', '2026-07-28'),
  (1506, 10724, 12976.04, 'LUBRICANTE WS-40 X 311 GR', '2026-07-28'),
  (1550, 2314.55, 2800.61, 'TF-UNION SIMPLE FUSION 50 MM', '2026-07-28'),
  (1551, 3418.5, 4136.39, 'TF-BUJE DE REDUCCION FUSION', '2026-07-28'),
  (1552, 14002.98, 16943.61, 'TF-LLAVE DE PASO NORMAL FUSI', '2026-07-30'),
  (1553, 2977.84, 3603.19, 'TF-CODO A 90 C/ROSCA HEMBRA', '2026-07-28'),
  (1554, 552.49, 668.51, 'TF-CODO A 90 FUSION 25 MM', '2026-07-28'),
  (1555, 418.7, 506.63, 'TF-UNION SIMPLE FUSION 25 MM', '2026-07-28'),
  (1556, 2264.96, 2740.6, 'TUBO AMANCO FUSION PN 20 25', '2026-07-28'),
  (1557, 5566.8, 6735.83, 'CONEXION DESPLAZADOR INODORO', '2026-07-28'),
  (1558, 4708.65, 5697.47, 'FLEXIBLE MALLADO MACHO GIRAT', '2026-07-28'),
  (1561, 3721.74, 4503.31, 'SELLADOR HIDRO 3 X 50 CC', '2026-07-28'),
  (1562, 378.19, 457.61, 'TEFLON ESTANDAR 3/4 X 10 LPL', '2026-07-28'),
  (1608, 5907.21, 7147.72, 'SELLADOR HIDRO 3 X 125 CC', '2026-08-11'),
  (1609, 2384.34, 2885.05, 'CANAMO PEINADO X 20 GRS', '2026-08-11'),
  (1628, 2555.69, 3092.38, 'R1 CODO 87 30 MH 110 MM', '2026-09-02'),
  (1702, 5143.57, 6223.72, 'LLAVE LISTA 2 PUNTOS BL - KA', '2026-07-28'),
  (1847, 3823, 4625.83, 'LLAVE LISTA 2 TOMAS 10A BL -', '2026-07-28'),
  (1855, 224, 271.04, 'CANO CORRUGADO LIVIANO 3/4 X', '2026-08-21'),
  (1856, 3823, 4625.83, 'LLAVE LISTA 2 TOMAS 10A BL -', '2026-07-28'),
  (1857, 277, 335.17, 'CONECTOR METALICO 3/4', '2026-07-28'),
  (1870, 3263.53, 3948.87, 'BARBIERI OMEGA CLASICA 12,5', '2026-08-28'),
  (1873, 1427.27, 1727.0, 'MINIRODILLO EPOXI N 8', '2026-08-20'),
  (2437, 2035.22, 2462.62, 'BARBIERI CANTONERA STANDAR 0', '2026-08-28'),
  (2521, 51814.05, 62695.0, 'ENDUIDO MULTIPROPOSITO S.W.', '2026-08-18'),
  (2564, 7442.97, 9005.99, 'IGAM FINO HIDRORREPELENTE EX', '2026-08-19'),
  (2565, 7442.97, 9005.99, 'IGAM FINO HIDRORREPELENTE EX', '2026-08-19'),
  (2577, 7443, 9006.03, 'IGAM FINO HIDRORREPELENTE EX', '2026-08-19'),
  (2661, 369, 446.49, 'CANO CORRUGADO LIVIANO 7/8 X', '2026-08-21'),
  (2662, 224, 271.04, 'CANO CORRUGADO LIVIANO 3/4 X', '2026-08-28'),
  (2663, 323, 390.83, 'CAJA RECTANGULAR METALICA', '2026-08-28'),
  (2664, 27488, 33260.48, 'CAJA DE EMBUTIR PVC P/24 MOD', '2026-08-21'),
  (2665, 724, 876.04, 'CANO PVC RIGIDO SEMIPESADO 7', '2026-08-21'),
  (2666, 191, 231.11, 'CONECTOR PVC 7/8 - 22 MM', '2026-08-21'),
  (2667, 323, 390.83, 'CAJA OCTOGONAL CHICA METALIC', '2026-08-21'),
  (2668, 142, 171.82, 'UNION PVC 7/8 - 22 MM', '2026-08-21'),
  (2669, 1168, 1413.28, 'CINTA NEGRA AISLADORA 20 MTS', '2026-08-21'),
  (2750, 5710.74, 6910.0, 'RODILLO CACIQUE BICOLOR ANTI', '2026-08-25'),
  (2752, 6177.69, 7475.0, 'ENDUIDO ALBAPLAST INTERIOR X', '2026-08-25'),
  (2838, 3998.84, 4838.6, 'BARBIERI SOLERA 70 MM DE 0,5', '2026-08-26'),
  (2839, 4493.04, 5436.58, 'BARBIERI MONTANTE 69 MM DE 0', '2026-08-26'),
  (2840, 2936.83, 3553.56, 'BARBIERI SOLERA 35 MM DE 0,5', '2026-08-26'),
  (2841, 3368.75, 4076.19, 'BARBIERI MONTANTE 34 MM DE 0', '2026-08-26'),
  (2842, 45247.14, 54749.04, 'SUPERBOARD STANDART 8 MM B.R', '2026-08-26'),
  (2843, 16526.44, 19996.99, 'DURLOCK PLACA STANDAR REF. 1', '2026-08-28'),
  (2849, 4195.79, 5076.91, 'DURLOCK CINTA FIBRA AUTOAD.', '2026-08-26'),
  (2850, 27962.84, 33835.04, 'ANCLAFLEX MASILLA LPU PLUS X', '2026-08-26'),
  (2851, 1378.51, 1668.0, 'REVOKITO YESO PARIS X 1 KG', '2026-08-28'),
  (2946, 323, 390.83, 'CAJA OCTOGONAL CHICA METALIC', '2026-08-21'),
  (2947, 323, 390.83, 'CAJA OCTOGONAL CHICA METALIC', '2026-08-21'),
  (2949, 3705, 4483.05, 'LLAVE LISTA 2 TOMAS 10A BL -', '2026-09-02'),
  (2950, 4986, 6033.06, 'LLAVE LISTA 2 PUNTOS BL - KA', '2026-08-28'),
  (2951, 4861, 5881.81, 'LLAVE LISTA TOMA 20A BL - KA', '2026-08-28'),
  (2953, 869, 1051.49, 'CABLE UNIPOLAR C/NORMAS IRAM', '2026-08-28'),
  (2954, 869, 1051.49, 'CABLE UNIPOLAR C/NORMAS IRAM', '2026-08-28'),
  (2974, 869, 1051.49, 'CABLE UNIPOLAR C/NORMAS IRAM', '2026-08-28'),
  (2975, 531, 642.51, 'CABLE UNIPOLAR C/NORMAS IRAM', '2026-08-28'),
  (2976, 3021, 3655.41, 'CABLE TIPO TALLER 3X2.5 MM C', '2026-08-28'),
  (2977, 1180, 1427.8, 'CINTA NEGRA AISLADORA 20 MTS', '2026-08-28'),
  (2978, 258, 312.18, 'CURVA PVC 3/4 - 20 MM', '2026-08-28'),
  (2979, 258, 312.18, 'CURVA PVC 3/4 - 20 MM', '2026-08-28'),
  (2980, 121, 146.41, 'UNION PVC 3/4 - 20 MM', '2026-08-28'),
  (2981, 40, 48.4, 'GRAMPA P/FIJAR CANO RIGIDO 3', '2026-08-28'),
  (2982, 16526.44, 19996.99, 'DURLOCK PLACA STANDAR REF. 1', '2026-08-28'),
  (2983, 4051.63, 4902.47, 'BARBIERI SOLERA 70 MM DE 0,5', '2026-08-28'),
  (2984, 3264.95, 3950.59, 'BARBIERI OMEGA CLASICA 12,5', '2026-08-28'),
  (2985, 2975.6, 3600.48, 'BARBIERI SOLERA 35 MM DE 0,5', '2026-08-28'),
  (2986, 2036.79, 2464.52, 'BARBIERI CANTONERA STANDAR 0', '2026-08-28'),
  (2991, 4251.18, 5143.93, 'DURLOCK CINTA FIBRA AUTOAD.', '2026-08-28'),
  (2992, 26290.72, 31811.77, 'DURLOCK MASILLA LPU MULTIUSO', '2026-08-28'),
  (2993, 1378.51, 1668.0, 'REVOKITO YESO PARIS X 1 KG', '2026-08-26'),
  (3036, 23257.91, 28142.07, 'ANGULO 1 X 3/16 (10.32 KG)', '2026-08-31'),
  (3082, 2936.83, 3553.56, 'BARBIERI SOLERA 35 MM DE 0,5', '2026-08-26'),
  (3177, 2555.69, 3092.38, 'R1 CODO 87 30 MH 110 MM', '2026-09-02'),
  (3178, 4618.15, 5587.96, 'R1 RAMAL 87 30 MH 110 X 110', '2026-09-02'),
  (3179, 2714.36, 3284.38, 'REJILLA VENT. APROB. 15 X 30', '2026-09-02'),
  (3269, 322.81, 390.6, 'CAJA OCTOGONAL CHICA METALIC', '2026-08-28'),
  (3270, 322.81, 390.6, 'CAJA RECTANGULAR METALICA', '2026-08-21'),
  (3274, 3705.45, 4483.59, 'LLAVE LISTA 2 TOMAS 10A BL -', '2026-08-28'),
  (3275, 4860.78, 5881.54, 'LLAVE LISTA TOMA 20A BL - KA', '2026-08-28'),
  (3278, 4985.58, 6032.55, 'LLAVE LISTA 2 PUNTOS BL - KA', '2026-08-28'),
  (3279, 678.09, 820.49, 'BASTIDOR 3 MOD - KALOP KD407', '2026-09-02'),
  (3280, 650.36, 786.94, 'TAPA 3 MOD BL - KALOP KD4071', '2026-09-02'),
  (3281, 1706.3, 2064.62, 'MODULO PUNTO BL - KALOP KD40', '2026-09-02'),
  (3282, 223.68, 270.65, 'CANO CORRUGADO LIVIANO 3/4 X', '2026-07-28'),
  (3285, 1179.79, 1427.55, 'CINTA NEGRA AISLADORA 20 MTS', '2026-08-28');

-- 1) renglón de compra (guard: solo si sigue con el precio neto)
update public.solicitud_compra_item i
set precio_unit = f.precio_nuevo
from fix_neto f
where i.id = f.item_id and i.precio_unit = f.precio_viejo;

-- 2) cuenta del cliente: unitario y total
update public.materiales_a_cuenta_cliente m
set precio_unit  = f.precio_nuevo,
    precio_total = round(m.cantidad * f.precio_nuevo, 2),
    updated_at   = now()
from fix_neto f
where m.item_id = f.item_id and m.precio_unit = f.precio_viejo;

-- 3) evento por renglón
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'Precio de compra cargado neto (sin IVA): ' || f.precio_viejo || ' → final ' || f.precio_nuevo || ' (' || f.fuente || ', ' || f.fecha_excel || ')',
       jsonb_build_object('motivo', 'compras netas a final 2026-09-04', 'precio_anterior', f.precio_viejo, 'precio_nuevo', f.precio_nuevo, 'fila_excel', f.fuente)
from fix_neto f join public.solicitud_compra_item i on i.id = f.item_id
where i.precio_unit = f.precio_nuevo;

drop table fix_neto;
