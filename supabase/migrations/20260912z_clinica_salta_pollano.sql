-- CLINICA SALTA: el presupuesto manuscrito de POLLANO, contra lo que estaba cargado
--
-- El user pasó las dos hojas del presupuesto de POLLANO SANITARIOS ("Salta 585"):
-- hoja 1 del 26/08 (subtotal $225.570) y hoja 2 del 02/09 (total $342.850), y
-- pidió revisar si estaba todo cargado. No lo estaba: había 19 renglones por
-- $214.920 contra 34 líneas de papel.
--
-- DOS PROBLEMAS DISTINTOS
--
-- 1) Los precios cargados no son los del papel. El diagnóstico es del pedido
--    694 de LAMADRID y se repite acá: la pantalla de resolver auto-completa el
--    precio_ref del catálogo y quien carga no tipea lo que cobró el proveedor.
--    Los peores: la grasera de 63 quedó en $1; el caño de termofusión, que se
--    mide en METROS, quedó a $8.960/m cuando la tira de 4 m costó $12.300
--    ($3.075/m); el caño Awaduct 32 x 3m entró con 2 unidades cuando el papel
--    dice 7; el caño de 110 con 1 cuando son 3.
--
-- 2) Faltaban 15 renglones ($108.480), casi toda la hoja 2: sifones, flexibles,
--    rejillas, curvas y codos de 50, el lubricante, el buje 50-40.
--
-- MARCA: el user avisó que "todo lo 63, 32 y 50 de ESTE pedido es Awaduct"
-- (no en todos los pedidos). Con el renombre de 20260912w/x la mayoría de las
-- fichas ya dice Awaduct; acá se reapuntan las tres que quedaban mirando a PVC
-- o al ángulo equivocado. No se usa la 928 como destino Awaduct: no tiene
-- código de lista y sus alias son de otra marca (ver 20260912w).
--
-- EL COBRO. Los 19 renglones estaban imputados al cobro 3 (el comodín de
-- $6.019.466,90 del 04/09, con $51.600 sin usar). El trigger fn_mcc_congelada
-- no deja cambiarle el precio a una fila cobrada, así que primero se sueltan
-- (cobro_id y monto_cobrado a null, que sí está permitido porque los importes
-- no cambian) y recién después se valúan. NO se usa el escape
-- cadinc.descongelar: acá los renglones realmente dejan de estar cobrados.
-- Después el user corre "Imputar lo pagado" y se reasignan con la regla normal.
-- Autorizado por el user el 09/09: "1 si solta el cobro y corregi".
--
-- El buje 63x50 del papel ($1.330) es la pieza que estaba cargada como
-- "Reducción 63 a 50mm" a $3.296 (user: "son lo mismo"): se le corrige el
-- precio y no se crea un renglón nuevo.
--
-- QUEDA UNA DIFERENCIA DE $450 contra el total del papel ($343.300 contra
-- $342.850): es un importe de la hoja 2 que no se lee con certeza. El user
-- dijo "3 ignora".
--
-- Total Pollano en la obra: de $214.920 a $343.300.

begin;

-- ── 1) Soltar del cobro 3 los 19 renglones a revaluar ────────────────────────
-- (no se toca el mcc 2868 / item 3049: ese caño de 110 salió del depósito, no
--  de esta compra)
update public.materiales_a_cuenta_cliente
   set cobro_id = null, monto_cobrado = null,
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id in (2709,2710,2711,2712,2713,2714,2715,2716,2717,2718,2719,
              2782,2783,2784,2785,2947,2948,2949,2950);

-- ── 2) Los precios y cantidades del papel ────────────────────────────────────
with v(item_id, cant, pu, total) as (values
  (2871::int,  2::numeric,    15540::numeric,    31080::numeric),  -- 2 caños Awaduct 63 x 4m
  (2872,       2,              2085,              4170),            -- 2 codos 63 MH
  (2873,       1,              8620,              8620),            -- grasera 63x50 cocina (estaba en $1)
  (2874,       1,              1330,              1330),            -- buje 63x50
  (2875,       1,              5100,              5100),            -- sopapa 50
  (2876,       4,              3075,             12300),            -- caño termofusión 20: tira de 4 m
  (2877,       5,               400,              2000),            -- 5 codos termofusión 20
  (2878,       1,             14660,             14660),            -- llave esférica 20
  (2879,       1,              2990,              2990),            -- tulipa macho 20 x 1/2
  (2880,       1,              2560,              2560),            -- tulipa hembra 20 x 1/2
  (2881,       2,              2670,              5340),            -- 2 codos 20 x 1/2 H
  (2955,       1,              1190,              1190),            -- reducción 50 a 40
  (2956,       1,              1390,              1390),            -- reducción 40 a 32
  (2957,       7,          2528.5714,            17700),            -- 7 caños Awaduct 32 x 3m (estaban 2)
  (2958,       3,           956.6667,             2870),            -- 3 codos 32 HH
  (3125,       3,         31173.3333,            93520),            -- 3 caños 110 x 4m (estaba 1)
  (3126,       2,              3490,              6980),            -- 2 codos 110
  (3127,       2,              4360,              8720),            -- 2 curvas 110 a 45°
  (3128,       1,             12300,             12300)             -- pegamento PVC x 250
)
update public.solicitud_compra_item i
   set cantidad = v.cant, cantidad_enviada = v.cant, precio_unit = v.pu,
       updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from v where v.item_id = i.id;

with v(item_id, cant, pu, total) as (values
  (2871::int,  2::numeric,    15540::numeric,    31080::numeric),
  (2872,       2,              2085,              4170),
  (2873,       1,              8620,              8620),
  (2874,       1,              1330,              1330),
  (2875,       1,              5100,              5100),
  (2876,       4,              3075,             12300),
  (2877,       5,               400,              2000),
  (2878,       1,             14660,             14660),
  (2879,       1,              2990,              2990),
  (2880,       1,              2560,              2560),
  (2881,       2,              2670,              5340),
  (2955,       1,              1190,              1190),
  (2956,       1,              1390,              1390),
  (2957,       7,          2528.5714,            17700),
  (2958,       3,           956.6667,             2870),
  (3125,       3,         31173.3333,            93520),
  (3126,       2,              3490,              6980),
  (3127,       2,              4360,              8720),
  (3128,       1,             12300,             12300)
)
update public.materiales_a_cuenta_cliente c
   set cantidad = v.cant, precio_unit = v.pu, precio_total = v.total,
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from v where c.item_id = v.item_id and c.obra_cod = 'CC CLINICA SALTA';

-- ── 3) Las tres fichas mal apuntadas ─────────────────────────────────────────
-- El codo de 63 del papel dice "MH" y es Awaduct (cód. 2007), no el codo de
-- desagüe genérico. El de 32 idem. La curva de 110 del papel es de 45°, no 90°.
update public.solicitud_compra_item
   set material_id = 1237, descripcion = 'Codo Awaduct 63mm 90° MH' where id = 2872;
update public.materiales_a_cuenta_cliente
   set descripcion = 'Codo Awaduct 63mm 90° MH' where item_id = 2872;

update public.solicitud_compra_item
   set material_id = 2279, descripcion = 'Codo Awaduct 32mm 87°30'' HH' where id = 2958;
update public.materiales_a_cuenta_cliente
   set descripcion = 'Codo Awaduct 32mm 87°30'' HH' where item_id = 2958;

update public.solicitud_compra_item
   set material_id = 1008, descripcion = 'Curva PVC 110mm 45°' where id = 3127;
update public.materiales_a_cuenta_cliente
   set descripcion = 'Curva PVC 110mm 45°' where item_id = 3127;

-- ── 4) La única ficha que faltaba ────────────────────────────────────────────
insert into public.stock_materiales (rubro_id, nombre, unidad, alias, precio_ref, obs, created_by)
select 1, 'Flexible 1/2" x 50cm', 'unid',
       array['flexible 50', 'flexible de 50', 'flexible 1/2 50'], 9350,
       'Alta desde el presupuesto de POLLANO del 02/09 (CLINICA SALTA): 2 u a $9.350.',
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where not exists (select 1 from public.stock_materiales where nombre = 'Flexible 1/2" x 50cm');

-- ── 5) Los 15 renglones que faltaban ─────────────────────────────────────────
with pedido as (
  insert into public.solicitud_compra (obra_cod, fecha, estado, prioridad, obs, created_by)
  values ('CC CLINICA SALTA', '2026-08-26', 'aprobada', 'normal',
          '[migración] Renglones del presupuesto manuscrito de POLLANO (hojas del 26/08 y 02/09) que nunca se cargaron. El material ya está en obra.',
          'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid)
  returning id
), nuevos(material_id, descripcion, cantidad, unidad, precio_unit, fecha) as (values
  (2189::int, 'Manguito de reparación Awaduct 63mm HH'::text,        2::numeric, 'unid'::text,  1985::numeric, '2026-08-27'::date),
  (2276,      'Codo Awaduct 32mm 45° HH',                            4, 'unid',   940, '2026-08-27'),
  (2279,      'Codo Awaduct 32mm 87°30'' HH',                        2, 'unid',   940, '2026-08-27'),
  (769,       'Arena x 25kg',                                        1, 'unid',  2800, '2026-08-27'),
  (196,       'Reducción Awaduct 50 a 40mm',                         1, 'unid',  1190, '2026-08-31'),
  (741,       'Reducción Awaduct 40 a 32mm',                         1, 'unid',  1390, '2026-08-31'),
  (2279,      'Codo Awaduct 32mm 87°30'' HH',                        2, 'unid',   940, '2026-08-31'),
  (2325,      'Codo Awaduct 50mm 45° HH',                            4, 'unid',  1160, '2026-09-02'),
  (2364,      'Caño Awaduct 50mm x 0.50m',                           1, 'unid',  3510, '2026-09-02'),
  (2281,      'Codo Awaduct 50mm 87°30'' HH',                        2, 'unid',  1185, '2026-09-02'),
  (736,       'Sifón PVC 50mm',                                      2, 'unid',  7850, '2026-09-02'),
  ((select id from public.stock_materiales where nombre = 'Flexible 1/2" x 50cm'),
              'Flexible 1/2" x 50cm',                                2, 'unid',  9350, '2026-09-02'),
  (1239,      'Lubricante p/ junta elástica PVC (solución deslizante)', 1, 'unid', 7690, '2026-09-02'),
  (null,      'Rejilla PVC (falta definir el modelo)',               2, 'unid', 18950, '2026-09-02'),
  (1051,      'Buje reducción Awaduct 50 a 40mm',                    1, 'unid',  1100, '2026-09-02')
), items as (
  insert into public.solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, estado, precio_unit, proveedor_id, material_id,
     cantidad_enviada, fecha_resolucion, fecha_envio, obs, updated_by)
  select p.id, n.descripcion, n.cantidad, n.unidad, 'enviado', n.precio_unit, 1, n.material_id,
         n.cantidad, n.fecha, n.fecha,
         'Presupuesto POLLANO ' || to_char(n.fecha, 'DD/MM') || ' — cargado el 09/09 desde el papel.',
         'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
    from pedido p cross join nuevos n
  returning id, solicitud_id, descripcion, cantidad, unidad, precio_unit, fecha_resolucion
)
insert into public.materiales_a_cuenta_cliente
  (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
   precio_unit, precio_total, origen, proveedor_id, fecha_resolucion, a_cargo_de, created_by)
select 'CC CLINICA SALTA', i.solicitud_id, i.id, i.descripcion, i.cantidad, i.unidad,
       i.precio_unit, round(i.cantidad * i.precio_unit, 2), 'proveedor', 1, i.fecha_resolucion, 'cliente',
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from items i;

commit;
