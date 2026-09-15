-- Alta del disco Dakton DC100 verde + pedido de 10 para el depósito
--
-- Pedido del user el 15/09. Referencia que dio: "es como el aliafor verde pero
-- más barato", o sea la ficha 441 (Disco widia turbo fino p/ porcelanato 115mm,
-- Aliafor verde, $26.000). Éste sale cuatro veces menos.
--
-- De la publicación (Inomax, tienda oficial de Mercado Libre) y de la cara del
-- disco:
--
--   Disco De Corte Para Vidrio Porcelanato Dekton Marmol Cuarzo Verde
--   marca DAKTON · modelo DC100 · Ø 115 mm · Ø interior 22,23 mm · máx 12.200 RPM
--   "corte rápido sin astillas" · verde
--   Precio          $ 6.649,05   (5% off de $6.999)
--   Sin impuestos   $ 5.495,00
--
-- PRECIO: va $6.649,05, el FINAL CON IVA (CLAUDE.md §5.14). Se verifica solo:
-- 5.495 x 1,21 = 6.648,95, a diez centavos del publicado — o sea que el número
-- grande de la publicación ya trae el IVA y el "sin impuestos nacionales" es el
-- neto. Es precio de referencia de internet, no de compra: cuando se resuelva
-- el pedido, el que compra carga el precio real.
--
-- OJO CON EL NOMBRE, porque hay dos palabras casi iguales: DAKTON es la marca
-- del disco (va en el nombre de la ficha), y DEKTON es una superficie de
-- Cosentino que el disco corta, igual que el porcelanato o el mármol. El modelo
-- DC100 es la identidad dura, así que entra como sinónimo (mismo criterio que
-- los códigos de Voltaje y Silva, y que PL2316 ayer).
--
-- Los 10 sinónimos se verificaron contra las 2.500 fichas activas simulando el
-- matcher real: 0 colisiones. Deliberadamente NO lleva "disco verde" ni "disco
-- para porcelanato" sueltos: los tiene la 441, y ahora que hay DOS discos verdes
-- de 115 para porcelanato, un alias genérico mandaría a ciegas al de $26.000.
-- Queda anotado para decidir aparte.
--
-- El pedido va a CC DEPOSITO, que es obra depósito (es_deposito = true): cuando
-- se resuelva NO entra en la cuenta de ningún cliente, es reposición de stock
-- (§5.1). Se arma igual que lo hace el backend en solicitudes.service.ts:
-- cabecera 'aprobada' con solicitante = aprobado_por = quien la crea, renglones
-- en 'pendiente', y un evento 'creado' por renglón para que arranque el timeline.

-- 1. La ficha. Nace sin precio para que el historial lo escriba fijar_precio_ref
--    con fuente 'migracion' y no 'sql' (el trigger de INSERT se saltea si el
--    precio es 0, así que no deja una fila basura).
insert into stock_materiales
  (rubro_id, nombre, unidad, clase, activo, usa_color, stock_actual, stock_minimo, precio_ref, alias, obs)
values
  (7, 'Disco de corte p/ porcelanato, vidrio y mármol 115mm (Dakton DC100 verde)',
   'unid', 'material', true, false, 0, 0, 0,
   array[
     'dakton dc100',
     'disco dakton',
     'dakton',
     'dc100',
     'disco dc100',
     'disco para vidrio',
     'disco corte vidrio',
     'disco verde dakton',
     'disco de corte porcelanato vidrio',
     'disco para porcelanato dakton'
   ],
   'Alta 15/09/2026 (20260915a). Dakton DC100, 115mm, eje 22,23mm, max 12.200 RPM. Precio de referencia de publicacion de Mercado Libre (Inomax), no de compra. Es la alternativa barata del Aliafor verde (ficha 441).');

-- 2. El precio, por la única puerta al catálogo.
select fijar_precio_ref(
  (select id from stock_materiales where nombre = 'Disco de corte p/ porcelanato, vidrio y mármol 115mm (Dakton DC100 verde)'),
  6649.05, 'migracion');

-- 3. El pedido al depósito.
insert into solicitud_compra
  (obra_cod, solicitante, fecha, estado, prioridad, obs, aprobado_por, created_by, updated_by)
values
  ('CC DEPOSITO', 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', date '2026-09-15',
   'aprobada', 'normal',
   'Reposicion de stock: 10 discos Dakton DC100 verde (115mm) para el deposito. Pedido del 15/09 a partir de la publicacion de Inomax en Mercado Libre, $6.649,05 c/IVA. Es la alternativa barata del Aliafor verde.',
   'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8',
   'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8',
   'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');

-- 4. El renglón, en 'pendiente' como lo deja el alta del backend.
insert into solicitud_compra_item
  (solicitud_id, descripcion, cantidad, unidad, estado, clase, material_id)
select s.id,
       'Disco de corte p/ porcelanato, vidrio y mármol 115mm (Dakton DC100 verde)',
       10, 'unid', 'pendiente', 'material',
       (select id from stock_materiales where nombre = 'Disco de corte p/ porcelanato, vidrio y mármol 115mm (Dakton DC100 verde)')
from solicitud_compra s
where s.obra_cod = 'CC DEPOSITO' and s.fecha = date '2026-09-15'
  and s.obs like 'Reposicion de stock: 10 discos Dakton%';

-- 5. El evento 'creado', que es lo que arranca la trazabilidad del renglón.
insert into solicitud_item_eventos
  (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, user_id)
select i.id, i.solicitud_id, 'creado', null, 'pendiente', i.cantidad, null,
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'
from solicitud_compra_item i
join solicitud_compra s on s.id = i.solicitud_id
where s.obra_cod = 'CC DEPOSITO' and s.fecha = date '2026-09-15'
  and s.obs like 'Reposicion de stock: 10 discos Dakton%';
