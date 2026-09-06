-- 20260906c — Facturas de ABC S.A. (datos-entrada/facturas abc.pdf, 6 facturas del 06/07 al 02/09/2026)
--
-- Todo neto + IVA 21 % aparte; acá queda FINAL (neto con descuento × 1,21).
-- Las percepciones (IB Tucumán, IVA RG 2408) van al total de la factura, no al
-- precio del artículo. Varios precios ya estaban en el catálogo (venían del
-- Excel de Nicolás como "sin identificar"): cinta de pintor 24, lijas 80 y 150,
-- cinceles SDS-max, cortahierro. Acá se registran las 6 facturas, se corrigen
-- los precios que estaban en neto o desactualizados, se dan de alta 3
-- artículos y se enganchan los renglones de los pedidos que coinciden.
--
--  1) 0012-00394050 06/07  $650.126,39  llana, tenaza, discos flap/corte/sierra, H4, espátula, Duracell AA
--  2) 0012-00397449 07/08   $14.800,91  espuma PU Fischer PU1/500
--  3) 0012-00399123 24/08  $288.005,03  puntas y cortahierros Tolsen, cinceles SDS-max, lija 80
--  4) 0012-00397479 07/08  $285.736,54  punta PH2, sierra ECO 7x60, lija 150, rodillo antigota, SX10 balde
--  5) 0012-00400128 01/09   $18.228,00  mechas 4,25
--  6) 0012-00400157 02/09  $659.995,95  cinta enmascarar, 3M 550 negro, anteojos, cinta aisladora, buscapolos, lubricante, Duracell AAA

-- 1) facturas ────────────────────────────────────────────────────────────────
insert into public.facturas_compra (proveedor_id, numero, fecha, total, obs, created_by, updated_by)
select 7, v.numero, v.fecha, v.total, 'datos-entrada/facturas abc.pdf, hoja ' || v.hoja || '. Neto ' || v.neto || ' + IVA ' || v.iva || ' + percepciones.',
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'
from (values
  ('12-394050', '2026-07-06'::date, 650126.39, 513933.90, 107926.12, 1),
  ('12-397449', '2026-08-07',        14800.91,  11700.32,   2457.07, 2),
  ('12-399123', '2026-08-24',       288005.03, 227671.96,  47811.11, 3),
  ('12-397479', '2026-08-07',       285736.54, 225878.69,  47434.52, 4),
  ('12-400128', '2026-09-01',        18228.00,  14700.00,   3087.00, 5),
  ('12-400157', '2026-09-02',       659995.95, 532254.80, 111773.51, 6)
) as v(numero, fecha, total, neto, iva, hoja)
where not exists (select 1 from public.facturas_compra f where f.proveedor_id = 7 and f.numero = v.numero);

-- 2) catálogo: precios finales de ABC ──────────────────────────────────────
update public.stock_materiales m set precio_ref = v.p, precio_actualizado_en = now(), obs = coalesce(m.obs || ' · ', '') || v.n
from (values
  (717,  2319.57,  'ABC 06/07/2026: disco flap 115 G60 Bosch $1.917 neto (la referencia anterior era el neto).'),
  (167,  444.52,   'ABC 06/07/2026: disco corte inox 115 x 1 mm Bosch $367,37 neto (×500).'),
  (440,  1511.75,  'ABC 06/07/2026: disco corte 180 x 1,6 Bosch $1.249,38 neto (la referencia anterior era el neto).'),
  (718,  26841.43, 'ABC 07/08/2026: sierra circular ECO 7" x 60 dientes Bosch $22.183 neto; la línea estándar salió $35.064 neto ($42.427 final) el 06/07.'),
  (719,  3302.21,  'ABC 06/07/2026: espátula mango de goma 40 mm Ingco $2.729,10 neto.'),
  (1241, 11812.50, 'ABC 02/09/2026: 3M PU550 negro 310 ml $12.203 lista −20 % = $9.762,40 neto (×20).'),
  (752,  4743.68,  'ABC 02/09/2026: buscapolo 3,5x100 Irimo $4.900,50 lista −20 % = $3.920,40 neto.'),
  (824,  1189.98,  'POR PILA. ABC 02/09/2026: Duracell AAA blíster x4 $3.933,83 neto → $4.759,93 final el blíster (la referencia anterior $4.000 era el blíster).'),
  (61,   4996.12,  'ABC 02/09/2026: cinta aisladora 3M 175 negra 20 m $5.161,28 lista −20 % (×30).'),
  (831,  4493.48,  'ABC 02/09/2026: lubricante multiuso Drive+ 440 ml $3.713,62 neto (no es WD-40 de marca; la referencia anterior $12.976 era el WD-40).'),
  (932,  1778.70,  'ABC 01/09/2026: mecha acero rápido 4,25 Lenox $1.470 neto (×10).'),
  (825,  13081.31, 'ABC 07/08/2026: punta doble PH2 65 mm Impact Bosch $10.811 neto (×3).'),
  (358,  7217.65,  'ABC 07/08/2026: rodillo antigota 22 cm Sinteplast $5.965 neto (×10).')
) as v(id, p, n)
where m.id = v.id;

-- 3) altas ───────────────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, obs)
select v.nombre, 'unid', v.p, v.rubro, v.alias, 'material', true, v.obs
from (values
  ('Espuma poliuretano x 500ml (Fischer PU1)', 14157.39, 6, array['espuma fischer','espuma pu1','espuma poliuretano 500','espuma de poliuretano fischer','pu1/500'],
     'Alta 2026-09-06 desde factura ABC 0012-00397449 07/08/2026: $14.625,41 lista −20 %. Precio final.'),
  ('Tarugo Fischer SX10 + tornillo 6x60 (balde)', 80305.26, 6, array['sx10 + tmf 6x60','balde fischer sx10','balde de tarugos fischer','sx 10 con tornillo balde','fijaciones fischer balde'],
     'Alta 2026-09-06 desde factura ABC 0012-00397479 07/08/2026: $82.959,98 lista −20 %. Cantidad de fijaciones por balde no indicada en la factura.'),
  ('Lámpara halógena H4 24V (Osram)', 13270.09, 6, array['lampara h4','lampara h4 24v','halogena h4','foco h4 camion','osram h4 24v'],
     'Alta 2026-09-06 desde factura ABC 0012-00394050 06/07/2026 (×6): $13.708,77 lista −20 %. Es para los camiones.')
) as v(nombre, p, rubro, alias, obs)
where not exists (select 1 from public.stock_materiales m where m.nombre = v.nombre);

-- 4) renglones de pedido que coinciden con las facturas ───────────────────
create temp table vinc (item_id int, numero text, precio numeric, nota text);
insert into vinc values
  (3120, '12-400157', 11812.50, '3M PU550 negro: $12.203 lista −20 % → $11.812,50 final (la factura trae 20 unidades)'),
  (2737, '12-400157', 4996.12,  'cinta aisladora 3M 175: $5.161,28 lista −20 % → $4.996,12 final'),
  (2738, '12-400157', 4743.68,  'buscapolo Irimo: $4.900,50 lista −20 % → $4.743,68 final (la factura trae 4 unidades)'),
  (2963, '12-400157', 4493.48,  'lubricante multiuso Drive+ 440 ml: $3.713,62 neto → $4.493,48 final'),
  (2739, '12-400157', 1189.98,  'Duracell AAA: blíster x4 $3.933,83 neto → $1.189,98 final la pila (10 blísteres = 40 pilas)'),
  (988,  '12-397479', 26841.43, 'sierra circular ECO 7x60D Bosch: $22.183 neto → $26.841,43 final');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Factura ABC ' || v.numero || ': ' || v.nota,
       jsonb_build_object('motivo', 'facturas ABC 2026-09-06', 'factura_id', f.id, 'precio_anterior', i.precio_unit, 'precio_nuevo', v.precio)
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.facturas_compra f on f.proveedor_id = 7 and f.numero = v.numero;

update public.solicitud_compra_item i set factura_id = f.id, precio_unit = v.precio, proveedor_id = 7
  from vinc v join public.facturas_compra f on f.proveedor_id = 7 and f.numero = v.numero where i.id = v.item_id;
update public.materiales_a_cuenta_cliente c set precio_unit = v.precio, precio_total = round(c.cantidad * v.precio, 2), updated_at = now()
  from vinc v where c.item_id = v.item_id and c.cobro_id is null;
drop table vinc;
