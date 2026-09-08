-- El tarugo de $100.106 vuelve a valer $21,29
--
-- Renglón 3333 del pedido #669: 20 tarugos fisher 6mm despachados del depósito
-- a MANTENIMIENTO (CC CADINC 1) el 04/09, cargados a $100.106,05 la unidad.
-- $2.002.121 por veinte tarugos.
--
-- NO fue un dedazo: el despacho de depósito autocompleta el precio con el de
-- referencia de la ficha (SolicitudesTab.tsx:976), y la ficha lo tenía mal.
--
-- El rastro arranca el 28/05 en el renglón 54: una compra a ABC para reponer
-- stock, con precio $100.106,05 y CANTIDAD 0. Como la cantidad era cero el
-- total daba $0 y nadie lo miró nunca, pero ese número quedó como precio de
-- referencia del tarugo. Tres meses después salió multiplicado por veinte.
--
-- La ficha ya se corrigió: quedó en $21,29 el 04/09 a las 15:37 UTC, tres horas
-- DESPUÉS del despacho (12:54). Se arregló la fuente y quedó el renglón afuera.
-- Por eso esto es un huérfano y no un problema vivo: barrí el catálogo buscando
-- fichas con precio_ref 4× por encima de lo que pagan sus renglones y el tarugo
-- ya no aparece (sí aparecen disco diamantado, lentes y caño termofusión, las
-- tres en el orden de los miles).
--
-- El precio correcto no se adivina: $21,29 es el del catálogo y el que llevan
-- 8 de los 16 renglones históricos de esta ficha. 20 × $21,29 = $425,80.
--
-- Seguro de tocar: sin cobrar, y CC CADINC 1 es un centro interno, o sea gasto
-- propio de CADINC y no factura de ningún cliente.
--
-- El stock en -20 de la ficha NO se toca acá: eso no es un error de precio sino
-- que se despacharon tarugos que no estaban cargados. Va por el recuento.

-- El renglón que tiene la plata.
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, i.cantidad,
       'Precio heredado de una ficha mal cargada: $100106.05 → $21.29 (el del catálogo). El despacho de depósito autocompleta con el precio de referencia y la ficha estaba mal cuando se despachó.',
       jsonb_build_object('motivo', 'tarugo mal tasado 2026-09-08', 'precio_anterior', i.precio_unit,
                          'precio_nuevo', 21.29, 'origen_del_error', 'renglon 54 del 28/05, cantidad 0')
from public.solicitud_compra_item i
where i.id = 3333 and i.precio_unit = 100106.05;

update public.solicitud_compra_item
   set precio_unit = 21.29
 where id = 3333 and precio_unit = 100106.05;

update public.materiales_a_cuenta_cliente c
   set precio_unit  = 21.29,
       precio_total = round(c.cantidad * 21.29, 2),
       updated_at   = now()
 where c.item_id = 3333 and c.cobro_id is null;

-- Y la fuente, que hoy da $0 por tener cantidad 0 pero sigue siendo el número
-- equivocado guardado en un renglón de compra.
update public.solicitud_compra_item
   set precio_unit = 21.29,
       obs = coalesce(obs || ' · ', '')
          || 'Precio corregido el 08/09: estaba en $100.106,05 con cantidad 0, '
          || 'y de ahí salió el precio de referencia que después infló un despacho en $2.001.695.'
 where id = 54 and precio_unit = 100106.05;
