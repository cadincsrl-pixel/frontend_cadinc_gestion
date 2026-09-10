-- "laxer" era el nivel láser autonivelante, y ya teníamos ficha.
--
-- El 09/09 a la mañana, antes de que se deployara el arreglo de las altas
-- rápidas, Cristian Sosa creó cuatro fichas a $11 desde el pedido (el
-- formulario exigía un precio > 0 y se ponía cualquiera). Tres se corrigieron
-- el mismo día en 20260912l/m/n —masilla poliéster a $14.000, alfombra a
-- $459.000, trincheta pasada a herramienta— y la cuarta se me pasó.
--
-- El user confirmó qué es: *"es laser autonivelante"*. O sea que la 2661
-- "laxer" ($11, unid, clase material, sin alias, sin obs) es un DUPLICADO de
-- la 1123 "Nivel láser autonivelante", que existe desde el 04/09 y está bien
-- cargada como `clase='herramienta'` — sin precio y fuera de la cuenta del
-- cliente, que es lo que corresponde para una herramienta (§5.12).
--
-- La 2661 no arrastra nada: 0 renglones de pedido, 0 movimientos de stock,
-- 0 filas de pañol y stock_actual en 0. Por eso alcanza con darla de baja;
-- no hace falta fusionar_tipo_herramienta (no hay nada que mover).

begin;

-- El error de tipeo entra como sinónimo de la ficha buena, así que la próxima
-- vez que alguien escriba "laxer" en un pedido, el buscador la encuentra en
-- lugar de ofrecerle crear una ficha nueva. "laser autonivelante" ya está
-- cubierto: es substring del alias "nivel laser autonivelante" que ya tiene.
update stock_materiales
   set alias = alias || array['laxer'], updated_at = now()
 where id = 1123 and not ('laxer' = any(alias));

update stock_materiales
   set activo = false,
       obs = 'Baja 09/09/2026: duplicado de la ficha 1123 "Nivel láser autonivelante". '
             || 'Nació a $11 desde un alta rápida (el formulario exigía precio). '
             || 'Sin uso: 0 pedidos, 0 movimientos, 0 pañol. El sinónimo "laxer" se pasó a la 1123.',
       updated_at = now()
 where id = 2661;

commit;
