-- El matafuego que se compró en CC NORTE es el de 5 kg (dato del user, 08/09).
--
-- El renglón 2545 ("Matafuego nuevo ABC", $145.000, SEGUMAX, 18/08/2026) estaba
-- sin ficha porque en la base no había con qué decidir entre las dos que
-- existen: 669 "Matafuego ABC 5kg" y 670 "Matafuego ABC 10kg". Ninguna tenía
-- precio, no hay otra compra de matafuegos en la historia y ni el pedido ni el
-- remito RM-0674 dicen la medida. Lo confirmó el user.
--
-- Con eso, la ficha 669 estrena precio de referencia: es la primera compra real
-- de un matafuego en el sistema. La de 10 kg sigue sin precio.

update stock_materiales
   set precio_ref = 145000,
       precio_actualizado_en = '2026-08-18',
       proveedor_id = 15,
       obs = 'Precio de la primera compra real: SEGUMAX, 18/08/2026, $145.000 '
          || '(renglón 2545 de CC NORTE). Sin factura asociada, así que no se '
          || 'pudo confirmar si ese número ya trae el IVA. Se recarga con la '
          || 'ficha "Recarga de matafuego ABC".'
 where id = 669;

update solicitud_compra_item
   set material_id = 669
 where id = 2545;
