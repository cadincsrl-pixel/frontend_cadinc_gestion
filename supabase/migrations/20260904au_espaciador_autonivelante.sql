-- 20260904au — La bolsa de separadores, con el detalle de la factura
--
-- User (2026-09-04) manda el renglón de la factura de Zeramiko:
--   023133  ESPACIAD.AUTONIV.2mmCLIPS AMARX150u-5094  20 × $6.678,28 = $133.565,60
-- Es la fila 318 (hasta hoy "Separador plástico 2cm", que confundía: son
-- clips de 2 mm, no separadores de 2 cm). Todos sus renglones son bolsas
-- (Lamadrid #651, Farmacia América #671, Clínica Salta #614), así que se
-- renombra en el lugar. Factura A: $6.678,28 es neto → $8.080,72 final.

update public.stock_materiales
   set nombre = 'Espaciador autonivelante 2mm clips amarillos x 150u (bolsa)',
       rubro_id = (select id from public.stock_rubros where nombre = 'Pisos y revestimientos'),
       precio_ref = 8080.72,
       alias = array(select distinct unnest(alias || array[
         'bolsa de separadores', 'bolsas de separadores', 'separadores bolsa', 'separadores', 'separadores 2mm',
         'separadores autonivelantes', 'separadores nivelantes', 'separadores porcelanato', 'separadores de porcelanato',
         'espaciador autonivelante', 'espaciador autonivelante 2mm', 'espaciad autoniv 2mm', 'espaciadores 2mm',
         'clips amarillos', 'clips nivelantes', 'clips 2mm', 'bolsa de clips', 'clips x 150', 'separador plastico 2cm', '023133'
       ])),
       obs = coalesce(obs || ' · ', '') || 'Factura Zeramiko cód. 023133 "ESPACIAD.AUTONIV.2mmCLIPS AMARX150u-5094": $6.678,28 neto la bolsa de 150 clips → $8.080,72 final. Va con la cuña p/ nivelador de porcelanato.'
 where id = 318;
