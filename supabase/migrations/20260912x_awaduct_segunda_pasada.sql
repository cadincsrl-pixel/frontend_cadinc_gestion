-- Segunda pasada del renombre de 20260912w.
--
-- Ese filtro buscaba el código de lista SOLO en el primer alias (alias[1]).
-- En 17 fichas el código está más atrás en el array, así que quedaron
-- afuera — entre ellas "Caño PVC 63mm x 4m" (cód. 1026), que es justo la que
-- se usó en el pedido 709. Acá se busca el código en CUALQUIER posición.
--
-- Las 17 son todas de la misma línea: caños de 40/50/63/110, codos MH,
-- ramales, reducciones y tapón, con códigos 1008/1017/1026/1035/1051 y
-- 20xx/21xx/22xx.
--
-- OJO con una: la 673 "Caño PVC pluvial 110mm x 4m" (cód. 1051). Awaduct
-- también hace pluvial, así que por código entra; pero conviene que el user
-- la confirme, porque sus vecinas de 63 (fichas 674 y 677) son pluvial SIN
-- código y esas sí son PVC.

begin;

update stock_materiales
   set alias = alias || array[ translate(lower(nombre), 'áéíóúüñ°"''', 'aeiouun') ]
 where activo and nombre ilike '%PVC%'
   and exists (select 1 from unnest(alias) a where a ~ '^[0-9]{4}$')
   and alias::text not ilike '%pvc%';

update stock_materiales
   set nombre = replace(nombre, 'PVC', 'Awaduct'), updated_at = now()
 where activo and nombre ilike '%PVC%'
   and exists (select 1 from unnest(alias) a where a ~ '^[0-9]{4}$');

-- Misma propagación que en 20260912w: solo a lo que no se cobró ni certificó.
update solicitud_compra_item i
   set descripcion = m.nombre
  from stock_materiales m
 where i.material_id = m.id
   and m.nombre like '%Awaduct%'
   and i.descripcion like '%PVC%'
   and i.descripcion = replace(m.nombre, 'Awaduct', 'PVC')
   and not exists (
     select 1 from materiales_a_cuenta_cliente c
      where c.item_id = i.id and (c.cobro_id is not null or c.certificado_id is not null)
   );

update materiales_a_cuenta_cliente c
   set descripcion = m.nombre, updated_at = now()
  from solicitud_compra_item i join stock_materiales m on m.id = i.material_id
 where c.item_id = i.id
   and c.cobro_id is null and c.certificado_id is null
   and m.nombre like '%Awaduct%'
   and c.descripcion = replace(m.nombre, 'Awaduct', 'PVC');

commit;
