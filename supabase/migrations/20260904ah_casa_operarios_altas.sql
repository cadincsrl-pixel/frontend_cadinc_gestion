-- 20260904ah — Casa Operarios (CC-014), texto libre, tanda 2: 25 altas + sus vínculos
--
-- OK del user 2026-09-04 ("da las altas que propones"). Precio de referencia =
-- precio de la compra (final; los tres del pedido #321 ya pasaron por
-- 20260904ag). Sinónimos para que la obra los encuentre como los pide. Cada
-- renglón se vincula a su fila nueva con evento; el disco Aliafor 4½ va a la
-- fila "Disco diamantado 115mm" que ya existe. No cambia ningún total.

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, v.unidad, v.precio_ref, v.rubro_id, v.alias, 'material',
       'Alta 2026-09-04 desde las compras de Casa Operarios (' || v.fuente || '). Precio de esa compra.'
from (values
  -- Sanitaria
  ('Curva de sobrepaso termofusión 25mm',          'unid',   1813.19, 1,  array['curva de sobrepaso 25','sobrepaso fusion 25','curva sobrepaso'],                       'pedido #238'),
  ('Flexible 1/2" x 30cm',                         'unid',   5320.10, 1,  array['flexible 30','flexible de 30cm','flexible 1/2 30'],                                    'pedido #238'),
  ('Sopapa p/ ducha',                               'unid',   4234.94, 1,  array['sopapa ducha','sopapa de ducha','sopapa para ducha'],                                  'pedido #342'),
  ('Buje reducción PVC 50 a 40mm',                  'unid',   1087.28, 1,  array['buje 40x50','buje 50 40 duratop','reduccion 50 40 pvc'],                              'pedido #342'),
  ('Pileta de lavar Ferrum mediana',               'unid', 145434.71, 1,  array['pileta de lavar','pileta lavadero','pileta de lavar mediana'],                          'pedido #374'),
  ('Grifería p/ pileta de lavar FV',               'unid',  83016.16, 1,  array['griferia pileta de lavar','griferia lavarropa','canilla pileta de lavar'],              'pedido #374'),
  ('Canilla de servicio FV 0436',                  'unid',   8733.51, 1,  array['canilla fv 0436','canilla 0436','canilla de servicio fv'],                              'pedido #374'),
  ('Botiquín c/ espejo Schneider',                 'unid', 210045.73, 1,  array['botiquin schneider','botiquin con espejo','botiquin de baño'],                           'pedido #374'),
  ('Sifón doble p/ pileta de cocina',              'unid',   4800.00, 1,  array['sifon doble','sifon doble cocina','sifon para bacha doble'],                            'pedido #392'),
  ('Grampa p/ lavatorio (par)',                    'unid',   2336.00, 1,  array['grampas para lavamanos','grampas lavatorio','grampa lavamanos'],                        'pedido #536'),
  ('Entrerrosca 1/2" PP',                          'unid',      0.00, 1,  array['entre rosca 1/2','entrerrosca 1/2','entre rosca de 1/2 pp'],                            'pedido #557, sin precio'),
  -- Gas
  ('Tapón epoxi gas 1/2"',                         'unid',   1349.28, 12, array['tapon epoxi 1/2','tapon epoxi gas','tapones epoxi'],                                    'pedido #287'),
  ('Flexible gas 1/2" x 30cm',                     'unid',  15219.39, 12, array['flexible gas 30','flexible de gas 30cm','flexible gas 1/2 30'],                         'pedido #342'),
  -- Electricidad
  ('Tablero embutir 36 bocas',                     'unid',  41576.12, 2,  array['caja de embutir 36 modulos','tablero 36 modulos','tablero de 36 bocas','caja din 36'],  'pedido #321'),
  ('Farol exterior trapezoidal c/ ménsula',        'unid',  28355.19, 2,  array['farol trapezoidal','farol con mensula','farol exterior'],                               'pedido #321'),
  ('Lámpara LED 12W',                              'unid',   1119.25, 2,  array['foco 12w','focos 12w','lampara 12w','led 12w'],                                         'pedido #321'),
  -- Albañilería / pisos
  ('Ferrite rojo',                                 'kg',     4500.00, 4,  array['ferrite rojo','ferrite colorado','oxido rojo'],                                          'pedido #248'),
  ('Guardacanto Atrim arco',                       'unid',  14408.30, 11, array['guardacanto arco','guardacantos arco','atrim arco'],                                    'pedido #474'),
  ('Guardacanto Atrim recto',                      'unid',  33976.70, 11, array['guardacanto atrim','guardacantos atrim','perfil guardacanto'],                          'pedido #474'),
  ('Guardacanto cuadrado metálico x 2.5m',         'unid',  38496.65, 11, array['guardacanto cuadrado','guardacanto metal','guardacanto cuadrado metal 2.5'],            'pedido #474'),
  -- Pintura
  ('Rodillo epoxi N°17',                           'unid',   4312.40, 5,  array['rodillo epoxi 17','rodillo epoxi n17','rodillo 17'],                                    'pedido #404'),
  -- Aberturas
  ('Picaporte (juego)',                            'unid',  21579.00, 10, array['picaporte','picaportes','juego de picaporte','manija de puerta'],                       'pedido #570'),
  ('Puerta mosquitera',                            'unid', 120000.00, 10, array['puerta mosquitera','puertas mosquiteras','mosquitero de puerta'],                       'pedido #536'),
  ('Soga p/ persiana',                             'm',       413.22, 10, array['soga para persiana','soga persiana','cinta de persiana'],                               'pedido #442'),
  -- Carpintería
  ('Colgador p/ alacena',                          'unid',      0.00, 13, array['cuelga alacena','colgador alacena','soporte alacena'],                                  'pedido #583, sin precio')
) as v(nombre, unidad, precio_ref, rubro_id, alias, fuente)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- vínculos ─────────────────────────────────────────────────────────────────
create temp table vinc (item_id int, nombre text);
insert into vinc values
  (913,  'Curva de sobrepaso termofusión 25mm'),
  (917,  'Flexible 1/2" x 30cm'),
  (1435, 'Sopapa p/ ducha'),
  (1439, 'Buje reducción PVC 50 a 40mm'),
  (1662, 'Pileta de lavar Ferrum mediana'),
  (1664, 'Grifería p/ pileta de lavar FV'),
  (1665, 'Canilla de servicio FV 0436'),
  (1670, 'Botiquín c/ espejo Schneider'),
  (1810, 'Sifón doble p/ pileta de cocina'),
  (2633, 'Grampa p/ lavatorio (par)'),
  (2720, 'Entrerrosca 1/2" PP'),
  (1149, 'Tapón epoxi gas 1/2"'),
  (1433, 'Flexible gas 1/2" x 30cm'),
  (1321, 'Tablero embutir 36 bocas'),
  (1328, 'Farol exterior trapezoidal c/ ménsula'),
  (1329, 'Lámpara LED 12W'),
  (962,  'Ferrite rojo'),
  (2306, 'Guardacanto Atrim arco'),
  (2307, 'Guardacanto Atrim recto'),
  (2308, 'Guardacanto cuadrado metálico x 2.5m'),
  (1875, 'Rodillo epoxi N°17'),
  (2305, 'Picaporte (juego)'),
  (2798, 'Picaporte (juego)'),
  (2630, 'Puerta mosquitera'),
  (2149, 'Soga p/ persiana'),
  (2887, 'Colgador p/ alacena'),
  (1776, 'Disco diamantado 115mm');   -- disco de 4 1/2 Aliafor

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.descripcion,
       jsonb_build_object('motivo', 'catalogo CC-014 2026-09-04', 'material_id', m.id, 'desc_canonica', m.nombre,
                          'unidad_anterior', i.unidad, 'unidad_nueva', i.unidad)
from vinc v
join public.stock_materiales m on m.nombre = v.nombre
join public.solicitud_compra_item i on i.id = v.item_id
where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = m.id, descripcion = m.nombre
  from vinc v join public.stock_materiales m on m.nombre = v.nombre
 where i.id = v.item_id and i.material_id is null;

update public.materiales_a_cuenta_cliente c
   set descripcion = m.nombre, updated_at = now()
  from vinc v join public.stock_materiales m on m.nombre = v.nombre
 where c.item_id = v.item_id and c.cobro_id is null;

drop table vinc;
