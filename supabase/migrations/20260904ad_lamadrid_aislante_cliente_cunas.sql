-- 20260904ad — Lamadrid (CC-016): el aislante lo pagó el cliente; las cuñas son de nivelador de porcelanato
--
-- User 2026-09-04: "el aislante es pagado por cliente; las 200 cuñas son las
-- que traban los separadores de porcelanato".
--  · item 1936 (9 rollos de aislante, pedido #410): pagado_por → cliente, con
--    evento. Sale de lo facturable; el precio queda en 0 como el resto de lo
--    que pagó el cliente.
--  · fila 944 del catálogo ("cuñas para piso", creada desde texto libre):
--    nombre y sinónimos claros. Sin precio todavía (falta el de la bolsa).

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'pagado_por_cliente', null, i.estado, i.cantidad,
       'Lo pagó el cliente directo: sale de lo facturable (rollos de aislante)',
       jsonb_build_object('motivo', 'ordenamiento cuenta CC-016 2026-09-04')
from public.solicitud_compra_item i
where i.id = 1936 and i.pagado_por = 'cadinc';

update public.solicitud_compra_item set pagado_por = 'cliente' where id = 1936 and pagado_por = 'cadinc';

update public.materiales_a_cuenta_cliente
   set pagado_por = 'cliente', updated_at = now()
 where item_id = 1936 and pagado_por = 'cadinc' and cobro_id is null;

update public.stock_materiales
   set nombre = 'Cuña p/ nivelador de porcelanato',
       alias  = array(select distinct unnest(alias || array['cunas para piso','cunas niveladoras','cuna nivelador','cunas para separadores','cunas de nivelacion','cunas porcelanato'])),
       obs    = coalesce(obs || ' · ', '') || 'Es la cuña que traba los separadores nivelantes de porcelanato (user 2026-09-04).'
 where id = 944;
