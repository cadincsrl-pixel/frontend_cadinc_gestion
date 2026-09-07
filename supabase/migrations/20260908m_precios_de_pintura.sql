-- 20260908m — Se cargan los precios de todo el rubro Pintura que estaba en $0
-- (user 2026-09-07: "lo de la pintura cargalo con el precio que tenemos, sigue
-- al mismo precio")
--
-- En 20260908l esto habia quedado afuera por dos dudas, y el user las despeja
-- las dos de un saque:
--   1) El precio de la ficha generica "Latex satinado interior x 20lts" viene
--      de un Loxon LD antimanchas SW6105, premium ($247.132,82 la lata). El
--      user confirma que ese es el precio que corresponde.
--   2) La brecha entre el despacho (junio) y la fecha del precio (septiembre)
--      hacia temer que se valuara caro. El user dice que SIGUE AL MISMO PRECIO,
--      asi que la brecha no distorsiona.
--
-- 79 renglones, $18.884.374,19. Ninguno esta cobrado. El grueso es una sola
-- ficha: 53 latas de latex satinado por $13.098.039,46 -- son 1.060 litros
-- repartidos en 4 despachos a CC CADINC 1, CC LOGISTICA y CC-001, todas obras
-- de CADINC, asi que no se le factura a ningun cliente. De cliente hay solo 2
-- renglones (un diluyente y un palo extensible).
update public.materiales_a_cuenta_cliente m
set precio_unit  = sm.precio_ref,
    precio_total = m.cantidad * sm.precio_ref
from public.solicitud_compra_item i, public.stock_materiales sm, public.stock_rubros r
where i.id = m.item_id
  and sm.id = i.material_id
  and r.id = sm.rubro_id
  and r.nombre = 'Pintura'
  and coalesce(m.precio_unit, 0) = 0
  and coalesce(sm.precio_ref, 0) > 0
  and m.cobro_id is null;

-- El renglon del pedido acompaña a la cuenta.
update public.solicitud_compra_item i
set precio_unit = m.precio_unit
from public.materiales_a_cuenta_cliente m
where m.item_id = i.id
  and coalesce(i.precio_unit, 0) = 0
  and coalesce(m.precio_unit, 0) > 0;
