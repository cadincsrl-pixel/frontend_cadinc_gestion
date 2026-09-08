-- Catálogo: la familia real de discos diamantados 115mm (dictada por el user)
--
-- Había DOS fichas para CUATRO productos reales, con los sinónimos cruzados:
-- todos los alias "widia" caían en el diamantado genérico (441) y los alias
-- de "porcelanato" en el continuo (859) — que según el user es para
-- MAMPOSTERÍA, no porcelanato. Su clasificación (08/09):
--
--   · continuo 115 (Patroll amarillo)      → corta mampostería
--   · segmentado 115 (Patroll amarillo)    → corta hormigón
--   · turbo 115 (Patroll amarillo)         → mampostería y cerámica
--   · widia turbo fino 115 (Aliafor VERDE) → porcelanatos
--
-- Mapa: la 441 (que ya juntaba los "widia" y ref $24.000) pasa a ser el
-- Aliafor de porcelanato — en el habla de la obra "widia" ES ese disco, así
-- que sus 18 renglones históricos quedan bien apuntados. La 859 conserva
-- "continuo" pero pierde los alias de porcelanato/cerámico (van al Aliafor y
-- al turbo nuevo) y toma ref $13.925 — el precio real que el user confirmó
-- hoy (la ficha decía $3.850 y por eso Americana cobró barato). Segmentado y
-- turbo se crean en $0: toman precio con la primera compra.

update stock_materiales set
  nombre = 'Disco widia turbo fino p/ porcelanato 115mm (Aliafor verde)',
  alias = array['disco de 4 1/2 widia','disco de widia','disco de widia 4.1/2','disco de widia de 4 1/2',
                'disco de widia de 4"','disco de widia n4.1/2','disco widia','disco widia 4 1/2',
                'disco widia de 4 1/2','discos de widia','discos de widia 4 1/2','widia','widia turbo fino',
                'disco para porcelanato','disco para porcelanato 4 1/2','disco para porcelanato aliafort',
                'disco para porcelanato de 4"','disco porcelanato 4 1/2','disco aliafor','disco verde'],
  obs = 'El "widia" de los obreros: turbo fino, VERDE, marca Aliafor. Para cortar PORCELANATO. Clasificación del user 08/09/2026.'
where id = 441;

update stock_materiales set
  nombre = 'Disco diamantado continuo 115mm (Patroll amarillo)',
  alias = array['disco continuo','disco continuo 4 1/2','disco diamantado continuo',
                'disco para mamposteria','disco para mamposteria 4 1/2','disco amarillo continuo'],
  precio_ref = 13925, precio_actualizado_en = '2026-09-08',
  obs = 'Amarillo, marca Patroll. Para cortar MAMPOSTERÍA (no porcelanato: eso es el Aliafor verde). Ref $13.925 confirmada por el user el 08/09 (la ficha decía $3.850).'
where id = 859;

insert into stock_materiales (rubro_id, nombre, unidad, clase, stock_actual, stock_minimo, precio_ref, alias, activo, obs) values
  (7, 'Disco diamantado segmentado 115mm (Patroll amarillo)', 'unid', 'material', 0, 0, 0,
   array['disco segmentado','disco segmentado 4 1/2','disco diamantado segmentado',
         'disco para hormigon','disco para hormigon 4 1/2','disco hormigon'],
   true, 'Amarillo Patroll. Para cortar HORMIGÓN. Alta 08/09/2026 (clasificación del user); precio con la primera compra.'),
  (7, 'Disco diamantado turbo 115mm (Patroll amarillo)', 'unid', 'material', 0, 0, 0,
   array['disco turbo','disco turbo 4 1/2','disco diamantado turbo',
         'disco para ceramica','disco para ceramico 4 1/2','disco ceramico 4 1/2','disco ceramico 4”'],
   true, 'Amarillo Patroll. Corta MAMPOSTERÍA y CERÁMICA. Alta 08/09/2026 (clasificación del user); precio con la primera compra.');
