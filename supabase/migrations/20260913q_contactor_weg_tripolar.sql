-- El contactor de 9 DE JULIO 882 entra al catálogo, y NO es el que ya estaba.
--
-- Nicolás compró el 11/09 a Marola Atilio SRL un renglón escrito solo como
-- "Contactor" ($48.655, item 3732). La factura dice qué es en realidad:
--
--     CONT.TRIP.WEG 12A 1NA+1NC 110Vca
--
-- O sea: contactor TRIPOLAR, marca WEG, 12 A, bobina de 110 Vca, con contactos
-- auxiliares 1 normal abierto + 1 normal cerrado.
--
-- La única ficha de contactor que existía —la 248, "Contactor 25A"— es otra
-- cosa: 25 A y MONOFÁSICA (lo dicen sus propios alias, "contactor monofasico"
-- y "contactor riel din monofasico"). Engancharlo ahí habría mezclado dos
-- artículos distintos y explicado mal la diferencia de precio ($48.655 contra
-- $38.000 no era aumento: era otro contactor).
--
-- Se sigue el patrón que el catálogo ya usa para las térmicas, donde cada
-- amperaje tiene su ficha POR MARCA (ABB / Schneider / Sica / sin marca). Los
-- contactores tenían una sola ficha genérica; esta es la primera con marca.
--
-- De paso, la 248 pasa a decir que es monofásica. El nombre a secas fue lo que
-- hizo dudar de si era la misma.

begin;

insert into stock_materiales (rubro_id, nombre, unidad, precio_ref, precio_actualizado_en, clase, alias, obs)
values (2, 'Contactor tripolar 12A WEG (bobina 110Vca, 1NA+1NC)', 'unid', 48655, '2026-09-11', 'material',
        array['contactor tripolar 12a', 'contactor weg 12a', 'contactor 12a weg',
              'cont trip weg 12a', 'contactor tripolar weg', 'contactor trifasico 12a',
              'contactor 12a 110v'],
        'Alta 2026-09-11 del texto libre del pedido 735 (9 DE JULIO 882). Factura de Marola Atilio SRL: "CONT.TRIP.WEG 12A 1NA+1NC 110Vca".');

update solicitud_compra_item i
   set material_id = m.id, descripcion = m.nombre
  from stock_materiales m
 where m.nombre = 'Contactor tripolar 12A WEG (bobina 110Vca, 1NA+1NC)'
   and i.id = 3732;

update materiales_a_cuenta_cliente c
   set descripcion = i.descripcion, updated_at = now()
  from solicitud_compra_item i
 where c.item_id = i.id and i.id = 3732;

-- El nombre a secas es lo que hizo dudar: ahora dice qué es.
update stock_materiales
   set nombre = 'Contactor 25A monofásico',
       alias  = alias || array['contactor 25a'],
       updated_at = now()
 where id = 248 and nombre = 'Contactor 25A';

commit;
