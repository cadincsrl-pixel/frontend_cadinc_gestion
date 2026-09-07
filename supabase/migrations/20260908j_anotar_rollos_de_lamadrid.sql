-- 20260908j — Se anota en los tres renglones de Lamadrid que cada "1 unid" es
-- un rollo de 20 m (user 2026-09-07: "si fueron 3 rollos de 20 metros, no
-- descontaron stock porque estaban con texto libre")
--
-- La cantidad y el precio estan BIEN y no se tocan: tres rollos de 20 m a
-- $265.220,50, que es el rollo a $13.261,03 el metro -- la cotizacion de hoy lo
-- confirma con 0,5 % de diferencia. Son 60 m y $795.661,50, y los tres siguen
-- sin cobrar.
--
-- Lo unico que se agrega es la aclaracion, porque desde que la ficha pasa a
-- metro lineal (20260908d) un "1 unid a $265.220,50" se puede leer como si
-- fuera el precio del METRO, que seria 20 veces mas caro. La plata no cambia.
update public.solicitud_compra_item
set obs = coalesce(obs || ' · ', '') ||
  'Cada unidad de este renglon es un ROLLO ENTERO de 20 m (ancho 1,22). El precio es el del rollo: $265.220,50 = 20 x $13.261,03 el metro. Confirmado por el user el 07/09. No descontó stock porque al resolverse el renglon estaba en texto libre y todavia no colgaba de la ficha.'
where id in (1930, 2025, 2380);

update public.materiales_a_cuenta_cliente
set descripcion = 'Chapa galvanizada lisa C25 (rollo de 20 m, ancho 1,22)'
where item_id in (1930, 2025, 2380);
