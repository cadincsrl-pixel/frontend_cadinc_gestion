-- FARMACIA AMERICA: el mandil sale $3.500 (corrección del user sobre el
-- $2.394 de la mediana puesto en 20260910m). 3 x 3.500 = $10.500.

update materiales_a_cuenta_cliente
   set precio_unit = 3500, precio_total = 10500, updated_at = now()
 where id = 2771 and obra_cod = 'CC-023';
