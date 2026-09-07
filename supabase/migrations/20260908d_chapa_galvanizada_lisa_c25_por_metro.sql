-- 20260908d — La chapa galvanizada lisa C25 pasa a metro lineal, con el precio
-- de la cotizacion del 07/09 que paso el user.
--
-- LA COTIZACION dice: "BOBINA CH GALV CAL 25 ANCHO 1.22 X KILO ( 5 KG X M )",
-- 250 kg a $2.181,41 el kilo. O sea que el proveedor la vende POR KILO, y da la
-- equivalencia: 5 kg por metro lineal a 1,22 m de ancho.
--   $2.181,41 neto x 1,21 = $2.639,51 el kilo, final con IVA.
--   x 5 kg/m           = $13.197,53 el metro lineal.
-- (Los $670.784,26 del total incluyen IIBB $4.090,15 y T.E.M. $6.816,91, que
-- son percepciones y NO van al precio de referencia, como siempre.)
--
-- POR QUE SE CAMBIA LA UNIDAD, Y POR QUE ACA SI ES SEGURO:
-- La ficha decia "rollo" pero nadie la pide asi. De sus 9 renglones, 4 estan en
-- metros -- incluido el que esta pendiente ahora mismo, 26 m para CC-025 -- y
-- su unico movimiento de stock es una salida de "10" que corresponde a un
-- renglon de 10 METROS. O sea que el numero siempre fue metros y la etiqueta
-- era la que mentia. Cambiarla no reinterpreta nada: lo ARREGLA.
--
-- 🐛 Y arregla un error de stock: con la ficha en "rollo", ese -10 se leia como
-- -10 rollos = -200 m. Pasando a metros, el -10 significa -10 m, que es lo que
-- realmente salio. No hace falta ajuste.
--
-- El molde es la ficha hermana 1015, "Chapa sinusoidal galv. C25 x metro
-- lineal", que ya funciona asi.
update public.stock_materiales
set nombre = 'Chapa galvanizada lisa C25 x metro lineal',
    unidad = 'm',
    precio_ref = 13197.53,
    precio_actualizado_en = '2026-09-07',
    alias = array(select distinct e from unnest(alias || array[
      'chapa galvanizada lisa por metro','chapa lisa c25 por metro',
      'bobina chapa galvanizada','bobina ch galv cal 25','bob25',
      'chapa lisa por metro','chapa galvanizada por metro']) e),
    obs = 'POR METRO LINEAL, ancho 1,22 m. El proveedor la vende POR KILO y la equivalencia es 5 kg por metro (cotizacion 07/09/2026): $2.181,41 el kilo neto = $2.639,51 con IVA = $13.197,53 el metro. El rollo entero es de 20 m = 100 kg = $263.951 con IVA. · 2026-09-07: la ficha decia "rollo" pero sus renglones y su unico movimiento de stock siempre estuvieron en metros; se corrigio la unidad y con eso el saldo -10 pasa a leerse como -10 m (antes se leia como -10 rollos, o sea -200 m).'
where id = 877;
