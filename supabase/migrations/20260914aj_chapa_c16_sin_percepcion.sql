-- NOTA DE NUMERACION: esta migracion se aplico en la base con el nombre
-- "20260914ai_chapa_c16_sin_percepcion" (version 20260914223510). Mientras se
-- escribia, otra sesion aplico "20260914ai_devoluciones_en_la_cuenta_corriente"
-- (version 20260914222743, 7 minutos antes) y las dos se quedaron con la letra
-- "ai" — el choque de prefijos que avisa CLAUDE.md 10. La base ordena por
-- timestamp, asi que no hubo problema de aplicacion; el archivo se renombro a
-- "aj" porque la otra llego primero. El nombre en el ledger de Supabase sigue
-- diciendo "ai": es una etiqueta, no el orden.

-- La chapa C16 de ARCOR también tenía la percepción adentro — $21.841,20
--
-- Lo destapó la verificación adversarial de 20260914ag: si la membrana de
-- Tecnopor se había cargado con la percepción adentro, valía preguntarse si
-- había más de la misma tanda. Había, y cuarenta veces más cara.
--
-- El rastro está en el historial de precios de la ficha 2713, del mismo día:
--
--   14:36:20   $54.602,53   fuente 'manual'   (alta rápida, sin renglón)
--   14:39:44   $67.161,12   fuente 'compra'   (renglón 3836)
--
--   67.161,12 / 54.602,53 = 1,2300001
--
-- Y 1,23 no es un número cualquiera. Es el 21% de IVA más el 2% de percepciones
-- de hierronort, leídas de su factura 0043-00014693 (la de la planchuela, que
-- es el comprobante que sí tenemos):
--
--   PERC. IIBB TUC   375,06 / 50.007,98 = 0,75 %
--   T.E.M.           625,10 / 50.007,98 = 1,25 %
--                                        ------
--                                         2,00 %  exacto
--
-- El control cruzado descarta la casualidad: la membrana de Tecnopor reconstruye
-- con la percepción de SU proveedor (IB-CM 1,25%), 42.592,57 x 1,2225 =
-- 52.069,42 al centavo. Dos proveedores, dos tasas distintas, y cada precio mal
-- cargado cierra con la tasa de su propia factura. Un número tipeado a ojo no
-- cae a un centavo de un factor específico del proveedor.
--
-- Chequeo independiente, por kilo de acero (7.850 kg/m³), mismo proveedor y
-- mismo día:
--   planchuela 2" x 3/16" x 6m = 11,395 kg -> 25.003,99 neto = $2.194/kg
--   chapa C16 1 x 2 m         = 24,932 kg -> 54.602,53 neto = $2.190/kg
-- Cuatro pesos de diferencia. Si $67.161,12 fuera el final correcto, el neto
-- daría $2.226/kg, fuera de la serie.
--
-- El user confirmó el 14/09 que $54.602,53 es el neto de la factura.
--
--   correcto:  54.602,53 x 1,21 = 66.069,06
--   20 hojas:  $1.343.222,40 cargado  ->  $1.321.381,20     (-$21.841,20)
--
-- La percepción no quedó sólo en la cuenta de ARCOR CANALETA: el $67.161,12 se
-- copió al catálogo (fuente 'compra'), así que la chapa está cara para TODAS las
-- obras hasta que se corrija acá.
--
-- El renglón no está cobrado ni certificado, la ficha no tiene un solo
-- movimiento de stock y no hay otro renglón colgado de ella: se corrige limpio.
--
-- OJO, PARA OTRO DÍA: la ficha 955 "chapon calibre 16" se mide en m² ($37.500)
-- y lleva el alias "chapa calibre 16". Puede ser el mismo producto medido de
-- dos maneras. No se toca acá, pero por eso ninguno de los sinónimos nuevos es
-- "chapa calibre 16": se lo dejamos a la 955 hasta decidir si son la misma cosa.

-- 1. La ficha primero (mismo orden que en ag: el historial copia la unidad).
--    Nombre según el patrón de sus hermanas C18 y C25. La unidad ya es correcta
--    ('unid' = una hoja), así que no se toca: sólo nombre y sinónimos.
--    Los 6 sinónimos se verificaron contra las 2.503 fichas activas: 0 colisiones.
update stock_materiales
   set nombre = 'Chapa galvanizada lisa C16 1 x 2 m (hoja)',
       alias  = array[
                  'chapa galvanizada calibre 16',
                  'chapa galvanizada c16',
                  'chapa lisa calibre 16',
                  'chapa lisa c16',
                  'chapa galvanizada 1x2',
                  'chapa c16'
                ],
       updated_at = now()
 where id = 2713
   and nombre = 'chapa galvanizada  calibre 16 1x2'
   and not exists (select 1 from stock_movimientos where material_id = 2713);

-- 2. El catálogo, por la única puerta.
select fijar_precio_ref(2713, 66069.06, 'migracion', 3836);

-- 3. La cuenta de ARCOR CANALETA.
update materiales_a_cuenta_cliente
   set precio_unit  = 66069.06,
       precio_total = round(cantidad * 66069.06, 2),
       descripcion  = 'Chapa galvanizada lisa C16 1 x 2 m (hoja)',
       updated_at   = now()
 where id = 3555
   and precio_unit = 67161.12
   and cobro_id is null and certificado_id is null;

-- 4. El renglón del pedido.
update solicitud_compra_item
   set precio_unit = 66069.06,
       obs = coalesce(obs || ' · ', '') ||
             'Precio corregido el 14/09 (20260914ai): estaba cargado a neto x 1,23, o sea con el 2% de percepciones de hierronort (IIBB 0,75% + TEM 1,25%) adentro. El precio con IVA es 54.602,53 x 1,21 = $66.069,06.'
 where id = 3836
   and precio_unit = 67161.12;
