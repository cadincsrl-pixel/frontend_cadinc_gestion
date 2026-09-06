-- 20260906d — Corrección: el 3M PU550 de la factura ABC 0012-00400157 NO tiene el 20 % de descuento
--
-- Verificado sumando los importes de la factura: 12.203 × 20 = 244.060 (sin
-- descuento); los renglones con −20 % son cinta enmascarar, anteojos, cinta
-- aisladora y buscapolo. Neto 532.254,80 + IVA 111.773,51 (21 %) + percepción
-- 15.967,64 = 659.995,95. El precio unitario de la factura es SIN IVA: final =
-- 12.203 × 1,21 = 14.765,63 (que era la referencia que ya tenía la fila).

update public.stock_materiales set precio_ref = 14765.63, precio_actualizado_en = now(),
       obs = coalesce(obs || ' · ', '') || 'Corrección 06/09/2026: la factura ABC 0012-00400157 lo trae a $12.203 neto SIN descuento → $14.765,63 final (antes se le había aplicado el −20 % por error).'
 where id = 1241;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Factura ABC 12-400157: el 3M PU550 no tiene descuento: $12.203 neto → $14.765,63 final',
       jsonb_build_object('motivo', 'facturas ABC 2026-09-06 (corrección)', 'precio_anterior', i.precio_unit, 'precio_nuevo', 14765.63)
from public.solicitud_compra_item i where i.id = 3120;
update public.solicitud_compra_item set precio_unit = 14765.63 where id = 3120;
update public.materiales_a_cuenta_cliente set precio_unit = 14765.63, precio_total = round(cantidad * 14765.63, 2), updated_at = now() where item_id = 3120 and cobro_id is null;
