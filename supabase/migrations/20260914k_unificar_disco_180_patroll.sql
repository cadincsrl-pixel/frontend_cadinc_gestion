-- Dos fichas para el mismo disco de 180, unificadas en la 861. Decisión del user el 14/09
-- después de mandar la foto del blíster.
--
--   861  "Disco diamantado 180mm"  $9.418  5 renglones, alias "disco de widia de 7"
--   1562 "Disco widia 180mm"       $9.110  sin alias, con la compra de Sosa (30 unidades)
--
-- Que son el mismo producto lo prueban los precios contra el aviso del fabricante: el
-- Patroll PYT-7 turbo de 180 mm sale $9.552, y las dos fichas estaban en $9.418 y $9.110.
-- La 1562 nació de un alta rápida porque el buscador no encontró la 861: la 861 no tenía
-- ningún alias con la palabra "widia" en singular ni el nombre "disco widia 180mm".
--
-- El nombre nuevo sigue el de sus hermanas de 115 mm, que ya estaban bien puestas
-- (continuo / turbo / segmentado + línea). El blíster dice Turbo y 7".
--
-- NO se propaga el nombre nuevo a la descripción de los renglones: los cinco de la 861 y
-- el de la 1562 están enviados, comprados o rechazados, y esa descripción es el registro
-- de lo que se pidió en su momento. No hay ninguno pendiente.
--
-- Y Patroll resulta ser la LÍNEA AMARILLA DE ALIAFOR, no otra marca: lo dice el pie del
-- envase. En el catálogo figuraban como fabricantes distintos ("Aliafor verde" contra
-- "Patroll amarillo"). No se tocan los nombres, porque las dos líneas tienen precios muy
-- distintos ($24.000 contra $9.500) y conviene distinguirlas; se suma "aliafor" como
-- sinónimo para que buscar la marca traiga las dos.

-- 1) la compra de Sosa pasa a la ficha buena
update public.solicitud_compra_item set material_id = 861 where material_id = 1562;

-- 2) los alias de las dos juntos, más los del nombre viejo y el código del producto
update public.stock_materiales
   set alias = (select array_agg(distinct a order by a) from unnest(
                  alias || array['disco widia 180mm','disco widia 180','disco widia de 7',
                                 'disco turbo 180','disco turbo 7','pyt-7','pyt 7','aliafor']) a),
       nombre = 'Disco diamantado turbo 180mm (Patroll amarillo)'
 where id = 861;

-- 3) la duplicada sale de circulación
update public.stock_materiales
   set activo = false,
       obs = coalesce(obs||' | ','') || 'Duplicada de la ficha 861 (mismo Patroll turbo 180mm). Unificada el 2026-09-14.'
 where id = 1562;

-- 4) que buscar "aliafor" traiga las dos líneas
update public.stock_materiales
   set alias = (select array_agg(distinct a order by a) from unnest(alias || array['aliafor']) a)
 where id in (859, 2647, 2648, 2649);
