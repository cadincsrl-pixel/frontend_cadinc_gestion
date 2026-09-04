-- 20260904am — Facturas de El Fontanero (8) y presupuestos de Voltaje (5): precios, altas y un IVA del 10,5 %
--
-- Archivos en datos-entrada/ (2026-09-04). Todo neto + IVA aparte; acá queda
-- FINAL. Los presupuestos de Voltaje son la fuente del Excel de Nicolás (mismos
-- renglones y precios), así que no traen precios nuevos, pero sí un dato que el
-- Excel no tenía: **hay renglones con IVA 10,5 %**. En el presupuesto 212162 el
-- IVA 10,5 % ($523,49) es exactamente el 10,5 % de la "llave lista 2 puntos"
-- ($4.986), y en el 212881 ($2.125,84) es el 10,5 % de 2 puntos + 1 punto +
-- módulo punto + módulo combinación + lámpara LED A60 ($20.246,10). El Excel
-- (y con él 20260904q/r/s/ag) los pasó a final con 21 %: se corrigen a 10,5 %.
--
-- 1) precios desde las facturas de El Fontanero (× 1,21)
-- 2) 8 altas nuevas de El Fontanero
-- 3) IVA 10,5 %: catálogo y renglones de la cuenta (Kalop puntos/módulos y lámparas)

-- 1) precios ────────────────────────────────────────────────────────────────
update public.stock_materiales set precio_ref = v.p, obs = coalesce(obs || ' · ', '') || v.n
from (values
  (224, 7314.66, 'Factura El Fontanero 0008-2264 30/07/2026: reja inox 10x10 $6.045,17 neto.'),
  (725, 7698.27, 'Factura El Fontanero 0008-2264 30/07/2026: reja inox 12x12 $6.362,21 neto.'),
  (32,  5531.03, 'Factura El Fontanero 0008-2416 21/08/2026: flexible mallado 1/2 x 40 $4.571,10 neto.'),
  (729, 5127.73, 'Factura El Fontanero 0008-2311 06/08/2026: flexible mallado 1/2 x 35 $4.237,79 neto.'),
  (198, 1167.32, 'POR METRO. Factura El Fontanero 0008-2336 11/08/2026: tubo Amanco fusión 32 $3.858,92 neto la barra de 4 m.')
) as v(id, p, n)
where stock_materiales.id = v.id;

update public.stock_materiales set precio_ref = 18006.32,
       obs = coalesce(obs || ' · ', '') || 'Factura El Fontanero 0008-2264 30/07/2026: sifón p/ descarga pileta doble $14.881,26 neto.'
 where nombre = 'Sifón doble p/ pileta de cocina';

-- 2) altas ───────────────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, 'unid', v.precio_ref, 1, v.alias, 'material',
       'Alta 2026-09-04 desde factura El Fontanero ' || v.fuente || '. Precio final (neto × 1,21).'
from (values
  ('Pico adaptador rosca 3/4" p/ canilla 1/2"',       766.66, array['pico adaptador canilla','adaptador 3/4 a 1/2 canilla','pico para manguera'],            '0008-2266 30/07/2026'),
  ('Tubo extensible cromado universal 40/50',         4825.64, array['tubo extensible cromado','extensible cromado 40 50','tubo extensible pileta'],          '0008-2354 13/08/2026'),
  ('Desplazador p/ inodoro 3.5cm x 10cm',             6735.83, array['desplazador inodoro 35','conexion desplazador inodoro','desplazador 3.5'],             '0008-2311 06/08/2026'),
  ('Roseta p/ canilla 1/2" inox',                      635.46, array['roseta canilla','roseta inox 1/2','roseta para canilla'],                            '0008-2354 13/08/2026'),
  ('Sifón simple p/ pileta de cocina',                8042.79, array['sifon simple','sifon pileta simple','sifon de cocina simple'],                        '0008-2354 13/08/2026'),
  ('Descarga p/ mingitorio c/ adaptador 1 1/4 x 40', 28711.28, array['descarga mingitorio','descarga para mingitorio','conexion mingitorio'],               '0008-2354 13/08/2026'),
  ('Sellador de roscas x 125cc',                      7147.72, array['sellador hidro 3 x 125','hidro 3 125cc','sella roscas 125'],                          '0008-2336 11/08/2026'),
  ('Banda autoadhesiva p/ intemperie Hidro 3 XT',    12867.58, array['banda autoadhesiva intemperie','hidro 3 xt','banda h3 xt','banda autoad intemperie'], '0008-2336 11/08/2026')
) as v(nombre, precio_ref, alias, fuente)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- 3) IVA 10,5 % ─────────────────────────────────────────────────────────────
-- catálogo (neto de los presupuestos de Voltaje × 1,105)
update public.stock_materiales set precio_ref = v.p, obs = coalesce(obs || ' · ', '') || 'IVA 10,5 % (presupuesto Voltaje 212881 02/09/2026).'
from (values
  (54,  5509.53),   -- Interruptor doble: llave lista 2 puntos $4.986
  (53,  3824.41),   -- Interruptor simple: llave lista 1 punto $3.461
  (251, 3063.06),   -- Interruptor combinación: módulo combinación $2.772
  (269, 1256.39)    -- Lámpara LED 15W: bulbo A60 $1.137
) as v(id, p)
where stock_materiales.id = v.id;

update public.stock_materiales set precio_ref = 1022.13, obs = coalesce(obs || ' · ', '') || 'IVA 10,5 % como la lámpara A60 de Voltaje.'
 where nombre = 'Lámpara LED 12W' and precio_ref = 1119.25;

-- renglones que hoy se pasaron a final con 21 % y son 10,5 %
create temp table fix (item_id int, precio_viejo numeric, precio_nuevo numeric, nota text);
insert into fix values
  (3278, 6032.55, 5509.07, 'llave lista 2 puntos: neto 4.985,58 × 1,105'),
  (2950, 6033.06, 5509.53, 'llave lista 2 puntos: neto 4.986 × 1,105'),
  (1315, 6223.03, 5683.02, 'llave lista 2 puntos: neto 5.143 × 1,105'),
  (1702, 6223.72, 5683.64, 'llave lista 2 puntos: neto 5.143,57 × 1,105'),
  (3281, 2064.62, 1885.46, 'módulo punto: neto 1.706,30 × 1,105'),
  (1329, 1119.25, 1022.13, 'focos 12w: neto 925 × 1,105 (lámparas LED con IVA 10,5 %)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'IVA 10,5 %, no 21 %: ' || f.nota || ' → $' || f.precio_nuevo,
       jsonb_build_object('motivo', 'IVA 10,5 % Kalop 2026-09-04', 'precio_anterior', f.precio_viejo, 'precio_nuevo', f.precio_nuevo)
from fix f join public.solicitud_compra_item i on i.id = f.item_id
where i.precio_unit = f.precio_viejo;

update public.solicitud_compra_item i set precio_unit = f.precio_nuevo
  from fix f where i.id = f.item_id and i.precio_unit = f.precio_viejo;

update public.materiales_a_cuenta_cliente c
   set precio_unit = f.precio_nuevo, precio_total = round(c.cantidad * f.precio_nuevo, 2), updated_at = now()
  from fix f
 where c.item_id = f.item_id and c.precio_unit = f.precio_viejo and c.cobro_id is null;

drop table fix;
