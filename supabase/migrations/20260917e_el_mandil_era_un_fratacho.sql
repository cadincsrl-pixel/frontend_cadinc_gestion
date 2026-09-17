-- "Mandil de trabajo" nunca existió: es el fratacho de goma espuma
--
-- El user, 17/09: "cargaron mandil de trabajo, no es mandil ni mandril, es
-- fratacho de goma espuma".
--
-- LA PRUEBA, que no depende de creerle a nadie:
--
--   339  Fratacho espuma      rubro Albañilería     $2.750   creada 18/04
--        alias: fletacho, fletachos, fletacho + punta filip
--   892  Mandil de trabajo    rubro Seguridad y EPP $2.500   creada 02/09
--        alias: mandil, mandiles, **MANDIL GOMA ESPUMA**
--
-- El alias de la 892 dice "mandil goma espuma". Un mandil de goma espuma no
-- existe; un fratacho de goma espuma sí, y es lo que la 339 ya era desde abril.
-- Y los precios de las dos fichas se pisan exactamente: la 892 se compró 12
-- veces entre $650 y $2.850, la 339 tres veces entre $2.350 y $4.800. Un mandil
-- de trabajo de verdad (el de soldador, de cuero) no baja de la decena de
-- miles. Son el mismo producto, comprado al mismo precio, con dos nombres.
--
-- Es el caso de manual del §5.15: la obra pide por nombre de obra, alguien
-- escribió "mandil de goma espuma" queriendo decir fratacho, el matcher no
-- encontró nada y se creó una ficha nueva en el rubro equivocado. Cinco meses
-- después hay dos fichas del mismo fratacho, con dos stocks, dos precios de
-- referencia y dos historiales.
--
-- QUÉ SE HACE ACÁ
-- La 339 queda como la buena (nombre correcto, rubro correcto, es la original)
-- y la 892 se da de baja después de pasarle todo. NO se toca la clase: sigue
-- siendo `material`. El user dijo que es "una herramienta sin retorno", y eso
-- es una decisión aparte con plata adentro — convertirla a `herramienta` haría
-- que `trg_material_clase_saca_de_mcc` BORRE $77.974 de renglones no cobrados
-- repartidos en 11 obras. Va cuando el user lo confirme, en otra migración.
--
-- EL ALIAS "mandil" SE CONSERVA, aunque el nombre esté mal. Es exactamente
-- para lo que existen los alias: la obra va a seguir escribiendo "mandil" y
-- tiene que caer en el fratacho. "mandril" NO se agrega — matchea la ficha 1096
-- (Mandril p/ taladro) y la 1309 (adaptador portamandril), que son cosas de
-- verdad distintas. Los 6 alias nuevos se chequearon contra el matcher: cero
-- fichas ajenas.
--
-- EL STOCK NO SE SUMA. La 339 tiene 25 y la 892 quedó en −1. Son dos cuentas
-- del mismo montón hechas por separado — el recuento del 08/09 le puso un
-- ajuste de +6 a la 892 por su lado. Sumarlas sería inventar un número
-- (§5.15: mover movimientos entre fichas con un recuento físico en el medio
-- recalcula mal). La 892 se cierra en 0 con su ajuste, la 339 se queda con sus
-- 25, y el número verdadero sale del próximo recuento físico. Los movimientos
-- históricos de la 892 quedan donde están: son lo que pasó.

-- 1. La 339 toma el nombre completo y los sinónimos de las dos.
update public.stock_materiales
   set nombre = 'Fratacho de goma espuma',
       alias  = array[
                  'fratacho',
                  'fratachos',
                  'fratacho espuma',
                  'fratacho de goma espuma',
                  'fratacho goma espuma',
                  'fratacho de espuma',
                  'fletacho',
                  'fletachos',
                  'fletacho + punta filip',
                  'mandil',
                  'mandiles',
                  'mandil goma espuma',
                  'mandil de trabajo'
                ],
       updated_at = now()
 where id = 339;

-- 2. Los renglones de la ficha falsa pasan a la buena, para que la
--    trazabilidad por ficha (y el pañol, que cuenta por material_id) diga la
--    verdad.
update public.solicitud_compra_item
   set material_id = 339
 where material_id = 892;

-- 3. La descripción de los renglones NO congelados. Los que ya están cobrados o
--    certificados se dejan como están: son la foto de lo que se facturó.
update public.materiales_a_cuenta_cliente
   set descripcion = 'Fratacho de goma espuma',
       updated_at  = now()
 where descripcion = 'Mandil de trabajo'
   and cobro_id is null
   and certificado_id is null;

-- 4. La 892 se cierra en cero y se da de baja.
insert into public.stock_movimientos
  (material_id, tipo, cantidad, motivo, sub_motivo, obs, fecha, estado, aprobado_at)
select 892, 'ajuste', -stock_actual, 'ajuste_inventario', 'error_carga',
       format('Ficha dada de baja: era un duplicado del fratacho (ficha 339). '
              'Venía en %s. Migración 20260917e.', stock_actual),
       current_date, 'aprobado', now()
  from public.stock_materiales where id = 892 and stock_actual <> 0;

update public.stock_materiales
   set stock_actual = 0,
       activo = false,
       alias  = array[]::text[],
       obs    = concat_ws(' · ', nullif(obs,''),
                'Duplicado del fratacho de goma espuma (ficha 339). Dada de baja el 17/09, migración 20260917e.'),
       updated_at = now()
 where id = 892;
