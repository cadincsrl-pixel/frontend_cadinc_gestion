-- TECHO MENDOZA 418: el renglón "inentendible" era 4 kg de yeso
--
-- En el pedido #709 (09/09, POLLANO) Nicolás cargó un renglón cuya
-- descripción es, literalmente, "inentendible": no pudo leer la letra del
-- presupuesto manuscrito. Quedó en texto libre, 4 unidades a $750.
--
-- El user leyó el papel (09/09): son 4 KG DE YESO. Cierra exacto —
-- 4 × $750 = $3.000, el importe del renglón— y explica la letra.
--
-- Va a la ficha 948 "Yeso x kg (suelto)", que es la del yeso por kilo (la
-- 772 es la bolsa de 40). Su precio de referencia es $1.668/kg, más del
-- doble de lo que salió acá; NO se toca la ficha: este es el precio real de
-- ESTA compra a POLLANO y el renglón manda sobre la referencia.

update public.solicitud_compra_item
   set material_id = 948,
       descripcion = 'Yeso x kg (suelto)',
       unidad = 'kg',
       obs = coalesce(obs || ' · ', '') ||
             'Cargado como "inentendible" el 09/09 por no poder leer el presupuesto manuscrito de POLLANO; el user lo leyó: son 4 kg de yeso ($750/kg).'
 where id = (select item_id from public.materiales_a_cuenta_cliente where id = 3335);

update public.materiales_a_cuenta_cliente
   set descripcion = 'Yeso x kg (suelto)', unidad = 'kg', updated_at = now()
 where id = 3335 and obra_cod = 'CC-011';
