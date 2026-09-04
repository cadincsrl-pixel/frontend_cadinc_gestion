-- 20260904bg — Villaguay (cc 24, llave en mano): ordenar lo que se mandó
--
-- 116 renglones, 14 pedidos, $3.239.779, 79 sin precio y 80 en texto libre.
-- 1) Los renglones del catálogo sin precio toman el precio de referencia (menos
--    el aguarrás x 4, cuyo precio de referencia está roto en $26,62).
-- 2) Altas de lo que faltaba y se entiende (eléctrica Cambre, riel DIN, cierra
--    puertas, descarga de lavatorio, gas R32, nitrógeno, baldosa, chapa lisa C25
--    en hoja, piso granítico, caño 20x10, reflector, artefacto exterior,
--    lavatorio Espacio, barral antipánico, fotocélula, travesaño de cielorraso).
-- 3) Vínculos de texto libre a filas del catálogo (con precio del catálogo o
--    el que ya traía el renglón). Las pinturas "6105 / 7005 / 7055" son códigos
--    de color Sherwin: van a Loxon LD interior/exterior mate (base EW) y a los
--    esmaltes; los renglones en litros pasan a lata (4 lt = 1 lata) o a precio
--    por litro (10 lt de Loxon exterior).
-- 4) Los $1,21 de marcador quedan en $0 visible.
-- 5) "máquina para inflar cañería de agua" es una herramienta (bomba de prueba):
--    sale de la cuenta y va al pañol.
-- Queda en texto libre lo que es a medida o no se entiende (ver diario).

-- 1) precios del catálogo ────────────────────────────────────────────────────
create temp table precios as
select i.id as item_id, m.precio_ref as precio, 'precio de referencia del catálogo (' || m.nombre || ')' as fuente
from public.solicitud_compra_item i
join public.solicitud_compra s on s.id = i.solicitud_id
join public.stock_materiales m on m.id = i.material_id
where s.obra_cod = 'cc 24' and coalesce(i.precio_unit, 0) = 0 and m.precio_ref > 0 and m.id <> 357;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $' || p.precio || ' (' || p.fuente || ')',
       jsonb_build_object('motivo', 'cc 24 Villaguay 2026-09-04', 'precio_anterior', i.precio_unit, 'precio_nuevo', p.precio)
from precios p join public.solicitud_compra_item i on i.id = p.item_id;
update public.solicitud_compra_item i set precio_unit = p.precio from precios p where i.id = p.item_id;
update public.materiales_a_cuenta_cliente c set precio_unit = p.precio, precio_total = round(c.cantidad * p.precio, 2), updated_at = now()
  from precios p where c.item_id = p.item_id and c.precio_unit = 0 and c.cobro_id is null;
drop table precios;

-- 2) altas ───────────────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, v.unidad, v.precio_ref, (select id from public.stock_rubros where nombre = v.rubro), v.alias, 'material',
       'Alta 2026-09-04 desde Villaguay (cc 24). ' || v.nota
from (values
  ('Tapa 1 módulo Cambre (punto simple)',            'unid',  3600.00, 'Electricidad',          array['tapa punto simple','tapa 1 modulo','tapa cambre 1 modulo','tapa punto simple cambre'],             'Precio del pedido #440 (proveedor).'),
  ('Tapa 2 módulos Cambre (toma doble)',             'unid',     0,    'Electricidad',          array['tapa toma doble','tapa 2 modulos','tapa cambre 2 modulos','tapa toma doble cambre'],              'Sin precio.'),
  ('Tecla (batidor) Cambre negro',                   'unid',     0,    'Electricidad',          array['batidor cambre','batidores negros cambre','tecla cambre negra','batidor negro'],                  'Sin precio.'),
  ('Portabastidor p/ cablecanal',                    'unid',     0,    'Electricidad',          array['portabastidor cable canal','porta bastidor cablecanal','portabastidor'],                          'Sin precio.'),
  ('Bornera de distribución (repartidor)',           'unid', 60000.00, 'Electricidad',          array['bornera de distribucion','repartidor de corriente','bornera repartidora','borne distribuidor'],   'Precio del pedido #440 (proveedor).'),
  ('Reflector LED 10W exterior',                     'unid',  6023.26, 'Electricidad',          array['reflector 10w','reflectores 10w exterior','reflector led 10','reflector exterior 10w'],           'Precio del pedido #85 (proveedor).'),
  ('Artefacto de iluminación exterior (aplique de frente)', 'unid', 13781.70, 'Electricidad',   array['artefactos exteriores para frente','aplique exterior','artefacto exterior','farol de frente'],   'Precio del pedido #485 (proveedor).'),
  ('Fotocélula (interruptor crepuscular)',           'unid',     0,    'Electricidad',          array['fotocelula','fotocélula','interruptor crepuscular','fotocontrol'],                                'Sin precio.'),
  ('Travesaño p/ cielorraso desmontable 0,60m',      'unid',     0,    'Construcción en seco',  array['travesaño cielorraso','travesaño de cielorraso desmontable de 0.60m','travesaño 60','travesaño 0.60'], 'Sin precio.'),
  ('Cierrapuertas hidráulico',                       'unid', 20000.00, 'Ferretería general',    array['cierra puerta hidraulico','cierrapuerta','cierra puertas','brazo cierrapuertas'],                'Precio del pedido #485 (proveedor).'),
  ('Barral antipánico p/ puerta',                    'unid',     0,    'Ferretería general',    array['barras antipanico','barra antipanico','barral antipanico','antipanico'],                          'Sin precio.'),
  ('Descarga p/ lavatorio (sopapa c/ tubo)',         'unid',  3988.13, 'Sanitaria',             array['descarga lavatorio','descarga de lavatorio','sopapa lavatorio con tubo'],                         'Precio del pedido #485 (proveedor).'),
  ('Lavatorio p/ discapacitados (línea Espacio)',    'unid', 389952.05, 'Sanitaria',            array['lavatorio linea espacio','lavatorio espacio','lavatorio discapacitados','fe lavatorio espacio'],   'Precio del pedido #485 (proveedor).'),
  ('Gas refrigerante R32 (carga)',                   'unid', 25319.25, 'Instalación de gas',    array['gas r32','carga de gas r32','refrigerante r32','gas para aire acondicionado'],                   'Precio del pedido #545 (proveedor).'),
  ('Nitrógeno (carga p/ prueba de cañería)',         'unid',     0,    'Instalación de gas',    array['nitrogeno','nitrógeno','carga de nitrogeno','prueba con nitrogeno'],                             'Sin precio.'),
  ('Baldosa de vereda 40x40',                        'unid',     0,    'Pisos y revestimientos', array['baldosa vereda','baldosas de vereda','baldosa vainilla','baldosa municipal'],                   'Sin precio.'),
  ('Piso granítico 40x40 (Thin Compact)',            'unid',     0,    'Pisos y revestimientos', array['piso granitico 40x40','piso granitico thin compact','granitico 40x40','mosaico granitico 40x40'], 'Sin precio.'),
  ('Chapa galvanizada lisa C25 1,22 x 2,40 m (hoja)', 'unid',    0,    'Techado y cubiertas',   array['chapa de zingueria calibre 25','chapa lisa calibre 25','chapa lisa c25 hoja','chapa zingueria 1.22x2.40'], 'Sin precio.'),
  ('Caño estructural 20x10',                         'unid',     0,    'Herrería',              array['caño 20x10','caños 20x10','estructural 20x10','tubo 20x10'],                                     'Sin precio.')
) as v(nombre, unidad, precio_ref, rubro, alias, nota)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- filas existentes que toman precio y sinónimos de esta obra
update public.stock_materiales set precio_ref = v.p, alias = array(select distinct unnest(alias || v.al)), obs = coalesce(obs || ' · ', '') || v.n
from (values
  (213, 99049.50, array['griferia cocina monocomando','monocomando cocina','griferia de cocina'], 'Pedido #485 Villaguay (proveedor): $99.049,50.'),
  (253,  9000.00, array['modulo cambre red','modulo rj45','modulo de red','toma de red cambre','rj45 cambre'], 'Pedido #440 Villaguay (proveedor): $9.000.'),
  (248, 38000.00, array['contactor riel din monofasico','contactor monofasico','contactor din'], 'Pedido #440 Villaguay (proveedor): $38.000 (monofásico riel DIN).'),
  (249, 23400.00, array['reloj mecanico riel din','reloj horario din','timer riel din','reloj programador'], 'Pedido #440 Villaguay (proveedor): $23.400.')
) as v(id, p, al, n)
where stock_materiales.id = v.id;

-- 3) vínculos ────────────────────────────────────────────────────────────────
-- (item, fila, precio a fijar (null = el que tenía), cantidad nueva (null = igual), unidad nueva (null = igual))
create temp table vinc (item_id int, nombre text, precio numeric, cant numeric, unidad text, nota text);
insert into vinc values
  (783,  'Látex interior Loxon Larga Duración mate x 18lts (base EW)', 172992.91, null, null, 'Loxon 6105 mate interior; hoy viene en 18 l'),
  (785,  'Espátula 150mm',                                             null,      null, null, null),
  (2004, 'Esmalte sintético x 4lts',                                   null,      1,    'lata', 'esmalte sintético color 7055 (Endure Bronx): 4 lt = 1 lata'),
  (2011, 'Rodillo lana pelo corto 23cm',                               null,      null, null, 'rodillo para satinado'),
  (2013, 'Esmalte al agua satinado Kem x 3,6lts (base EW)',            54170.65,  1,    'lata', 'satinado 6106 guardasillas: 4 lt = 1 lata de 3,6'),
  (2014, 'Látex interior Loxon Larga Duración mate x 18lts (base EW)', 172992.91, null, null, 'látex interior 6105'),
  (2016, 'Palo extensible p/ rodillo',                                 null,      null, null, null),
  (2021, 'Látex exterior Loxon Larga Duración mate x 18lts (base EW)', 8488.10,   null, null, 'látex exterior 7005: 10 lt a $152.785,81 / 18 el litro'),
  (2097, 'Interruptor simple',                                         4200.00,   null, null, 'llave 1 punto Cambre, mismo precio que el renglón comprado del pedido'),
  (2108, 'Interruptor simple',                                         null,      null, null, null),
  (2098, 'Interruptor combinación',                                    null,      null, null, null),
  (2099, 'Tapa 1 módulo Cambre (punto simple)',                        3600.00,   null, null, 'mismo precio que el renglón comprado del pedido'),
  (2109, 'Tapa 1 módulo Cambre (punto simple)',                        null,      null, null, null),
  (2100, 'Tapa 2 módulos Cambre (toma doble)',                         null,      null, null, null),
  (2101, 'Tecla (batidor) Cambre negro',                               null,      null, null, null),
  (2102, 'Toma RJ45 datos',                                            9000.00,   null, null, 'mismo precio que el renglón comprado del pedido'),
  (2110, 'Toma RJ45 datos',                                            null,      null, null, null),
  (2104, 'Portabastidor p/ cablecanal',                                null,      null, null, null),
  (2105, 'Bornera de distribución (repartidor)',                       null,      null, null, null),
  (2106, 'Contactor 25A',                                              null,      null, null, 'contactor riel DIN monofásico'),
  (2107, 'Timer analógico riel DIN',                                   null,      null, null, 'reloj mecánico riel DIN'),
  (2204, 'Travesaño p/ cielorraso desmontable 0,60m',                  null,      null, null, null),
  (2354, 'Roseta p/ canilla 1/2" inox',                                null,      null, null, null),
  (2358, 'Grifería monocomando cocina',                                null,      null, null, null),
  (2363, 'Descarga p/ mingitorio c/ adaptador 1 1/4 x 40',             null,      null, null, null),
  (2364, 'Descarga p/ lavatorio (sopapa c/ tubo)',                     null,      null, null, null),
  (2367, 'Placa Superboard 10mm',                                      null,      null, null, null),
  (2369, 'Artefacto de iluminación exterior (aplique de frente)',      null,      null, null, null),
  (2372, 'Barral antipánico p/ puerta',                                0,         null, null, 'estaba a $1,21 de marcador'),
  (2373, 'Cierrapuertas hidráulico',                                   null,      null, null, null),
  (2374, 'Fotocélula (interruptor crepuscular)',                       0,         null, null, 'estaba a $1,21 de marcador'),
  (2376, 'Lavatorio p/ discapacitados (línea Espacio)',                null,      null, null, null),
  (2391, 'Espejo 60x80cm',                                             0,         null, null, 'estaba a $1,21 de marcador'),
  (2393, 'Cable UTP cat5e',                                            null,      null, null, null),
  (2424, 'Tapa ciega',                                                 86.56,     null, null, null),
  (2425, 'Cerradura de embutir',                                       null,      null, null, 'marca Andif'),
  (2468, 'Picaporte (juego)',                                          21579.00,  null, null, null),
  (2707, 'Gas refrigerante R32 (carga)',                               null,      null, null, null),
  (2708, 'Nitrógeno (carga p/ prueba de cañería)',                     null,      null, null, null),
  (2655, 'Baldosa de vereda 40x40',                                    null,      null, null, null),
  (996,  'Piso granítico 40x40 (Thin Compact)',                        null,      null, null, null),
  (736,  'Chapa galvanizada lisa C25 1,22 x 2,40 m (hoja)',            null,      null, null, null),
  (1272, 'Caño estructural 20x10',                                     null,      null, null, null),
  (207,  'Reflector LED 10W exterior',                                 null,      null, null, null),
  (794,  'Aire acondicionado split inverter 3000 frig. BGH R32 (3650 W)', null,   null, null, 'cantidad 0 en el pedido: revisar');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado,
       i.descripcion || coalesce(' — ' || v.nota, ''),
       jsonb_build_object('motivo', 'cc 24 Villaguay 2026-09-04', 'material_id', m.id, 'desc_canonica', m.nombre,
                          'precio_anterior', i.precio_unit, 'precio_nuevo', coalesce(v.precio, i.precio_unit),
                          'cantidad_anterior', i.cantidad, 'cantidad_nueva', coalesce(v.cant, i.cantidad))
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on m.nombre = v.nombre
where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = m.id, descripcion = m.nombre,
       precio_unit = coalesce(v.precio, i.precio_unit),
       cantidad = coalesce(v.cant, i.cantidad),
       cantidad_comprada = case when i.cantidad_comprada is null then null else coalesce(v.cant, i.cantidad_comprada) end,
       cantidad_enviada  = case when i.cantidad_enviada  is null then null else coalesce(v.cant, i.cantidad_enviada) end,
       unidad = coalesce(v.unidad, i.unidad)
  from vinc v join public.stock_materiales m on m.nombre = v.nombre
 where i.id = v.item_id and i.material_id is null;

update public.materiales_a_cuenta_cliente c
   set descripcion = i.descripcion, precio_unit = i.precio_unit, cantidad = i.cantidad, unidad = i.unidad,
       precio_total = round(i.cantidad * coalesce(i.precio_unit, 0), 2), updated_at = now()
  from vinc v join public.solicitud_compra_item i on i.id = v.item_id
 where c.item_id = v.item_id and c.cobro_id is null;
drop table vinc;

-- 5) la bomba de prueba es herramienta: al pañol, fuera de la cuenta ────────
update public.solicitud_compra_item set clase = 'herramienta' where id = 788 and clase <> 'herramienta';
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select c.item_id, c.solicitud_id, 'sacado_de_cuenta_cliente', null, i.estado, c.cantidad,
       'Herramienta (bomba de prueba de cañería) cargada en la cuenta de la obra; va al pañol: ' || i.descripcion,
       jsonb_build_object('motivo', 'cc 24 Villaguay 2026-09-04', 'origen_mcc', c.origen, 'precio_total', c.precio_total, 'detectada_por', 'user')
from public.materiales_a_cuenta_cliente c join public.solicitud_compra_item i on i.id = c.item_id
where c.item_id = 788 and c.cobro_id is null;
delete from public.materiales_a_cuenta_cliente where item_id = 788 and cobro_id is null;
