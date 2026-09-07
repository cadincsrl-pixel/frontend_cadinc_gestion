-- 20260907f — Yeso: 3 renglones por kilo estaban colgados de la bolsa de 25 kg (user 2026-09-07)
--
-- El user: "la bolsa de yeso viene por 1 kg y por 25 kg, y en el catálogo veo que tenés
-- la de 25 al precio de la de 1 kg". Las dos filas existían y la referencia de la bolsa
-- estaba bien ($14.400, Pollano 04/08). Lo que mostraba $1.668 era la ÚLTIMA COMPRA:
-- tres compras a Silva a precio por kilo habían quedado vinculadas a la fila de la bolsa.
--
-- Los tres renglones ya tenían unidad 'kg' en el pedido y en la cuenta del cliente, así
-- que las cantidades y los importes SIEMPRE estuvieron bien. Lo único mal era el
-- material_id (772, la bolsa) y la descripción ("Yeso x 25kg" cuando eran kilos sueltos).
--
--   item 1651  29/07  CC CLINICA HERAS   2 kg × $1.559,00  a cobrar
--   item 2851  26/08  CC CLINICA SALTA   2 kg × $1.668,00  cobrado (cobro 3)
--   item 2993  28/08  CC CLINICA SALTA   3 kg × $1.668,00  cobrado (cobro 3)
--
-- Decisión del user: mover los tres a la fila del kilo y corregir la descripción también
-- en los dos que ya entraron al cobro 3 de Clínica Salta ($6.019.466,90, cobrado el
-- 04/09), SIN tocar importes. Por eso acá no se tocan cantidad, precio_unit,
-- precio_total, cobro_id ni monto_cobrado. Los renglones viejos de junio ($2.050,
-- $4.200) quedan como están, también por decisión del user.
--
-- No hay stock_movimientos colgando de estos items (son compra externa), así que el
-- stock de ninguna de las dos filas cambia.

create temp table mov_yeso as
select i.id as item_id, i.solicitud_id, i.estado, i.material_id as de
from public.solicitud_compra_item i
where i.id in (1651, 2851, 2993) and i.material_id = 772;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select m.item_id, m.solicitud_id, 'correccion', null, m.estado,
       'Yeso: era por kilo, no bolsa de 25 kg. Pasa a "Yeso x kg (suelto)". '
       'Cantidad e importe no cambian (ya estaban en kg).',
       jsonb_build_object('motivo','yeso kilos mal colgados de la bolsa 2026-09-07',
                          'material_anterior', m.de, 'material_nuevo', 948)
from mov_yeso m;

update public.solicitud_compra_item i
   set material_id = 948, descripcion = 'Yeso x kg (suelto)'
  from mov_yeso m where i.id = m.item_id;

-- solo la descripción; ningún campo de plata
update public.materiales_a_cuenta_cliente c
   set descripcion = 'Yeso x kg (suelto)', updated_at = now()
  from mov_yeso m where c.item_id = m.item_id;

update public.stock_materiales
   set obs = coalesce(obs || ' · ', '') ||
             '2026-09-07: tres compras a Silva por kilo (items 1651, 2851, 2993) estaban colgadas '
             'de esta fila y hacían que la última compra mostrara $1.668 (precio del kilo). '
             'Movidas a "Yeso x kg (suelto)" (948). La referencia $14.400 de la bolsa la confirmó el user.',
       updated_at = now()
 where id = 772;

update public.stock_materiales
   set obs = coalesce(obs || ' · ', '') ||
             '2026-09-07: recibe los items 1651, 2851 y 2993, que estaban en la bolsa de 25 kg (772). '
             'Ya venían con unidad kg, así que no se tocó ningún importe; dos de ellos están en el '
             'cobro 3 de Clínica Salta, ya cobrado, y solo se les corrigió la descripción.',
       updated_at = now()
 where id = 948;
