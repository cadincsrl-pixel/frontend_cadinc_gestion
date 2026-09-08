-- FARMACIA AMERICA (CC-023): precios a los renglones que la base sí conoce
--
-- El user pidió tasar los 11 renglones en $0 de la obra con lo que haya en
-- la base. Cinco tienen dato firme (precio_ref vigente o última venta real
-- del mismo material); los otros seis no tienen de dónde (ver al pie).
--
--   2510 Tanza de replanteo x1        $5.000     (precio_ref, actualizado hoy)
--   2745 Rosca hembra term. 3/4 x1    $3.562,72  (ref = última venta 08/09 POLLANO)
--   3022 Revoque fino Weber x1        $9.330,49  (ref = venta 03/09 El Sol en CC-025)
--   3248 Chapa sinusoidal C25
--        1,10 x 2m x4                 $26.318/u  (ficha 1015: $13.159 el metro,
--                                                 el precio del techo de LAMADRID;
--                                                 4 chapas x 2m = $105.272)
--   3250 Tornillo autoperf. 14x2 x60  $89/u      (última venta 31/07, $5.340)
--
-- Total tasado: $128.505,21.
--
-- SIN DATO (siguen en $0): codo PVC c/acometida 110x63 (2735), curva PVC
-- 50mm 45° (2740), te termofusión 25x20 (2742), puntal regulable x3 (2778
-- — ojo: ¿se cobra o es herramienta que vuelve?), "tablas" x2 (3141, sin
-- ficha ni medida), perfil C 120x50x15 (3222).

update materiales_a_cuenta_cliente set precio_unit = 5000,    precio_total = 5000,      updated_at = now() where id = 2510 and obra_cod = 'CC-023';
update materiales_a_cuenta_cliente set precio_unit = 3562.72, precio_total = 3562.72,   updated_at = now() where id = 2745 and obra_cod = 'CC-023';
update materiales_a_cuenta_cliente set precio_unit = 9330.49, precio_total = 9330.49,   updated_at = now() where id = 3022 and obra_cod = 'CC-023';
update materiales_a_cuenta_cliente set precio_unit = 26318,   precio_total = 105272,    updated_at = now() where id = 3248 and obra_cod = 'CC-023';
update materiales_a_cuenta_cliente set precio_unit = 89,      precio_total = 5340,      updated_at = now() where id = 3250 and obra_cod = 'CC-023';
