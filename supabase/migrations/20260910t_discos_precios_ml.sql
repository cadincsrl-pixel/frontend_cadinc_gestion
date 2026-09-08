-- Catálogo: precios de Mercado Libre para los discos Patroll nuevos
--
-- Búsqueda del 08/09 (3 agentes, valor medio del rango creíble, IVA
-- incluido; ML bloquea el fetch directo, precios de snippets + Easy +
-- lectura en vivo del listado):
--
--   Segmentado 115 (Patroll PYS-4.5): $7.500  (ML $5.800-$8.500, 5+
--     vendedores; es la línea económica de Aliafor, cotiza abajo del
--     continuo — no es error)
--   Turbo 115 (Patroll PYT-4.5):      $9.500  (ML $9.475; Distribix $9.164)
--   Segmentado 180 (Patroll PYS-7):  $15.000  (ML $12.300-$17.800;
--     Easy $14.600)

update stock_materiales set precio_ref = 7500,  precio_actualizado_en = '2026-09-08',
  obs = obs || ' Ref $7.500 de ML 08/09 (PYS-4.5, rango $5.800-8.500).'
 where nombre = 'Disco diamantado segmentado 115mm (Patroll amarillo)';

update stock_materiales set precio_ref = 9500,  precio_actualizado_en = '2026-09-08',
  obs = obs || ' Ref $9.500 de ML 08/09 (PYT-4.5).'
 where nombre = 'Disco diamantado turbo 115mm (Patroll amarillo)';

update stock_materiales set precio_ref = 15000, precio_actualizado_en = '2026-09-08',
  obs = obs || ' Ref $15.000 de ML 08/09 (PYS-7, Easy $14.600).'
 where nombre = 'Disco diamantado segmentado 180mm (Patroll amarillo)';
