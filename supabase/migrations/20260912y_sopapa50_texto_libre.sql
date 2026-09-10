-- Revisión de los pedidos de hoy: el renglón "sopapa 50" del pedido 711
-- (PASAJE KOTCH) quedó como texto libre habiendo ficha para eso.
--
-- La ficha 732 "Sopapa 50mm p/ pileta de cocina" tiene el alias "sopapa de
-- 50". Se escribió "sopapa 50", sin el "de", y el matcher del Combobox es
-- substring: "sopapa 50" NO está contenido en "sopapa de 50", así que no
-- hubo match y el renglón nació suelto. Es el mismo modo de falla que
-- manifull/maniful.
--
-- Se enlaza el renglón y se le suma a la ficha la forma sin "de", que es
-- como se pide en obra.
--
-- OJO con el precio: entró a $6.400, que es exactamente el precio de la
-- "Sopapa p/ inodoro" (ficha 226) y no el de esta, cuya referencia es
-- $8.846. No se toca — puede ser lo que pagaron de verdad — pero conviene
-- que el user lo confirme.

begin;

update stock_materiales
   set alias = alias || array['sopapa 50', 'sopapa 50 pileta de cocina']
 where id = 732;

update solicitud_compra_item
   set material_id = 732, descripcion = 'Sopapa 50mm p/ pileta de cocina'
 where id = 3572 and material_id is null;

update materiales_a_cuenta_cliente
   set descripcion = 'Sopapa 50mm p/ pileta de cocina', updated_at = now()
 where item_id = 3572;

commit;
