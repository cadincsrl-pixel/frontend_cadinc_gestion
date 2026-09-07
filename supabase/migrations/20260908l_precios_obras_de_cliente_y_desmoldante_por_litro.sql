-- 20260908l — Se cargan los precios de las obras de CLIENTE que ya estaban en
-- el sistema, y el desmoldante pasa a litro (user 2026-09-07: "arranca, despues
-- reviso igual antes de cobrar")
--
-- Del barrido: 278 renglones a $0 tienen ficha con precio, por $26,3 M. Se
-- cargan SOLO los de obras de cliente con menos de 30 dias entre el despacho y
-- la fecha del precio: son los unicos que cambian lo que se le factura a
-- alguien y los unicos donde el precio es contemporaneo al despacho. Los 254 de
-- obras de CADINC quedan afuera -- $18,8 M de esos son pintura con la ficha
-- generica de latex satinado a $247.132 la lata, precio que viene de un Loxon
-- premium; primero hay que ordenar esas fichas.
--
-- EL DESMOLDANTE SE MIDE POR LITRO, no por balde. Lo confirman sus propios
-- renglones: 4 de 5 estan en "lt" a ~$4.084, y el quinto dice "1 balde" pero
-- con el MISMO precio, o sea el del litro. La ficha decia "x 20lts" con unidad
-- balde, y con eso $4.083,75 parecia el precio de un balde entero. Cambiar la
-- unidad no reinterpreta nada: el numero siempre fue litros.
update public.stock_materiales
set nombre = 'Desmoldante p/ encofrado x litro',
    unidad = 'lt',
    alias = array(select distinct e from unnest(coalesce(alias, '{}'::text[]) || array[
      'desmoldante','desmoldante x 20lts','desmoldante encofrado','balde de desmoldante']) e),
    obs = 'POR LITRO. Viene en balde de 20 litros: al precio de referencia el balde sale $81.675. La ficha decia "x 20lts" con unidad balde y eso hacia leer los $4.083,75 como el precio del balde entero, cuando es el del litro -- lo confirman 4 de sus 5 renglones, cargados en "lt".'
where id = 626;

-- El renglon que dice "1 balde" con precio de litro queda MARCADO, no adivinado.
update public.solicitud_compra_item
set obs = coalesce(obs || ' · ', '') || 'REVISAR: dice "1 balde" pero con el precio del LITRO ($4.083,75). O son 20 litros y falta multiplicar por 20, o es 1 litro y la unidad esta mal. Marcado el 07/09 al pasar la ficha a litro.'
where id = 3267;

-- Precios de obras de cliente, brecha de hasta 30 dias, sin cobrar.
update public.materiales_a_cuenta_cliente m
set precio_unit  = sm.precio_ref,
    precio_total = m.cantidad * sm.precio_ref
from public.solicitud_compra_item i, public.stock_materiales sm, public.obras o
where i.id = m.item_id
  and sm.id = i.material_id
  and o.cod = m.obra_cod
  and coalesce(m.precio_unit, 0) = 0
  and coalesce(sm.precio_ref, 0) > 0
  and o.materiales_a_cargo_de = 'cliente'
  and m.cobro_id is null
  and (sm.precio_actualizado_en::date - m.fecha_resolucion::date) <= 30;

-- El renglon del pedido acompaña a la cuenta.
update public.solicitud_compra_item i
set precio_unit = m.precio_unit
from public.materiales_a_cuenta_cliente m
where m.item_id = i.id
  and coalesce(i.precio_unit, 0) = 0
  and coalesce(m.precio_unit, 0) > 0;
