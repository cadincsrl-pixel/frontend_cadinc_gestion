-- FARMACIA AMERICA (CC-023): precios de Mercado Libre a los 5 renglones
-- que no tenían dato en ninguna parte de la base
--
-- Pedido del user: "los precios de las cosas que faltan lo podés buscar en
-- mercado libre". Búsqueda del 08/09 (5 agentes en paralelo), en cada caso
-- el valor MEDIO del rango relevado, final con IVA:
--
--   2735 Codo PVC c/acometida 110x63  x2  $11.188/u  (rango 7.100-12.800;
--        se vende como codo c/3 acometidas ortogonales, Duratop)
--   2740 Curva PVC 50mm 45°           x1   $2.106/u  (rango 1.190-3.500;
--        Concorplast MH línea 3.2)
--   2742 Te termofusión red. 25x20    x4   $2.676/u  (mayoría 1.900-4.000;
--        Tigre ref 2721, medida exacta)
--   2778 Puntal metálico regulable    x3  $46.572/u  (rango 35.754-87.000;
--        telescópico 2,0-3,5m tipo alemán — no existe "fijo de 2,5m")
--   3222 Perfil C 120x50x15 x 6m      x3  $68.750/u  (rango 49.520-81.884
--        la barra de 6m; derivado de la de 12m en 2mm $137.500,
--        corroborado con Creasteel $66.083)
--
-- Total: $381.152. Con esto la obra queda sin renglones en $0.

update materiales_a_cuenta_cliente set precio_unit = 11188, precio_total = 22376,  updated_at = now() where id = 2735 and obra_cod = 'CC-023';
update materiales_a_cuenta_cliente set precio_unit = 2106,  precio_total = 2106,   updated_at = now() where id = 2740 and obra_cod = 'CC-023';
update materiales_a_cuenta_cliente set precio_unit = 2676,  precio_total = 10704,  updated_at = now() where id = 2742 and obra_cod = 'CC-023';
update materiales_a_cuenta_cliente set precio_unit = 46572, precio_total = 139716, updated_at = now() where id = 2778 and obra_cod = 'CC-023';
update materiales_a_cuenta_cliente set precio_unit = 68750, precio_total = 206250, updated_at = now() where id = 3222 and obra_cod = 'CC-023';

update solicitud_compra_item i
   set obs = coalesce(i.obs || ' · ', '') ||
             'Precio de referencia tomado de Mercado Libre el 08/09/2026 (valor medio del rango relevado, IVA incluido).'
  from materiales_a_cuenta_cliente c
 where c.item_id = i.id and c.id in (2735, 2740, 2742, 2778, 3222);
