-- 20260908f — El Poximix no es un adhesivo epoxi (user 2026-09-07: "al poximix
-- le cambiemos el detalle, no es un adhesivo epoxi es un reparador de grietas")
--
-- La ficha se llamaba "Poximix (adhesivo epoxi pasta)" y eso es falso de punta
-- a punta: el Poximix es un MORTERO A BASE DE CEMENTO listo para usar, no tiene
-- resina epoxi. Lo confirma la descripcion del fabricante que pego Sosa en el
-- recuento: "material a base de cemento, de color gris, ideal para reparar
-- grietas, agujeros y huecos en paredes y techos".
--
-- Importa mas de lo que parece: en el mismo rubro esta la ficha 695, "Sikadur
-- 31 (adhesivo epoxi)", que SI es epoxi y sale tres veces mas ($53.700 contra
-- $18.751). Con el nombre viejo, alguien que buscaba "adhesivo epoxi" en el
-- pedido se llevaba cualquiera de las dos.
--
-- Se agrega tambien la presentacion al nombre, que ya estaba en `obs` y en tres
-- alias ("poximix exterior x 5", "poximix x 5 kg", "bolsa de poximix 5") pero
-- no donde se ve al pedir. Misma leccion que la chapa de recien.
--
-- Y la unidad pasa de "unid" a "bolsa", que es como lo cuenta el deposito ("
-- tengo 9 bolsas"). No reinterpreta ningun numero: una unidad siempre fue una
-- bolsa.
update public.stock_materiales
set nombre = 'Poximix Exterior x 5kg (reparador de grietas)',
    unidad = 'bolsa',
    alias = array(select distinct e from unnest(alias || array[
      'reparador de grietas','tapa grietas','mortero reparador',
      'poximix reparador','poximix bolsa','reparador de paredes']) e),
    obs = 'Mortero reparador listo para usar, a base de CEMENTO, gris. Para grietas, agujeros y huecos en paredes y techos. NO es epoxi: el adhesivo epoxi del catalogo es el Sikadur 31 (ficha 695), que es otro producto y sale el triple.'
          || E'\n'
          || 'Bolsa de 5 kg, version Exterior. Si alguna vez se compra la Interior, va en ficha propia.'
          || E'\n'
          || 'Precio: Prestigio 05/08/2026 $22.138,88 con 30 % de descuento neto (el 21/05 salia $17.858,72 final).'
where id = 697;
