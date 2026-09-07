-- 20260908n — CC-019 (Hipodromo): se vincula el texto libre que se puede
-- vincular sin adivinar (user 2026-09-07: "fijate de arreglar el cc-019 que
-- tiene muchos materiales de texto libre")
--
-- Hay 36 renglones sin ficha. 8 estan `rechazado` y no se tocan: nunca pasaron.
-- De los 28 que si estan en la cuenta -- ninguno cobrado -- SOLO TRES se pueden
-- resolver con lo que dice el texto. El resto no es un problema de matcheo: es
-- que al texto le FALTA el dato que define cual ficha es.
--
--   1408 "lavamanos" $42.357,84 -> Lavatorio Andina 46.5x42 1 agujero ($46.675).
--        Es el unico lavatorio comun del catalogo; el otro es de discapacitados
--        a $389.952. El precio del renglon acompaña.
--   1591 "curva a 90 de 32"     -> Curva termofusion 32mm 90°. Es la unica
--        curva de 32 que existe: en PVC no hay de esa medida.
--   2275 "tachos de 20 lts alba mate blanco" -> Latex interior x 20lts. Alba
--        mate blanco es latex interior mate; el tacho de 20 coincide.
--
-- VINCULAR NO ARREGLA EL STOCK. Como se vio en Lamadrid, colgar el renglon de
-- una ficha DESPUES de despacharlo no genera el movimiento retroactivo. Esto
-- ordena el catalogo y habilita el precio de referencia, nada mas.
--
-- Las descripciones NO se tocan: son renglones `enviado`, o sea documentos, y
-- ademas conviene que se siga viendo que se pidio en texto libre.
update public.solicitud_compra_item set material_id = 986  where id = 1408 and material_id is null;
update public.solicitud_compra_item set material_id = 958  where id = 1591 and material_id is null;
update public.solicitud_compra_item set material_id = 112  where id = 2275 and material_id is null;
