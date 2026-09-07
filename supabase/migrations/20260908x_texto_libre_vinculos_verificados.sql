-- 20260908x — Texto libre: se vinculan los 15 renglones que sobrevivieron a la
-- verificacion, y se marcan los 21 que no son materiales
-- (user 2026-09-07: "repasa los materiales de todas las obras ... sin
-- necesitarme, estoy entrenando")
--
-- Barrido de 8 agentes sobre los 334 renglones con material_id NULL, mas un
-- esceptico por cada vinculo propuesto con la consigna de REFUTARLO. De 31
-- vinculos propuestos, 15 sobrevivieron y 16 se cayeron.
--
-- VINCULAR NO MUEVE PLATA: solo setea material_id. Ni la cantidad ni el precio
-- se tocan, y ningun trigger de esta tabla escribe en la cuenta del cliente. El
-- item 408 esta COBRADO y por eso mismo se lo vincula sin tocarle nada mas.
--
-- Los 42 renglones que pedirian FICHA NUEVA y los 240 a los que les falta un
-- dato NO se tocan: crear 42 fichas sin que nadie las mire es justo lo que la
-- fase 1 del catalogo vino a evitar.
update public.solicitud_compra_item i
set material_id = v.mat
from (values
  (408,  101),  -- "1 barra de hierro del 12"            -> Hierro Ø 12mm x 12m
  (864,   16),  -- "caños de 25 fucion 35 ml"            -> Caño termofusion 25mm
  (2912, 208),  -- "tubo hembra de 25x 3/4"              -> Rosca hembra termofusion 3/4"
  (1633, 838),  -- "5 ml de cinta perforada"             -> Fleje perforado galvanizado
  (905,  966),  -- "T de 32 con reduccion a 25 fucion"   -> Te termofusion reduccion 32x25mm
  (338,  935),  -- "bolsa de precintos de 25cm"          -> Precinto plastico 25cm
  (2706,1324),  -- "lajas frontis"                       -> Lajas frontis
  (3459, 433),  -- "Planchuela 3/4 x 1/8"                -> Hierro plano 3/4" x 6m
  (3188,1567),  -- "fino exterior y interior"            -> Revoque fino Weber extra blanco
  (1268, 526),  -- "Reja para ventanas"                  -> Reja p/ ventana a medida
  (1101, 718),  -- "disco de sierra circular n7"         -> Disco sierra circular 7 1/4"
  (814, 1567),  -- "bolsas fino exterior y interior"     -> Revoque fino Weber extra blanco
  (639,  167),  -- "disco de corte metal 115mm x 1.6mm"  -> Disco corte 115mm
  (1111,1132),  -- "fusionadora..."                      -> Termofusora p/ PPR (HERRAMIENTA)
  (1103, 647)   -- "protector auditivos"                 -> Protector auditivo copa (EPP)
) as v(item, mat)
where i.id = v.item and i.material_id is null;

-- Avisos que dejo la verificacion y que hay que resolver a mano.
update public.solicitud_compra_item
set obs = coalesce(obs || ' · ', '') || 'VINCULADO 07/09 pero REVISAR: ' || v.aviso
from (values
  (864,  'la ficha se mide en METROS y el renglon quedo en "unid" con cantidad 0 y $67.560,55, que parece el TOTAL de los 35 ml. Pasar cantidad=35 y precio por metro.'),
  (1633, 'la ficha es por ROLLO y el renglon pide 5 metros.'),
  (338,  'la ficha es POR UNIDAD y el renglon pide una BOLSA (suelen ser 100). Con cantidad 1 se registra un solo precinto.'),
  (2706, 'la ficha se mide en M2 ($63.333,33/m2) y el renglon dice 1 unid por $190.000, o sea ~3 m2.'),
  (3459, 'la ficha es la barra de 6 m pero sus alias muestran compras de 2 m, y el renglon no dice el largo.'),
  (3188, 'la ficha es por BOLSA de 25 kg y el renglon dice 1 unid: falta cuantas bolsas son.'),
  (1268, 'la ficha se mide en M2 y el renglon dice 1 unid: faltan los m2 reales.'),
  (1101, 'cantidad 0 y precio $1,21: los dos datos estan mal cargados.'),
  (639,  'cantidad 0 y precio 0.'),
  (1103, 'cantidad 0.'),
  (1111, 'la ficha es clase HERRAMIENTA y el renglon quedo como material, con $198.000. Las herramientas no se facturan a la obra (CLAUDE.md 5.12); definir si corresponde pasarlo al panol.')
) as v(item, aviso)
where id = v.item;

-- Los 21 que NO son materiales: 5 lineas de IVA, 4 nombres de responsables,
-- canjes de herramienta, tareas y notas sueltas. NO se borran -- algunos estan
-- en la cuenta y borrar es destructivo -- pero quedan identificados.
update public.solicitud_compra_item
set obs = coalesce(obs || ' · ', '') ||
  'NO ES UN MATERIAL (revision 07/09): es una linea de impuesto, un nombre de responsable, una tarea, un canje de herramienta o una nota suelta. No deberia estar como renglon de pedido ni figurar en la cuenta de la obra.'
where id in (1640,376,241,1353,897,1354,2386,2546,483,2195,1700,1516,852,3133,1965,1517,1989,2334,1270,894,3183)
  and coalesce(obs,'') not like '%NO ES UN MATERIAL%';
