-- 20260904aj — Casa Operarios (CC-014): el EPP es costo de CADINC, sale de la cuenta del cliente
--
-- Regla del user 2026-09-04: "los EPP son costos de CADINC". Salen de la cuenta
-- los 14 renglones de elementos de protección personal de la obra (rubro
-- Seguridad y EPP, más "careta" y "par de botas" que estaban en texto libre):
-- cascos ×9, arneses ×7, chalecos ×6, guantes de tela ×16, guantes descarne
-- ×14, lentes ×10, protectores auditivos ×10, barbijos ×5, protector facial,
-- careta, botas. $73.605 en total; ninguno cobrado. Evento por renglón.

create temp table epp as
select c.id as mcc_id, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen, c.precio_total
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
left join public.stock_materiales m on m.id = i.material_id
where c.obra_cod = 'CC-014' and c.cobro_id is null
  and (m.rubro_id = 15 or i.id in (845, 743));

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select e.item_id, e.solicitud_id, 'sacado_de_cuenta_cliente', null, e.estado, e.cantidad,
       'EPP: costo de CADINC, no se cobra al cliente: ' || e.descripcion,
       jsonb_build_object('motivo', 'EPP costo CADINC 2026-09-04', 'origen_mcc', e.origen, 'precio_total', e.precio_total, 'detectada_por', 'user')
from epp e;

delete from public.materiales_a_cuenta_cliente c using epp e where c.id = e.mcc_id;

drop table epp;
