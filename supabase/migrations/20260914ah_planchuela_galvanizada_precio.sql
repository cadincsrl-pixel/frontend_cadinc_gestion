-- El precio que le faltaba a la planchuela galvanizada — llegó el comprobante
--
-- La ficha 2712 se creó el 14/09 (20260914w) deliberadamente SIN precio, porque
-- no se sabía si los $30.254,84 del renglón salían de un neto o de un final.
-- Ya está el papel: factura A 0043-00014693 de HIERRONORT S.R.L., 14/09/2026.
--
--   cód.     cant.  detalle                    pr. unit.        importe
--   PL2316     2     PLANCHUELAS 2" X 3/16"   $ 25.003,9891   $ 50.007,98
--
--   SUBTOTAL        $ 50.007,98
--   PERC. IIBB TUC  $    375,06   <- percepción, afuera del precio
--   T.E.M. 1,25%    $    625,10   <- percepción, afuera del precio
--   IVA 21%         $ 10.501,68
--   TOTAL           $ 61.509,81
--
-- Precio final con IVA (CLAUDE.md §5.14), sin percepciones:
--
--   25.003,9891 x 1,21 = 30.254,83
--
-- El renglón 3826 ya tiene $30.254,84, un centavo arriba por redondeo. NO SE
-- TOCA: dos centavos sobre la compra entera no justifican un evento
-- precio_cambiado en la cuenta de ARCOR CANALETA.
--
-- LA FACTURA NO DICE "GALVANIZADA", el pedido sí. Se consultó al user el 14/09
-- y confirmó que lo que llegó a la obra es galvanizada: hierronort abrevia el
-- detalle y el código PL2316 le sirve para las dos. Queda anotado porque el
-- precio por kilo de esta compra ($2.194/kg neto) cae por DEBAJO de la serie de
-- hierro plano común del catálogo (1/2" a $2.806/kg, 3/4" a $2.486/kg), cuando
-- el galvanizado normalmente va 30-40% por arriba. O sea que ésta queda como la
-- galvanizada más barata por kilo que tenemos. Si el día de mañana una compra
-- de galvanizada aparece muy por encima, ésta es la fila a mirar primero.
--
-- La ficha 427 (Planchuela 2" x 3/16" x 6m, la común) sigue sin precio y sin un
-- solo renglón. No se toca.

-- 1. El precio, por la única puerta al catálogo.
select fijar_precio_ref(2712, 30254.83, 'migracion', 3826);

-- 2. El código del proveedor como sinónimo. Mismo criterio que Voltaje y Silva:
--    el nombre se escribe de diez maneras, el código no. Verificado que 'pl2316'
--    no aparece dentro del nombre ni de los alias de ninguna otra ficha activa.
update stock_materiales
   set alias = alias || array['pl2316'],
       updated_at = now()
 where id = 2712
   and not ('pl2316' = any(alias));
