-- 20260904ao — Mantenimiento (CC CADINC 1): "pagó el cliente" era un error de carga
--
-- El user (2026-09-04): "CADINC paga a Mantenimiento, no el cliente". Ocho
-- renglones del 3 y 4/9 cargados con pagado_por='cliente' pasan a 'cadinc'.
-- Siguen siendo gasto de CADINC (a_cargo_de='cadinc', obra llave en mano);
-- lo que cambia es que ya no cuentan como "pagó directo". Ninguno cobrado.
-- Se corrige el ítem de la solicitud y la fila de la cuenta, con evento.

create temp table fix as
select c.id as mcc_id, c.item_id, c.solicitud_id, i.estado, c.descripcion
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
where c.obra_cod = 'CC CADINC 1' and c.pagado_por = 'cliente' and c.cobro_id is null;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select item_id, solicitud_id, 'correccion', null, estado,
       'Estaba cargado como pagado por el cliente; en Mantenimiento paga CADINC',
       jsonb_build_object('motivo', 'Mantenimiento pagado_por 2026-09-04', 'pagado_por_anterior', 'cliente', 'pagado_por_nuevo', 'cadinc')
from fix;

update public.solicitud_compra_item i set pagado_por = 'cadinc' from fix f where i.id = f.item_id;
update public.materiales_a_cuenta_cliente c set pagado_por = 'cadinc', updated_at = now() from fix f where c.id = f.mcc_id;
drop table fix;
