-- La zaranda es una herramienta (un tamiz para arena) y no estaba en el catálogo.
--
-- Candela pidió "Zaranda chica" para CORRIENTES (pedido 724) y quedó como
-- texto libre: no existía ninguna ficha con ese nombre ni parecido. El user
-- confirmó qué es: *"zaranda es una herramienta, es como un tamiz de arena"*.
--
-- El renglón ya venía bien en lo importante: `clase = 'herramienta'`, así que
-- NO entró a materiales_a_cuenta_cliente (trg_mcc_sin_herramientas) y no se le
-- cobró al cliente. Lo que faltaba es la ficha del TIPO: en el pañol la entrega
-- quedó con material_id nulo, o sea contada como texto suelto y no contra un
-- tipo (§5.12). Al enganchar la ficha, trg_herr_entregas_sync la reacomoda.
--
-- Sin precio a propósito: una herramienta va y vuelve de la obra y no se tasa.

begin;

insert into stock_materiales (rubro_id, nombre, unidad, precio_ref, clase, alias, obs)
values (26, 'Zaranda p/ arena (tamiz)', 'unid', 0, 'herramienta',
        array['zaranda chica', 'zarandas', 'zaranda para arena', 'tamiz de arena',
              'tamiz para arena', 'criba', 'harnero', 'zaranda de arena'],
        'Alta 2026-09-10: tipo de herramienta del pañol, salió del texto libre del pedido 724 (CORRIENTES). La unidad concreta es la ficha HER.');

update solicitud_compra_item i
   set material_id = m.id, descripcion = m.nombre
  from stock_materiales m
 where m.nombre = 'Zaranda p/ arena (tamiz)'
   and i.id = 3672;

commit;
