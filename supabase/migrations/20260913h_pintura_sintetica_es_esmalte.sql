-- "Pintura sintética" es como se le dice al esmalte sintético.
--
-- El 10/09 dos renglones de GARITA (pedido 720) quedaron como texto libre:
-- "Pintura sintetica negro mate x4 lts" ($46.500) y "pintura sintetica blanco
-- brillante x 1lts" ($11.375). Las fichas EXISTÍAN — 703 y 699 — pero el
-- catálogo las llama "Esmalte sintético" y en obra dicen "pintura sintética".
-- Como el matcher del Combobox es substring, "pintura sintetica negro" no pega
-- contra "Esmalte sintético negro x 4lts" y el renglón nació suelto.
--
-- El user lo confirmó: *"lo de garita es esmalte sintetico, la llaman así a
-- veces"*.
--
-- Se arregla en los dos niveles: se enganchan los dos renglones, y las 23
-- fichas de esmalte sintético reciben su nombre dicho de la otra forma, para
-- que la próxima el buscador las encuentre igual. El alias se genera del
-- nombre, así que es una frase completa por ficha ("pintura sintetica negro x
-- 4lts") y no la palabra suelta: el matcher es substring y un alias corto
-- contamina búsquedas lejanas.

begin;

-- 1) Los dos renglones a su ficha.
update solicitud_compra_item set material_id = 703, descripcion = 'Esmalte sintético negro x 4lts'  where id = 3651;
update solicitud_compra_item set material_id = 699, descripcion = 'Esmalte sintético blanco x 1lt'   where id = 3652;

update materiales_a_cuenta_cliente set descripcion = 'Esmalte sintético negro x 4lts', updated_at = now() where item_id = 3651;
update materiales_a_cuenta_cliente set descripcion = 'Esmalte sintético blanco x 1lt',  updated_at = now() where item_id = 3652;

-- 2) Las dos fichas estaban en $0, que es justamente lo que hace nacer sin
--    precio al despacho siguiente. Toman el valor de estos renglones.
--    OJO: es una valuación de despacho, no una factura — pero encaja con el
--    resto del catálogo (el esmalte genérico de 4 lts está en $49.200 y el
--    blanco de 4 lts en $40.356), así que es mejor referencia que el cero.
update stock_materiales set precio_ref = 46500, precio_actualizado_en = '2026-09-10' where id = 703 and precio_ref = 0;
update stock_materiales set precio_ref = 11375, precio_actualizado_en = '2026-09-10' where id = 699 and precio_ref = 0;

-- 3) Las 23 fichas de esmalte pasan a encontrarse también por "pintura".
--    El alias sale del propio nombre, normalizado como los demás del catálogo.
update stock_materiales m
   set alias = m.alias || array[
         translate(lower(replace(m.nombre, 'Esmalte sintético', 'pintura sintetica')),
                   'áéíóúüñ°"''', 'aeiouun')
       ],
       updated_at = now()
 where m.activo
   and m.nombre like 'Esmalte sintético%'
   and not exists (
     select 1 from unnest(m.alias) a where a like 'pintura sintetica%'
   );

commit;
