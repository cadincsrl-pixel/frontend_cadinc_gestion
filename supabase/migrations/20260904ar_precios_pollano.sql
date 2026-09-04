-- 20260904ar — Precios de Pollano Sanitarios (10 presupuestos manuscritos, jul–ago 2026)
--
-- Fotos en datos-entrada/ (WhatsApp 13/08). Presupuestos "X" a consumidor
-- final: precios FINALES (IVA incluido), se cargan tal cual. Regla: el precio
-- de referencia es el más reciente que tenemos; donde otra fuente (El
-- Fontanero 11/08, Excel de Nicolás 26/08–02/09) es posterior, se deja y se
-- anota. Precios repetidos en varios presupuestos (codo 25 = $630 ×3, barra
-- de 25 = $9.100 ×3) confirman la lectura de la letra.
--
-- Corrección aparte: el caño termofusión 32 estaba a $1.167,32/m porque leí
-- la factura de El Fontanero 0008-2336 como "la barra de 4 m", pero el
-- renglón "TUBO AMANCO FUSION PN 20 32 MM 56011132-M" es POR METRO
-- ($3.858,92 neto). Queda $4.669,29/m (Fontanero 11/08 > Pollano 7/8 $3.875).

-- 1) precios sobre filas existentes ─────────────────────────────────────────
update public.stock_materiales set precio_ref = v.p, obs = coalesce(obs || ' · ', '') || v.n
from (values
  (16,   2275.00, 'Pollano 07/08/2026: barra de 4 m $9.100 (también 03/07 y 05/08).'),
  (18,    630.00, 'Pollano 07/08/2026 (también 03/07 y 05/08).'),
  (203,   480.00, 'Pollano 07/08/2026 (también 05/08).'),
  (724,  3790.00, 'Pollano 05/08/2026 (codo 25 x 1/2 H).'),
  (726, 14050.00, 'Pollano 05/08/2026 (llave de paso 25 c/ campana).'),
  (207,  3700.00, 'Pollano 05/08/2026 (cupla 25 x 1/2 H).'),
  (205,  3690.00, 'Pollano 03/07/2026 (tubo macho 25 x 1/2).'),
  (202,  1430.00, 'Pollano 07/08/2026.'),
  (204,   670.00, 'Pollano 07/08/2026.'),
  (198,  4669.29, 'POR METRO. Factura El Fontanero 0008-2336 11/08/2026: $3.858,92 neto el metro (antes estaba leído como barra). Pollano 07/08: $3.875/m.'),
  (5,    1090.00, 'Pollano 07/08/2026 (codo 40 MH).'),
  (189,  6730.00, 'Pollano 07/08/2026 (ramal Y 110x110); 11/07 $6.900.'),
  (4,   41900.00, 'Pollano 07/08/2026: caño 110 x 4 m esp. 3.2.'),
  (1039,  240.00, 'Pollano 23/07/2026 (entrerrosca 1/2 PP).'),
  (21,   6200.00, 'Pollano 03/07/2026 (canilla esférica pico 1/2).'),
  (209,  3590.00, 'Pollano 21/07/2026 (llave esférica 1/2).'),
  (772, 14400.00, 'Pollano 04/08/2026: bolsa de yeso.')
) as v(id, p, n)
where stock_materiales.id = v.id;

update public.stock_materiales
   set alias = array(select distinct unnest(alias || array['llave esferica 1/2', 'llave esferica de 1/2']))
 where id = 209;

-- Sombrerete: la fila era de gas; el de Pollano es el de chapa de 100 para ventilación.
update public.stock_materiales
   set nombre = 'Sombrerete de chapa 100mm', rubro_id = 1, precio_ref = 12340.00,
       alias = array(select distinct unnest(alias || array['sombrerete chapa 100', 'sombrerete de chapa', 'sombrerete 100'])),
       obs = coalesce(obs || ' · ', '') || 'Pollano 07/08/2026: sombrerete chapa 100 $12.340.'
 where id = 588;

-- 2) altas (Sanitaria, precio final) ─────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, v.unidad, v.precio_ref, 1, v.alias, 'material',
       'Alta 2026-09-04 desde presupuesto Pollano ' || v.fuente || '. Precio final.'
from (values
  ('Codo termofusión 25mm c/ rosca hembra 3/4"',    'unid',  3990.00, array['codo 25 x 3/4 hembra','codo 25x3/4 h','codo con rosca 3/4 fusion 25'],            '05/08/2026'),
  ('Tapón termofusión 20mm',                         'unid',   380.00, array['tapa 20 ff','tapon fusion 20','tapa fusion 20','tapon de 20'],                     '07/08/2026'),
  ('Tapón termofusión 25mm',                         'unid',   570.00, array['tapa 25 ff','tapon fusion 25','tapa fusion 25','tapon de 25'],                     '07/08/2026'),
  ('Tapón termofusión 32mm',                         'unid',   770.00, array['tapa h 32 ff','tapon fusion 32','tapa fusion 32','tapon de 32'],                   '07/08/2026'),
  ('Niple 1/2" x 5cm PP',                            'unid',   370.00, array['niple 1/2 x 5','niple pp 1/2','niple de 1/2'],                                     '23/07/2026'),
  ('Codo roscado 1/2" PP',                           'unid',   470.00, array['codo 1/2 pp','codo pp 1/2','codo roscado 1/2'],                                    '23/07/2026'),
  ('Codo roscado 3/4" PP',                           'unid',   660.00, array['codo 3/4 pp','codo pp 3/4','codo roscado 3/4'],                                    '30/07/2026'),
  ('Cupla roscada 3/4" PP',                          'unid',   590.00, array['cupla 3/4 pp','cupla pp 3/4','cupla roscada 3/4'],                                 '30/07/2026'),
  ('Caño PP roscado 3/4" (bicapa)',                  'm',     2630.00, array['caño 3/4 bicapa','cano bicapa 3/4','caño pp 3/4','cano 3/4 bicapa'],                '30/07/2026'),
  ('Canilla esférica bronce 1/2"',                   'unid', 21300.00, array['canilla bronce 1/2','canilla bronce esferica','canilla de bronce 1/2'],             '05/08/2026'),
  ('Prolongación cromada 1/2" x 5cm',                'unid',  8400.00, array['prolongacion 1/2 x 5','prolongacion cromada','prolong 1/2 x 5 crom'],              '05/08/2026'),
  ('Descarga p/ depósito Ferrum c/ flapper (VF051)', 'unid', 28600.00, array['descarga ferrum','descarga con flapper','flapper ferrum','vf051','vf151'],          '07/08/2026'),
  ('Pulsador p/ depósito Ferrum (VTA)',              'unid', 19800.00, array['pulsador ferrum','pulsador deposito','boton deposito ferrum','vta 318','vta 99'],  '07/08/2026'),
  ('Kit de fijación p/ depósito Ferrum (VTC04)',     'unid', 10300.00, array['kit fijacion ferrum','kit fijacion deposito','vtc04'],                              '07/08/2026'),
  ('Válvula pressmatic p/ mingitorio',               'unid', 45500.00, array['pressmatic mingitorio','valvula mingitorio pressmatic','pressmatic'],              '23/07/2026'),
  ('Grampa omega 3/4"',                              'unid',   360.00, array['grampa omega','grampas omega 3/4','omega 3/4'],                                    '07/08/2026')
) as v(nombre, unidad, precio_ref, alias, fuente)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));
