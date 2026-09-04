-- El film polietileno pasa a medirse por METRO LINEAL, con el ancho en el nombre.
--
-- EL PROBLEMA
-- La fila 456 ("Film polietileno 200 micrones", unidad rollo) venia recibiendo
-- CUATRO unidades distintas en los pedidos: rollo, unid, m2 y m. Hay renglones
-- de "50 m2", "20 m2", "2 m" y "1 rollo" apuntando al mismo material, asi que su
-- stock (-1) no significa nada.
--
-- La aritmetica dice que los "m2" son metros LINEALES: 50 "m2" x $1.900 = $95.000,
-- casi exactamente lo que costo un rollo entero de 4x50 ($100.000). Leido como
-- superficie, ese rollo (200 m2) tendria que costar $380.000, o sea 3,8x el precio
-- real. El user confirmo: se compra por metro de largo, en anchos de 2, 3 y 4 m.
-- Mismo caso que la lana de vidrio (20260903h), esta vez con numeros.
--
-- POR QUE FILA NUEVA Y NO RENAME IN PLACE
-- `stock_movimientos` NO TIENE COLUMNA `unidad`: su `cantidad` esta denominada
-- implicitamente por stock_materiales.unidad, que se lee EN VIVO. Cambiarle la
-- unidad a la 456 reinterpretaria en silencio el movimiento id 114 ("salida, 1,
-- despacho_obra, CC-016, 2026-09-03") de UN ROLLO a UN METRO — 50x — sin que
-- ningun UPDATE toque esa fila. El user confirmo que ese dia salio un rollo
-- ENTERO, asi que reinterpretarlo seria mentirle al ledger. Es el desastre de
-- categorias.vh otra vez.
-- La 456 queda DESACTIVADA con su historia intacta: sus 12 renglones de remito
-- ya emitidos y sus filas de cuenta del cliente son snapshots y siguen diciendo
-- lo que dijeron. El indice unico es parcial (WHERE activo), asi que una fila
-- desactivada no bloquea el nombre nuevo.
--
-- UN SOLO ANCHO POR AHORA: 4m es el unico con evidencia en la base. Las de 2m y
-- 3m se abren cuando aparezca la primera compra, con el mismo formato de nombre;
-- crearlas hoy son dos filas vacias que solo ensucian el buscador.

begin;

insert into public.stock_materiales
  (nombre, unidad, rubro_id, clase, activo, stock_actual, stock_minimo, precio_ref, alias, obs)
values (
  'Film polietileno 200 micrones (rollo 4m)',
  'm', 8, 'material', true, 0, 0, 2000,
  array['plastico negro','plastico negro 4m','nylon negro','film negro'],
  'Se compra por METRO LINEAL de rollo. Ancho 4m: 1 m lineal = 4 m2; rollo estandar de 50 m = 200 m2. Reemplaza a la fila 456, que quedo desactivada porque mezclaba rollo/unid/m2/m y su saldo no era interpretable.'
);

update public.stock_materiales
   set activo = false,
       alias  = array[]::text[],
       obs    = 'DESACTIVADA el 2026-09-04. Mezclaba cuatro unidades (rollo, unid, m2, m) y su saldo -1 no era interpretable. Reemplazada por "Film polietileno 200 micrones (rollo 4m)", que se mide en metro lineal. Su historia (12 renglones de remito emitidos y su cuenta del cliente) queda intacta: son snapshots.'
 where id = 456;

-- La compra en vuelo se reexpresa en metros ANTES de recibirla. Importa: al
-- recibir, el backend hace stock_actual += cantidad_comprada Y PISA precio_ref
-- con precio_unit (remitos-envio.service.ts). Si entraba como estaba, el
-- deposito quedaba con "2" y un precio de referencia 50x el real.
-- Pedido 1 rollo = 50 m · comprados 2 rollos = 100 m · $100.000 por rollo
-- (confirmado por el user) = $2.000 el metro. Total $200.000, identico.
update public.solicitud_compra_item
   set material_id      = (select id from public.stock_materiales
                            where nombre = 'Film polietileno 200 micrones (rollo 4m)'),
       descripcion      = 'Film polietileno 200 micrones (rollo 4m)',
       unidad           = 'm',
       cantidad         = 50,
       cantidad_comprada = 100,
       precio_unit      = 2000
 where id = 2945
   and estado = 'comprado'
   and cantidad_comprada = 2
   and precio_unit = 100000;

commit;
