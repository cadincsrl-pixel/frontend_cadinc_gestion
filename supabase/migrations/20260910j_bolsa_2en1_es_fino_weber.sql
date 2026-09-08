-- Catálogo: "bolsa de 2 en 1" = el fino Weber interior/exterior
--
-- El renglón texto-libre "bolsa de 2 en 1" de FARMACIA AMERICA (item 2895,
-- 27/08, $9.500) es la ficha 1567 "Revoque fino Weber extra blanco
-- interior/exterior x 25kg" (dicho del user). Se vincula y la ficha gana
-- el apodo, así el buscador lo encuentra la próxima vez. El precio cobrado
-- ($9.500, contra ref $9.330,49) se deja como está.

update solicitud_compra_item
   set material_id = 1567
 where id = 2895;

update stock_materiales
   set alias = (select array_agg(distinct a) from unnest(
                  coalesce(alias, '{}') || array['2 en 1', 'bolsa 2 en 1', 'fino 2 en 1']
                ) a)
 where id = 1567;
