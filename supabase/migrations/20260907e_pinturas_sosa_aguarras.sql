-- 20260907e — Pedido 680 (CONCEPCION CAPILLA, Sosa): tres altas rápidas con
-- código de proveedor pasan a las filas reales del catálogo; el código queda
-- como sinónimo. Según el user: 7055 = esmalte sintético x 4 lts; 7067 y 7005 =
-- latex exterior x 20 lts. Más adelante las pinturas se van a cargar por marca
-- (la iglesia usa mucho SW); por ahora el código vive como sinónimo.
update public.solicitud_compra_item
   set material_id = 122, descripcion = 'Esmalte sintético x 4lts (cód. 7055)', unidad = 'lata'
 where id = 3400;
update public.solicitud_compra_item
   set material_id = 115, descripcion = 'Latex exterior x 20lts (cód. 7067)', unidad = 'lata'
 where id = 3401;
update public.solicitud_compra_item
   set material_id = 115, descripcion = 'Latex exterior x 20lts (cód. 7005)', unidad = 'lata'
 where id = 3402;

-- El despacho de depósito de esa pintura (2 latas, forzado sin stock) sigue al material real.
update public.stock_movimientos set material_id = 122 where id = 196 and material_id = 1540;
update public.stock_materiales set stock_actual = stock_actual - 2 where id = 122;

-- Sinónimos con el código, para que el buscador los encuentre la próxima vez.
update public.stock_materiales
   set alias = array(select distinct x from unnest(alias || array['pintura cod7055 x 4l','pintura cod 7055','esmalte sintetico 7055','cod 7055','7055']) x)
 where id = 122;
update public.stock_materiales
   set alias = array(select distinct x from unnest(alias || array['pintura codigo 7067 x 20l','latex exterior 7067','cod 7067','7067','pintura iglesia 7005 x 20l','latex exterior 7005','cod 7005','7005']) x)
 where id = 115;
-- El 7055 no es latex: sacar el sinónimo equivocado de "pintura latex cod 7689".
update public.stock_materiales set alias = array_remove(alias, 'pintura cod 7055') where id = 946;

-- Las tres filas de hoy, ya sin referencias, se borran.
delete from public.stock_materiales where id in (1540, 1541, 1542)
  and not exists (select 1 from public.solicitud_compra_item i where i.material_id = stock_materiales.id)
  and not exists (select 1 from public.stock_movimientos m where m.material_id = stock_materiales.id);

-- Aguarrás viene por 1, 4 y 5 litros: faltaban las presentaciones de 1 y 5.
insert into public.stock_materiales (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias, clase)
values
  (5, 'Aguarrás x 1lt',  'lata', 0, 0, 0, true, array['aguarras x 1lt','aguarras 1 litro','aguarras x 1','aguarras chico'], 'material'),
  (5, 'Aguarrás x 5lts', 'lata', 0, 0, 0, true, array['aguarras x 5lts','aguarras 5 litros','aguarras x 5','aguarras 5 lts'], 'material');
update public.stock_materiales set alias = array_remove(alias, 'aguarras x 1lt') where id = 357;

-- La cuenta del cliente del despacho (obra a cargo de CADINC): descripción
-- real y precio de referencia del esmalte, que había quedado en $0.
update public.materiales_a_cuenta_cliente
   set descripcion = 'Esmalte sintético x 4lts (cód. 7055)',
       precio_unit = 49200, precio_total = 2 * 49200
 where id = 3188 and item_id = 3400 and precio_unit = 0;
