-- FARMACIA AMERICA: las "tablas" son pino 1x6" — con ficha y precio
--
-- El renglón texto-libre "tablas" x2 (item 3349 / mcc 3141, 04/09, en $0):
-- el user confirmó que son 1x6". Se vinculan a la ficha 933 "Tabla pino
-- cepillada 1x6\" x 3.05m" (la variante que se vende siempre; la de 3,35 m
-- no tiene movimiento) al precio de sus últimas ventas: $4.356/u
-- (CC-013 y CC-015 12/08, CC-025 01/09). 2 x 4.356 = $8.712.

update solicitud_compra_item
   set material_id = 933
 where id = 3349;

update materiales_a_cuenta_cliente
   set precio_unit = 4356, precio_total = 8712, updated_at = now()
 where id = 3141 and obra_cod = 'CC-023';
